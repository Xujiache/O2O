/**
 * @file payment-state-machine.ts
 * @stage P4/T4.29（Sprint 4）
 * @desc 支付状态机：transit(payNo, event, ctx) → 校验变迁 + 分布式锁 + 事务 + 发事件
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 状态：
 *   0 创建 → 1 支付中（adapter 唤起后）/ 2 成功（余额 / mock）/ 4 关闭
 *   1 支付中 → 2 成功 / 3 失败 / 4 关闭
 *   2 成功 → 5 已退款（refund 回调到达）
 *   5 已退款 → 5 已退款（部分退款多次到账，依然 5）
 *
 * 事件 → 目标状态映射见 PAYMENT_EVENT_TO_STATUS（types/payment.types.ts）
 *
 * 加锁：lock:pay:{payNo} 30s（Redis SET NX EX）
 *
 * 事务：UPDATE payment_record SET status, pay_at, out_trade_no, raw_response WHERE payNo
 *
 * 失败：
 *   - 拿不到锁 → BIZ_DATA_CONFLICT 10011 "支付状态切换中"
 *   - 状态不允许 → BIZ_PAYMENT_DUPLICATED 10401（如已 SUCCESS 再次 transit SUCCESS 视为幂等）
 *
 * 幂等：transit(payNo, 'PaymentSucceed') 多次调用，第二次返回 idempotent=true，不重复发事件
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { PaymentRecord } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import {
  PAYMENT_EVENT_TO_STATUS,
  PAYMENT_TRANSITION_MAP,
  type PayStatus,
  type PaymentEventName
} from '../types/payment.types'
import {
  PAYMENT_EVENTS_PUBLISHER,
  type PaymentEventPayload,
  type PaymentEventsPublisher
} from './payment-events.publisher'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 分布式锁 Key 模板 */
const LOCK_KEY = (payNo: string): string => `lock:pay:${payNo}`

/** 锁 TTL（秒） */
const LOCK_TTL_SECONDS = 30

/* ============================================================================
 * transit 上下文
 * ============================================================================ */

/**
 * 状态机变迁上下文
 *
 * 字段：
 *   - outTradeNo   三方交易号（PaymentSucceed 时回填）
 *   - paidAt       三方支付完成时间（ms）
 *   - rawResponse  三方原始返回（写入 payment_record.raw_response）
 *   - errorCode    失败代码（PaymentFailed 时填）
 *   - errorMsg     失败描述
 *   - traceId      链路追踪 ID
 *   - extra        附加事件 payload 字段
 */
export interface PaymentTransitContext {
  outTradeNo?: string
  paidAt?: number
  rawResponse?: Record<string, unknown>
  errorCode?: string
  errorMsg?: string
  traceId?: string
  extra?: Record<string, unknown>
}

/**
 * transit 返回结果
 *
 * 字段：
 *   - from         迁移前状态
 *   - to           迁移后状态
 *   - idempotent   是否幂等命中（true 时不重复发事件）
 *   - payNo        支付单号（透传）
 */
export interface PaymentTransitResult {
  from: PayStatus
  to: PayStatus
  idempotent: boolean
  payNo: string
}

/* ============================================================================
 * 状态机服务
 * ============================================================================ */

@Injectable()
export class PaymentStateMachine {
  private readonly logger = new Logger(PaymentStateMachine.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PAYMENT_EVENTS_PUBLISHER) private readonly publisher: PaymentEventsPublisher
  ) {}

  /**
   * 状态机变迁
   * 参数：
   *   payNo  平台支付单号（28 位）
   *   event  事件名（必须在 PAYMENT_EVENT_TO_STATUS 内有非 null 目标状态）
   *   ctx    可选上下文（outTradeNo / paidAt / errorCode / errorMsg / rawResponse / traceId / extra）
   * 返回值：PaymentTransitResult
   * 错误：
   *   - BIZ_DATA_CONFLICT 10011：拿不到分布式锁
   *   - BIZ_RESOURCE_NOT_FOUND 10010：payment_record 不存在
   *   - BIZ_STATE_INVALID 10013：事件目标状态非法
   *   - BIZ_ORDER_STATE_NOT_ALLOWED 10301：from→to 不在变迁表中
   *
   * 设计：
   *   1. SETNX lock:pay:{payNo} EX 30s
   *   2. 查 payment_record（行锁 SELECT FOR UPDATE）
   *   3. 解析事件目标状态；若 to=from（如 SUCCESS→SUCCESS），返回 idempotent=true
   *   4. 校验 transition map；不允许则抛错
   *   5. 事务 UPDATE payment_record + commit
   *   6. 释放锁
   *   7. 异步 publish 事件
   */
  async transit(
    payNo: string,
    event: PaymentEventName,
    ctx: PaymentTransitContext = {}
  ): Promise<PaymentTransitResult> {
    const targetStatus = PAYMENT_EVENT_TO_STATUS[event]
    if (targetStatus === null || targetStatus === undefined) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `事件 ${event} 不可直接驱动 payment_record 状态变迁`
      )
    }

    const lockKey = LOCK_KEY(payNo)
    const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const acquired = await this.redis.set(lockKey, lockToken, 'EX', LOCK_TTL_SECONDS, 'NX')
    if (acquired !== 'OK') {
      throw new BusinessException(
        BizErrorCode.BIZ_DATA_CONFLICT,
        `payNo=${payNo} 状态切换中，请稍后重试`
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    let result: PaymentTransitResult
    let needPublishPayload: PaymentEventPayload | null = null
    try {
      await queryRunner.connect()
      await queryRunner.startTransaction()

      const repo = queryRunner.manager.getRepository(PaymentRecord)
      const record = await repo.findOne({
        where: { payNo, isDeleted: 0 },
        lock: { mode: 'pessimistic_write' }
      })
      if (!record) {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, `支付单 ${payNo} 不存在`)
      }

      const fromStatus = record.status as PayStatus

      /* 幂等命中：to===from 且属于"重复事件"（SUCCESS→SUCCESS / REFUNDED→REFUNDED） */
      if (fromStatus === targetStatus) {
        await queryRunner.commitTransaction()
        result = { from: fromStatus, to: targetStatus, idempotent: true, payNo }
        this.logger.log(
          `[STATE] transit IDEMPOTENT payNo=${payNo} event=${event} status=${fromStatus}`
        )
      } else {
        const allowedNexts = PAYMENT_TRANSITION_MAP[fromStatus] ?? []
        if (!allowedNexts.includes(targetStatus)) {
          throw new BusinessException(
            BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
            `payNo=${payNo} 状态不允许：${fromStatus} → ${targetStatus}（事件 ${event}）`
          )
        }

        /* 装配 UPDATE 字段 */
        record.status = targetStatus
        if (targetStatus === 2 /* SUCCESS */) {
          record.payAt = ctx.paidAt ? new Date(ctx.paidAt) : new Date()
          if (ctx.outTradeNo) record.outTradeNo = ctx.outTradeNo
        }
        if (ctx.rawResponse) record.rawResponse = ctx.rawResponse
        if (ctx.errorCode !== undefined) record.errorCode = ctx.errorCode
        if (ctx.errorMsg !== undefined) record.errorMsg = ctx.errorMsg
        await repo.save(record)

        await queryRunner.commitTransaction()

        result = { from: fromStatus, to: targetStatus, idempotent: false, payNo }
        this.logger.log(
          `[STATE] transit OK payNo=${payNo} event=${event} ${fromStatus}→${targetStatus}`
        )

        needPublishPayload = {
          eventName: event,
          payNo: record.payNo,
          orderNo: record.orderNo,
          orderType: record.orderType,
          userId: record.userId,
          amount: record.amount,
          payMethod: record.payMethod,
          fromStatus,
          toStatus: targetStatus,
          occurredAt: Date.now(),
          traceId: ctx.traceId ?? '',
          extra: { ...(ctx.extra ?? {}), ...(ctx.outTradeNo ? { outTradeNo: ctx.outTradeNo } : {}) }
        }
      }
    } catch (err) {
      try {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
      } catch (rollbackErr) {
        this.logger.error(`[STATE] rollback 失败 payNo=${payNo}：${(rollbackErr as Error).message}`)
      }
      throw err
    } finally {
      try {
        await queryRunner.release()
      } catch {
        /* ignore */
      }
      await this.releaseLock(lockKey, lockToken)
    }

    if (needPublishPayload) {
      try {
        await this.publisher.publish(needPublishPayload)
      } catch (err) {
        this.logger.error(
          `[STATE] event publish 失败 payNo=${payNo} event=${event}：${(err as Error).message}`
        )
      }
    }
    return result
  }

  /**
   * 释放分布式锁（Lua 校验 token 防误删）
   * 参数：key 锁键；token 加锁时写入的随机串
   * 返回值：void
   */
  private async releaseLock(key: string, token: string): Promise<void> {
    const script = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end`
    try {
      await this.redis.eval(script, 1, key, token)
    } catch (err) {
      this.logger.warn(`[STATE] 释放锁失败 key=${key}：${(err as Error).message}`)
    }
  }
}
