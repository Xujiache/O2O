/**
 * @file dispatch.service.ts
 * @stage P4/T4.36 + T4.39（Sprint 6）
 * @desc Dispatch 主入口：CRUD + 系统派单 Worker（15s 超时 next；3 次失败进抢单池）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 主流程（DESIGN_P4 §5.2 / V4.27）：
 *   dispatchOrder(orderNo, orderType?) → 串行 ≤ 3 次系统派单尝试
 *     1) lock:dispatch:{orderNo} 30s
 *     2) 解析订单上下文（city / pickup / delivery）
 *     3) candidate.findCandidates → 空 → 直接进入抢单池
 *     4) scoring.score 全量 → 取 Top1
 *     5) INSERT dispatch_record(status=0, expire_at=now+15s) + 推送 RIDER_DISPATCH
 *     6) BullMQ delay 15s → handleTimeout(orderNo, dispatchRecordId)
 *
 *   handleTimeout：
 *     1) 校验 dispatch_record 仍 status=0（已被骑手 accept/reject 则跳过）
 *     2) UPDATE status=3（超时）
 *     3) 递归调 dispatchOrder（attempt 透传，保护循环上限）
 *
 *   accept / reject：骑手接受 / 拒绝系统派单
 *     - accept：dispatch_record status=1 + 主表 status=20 + 缓存活跃订单几何
 *     - reject：dispatch_record status=2 + 立即 dispatchOrder
 *
 *   manualDispatch：管理后台强制指派
 *     - 直接 INSERT(dispatch_mode=3, status=1) + 主表 UPDATE
 *
 * 备注：
 *   - 不调 OrderStateMachine（任务说明 §7.4 简化方案）；用 raw query 直接 UPDATE 主表 + 写状态日志
 *   - BullMQ queue 名 `dispatch-retry`；processor 在 dispatch-retry.processor.ts
 *   - 不订阅 OrderPaid 事件（Sprint 8 编排接入），dispatchOrder 由外部主动调用
 */

import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { randomUUID } from 'crypto'
import type Redis from 'ioredis'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '@/common'
import { DispatchRecord } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { MessageService } from '@/modules/message/message.service'
import { OrderShardingHelper } from '@/modules/order/order-sharding.helper'
import { SysConfigService } from '@/modules/system/sys-config.service'
import {
  DEFAULT_DISPATCH_MAX_ATTEMPTS,
  DEFAULT_DISPATCH_RESPONSE_TIMEOUT_MS,
  SYS_KEY_DISPATCH_MAX_ATTEMPTS,
  SYS_KEY_DISPATCH_RESPONSE_TIMEOUT_MS
} from '@/modules/system/sys-config.keys'
import { SnowflakeId } from '@/utils'
import { type DispatchListQueryDto, type DispatchRecordVo } from '../dto/dispatch.dto'
import {
  DispatchModeEnum,
  DispatchStatusEnum,
  OrderTypeForDispatch,
  type DispatchOrderContext,
  type OrderTypeForDispatch as OrderTypeForDispatchValue,
  type RankedCandidate
} from '../types/dispatch.types'
import { CandidateService } from './candidate.service'
import { GrabService } from './grab.service'
import { RouteMatchService } from './route-match.service'
import { ScoringService } from './scoring.service'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** dispatch-retry BullMQ 队列名 */
export const DISPATCH_RETRY_QUEUE = 'dispatch-retry'

/** delay 检查任务名 */
export const CHECK_TIMEOUT_JOB = 'check-timeout'

/** 派单锁 Key + TTL（30s） */
const DISPATCH_LOCK_KEY = (orderNo: string): string => `lock:dispatch:${orderNo}`
const DISPATCH_LOCK_TTL_S = 30

/** 应答超时（毫秒）默认值：DESIGN §5.2 / V4.27（P9 Sprint 3 起改读 sys_config dispatch.response_timeout_ms） */
const RESPONSE_TIMEOUT_MS_DEFAULT = DEFAULT_DISPATCH_RESPONSE_TIMEOUT_MS

/** 系统派单最大重试次数默认值：超过进抢单池（P9 Sprint 3 起改读 sys_config dispatch.max_attempts） */
const MAX_DISPATCH_ATTEMPTS_DEFAULT = DEFAULT_DISPATCH_MAX_ATTEMPTS

/** OperationLog op_type：5 系统 / 4 管理员 / 3 骑手 */
const OP_TYPE_SYSTEM = 5
const OP_TYPE_ADMIN = 4
const OP_TYPE_RIDER = 3

/** 订单待接单 / 已接受 status */
const ORDER_PENDING_ACCEPT = 10
const ORDER_ACCEPTED = 20

/** raw query 受影响行数 */
interface UpdateResultPacket {
  affectedRows?: number
}

/** dispatch-retry Job payload */
export interface DispatchRetryJob {
  dispatchRecordId: string
  orderNo: string
  orderType: OrderTypeForDispatchValue
  attempt: number
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(DispatchRecord)
    private readonly dispatchRepo: Repository<DispatchRecord>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(DISPATCH_RETRY_QUEUE) private readonly retryQueue: Queue<DispatchRetryJob>,
    private readonly candidateService: CandidateService,
    private readonly scoringService: ScoringService,
    private readonly routeMatchService: RouteMatchService,
    private readonly grabService: GrabService,
    private readonly messageService: MessageService,
    /**
     * P9 Sprint 3 / W3.A.1：sys_config 全量接入。
     *   - dispatch.response_timeout_ms / dispatch.max_attempts 改读 sys_config，缺失时回退默认 15s / 3 次
     *   - @Optional() 保证旧测试 / mock 模式不阻塞
     */
    @Optional() private readonly sysConfigService?: SysConfigService
  ) {}

  /**
   * 解析应答超时（毫秒）：sys_config dispatch.response_timeout_ms 优先，缺失回退默认 15000
   */
  private async resolveResponseTimeoutMs(): Promise<number> {
    if (!this.sysConfigService) return RESPONSE_TIMEOUT_MS_DEFAULT
    const v = await this.sysConfigService.get<number>(
      SYS_KEY_DISPATCH_RESPONSE_TIMEOUT_MS,
      RESPONSE_TIMEOUT_MS_DEFAULT
    )
    return typeof v === 'number' && Number.isFinite(v) && v >= 1000
      ? v
      : RESPONSE_TIMEOUT_MS_DEFAULT
  }

  /**
   * 解析系统派单最大重试次数：sys_config dispatch.max_attempts 优先，缺失回退默认 3
   */
  private async resolveMaxAttempts(): Promise<number> {
    if (!this.sysConfigService) return MAX_DISPATCH_ATTEMPTS_DEFAULT
    const v = await this.sysConfigService.get<number>(
      SYS_KEY_DISPATCH_MAX_ATTEMPTS,
      MAX_DISPATCH_ATTEMPTS_DEFAULT
    )
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10
      ? v
      : MAX_DISPATCH_ATTEMPTS_DEFAULT
  }

  /* ============================================================================
   * 派单主入口：dispatchOrder
   * ============================================================================ */

  /**
   * 系统派单（按候选评分推送 Top1，15s 超时 next；3 次失败进抢单池）
   *
   * 参数：
   *   - orderNo
   *   - orderType        1 外卖 / 2 跑腿
   *   - attempt          重试次数（外部首次为 0；超时 worker 触发递归 +1）
   * 返回值：
   *   - 推送成功 → DispatchRecordVo
   *   - 候选耗尽 → null（订单已转入抢单池）
   * 错误：
   *   - 订单不存在 / 抢锁失败抛业务异常
   */
  async dispatchOrder(
    orderNo: string,
    orderType: OrderTypeForDispatchValue,
    attempt: number = 0
  ): Promise<DispatchRecordVo | null> {
    /* 锁 */
    const lockToken = randomUUID()
    const acquired = await this.acquireLock(orderNo, lockToken)
    if (!acquired) {
      throw new BusinessException(
        BizErrorCode.BIZ_DATA_CONFLICT,
        `订单 ${orderNo} 派单锁被占用，稍后再试`
      )
    }

    try {
      /* 取消订单或非待派单状态直接退出 */
      const orderCtx = await this.loadOrderContext(orderNo, orderType)
      if (!orderCtx) {
        throw new BusinessException(
          BizErrorCode.BIZ_ORDER_NOT_FOUND,
          `订单 ${orderNo} 不存在或未生成`
        )
      }

      const orderStatus = await this.fetchOrderStatus(orderNo, orderType)
      if (orderStatus !== ORDER_PENDING_ACCEPT) {
        this.logger.log(
          `[DISPATCH] 跳过派单 order=${orderNo} status=${orderStatus} 不为 ${ORDER_PENDING_ACCEPT}`
        )
        return null
      }

      /* 候选 → 评分 → Top1 */
      const candidates = await this.candidateService.findCandidates(orderCtx)
      if (candidates.length === 0) {
        await this.markGrabPool(orderCtx)
        this.logger.log(`[DISPATCH] 无候选骑手 order=${orderNo} attempt=${attempt} → 进入抢单池`)
        return null
      }

      const ranked = await this.rankCandidates(candidates, orderCtx)
      const top = ranked[0]
      if (!top) {
        await this.markGrabPool(orderCtx)
        return null
      }

      /* 写 dispatch_record + delay 15s（或 sys_config 配置值）检查 + 推送 */
      const responseTimeoutMs = await this.resolveResponseTimeoutMs()
      const expireAt = new Date(Date.now() + responseTimeoutMs)
      const drId = await this.insertDispatchRecord({
        orderNo,
        orderType,
        riderId: top.candidate.riderId,
        breakdown: top.breakdown,
        expireAt,
        attempt
      })

      await this.scheduleTimeoutJob(drId, orderNo, orderType, attempt, responseTimeoutMs)
      await this.pushDispatchMessage(top, orderCtx)

      const record = await this.dispatchRepo.findOne({ where: { id: drId } })
      if (!record) {
        throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, '派单记录写入异常')
      }
      return this.toVo(record)
    } finally {
      await this.releaseLock(orderNo, lockToken)
    }
  }

  /* ============================================================================
   * 超时回调：handleTimeout（被 dispatch-retry processor 调用）
   * ============================================================================ */

  /**
   * 应答超时处理：
   *   1) 仍是 status=0 → UPDATE status=3 超时
   *   2) attempt < 3 → 递归调 dispatchOrder（attempt+1）
   *   3) attempt >= 3 → 进入抢单池
   */
  async handleTimeout(
    dispatchRecordId: string,
    orderNo: string,
    orderType: OrderTypeForDispatchValue,
    attempt: number
  ): Promise<void> {
    const record = await this.dispatchRepo.findOne({ where: { id: dispatchRecordId } })
    if (!record) {
      this.logger.warn(`[DISPATCH-TIMEOUT] dispatchRecord ${dispatchRecordId} 不存在`)
      return
    }
    if (record.status !== DispatchStatusEnum.PENDING) {
      this.logger.log(
        `[DISPATCH-TIMEOUT] dispatchRecord=${dispatchRecordId} status=${record.status}，已应答不处理`
      )
      return
    }
    await this.dispatchRepo.update(
      { id: dispatchRecordId },
      {
        status: DispatchStatusEnum.TIMEOUT,
        respondedAt: new Date(),
        updatedAt: new Date()
      }
    )

    const nextAttempt = attempt + 1
    const maxAttempts = await this.resolveMaxAttempts()
    if (nextAttempt >= maxAttempts) {
      const orderCtx = await this.loadOrderContext(orderNo, orderType)
      if (orderCtx) {
        await this.markGrabPool(orderCtx)
      }
      this.logger.warn(
        `[DISPATCH-TIMEOUT] order=${orderNo} attempts=${nextAttempt} 达上限，进入抢单池`
      )
      return
    }
    try {
      await this.dispatchOrder(orderNo, orderType, nextAttempt)
    } catch (err) {
      this.logger.error(
        `[DISPATCH-TIMEOUT] re-dispatch 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /* ============================================================================
   * 骑手响应：accept / reject
   * ============================================================================ */

  /**
   * 骑手接受系统派单
   * 参数：orderNo / orderType / riderId
   * 返回值：DispatchRecordVo
   * 错误：
   *   - 派单记录不存在 / 非本人
   *   - 已应答（status≠0）
   *   - 已超时（expire_at < now）
   */
  async acceptDispatch(
    orderNo: string,
    orderType: OrderTypeForDispatchValue,
    riderId: string
  ): Promise<DispatchRecordVo> {
    const record = await this.findActivePending(orderNo, riderId)

    const now = new Date()
    if (record.expireAt && record.expireAt.getTime() < now.getTime()) {
      throw new BusinessException(BizErrorCode.BIZ_DISPATCH_TIMEOUT, '派单已超时')
    }

    /* 同事务：dispatch_record + 主表 UPDATE + 状态日志 */
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
      if (!yyyymm) {
        throw new BusinessException(
          BizErrorCode.SYSTEM_INTERNAL_ERROR,
          `订单号 ${orderNo} 无法解析分表月份`
        )
      }
      const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
      const mainTable =
        orderType === OrderTypeForDispatch.TAKEOUT
          ? OrderShardingHelper.tableName('order_takeout', date)
          : OrderShardingHelper.tableName('order_errand', date)
      const logTable = OrderShardingHelper.statusLog(new Date())

      const updateRes = (await queryRunner.manager.query(
        `UPDATE \`${mainTable}\`
            SET rider_id = ?, status = ?, accept_at = ?, updated_at = ?
          WHERE order_no = ? AND status = ? AND is_deleted = 0`,
        [riderId, ORDER_ACCEPTED, now, now, orderNo, ORDER_PENDING_ACCEPT]
      )) as UpdateResultPacket
      if ((updateRes.affectedRows ?? 0) !== 1) {
        throw new BusinessException(
          BizErrorCode.BIZ_DATA_CONFLICT,
          `订单 ${orderNo} 状态非待接单，无法接受派单`
        )
      }

      await queryRunner.manager.query(
        `UPDATE dispatch_record
            SET status = ?, accepted_at = ?, responded_at = ?, updated_at = ?
          WHERE id = ?`,
        [DispatchStatusEnum.ACCEPTED, now, now, now, record.id]
      )

      await queryRunner.manager.query(
        `INSERT INTO \`${logTable}\`
           (id, tenant_id, order_no, order_type, from_status, to_status,
            op_type, op_id, op_ip, remark, extra,
            is_deleted, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
        [
          SnowflakeId.next(),
          orderNo,
          orderType,
          ORDER_PENDING_ACCEPT,
          ORDER_ACCEPTED,
          OP_TYPE_RIDER,
          riderId,
          '骑手接受系统派单',
          JSON.stringify({ dispatchRecordId: record.id }),
          now,
          now
        ]
      )
      await queryRunner.commitTransaction()
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

    /* 维护活跃订单 + 顺路几何 */
    await this.candidateService.appendActiveOrder(riderId, orderNo)
    const orderCtx = await this.loadOrderContext(orderNo, orderType)
    if (orderCtx && orderCtx.deliveryLng != null && orderCtx.deliveryLat != null) {
      await this.routeMatchService.cacheActiveOrderGeo({
        orderNo,
        pickupLng: orderCtx.pickupLng,
        pickupLat: orderCtx.pickupLat,
        deliveryLng: orderCtx.deliveryLng,
        deliveryLat: orderCtx.deliveryLat
      })
    }

    const updated = await this.dispatchRepo.findOne({ where: { id: record.id } })
    if (!updated) {
      throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, '派单记录读取失败')
    }
    return this.toVo(updated)
  }

  /**
   * 骑手拒绝系统派单
   * 参数：orderNo / orderType / riderId / reason
   * 返回值：DispatchRecordVo
   */
  async rejectDispatch(
    orderNo: string,
    orderType: OrderTypeForDispatchValue,
    riderId: string,
    reason: string
  ): Promise<DispatchRecordVo> {
    const record = await this.findActivePending(orderNo, riderId)
    const now = new Date()
    await this.dispatchRepo.update(
      { id: record.id },
      {
        status: DispatchStatusEnum.REJECTED,
        respondedAt: now,
        rejectReason: reason,
        updatedAt: now
      }
    )
    /* 立即重新派单（不影响调用方）*/
    void this.dispatchOrder(orderNo, orderType, 0).catch((err) => {
      this.logger.warn(
        `reject 后立即派单失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    })
    const updated = await this.dispatchRepo.findOne({ where: { id: record.id } })
    if (!updated) {
      throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, '派单记录读取失败')
    }
    return this.toVo(updated)
  }

  /* ============================================================================
   * 管理后台：强制指派 / 列表
   * ============================================================================ */

  /**
   * 管理后台强制指派
   * 参数：orderNo / orderType / riderId / opAdminId
   * 返回值：DispatchRecordVo
   */
  async manualDispatch(
    orderNo: string,
    orderType: OrderTypeForDispatchValue,
    riderId: string,
    opAdminId: string
  ): Promise<DispatchRecordVo> {
    const orderStatus = await this.fetchOrderStatus(orderNo, orderType)
    if (orderStatus !== ORDER_PENDING_ACCEPT) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        `订单 ${orderNo} 状态 ${orderStatus} 不可指派`
      )
    }

    const orderCtx = await this.loadOrderContext(orderNo, orderType)
    if (!orderCtx) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }

    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `订单号 ${orderNo} 无法解析分表月份`
      )
    }
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const mainTable =
      orderType === OrderTypeForDispatch.TAKEOUT
        ? OrderShardingHelper.tableName('order_takeout', date)
        : OrderShardingHelper.tableName('order_errand', date)
    const logTable = OrderShardingHelper.statusLog(new Date())

    const now = new Date()
    const dispatchRecordId = SnowflakeId.next()

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      const updateRes = (await queryRunner.manager.query(
        `UPDATE \`${mainTable}\`
            SET rider_id = ?, status = ?, accept_at = ?, updated_at = ?
          WHERE order_no = ? AND status = ? AND is_deleted = 0`,
        [riderId, ORDER_ACCEPTED, now, now, orderNo, ORDER_PENDING_ACCEPT]
      )) as UpdateResultPacket
      if ((updateRes.affectedRows ?? 0) !== 1) {
        throw new BusinessException(
          BizErrorCode.BIZ_DATA_CONFLICT,
          `订单 ${orderNo} 状态被并发更新或非待接单`
        )
      }
      await queryRunner.manager.query(
        `INSERT INTO dispatch_record
           (id, tenant_id, order_no, order_type, dispatch_mode, rider_id,
            status, accepted_at, responded_at, expire_at, op_admin_id, extra,
            is_deleted, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
        [
          dispatchRecordId,
          orderNo,
          orderType,
          DispatchModeEnum.MANUAL,
          riderId,
          DispatchStatusEnum.ACCEPTED,
          now,
          now,
          opAdminId,
          JSON.stringify({ source: 'manual' }),
          now,
          now
        ]
      )
      await queryRunner.manager.query(
        `INSERT INTO \`${logTable}\`
           (id, tenant_id, order_no, order_type, from_status, to_status,
            op_type, op_id, op_ip, remark, extra,
            is_deleted, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
        [
          SnowflakeId.next(),
          orderNo,
          orderType,
          ORDER_PENDING_ACCEPT,
          ORDER_ACCEPTED,
          OP_TYPE_ADMIN,
          opAdminId,
          '管理员强制指派',
          JSON.stringify({ riderId, dispatchRecordId }),
          now,
          now
        ]
      )
      await queryRunner.commitTransaction()
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

    /* 维护活跃 / 顺路几何 + 抢单池清理 */
    await this.candidateService.appendActiveOrder(riderId, orderNo)
    if (orderCtx.cityCode) {
      await this.grabService.releaseGrabKey(orderNo)
      try {
        await this.redis.srem(`dispatch:grabpool:${orderCtx.cityCode}`, orderNo)
      } catch (err) {
        this.logger.warn(
          `manualDispatch 抢单池清理失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    if (orderCtx.deliveryLng != null && orderCtx.deliveryLat != null) {
      await this.routeMatchService.cacheActiveOrderGeo({
        orderNo,
        pickupLng: orderCtx.pickupLng,
        pickupLat: orderCtx.pickupLat,
        deliveryLng: orderCtx.deliveryLng,
        deliveryLat: orderCtx.deliveryLat
      })
    }

    const record = await this.dispatchRepo.findOne({ where: { id: dispatchRecordId } })
    if (!record) {
      throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, '派单记录读取失败')
    }
    return this.toVo(record)
  }

  /* ============================================================================
   * 列表 / 详情查询
   * ============================================================================ */

  /**
   * 派单记录全量查询（管理后台）
   */
  async listDispatches(query: DispatchListQueryDto): Promise<PageResult<DispatchRecordVo>> {
    const qb = this.dispatchRepo.createQueryBuilder('d').where('d.is_deleted = 0')
    if (query.orderType !== undefined) {
      qb.andWhere('d.order_type = :ot', { ot: query.orderType })
    }
    if (query.status !== undefined) {
      qb.andWhere('d.status = :st', { st: query.status })
    }
    if (query.orderNo) {
      qb.andWhere('d.order_no LIKE :no', { no: `%${query.orderNo}%` })
    }
    if (query.riderId) {
      qb.andWhere('d.rider_id = :rid', { rid: query.riderId })
    }
    qb.orderBy('d.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 取派单记录详情
   * 参数：id
   * 返回值：DispatchRecordVo
   * 错误：BIZ_RESOURCE_NOT_FOUND
   */
  async findById(id: string): Promise<DispatchRecordVo> {
    const r = await this.dispatchRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!r) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, `派单记录 ${id} 不存在`)
    }
    return this.toVo(r)
  }

  /* ============================================================================
   * 内部：候选评分排名
   * ============================================================================ */

  /**
   * 对候选骑手批量评分 + 按分数 DESC 排序
   */
  private async rankCandidates(
    candidates: Array<Awaited<ReturnType<CandidateService['findCandidates']>>[number]>,
    order: DispatchOrderContext
  ): Promise<RankedCandidate[]> {
    const ranked: RankedCandidate[] = []
    for (const c of candidates) {
      const breakdown = await this.scoringService.score(c, order)
      ranked.push({ candidate: c, breakdown })
    }
    ranked.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore)
    return ranked
  }

  /* ============================================================================
   * 内部：DB / Redis helpers
   * ============================================================================ */

  /**
   * 加载订单上下文（city / pickup / delivery 经纬度 / serviceType）
   */
  private async loadOrderContext(
    orderNo: string,
    orderType: OrderTypeForDispatchValue
  ): Promise<DispatchOrderContext | null> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) return null
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const table =
      orderType === OrderTypeForDispatch.TAKEOUT
        ? OrderShardingHelper.tableName('order_takeout', date)
        : OrderShardingHelper.tableName('order_errand', date)
    const sql =
      orderType === OrderTypeForDispatch.TAKEOUT
        ? `SELECT city_code,
                  JSON_EXTRACT(shop_snapshot, '$.lng')    AS pickup_lng,
                  JSON_EXTRACT(shop_snapshot, '$.lat')    AS pickup_lat,
                  JSON_EXTRACT(address_snapshot, '$.lng') AS delivery_lng,
                  JSON_EXTRACT(address_snapshot, '$.lat') AS delivery_lat,
                  NULL AS service_type
             FROM \`${table}\`
            WHERE order_no = ? AND is_deleted = 0
            LIMIT 1`
        : `SELECT city_code, service_type,
                  JSON_EXTRACT(pickup_snapshot, '$.lng')   AS pickup_lng,
                  JSON_EXTRACT(pickup_snapshot, '$.lat')   AS pickup_lat,
                  JSON_EXTRACT(delivery_snapshot, '$.lng') AS delivery_lng,
                  JSON_EXTRACT(delivery_snapshot, '$.lat') AS delivery_lat
             FROM \`${table}\`
            WHERE order_no = ? AND is_deleted = 0
            LIMIT 1`
    let rows: Array<{
      city_code: string | null
      pickup_lng: number | string | null
      pickup_lat: number | string | null
      delivery_lng: number | string | null
      delivery_lat: number | string | null
      service_type?: number | null
    }> = []
    try {
      rows = await this.dataSource.query(sql, [orderNo])
    } catch (err) {
      this.logger.warn(
        `loadOrderContext 查询失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
    const first = rows[0]
    if (!first) return null
    const pickupLng = this.toNumber(first.pickup_lng)
    const pickupLat = this.toNumber(first.pickup_lat)
    if (pickupLng == null || pickupLat == null) return null
    return {
      orderNo,
      orderType,
      serviceType: first.service_type != null ? Number(first.service_type) : null,
      cityCode: first.city_code ?? '',
      pickupLng,
      pickupLat,
      deliveryLng: this.toNumber(first.delivery_lng),
      deliveryLat: this.toNumber(first.delivery_lat)
    }
  }

  /**
   * 取订单当前 status（直接查主表）
   */
  private async fetchOrderStatus(
    orderNo: string,
    orderType: OrderTypeForDispatchValue
  ): Promise<number> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `订单号 ${orderNo} 无法解析分表月份`
      )
    }
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const table =
      orderType === OrderTypeForDispatch.TAKEOUT
        ? OrderShardingHelper.tableName('order_takeout', date)
        : OrderShardingHelper.tableName('order_errand', date)
    const rows = await this.dataSource.query<Array<{ status: number }>>(
      `SELECT status FROM \`${table}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`,
      [orderNo]
    )
    const first = rows[0]
    if (!first) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    return Number(first.status)
  }

  /**
   * INSERT dispatch_record(status=0)
   * 参数：orderNo / orderType / riderId / breakdown / expireAt / attempt
   * 返回值：dispatchRecordId
   */
  private async insertDispatchRecord(input: {
    orderNo: string
    orderType: OrderTypeForDispatchValue
    riderId: string
    breakdown: RankedCandidate['breakdown']
    expireAt: Date
    attempt: number
  }): Promise<string> {
    const id = SnowflakeId.next()
    const now = new Date()
    const entity = this.dispatchRepo.create({
      id,
      tenantId: 1,
      orderNo: input.orderNo,
      orderType: input.orderType,
      dispatchMode: DispatchModeEnum.SYSTEM,
      riderId: input.riderId,
      score: input.breakdown.finalScore.toFixed(4),
      distanceM: input.breakdown.distanceM,
      status: DispatchStatusEnum.PENDING,
      acceptedAt: null,
      respondedAt: null,
      rejectReason: null,
      expireAt: input.expireAt,
      opAdminId: null,
      extra: {
        attempt: input.attempt,
        scoring: input.breakdown,
        opType: OP_TYPE_SYSTEM
      },
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    await this.dispatchRepo.save(entity)
    return id
  }

  /**
   * 推送派单消息（RIDER_DISPATCH 模板，best-effort）
   */
  private async pushDispatchMessage(
    top: RankedCandidate,
    orderCtx: DispatchOrderContext
  ): Promise<void> {
    try {
      await this.messageService.send({
        code: 'RIDER_DISPATCH',
        targetType: 3,
        targetId: top.candidate.riderId,
        vars: {
          orderNo: orderCtx.orderNo,
          distanceKm: top.candidate.distanceKm.toFixed(2)
        },
        relatedType: orderCtx.orderType,
        relatedNo: orderCtx.orderNo
      })
    } catch (err) {
      this.logger.warn(
        `RIDER_DISPATCH 推送失败 rider=${top.candidate.riderId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 进入抢单池
   */
  private async markGrabPool(orderCtx: DispatchOrderContext): Promise<void> {
    if (!orderCtx.cityCode) return
    await this.grabService.addToGrabPool(orderCtx.orderNo, orderCtx.cityCode)
    /* 把进行中订单的几何挂上去（顺路评分用）；仅当有 delivery 时 */
    if (orderCtx.deliveryLng != null && orderCtx.deliveryLat != null) {
      await this.routeMatchService.cacheActiveOrderGeo({
        orderNo: orderCtx.orderNo,
        pickupLng: orderCtx.pickupLng,
        pickupLat: orderCtx.pickupLat,
        deliveryLng: orderCtx.deliveryLng,
        deliveryLat: orderCtx.deliveryLat
      })
    }
  }

  /**
   * 找到当前骑手的待应答派单记录（status=0 + rider_id=riderId + 订单匹配）
   * 错误：未找到 → BIZ_RESOURCE_NOT_FOUND；非本人 → AUTH_PERMISSION_DENIED
   */
  private async findActivePending(orderNo: string, riderId: string): Promise<DispatchRecord> {
    const record = await this.dispatchRepo
      .createQueryBuilder('d')
      .where('d.order_no = :no AND d.rider_id = :rid AND d.status = :st AND d.is_deleted = 0', {
        no: orderNo,
        rid: riderId,
        st: DispatchStatusEnum.PENDING
      })
      .orderBy('d.created_at', 'DESC')
      .getOne()
    if (!record) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        `没有待应答的派单（order=${orderNo}）`
      )
    }
    return record
  }

  /**
   * 加 BullMQ delay 任务
   */
  private async scheduleTimeoutJob(
    dispatchRecordId: string,
    orderNo: string,
    orderType: OrderTypeForDispatchValue,
    attempt: number,
    delayMs?: number
  ): Promise<void> {
    try {
      await this.retryQueue.add(
        CHECK_TIMEOUT_JOB,
        { dispatchRecordId, orderNo, orderType, attempt } satisfies DispatchRetryJob,
        {
          delay: delayMs ?? RESPONSE_TIMEOUT_MS_DEFAULT,
          jobId: `dr-${dispatchRecordId}`,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 }
        }
      )
    } catch (err) {
      this.logger.warn(
        `scheduleTimeoutJob 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 获取派单锁（lock:dispatch:{orderNo}）
   */
  private async acquireLock(orderNo: string, token: string): Promise<boolean> {
    try {
      const ok = await this.redis.set(
        DISPATCH_LOCK_KEY(orderNo),
        token,
        'EX',
        DISPATCH_LOCK_TTL_S,
        'NX'
      )
      return ok === 'OK'
    } catch (err) {
      this.logger.warn(
        `acquireLock 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return false
    }
  }

  /**
   * 释放派单锁（lua 校验 token）
   */
  private async releaseLock(orderNo: string, token: string): Promise<void> {
    const luaScript = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`
    try {
      await this.redis.eval(luaScript, 1, DISPATCH_LOCK_KEY(orderNo), token)
    } catch (err) {
      this.logger.warn(
        `releaseLock 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /* ============================================================================
   * VO 转换
   * ============================================================================ */

  /**
   * Entity → VO
   */
  private toVo(record: DispatchRecord): DispatchRecordVo {
    return {
      id: record.id,
      orderNo: record.orderNo,
      orderType: record.orderType,
      dispatchMode: record.dispatchMode,
      riderId: record.riderId,
      score: record.score,
      distanceM: record.distanceM,
      status: record.status,
      acceptedAt: record.acceptedAt,
      respondedAt: record.respondedAt,
      rejectReason: record.rejectReason,
      expireAt: record.expireAt,
      createdAt: record.createdAt
    }
  }

  /**
   * 数字转换 helper（JSON_EXTRACT 可能返回 string）
   */
  private toNumber(input: number | string | null | undefined): number | null {
    if (input == null) return null
    const n = Number(input)
    return Number.isFinite(n) ? n : null
  }

  /* ============================================================================
   * 兜底：失败时手动测试用
   * ============================================================================ */

  /**
   * 重新派单（admin 接口透传）
   */
  async forceReDispatch(
    orderNo: string,
    orderType: OrderTypeForDispatchValue
  ): Promise<DispatchRecordVo | null> {
    return this.dispatchOrder(orderNo, orderType, 0)
  }
}
