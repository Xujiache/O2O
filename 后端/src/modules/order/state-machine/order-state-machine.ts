/**
 * @file order-state-machine.ts
 * @stage P4/T4.15（Sprint 3）
 * @desc 订单统一状态机 transit：分布式锁 + 校验 + 事务（更新主单 + 写日志） + 发事件
 * @author 单 Agent V2.0
 *
 * 核心契约（DESIGN_P4 §2.2 / 用户任务书 §7.1）：
 *   transit(orderNo, orderType, event, ctx) 步骤：
 *     1) Redis SET NX EX 30  lock:order:{orderNo}（防并发迁移）
 *     2) 反查订单当前状态（走 OrderShardingHelper：根据 order_no 解析 yyyymm）
 *     3) 在 TAKEOUT_TRANSITIONS / ERRAND_TRANSITIONS 找 from→event→config
 *        - 事件未注册 → 抛 BIZ_ORDER_STATE_NOT_ALLOWED 10301
 *     4) QueryRunner 事务：
 *        a) UPDATE order_${type}_<yyyymm> SET status=to, updated_at=NOW(3), …additionalFields
 *           WHERE order_no=? AND status=fromStatus（CAS，防止重复迁移）
 *        b) INSERT order_status_log_<yyyymm>（按 createdAt 当月分表）
 *     5) 提交事务 → 释放锁 → 调 OrderEventsPublisher.publish（best-effort）
 *     6) 失败：回滚事务 / 释放锁 / 抛业务异常
 *
 * 锁约定：
 *   - Key 模式 lock:order:{orderNo}；TTL 30s 兜底防死锁
 *   - 释放时使用 lua 校验 token，避免误删别人的锁
 *
 * 不实现：
 *   - 70 售后中跳转（由 Sprint 7 Review 完整接入）
 *   - 库存恢复 / 优惠券恢复（外层调用方在 transit 后自行调度）
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { randomUUID } from 'crypto'
import { DataSource, type EntityManager, type QueryRunner } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { SnowflakeId } from '@/utils'
import { OrderShardingHelper } from '../order-sharding.helper'
import { ORDER_EVENTS_PUBLISHER, type OrderEventPayload } from '../events/order-events.constants'
import type { OrderEventsPublisher } from '../events/order-events.publisher'
import {
  OrderOpTypeEnum,
  OrderTypeEnum,
  type OrderEventName,
  type OrderType,
  type TransitionContext,
  type TransitionResult
} from '../types/order.types'
import { getTransitionsTable } from './states-config'

/* ============================================================================
 * Redis 锁
 * ============================================================================ */

/** lock:order:{orderNo}，TTL 30s */
const ORDER_LOCK_KEY = (orderNo: string): string => `lock:order:${orderNo}`
const ORDER_LOCK_TTL_SECONDS = 30

/** Lua：仅当持有 token 一致时才删除（避免误删后续重入的锁） */
const LUA_RELEASE_LOCK = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

/* ============================================================================
 * 行结果（service 反查 + 用 raw query 拼装最少字段）
 * ============================================================================ */

interface CurrentOrderRow {
  status: number
  payStatus: number
  userId: string
  shopId: string | null
  merchantId: string | null
  riderId: string | null
}

@Injectable()
export class OrderStateMachine {
  private readonly logger = new Logger(OrderStateMachine.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ORDER_EVENTS_PUBLISHER) private readonly publisher: OrderEventsPublisher
  ) {}

  /* ==========================================================================
   * 公共 API
   * ========================================================================== */

  /**
   * 状态迁移（核心入口）
   * 参数：
   *   - orderNo    18 位订单号（本机 OrderNoGenerator 生成）
   *   - orderType  1 外卖 / 2 跑腿
   *   - event      OrderEventName 字面量
   *   - ctx        TransitionContext（opType / opId / additionalFields / extra / remark）
   * 返回值：TransitionResult
   *
   * 异常：
   *   - 10300 BIZ_ORDER_NOT_FOUND     订单不存在
   *   - 10301 BIZ_ORDER_STATE_NOT_ALLOWED 当前 status 无 event 对应迁移
   *   - 10011 BIZ_DATA_CONFLICT       CAS 失败（并发已迁移）
   *   - 50001 SYSTEM_INTERNAL_ERROR   分表反推失败 / 物理表缺失
   */
  async transit(
    orderNo: string,
    orderType: OrderType,
    event: OrderEventName,
    ctx: TransitionContext
  ): Promise<TransitionResult> {
    if (!orderNo || orderNo.length !== 18) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'orderNo 非法')
    }
    const lockToken = randomUUID()
    const acquired = await this.acquireLock(orderNo, lockToken)
    if (!acquired) {
      throw new BusinessException(
        BizErrorCode.BIZ_DATA_CONFLICT,
        `订单 ${orderNo} 状态正在变更，请稍后再试`
      )
    }

    let result: TransitionResult
    try {
      result = await this.transitInternal(orderNo, orderType, event, ctx)
    } finally {
      await this.releaseLock(orderNo, lockToken)
    }

    /* 事务提交后才发事件，best-effort */
    if (!ctx.skipPublish) {
      const payload: OrderEventPayload = {
        eventName: event,
        orderNo,
        orderType,
        fromStatus: result.fromStatus,
        toStatus: result.toStatus,
        occurredAt: result.occurredAt,
        traceId: '',
        extra: ctx.eventPayloadExtra ?? {}
      }
      await this.publisher.publish(payload)
    }
    return result
  }

  /**
   * 仅查询当前状态（不加锁），供 service 在迁移前先做业务判断（如取消必须 status ∈ [0,10]）
   * 参数：orderNo / orderType
   * 返回值：当前 status；订单不存在抛 10300
   */
  async getCurrentStatus(orderNo: string, orderType: OrderType): Promise<number> {
    const yyyymm = this.assertYyyymm(orderNo)
    const tbl = this.mainTable(orderType, yyyymm)
    const row = await this.dataSource.query<Array<{ status: number }>>(
      `SELECT status FROM \`${tbl}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`,
      [orderNo]
    )
    const first = row[0]
    if (!first) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    return Number(first.status)
  }

  /* ==========================================================================
   * 内部：核心事务
   * ========================================================================== */

  /**
   * transit 真正实现（已加锁，外层负责释放）
   */
  private async transitInternal(
    orderNo: string,
    orderType: OrderType,
    event: OrderEventName,
    ctx: TransitionContext
  ): Promise<TransitionResult> {
    const yyyymm = this.assertYyyymm(orderNo)
    const mainTbl = this.mainTable(orderType, yyyymm)
    const logTbl = OrderShardingHelper.statusLog(new Date())

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      const current = await this.lockAndReadCurrent(queryRunner, mainTbl, orderNo, orderType)
      const transitions = getTransitionsTable(orderType).get(current.status)
      const config = transitions?.get(event)
      if (!config) {
        throw new BusinessException(
          BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
          `订单 ${orderNo} 当前状态 ${current.status} 不支持事件 ${event}`
        )
      }

      const opType = ctx.opType ?? config.opType ?? OrderOpTypeEnum.SYSTEM
      const fromStatus = current.status
      const toStatus = config.to

      /* 1) UPDATE 主表 + CAS（status=fromStatus）防并发 */
      const updateResult = await this.updateMainTable(
        queryRunner.manager,
        mainTbl,
        orderNo,
        fromStatus,
        toStatus,
        ctx.additionalFields ?? {}
      )
      if (updateResult !== 1) {
        throw new BusinessException(
          BizErrorCode.BIZ_DATA_CONFLICT,
          `订单 ${orderNo} 状态已被并发更新（期望 ${fromStatus} → ${toStatus}，受影响 ${updateResult} 行）`
        )
      }

      /* 2) INSERT 状态日志 */
      const statusLogId = await this.insertStatusLog(queryRunner.manager, logTbl, {
        orderNo,
        orderType,
        fromStatus,
        toStatus,
        opType,
        opId: ctx.opId,
        opIp: ctx.opIp ?? null,
        remark: ctx.remark ?? null,
        extra: ctx.extra ?? null
      })

      await queryRunner.commitTransaction()
      const occurredAt = Date.now()
      this.logger.log(
        `[STM] orderNo=${orderNo} type=${orderType} ${fromStatus}→${toStatus} via ${event} log=${statusLogId}`
      )
      return {
        orderNo,
        orderType,
        event,
        fromStatus,
        toStatus,
        statusLogId,
        occurredAt
      }
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

  /* ==========================================================================
   * 内部：分表 / SQL helpers
   * ========================================================================== */

  /**
   * 根据 order_no 反推 yyyymm（订单号本身已编码 yyyyMMdd），失败抛系统错
   */
  private assertYyyymm(orderNo: string): string {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `无法解析订单号 ${orderNo} 的物理分表月份`
      )
    }
    return yyyymm
  }

  /**
   * 根据 orderType + yyyymm 拼接主表名
   */
  private mainTable(orderType: OrderType, yyyymm: string): string {
    if (orderType === OrderTypeEnum.TAKEOUT) {
      return OrderShardingHelper.tableName('order_takeout', this.dateFromYyyymm(yyyymm))
    }
    return OrderShardingHelper.tableName('order_errand', this.dateFromYyyymm(yyyymm))
  }

  /**
   * 把 yyyymm（如 '202604'）还原为该月的 1 号 Date（北京时间日 1 日 00:00 UTC+8）
   * 用途：仅给 ShardingHelper.tableName 用（它内部会再 +8h 折算回 yyyymm）
   * 实现：构造 UTC 1 日 -8h 的时间戳，使 ShardingHelper toYyyymm 内 +8h 落到目标月 1 日
   */
  private dateFromYyyymm(yyyymm: string): Date {
    const y = Number(yyyymm.slice(0, 4))
    const m = Number(yyyymm.slice(4, 6))
    return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
  }

  /**
   * 行锁查当前订单（FOR UPDATE）
   * 外卖表有 shop_id / merchant_id；跑腿表没有，分支查询；统一拼成 CurrentOrderRow
   */
  private async lockAndReadCurrent(
    queryRunner: QueryRunner,
    table: string,
    orderNo: string,
    orderType: OrderType
  ): Promise<CurrentOrderRow> {
    if (orderType === OrderTypeEnum.TAKEOUT) {
      const rows = await queryRunner.manager.query<
        Array<{
          status: number
          pay_status: number
          user_id: string
          shop_id: string | null
          merchant_id: string | null
          rider_id: string | null
        }>
      >(
        `SELECT status, pay_status, user_id, shop_id, merchant_id, rider_id
         FROM \`${table}\`
         WHERE order_no = ? AND is_deleted = 0
         LIMIT 1
         FOR UPDATE`,
        [orderNo]
      )
      const first = rows[0]
      if (!first) {
        throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
      }
      return {
        status: Number(first.status),
        payStatus: Number(first.pay_status),
        userId: String(first.user_id),
        shopId: first.shop_id != null ? String(first.shop_id) : null,
        merchantId: first.merchant_id != null ? String(first.merchant_id) : null,
        riderId: first.rider_id != null ? String(first.rider_id) : null
      }
    }
    /* 跑腿主表 */
    const rows = await queryRunner.manager.query<
      Array<{
        status: number
        pay_status: number
        user_id: string
        rider_id: string | null
      }>
    >(
      `SELECT status, pay_status, user_id, rider_id
       FROM \`${table}\`
       WHERE order_no = ? AND is_deleted = 0
       LIMIT 1
       FOR UPDATE`,
      [orderNo]
    )
    const first = rows[0]
    if (!first) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    return {
      status: Number(first.status),
      payStatus: Number(first.pay_status),
      userId: String(first.user_id),
      shopId: null,
      merchantId: null,
      riderId: first.rider_id != null ? String(first.rider_id) : null
    }
  }

  /**
   * UPDATE 主表（CAS：status=fromStatus）+ 同事务内额外字段
   * 参数：
   *   - manager 事务内 EntityManager
   *   - table   物理主表名
   *   - orderNo / fromStatus / toStatus
   *   - additional 额外字段（key 为 entity 字段驼峰；本函数转下划线列名）
   * 返回值：affectedRows
   */
  private async updateMainTable(
    manager: EntityManager,
    table: string,
    orderNo: string,
    fromStatus: number,
    toStatus: number,
    additional: Record<string, string | number | Date | null>
  ): Promise<number> {
    const setClauses: string[] = ['`status` = ?', '`updated_at` = NOW(3)']
    const params: Array<string | number | Date | null> = [toStatus]

    for (const [key, value] of Object.entries(additional)) {
      const column = this.camelToSnake(key)
      setClauses.push(`\`${column}\` = ?`)
      params.push(value)
    }

    params.push(orderNo, fromStatus)
    const sql = `UPDATE \`${table}\` SET ${setClauses.join(', ')} WHERE order_no = ? AND status = ? AND is_deleted = 0`
    const raw = (await manager.query(sql, params)) as { affectedRows?: number }
    return raw.affectedRows ?? 0
  }

  /**
   * INSERT 一条 order_status_log
   * 参数：manager / 物理日志表名 / 字段 input
   * 返回值：日志主键（雪花字符串）
   */
  private async insertStatusLog(
    manager: EntityManager,
    table: string,
    input: {
      orderNo: string
      orderType: OrderType
      fromStatus: number | null
      toStatus: number
      opType: number
      opId: string | null
      opIp: Buffer | null
      remark: string | null
      extra: Record<string, unknown> | null
    }
  ): Promise<string> {
    const id = SnowflakeId.next()
    const now = new Date()
    await manager.query(
      `INSERT INTO \`${table}\`
        (id, tenant_id, order_no, order_type, from_status, to_status,
         op_type, op_id, op_ip, remark, extra, is_deleted, created_at, updated_at)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        input.orderNo,
        input.orderType,
        input.fromStatus,
        input.toStatus,
        input.opType,
        input.opId,
        input.opIp,
        input.remark,
        input.extra ? JSON.stringify(input.extra) : null,
        now,
        now
      ]
    )
    return id
  }

  /**
   * 驼峰 → 下划线（仅本 service 用到的字段集；不引入额外依赖）
   */
  private camelToSnake(input: string): string {
    return input.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)
  }

  /* ==========================================================================
   * 内部：分布式锁
   * ========================================================================== */

  /**
   * 抢占分布式锁
   * 返回值：true 抢到 / false 未抢到
   */
  private async acquireLock(orderNo: string, token: string): Promise<boolean> {
    const ok = await this.redis.set(
      ORDER_LOCK_KEY(orderNo),
      token,
      'EX',
      ORDER_LOCK_TTL_SECONDS,
      'NX'
    )
    return ok === 'OK'
  }

  /**
   * 释放锁（lua 比对 token；失败仅 warn 不抛）
   */
  private async releaseLock(orderNo: string, token: string): Promise<void> {
    try {
      await this.redis.eval(LUA_RELEASE_LOCK, 1, ORDER_LOCK_KEY(orderNo), token)
    } catch (err) {
      this.logger.warn(`释放订单锁失败 orderNo=${orderNo}：${(err as Error).message}`)
    }
  }
}
