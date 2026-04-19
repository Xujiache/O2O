/**
 * @file grab.service.ts
 * @stage P4/T4.40（Sprint 6）
 * @desc 抢单服务：Redis Lua 原子抢占 + 派单记录入库 + 订单回写（raw query 跨分表）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 流程（V4.28 抢单不会一单被抢两次）：
 *   1) 校验订单存在 + status=10 + 在抢单池内（dispatch:grabpool:{cityCode}）
 *   2) Redis Lua grab_order.lua 原子 SETNX：dispatch:grabbed:{orderNo} = riderId TTL=3600
 *      返回 1 抢到 / 0 已被抢
 *   3) 抢到：
 *      a) INSERT dispatch_record(dispatch_mode=2, status=1, rider_id=riderId, accepted_at=now)
 *      b) UPDATE order_takeout_yyyymm / order_errand_yyyymm
 *           SET rider_id=?, accept_at=NOW(3), status=20  WHERE order_no=? AND status=10
 *         （CAS：status=10）；若 affectedRows ≠ 1 → 状态非 10 抛错并 DEL 抢占 Key
 *      c) INSERT order_status_log_yyyymm（操作来源 RIDER）
 *      d) 把订单加入骑手活跃集合 + 几何缓存（顺路单将立即可用）
 *      e) 触发 message.send RIDER_DISPATCH（mock）
 *      f) 从抢单池移除（SREM dispatch:grabpool:{cityCode}）
 *   4) 抢失败 → 抛 BIZ_OPERATION_FORBIDDEN '订单已被抢'
 */

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import type Redis from 'ioredis'
import { join } from 'path'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { DispatchRecord } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OrderShardingHelper } from '@/modules/order/order-sharding.helper'
import { SnowflakeId } from '@/utils'
import {
  DispatchModeEnum,
  DispatchStatusEnum,
  OrderTypeForDispatch,
  type OrderTypeForDispatch as OrderTypeForDispatchValue
} from '../types/dispatch.types'
import { CandidateService } from './candidate.service'
import { RouteMatchService } from './route-match.service'

/* ============================================================================
 * 类型 / 常量
 * ============================================================================ */

/** 抢单 Key TTL（秒）：订单从派出到结算约 1 小时 */
const GRAB_KEY_TTL_S = 3600

/** Redis Key 模板 */
const GRAB_KEY = (orderNo: string): string => `dispatch:grabbed:${orderNo}`
const GRAB_POOL_KEY = (cityCode: string): string => `dispatch:grabpool:${cityCode}`

/** 订单接受后的状态 = 20（外卖 + 跑腿都用 20，对齐 OrderTakeoutStatusEnum.ACCEPTED / OrderErrandStatusEnum.ACCEPTED） */
const ACCEPTED_STATUS = 20
/** 订单待接单状态 = 10 */
const PENDING_ACCEPT_STATUS = 10

/** OperationLog op_type：3 骑手 */
const OP_TYPE_RIDER = 3

/** raw query 受影响行数 */
interface UpdateResultPacket {
  affectedRows?: number
}

/** UPDATE 主表后再 SELECT 几何信息回填 RouteMatchService */
interface PickupGeoRow {
  pickup_lng: string | null
  pickup_lat: string | null
  delivery_lng: string | null
  delivery_lat: string | null
  city_code: string | null
}

/** 抢单成功的回执 */
export interface GrabResult {
  success: boolean
  dispatchRecordId?: string
  grabbedAt?: Date
  reason?: string
}

@Injectable()
export class GrabService {
  private readonly logger = new Logger(GrabService.name)

  /** Lua 脚本：构造时一次性同步加载 */
  private readonly grabScript: string

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(DispatchRecord)
    private readonly dispatchRepo: Repository<DispatchRecord>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly candidateService: CandidateService,
    private readonly routeMatchService: RouteMatchService
  ) {
    /**
     * Lua 路径解析与 RedPacketService / InventoryService 一致：
     *   src/modules/dispatch/services → ../../../redis/lua
     *   dist/modules/dispatch/services → ../../../redis/lua（nest-cli.json assets 已配）
     */
    const luaDir = join(__dirname, '..', '..', '..', 'redis', 'lua')
    this.grabScript = readFileSync(join(luaDir, 'grab_order.lua'), 'utf-8')
  }

  /* ============================================================================
   * 主入口：grab
   * ============================================================================ */

  /**
   * 骑手抢单
   * 参数：orderNo / orderType / riderId
   * 返回值：GrabResult
   * 错误：
   *   - 10300 订单不存在 / 10301 状态非法
   *   - 10012 BIZ_OPERATION_FORBIDDEN：订单已被抢
   */
  async grab(
    orderNo: string,
    orderType: OrderTypeForDispatchValue,
    riderId: string
  ): Promise<GrabResult> {
    /* 1) 校验订单存在 + status=10 + 在抢单池 */
    const orderRow = await this.fetchOrderForGrab(orderNo, orderType)
    if (!orderRow) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_NOT_FOUND,
        `订单 ${orderNo} 不存在或已超时`
      )
    }
    if (orderRow.status !== PENDING_ACCEPT_STATUS) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        `订单 ${orderNo} 状态 ${orderRow.status} 不可抢`
      )
    }
    if (orderRow.cityCode) {
      const inPool = await this.redis.sismember(GRAB_POOL_KEY(orderRow.cityCode), orderNo)
      if (inPool !== 1) {
        throw new BusinessException(
          BizErrorCode.BIZ_OPERATION_FORBIDDEN,
          `订单 ${orderNo} 不在抢单池`
        )
      }
    }

    /* 2) Redis Lua 原子抢占 */
    let luaResult: number = 0
    try {
      const reply = await this.redis.eval(
        this.grabScript,
        1,
        GRAB_KEY(orderNo),
        riderId,
        String(GRAB_KEY_TTL_S)
      )
      luaResult = Number(reply)
    } catch (err) {
      this.logger.error(
        `Lua grab_order 执行异常 order=${orderNo} rider=${riderId}：${err instanceof Error ? err.message : String(err)}`
      )
      throw new BusinessException(
        BizErrorCode.SYSTEM_REDIS_ERROR,
        '抢单 Redis 异常',
        HttpStatus.BAD_GATEWAY
      )
    }
    if (luaResult !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, `订单 ${orderNo} 已被抢`)
    }

    /* 3) 写 dispatch_record + UPDATE 主表 + 状态日志（事务） */
    const grabbedAt = new Date()
    let dispatchRecordId: string
    try {
      dispatchRecordId = await this.persistGrab({
        orderNo,
        orderType,
        riderId,
        grabbedAt,
        cityCode: orderRow.cityCode
      })
    } catch (err) {
      /* DB 写失败 → 释放 Redis 抢占，避免订单"幽灵"卡死 */
      await this.releaseGrabKey(orderNo)
      throw err
    }

    /* 4) 抢单池移除 + 活跃订单维护 + 顺路几何缓存 + 推送（best-effort） */
    if (orderRow.cityCode) {
      try {
        await this.redis.srem(GRAB_POOL_KEY(orderRow.cityCode), orderNo)
      } catch (err) {
        this.logger.warn(
          `从抢单池移除失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    await this.candidateService.appendActiveOrder(riderId, orderNo)
    if (
      orderRow.pickupLng != null &&
      orderRow.pickupLat != null &&
      orderRow.deliveryLng != null &&
      orderRow.deliveryLat != null
    ) {
      await this.routeMatchService.cacheActiveOrderGeo({
        orderNo,
        pickupLng: orderRow.pickupLng,
        pickupLat: orderRow.pickupLat,
        deliveryLng: orderRow.deliveryLng,
        deliveryLat: orderRow.deliveryLat
      })
    }

    return { success: true, dispatchRecordId, grabbedAt }
  }

  /* ============================================================================
   * 释放抢占（异常 / 撤销时使用）
   * ============================================================================ */

  /**
   * 释放抢单 Key
   * 参数：orderNo
   * 返回值：void
   */
  async releaseGrabKey(orderNo: string): Promise<void> {
    try {
      await this.redis.del(GRAB_KEY(orderNo))
    } catch (err) {
      this.logger.warn(
        `releaseGrabKey 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 加入抢单池（DispatchService 在 3 次系统派单失败时调用）
   * 参数：orderNo / cityCode
   * 返回值：void
   */
  async addToGrabPool(orderNo: string, cityCode: string): Promise<void> {
    try {
      await this.redis.sadd(GRAB_POOL_KEY(cityCode), orderNo)
      await this.redis.expire(GRAB_POOL_KEY(cityCode), GRAB_KEY_TTL_S)
    } catch (err) {
      this.logger.warn(
        `addToGrabPool 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 列出指定城市抢单池中的订单号
   * 参数：cityCode
   * 返回值：orderNo[]
   */
  async listGrabPool(cityCode: string): Promise<string[]> {
    try {
      return await this.redis.smembers(GRAB_POOL_KEY(cityCode))
    } catch (err) {
      this.logger.warn(
        `listGrabPool 失败 city=${cityCode}：${err instanceof Error ? err.message : String(err)}`
      )
      return []
    }
  }

  /**
   * 抢单池大小（看板）
   */
  async grabPoolSize(cityCode: string): Promise<number> {
    try {
      return await this.redis.scard(GRAB_POOL_KEY(cityCode))
    } catch (err) {
      this.logger.warn(
        `grabPoolSize 失败 city=${cityCode}：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /* ============================================================================
   * 内部：跨分表读 + 写
   * ============================================================================ */

  /**
   * 读订单核心字段（含 status / cityCode / pickup / delivery 经纬度）
   * 用 OrderShardingHelper.yyyymmFromOrderNo 拼接物理表名，避免 OrderModule 强依赖
   */
  private async fetchOrderForGrab(
    orderNo: string,
    orderType: OrderTypeForDispatchValue
  ): Promise<{
    status: number
    cityCode: string | null
    pickupLng: number | null
    pickupLat: number | null
    deliveryLng: number | null
    deliveryLat: number | null
  } | null> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) return null
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const table =
      orderType === OrderTypeForDispatch.TAKEOUT
        ? OrderShardingHelper.tableName('order_takeout', date)
        : OrderShardingHelper.tableName('order_errand', date)

    const sql = `SELECT status, city_code,
                        JSON_EXTRACT(shop_snapshot, '$.lng')        AS pickup_lng,
                        JSON_EXTRACT(shop_snapshot, '$.lat')        AS pickup_lat,
                        JSON_EXTRACT(address_snapshot, '$.lng')     AS delivery_lng,
                        JSON_EXTRACT(address_snapshot, '$.lat')     AS delivery_lat
                   FROM \`${table}\`
                  WHERE order_no = ? AND is_deleted = 0
                  LIMIT 1`
    let rows: Array<{
      status: number
      city_code: string | null
      pickup_lng: number | string | null
      pickup_lat: number | string | null
      delivery_lng: number | string | null
      delivery_lat: number | string | null
    }> = []
    try {
      rows = await this.dataSource.query(sql, [orderNo])
    } catch (err) {
      this.logger.warn(
        `fetchOrderForGrab 主表查询失败 order=${orderNo} table=${table}：${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
    const first = rows[0]
    if (!first) return null
    return {
      status: Number(first.status),
      cityCode: first.city_code != null ? String(first.city_code) : null,
      pickupLng: this.toNumber(first.pickup_lng),
      pickupLat: this.toNumber(first.pickup_lat),
      deliveryLng: this.toNumber(first.delivery_lng),
      deliveryLat: this.toNumber(first.delivery_lat)
    }
  }

  /**
   * 持久化抢单：dispatch_record + 主表 UPDATE + 状态日志（单事务）
   * 用途：grab() 抢占成功后调用
   * 返回值：dispatchRecordId
   */
  private async persistGrab(input: {
    orderNo: string
    orderType: OrderTypeForDispatchValue
    riderId: string
    grabbedAt: Date
    cityCode: string | null
  }): Promise<string> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(input.orderNo)
    if (!yyyymm) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `订单号 ${input.orderNo} 无法解析分表月份`
      )
    }
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const mainTable =
      input.orderType === OrderTypeForDispatch.TAKEOUT
        ? OrderShardingHelper.tableName('order_takeout', date)
        : OrderShardingHelper.tableName('order_errand', date)
    const logTable = OrderShardingHelper.statusLog(new Date())

    const dispatchRecordId = SnowflakeId.next()
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      /* a) UPDATE 主表（CAS：status=10）+ 写骑手 + accept_at */
      const updateSql =
        input.orderType === OrderTypeForDispatch.TAKEOUT
          ? `UPDATE \`${mainTable}\`
                SET rider_id = ?, status = ?, accept_at = ?, updated_at = ?
              WHERE order_no = ? AND status = ? AND is_deleted = 0`
          : `UPDATE \`${mainTable}\`
                SET rider_id = ?, status = ?, accept_at = ?, updated_at = ?
              WHERE order_no = ? AND status = ? AND is_deleted = 0`
      const updateRes = (await queryRunner.manager.query(updateSql, [
        input.riderId,
        ACCEPTED_STATUS,
        input.grabbedAt,
        input.grabbedAt,
        input.orderNo,
        PENDING_ACCEPT_STATUS
      ])) as UpdateResultPacket
      if ((updateRes.affectedRows ?? 0) !== 1) {
        throw new BusinessException(
          BizErrorCode.BIZ_DATA_CONFLICT,
          `订单 ${input.orderNo} 状态被并发更新或不在待接单状态`
        )
      }

      /* b) INSERT dispatch_record */
      await queryRunner.manager.query(
        `INSERT INTO dispatch_record
           (id, tenant_id, order_no, order_type, dispatch_mode, rider_id,
            status, accepted_at, responded_at, expire_at, extra,
            is_deleted, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
        [
          dispatchRecordId,
          input.orderNo,
          input.orderType,
          DispatchModeEnum.GRAB,
          input.riderId,
          DispatchStatusEnum.ACCEPTED,
          input.grabbedAt,
          input.grabbedAt,
          JSON.stringify({ source: 'grab', cityCode: input.cityCode }),
          input.grabbedAt,
          input.grabbedAt
        ]
      )

      /* c) INSERT order_status_log */
      await queryRunner.manager.query(
        `INSERT INTO \`${logTable}\`
           (id, tenant_id, order_no, order_type, from_status, to_status,
            op_type, op_id, op_ip, remark, extra,
            is_deleted, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
        [
          SnowflakeId.next(),
          input.orderNo,
          input.orderType,
          PENDING_ACCEPT_STATUS,
          ACCEPTED_STATUS,
          OP_TYPE_RIDER,
          input.riderId,
          '骑手抢单',
          JSON.stringify({ dispatchMode: DispatchModeEnum.GRAB }),
          input.grabbedAt,
          input.grabbedAt
        ]
      )

      await queryRunner.commitTransaction()
      return dispatchRecordId
    } catch (err) {
      try {
        await queryRunner.rollbackTransaction()
      } catch {
        /* ignore */
      }
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * JSON_EXTRACT / DECIMAL → number；非法返回 null
   */
  private toNumber(input: number | string | null | undefined): number | null {
    if (input == null) return null
    const n = Number(input)
    return Number.isFinite(n) ? n : null
  }

  /* ============================================================================
   * 仅给上层 / 单测复用：当前抢占骑手 ID
   * ============================================================================ */

  /**
   * 查抢占者
   * 参数：orderNo
   * 返回值：riderId 或 null
   */
  async getGrabbedRider(orderNo: string): Promise<string | null> {
    try {
      return await this.redis.get(GRAB_KEY(orderNo))
    } catch (err) {
      this.logger.warn(
        `getGrabbedRider 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
  }

  /**
   * 暴露不依赖订单的几何 helper：用于 PickupGeoRow 解析
   */
  static parsePickupGeoRow(row: PickupGeoRow): {
    pickupLng: number | null
    pickupLat: number | null
    deliveryLng: number | null
    deliveryLat: number | null
    cityCode: string | null
  } {
    const toNum = (v: string | null): number | null => {
      if (v == null) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    return {
      pickupLng: toNum(row.pickup_lng),
      pickupLat: toNum(row.pickup_lat),
      deliveryLng: toNum(row.delivery_lng),
      deliveryLat: toNum(row.delivery_lat),
      cityCode: row.city_code
    }
  }
}
