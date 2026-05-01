/**
 * @file refund.service.ts
 * @stage P4/T4.27（Sprint 4）+ P9 Sprint 3 / W3.B.1（确认 RefundSucceed 事件发布点）
 * @desc 退款：创建 + 三方回调处理 + 幂等
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 核心接口：
 *   - createRefund(payNo, amount, reason, opAdminId?, afterSaleNo?)
 *       1) 校验 payment_record 存在 + 状态∈{2,5}
 *       2) SUM(已退累计) + amount <= payment.amount，否则 BIZ_REFUND_OVER_LIMIT 10501
 *       3) INSERT refund_record(status=0 申请) + refund_no 唯一索引
 *       4) 余额支付分支：直接调 BalanceService.refundToBalance + 转 status=2 + 发 RefundSucceed
 *       5) 第三方分支：adapter.refund → outRefundNo + status=1 处理中
 *       6) 写 OperationLog（如 opAdminId）
 *
 *   - handleRefundNotify(channel, headers, body)
 *       1) adapter.verifyNotify
 *       2) 查 refund_record by outRefundNo / refundNo（幂等 SETNX 30s）
 *       3) 事务 UPDATE refund_record.status=2 + refund_at + raw_response
 *       4) state machine transit(payNo, 'RefundSucceed') → payment_record.status=5
 *       5) 发 RefundSucceed 事件
 *
 * 幂等：
 *   - refund_no 唯一索引（DB 兜底）
 *   - createRefund 同 (payNo, amount, reason) 30s 内重复 SETNX 防抖
 *   - handleRefundNotify 同 outRefundNo 30s 内 SETNX 防重复回调
 *
 * P9 Sprint 3 / W3.B.1 事件发布确认：
 *   - 余额支付同步成功（line 257）：safePublish('RefundSucceed', ...)
 *   - 第三方同步成功（line 328）  ：safePublish('RefundSucceed', ...)
 *   - 异步回调成功（line 445）    ：safePublish('RefundSucceed', ...)
 *   - 三处均已发布；OrchestrationModule.PaymentEventsConsumer 路由到 RefundSagaService
 *     调 SettlementService.reverseForOrder 完成反向分账闭环。
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { createHash } from 'crypto'
import type Redis from 'ioredis'
import { DataSource, In, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { PaymentRecord, RefundRecord } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import {
  PAYMENT_ADAPTER_REGISTRY,
  type IPaymentAdapter,
  type NotifyRawInput,
  type VerifyNotifyResult
} from '../adapters/payment-adapter.interface'
import { PayMethod, PayStatus, RefundStatus, type PayChannelKey } from '../types/payment.types'
import { BalanceService, type BalanceRefundResult } from './balance.service'
import { PAYMENT_EVENTS_PUBLISHER, type PaymentEventsPublisher } from './payment-events.publisher'
import { PaymentStateMachine } from './payment-state-machine'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 创建退款抢占锁（防同 payNo + amount + reason 并发） */
const CREATE_LOCK_KEY = (payNo: string, hash: string): string =>
  `lock:refund:create:${payNo}:${hash}`
const CREATE_LOCK_TTL_SECONDS = 30

/** 回调幂等锁（防同 outRefundNo 重复回调） */
const NOTIFY_LOCK_KEY = (outRefundNo: string): string => `lock:refund:notify:${outRefundNo}`
const NOTIFY_LOCK_TTL_SECONDS = 30

/* ============================================================================
 * 入参 / 出参
 * ============================================================================ */

/**
 * 创建退款入参
 *
 * 字段：
 *   - payNo         原平台支付单号
 *   - amount        本次退款金额（string）
 *   - reason        退款原因
 *   - opAdminId     操作管理员 ID（人工退款时；自动退款为 null）
 *   - afterSaleNo   关联售后单号（可选）
 */
export interface CreateRefundInput {
  payNo: string
  amount: string
  reason: string
  opAdminId?: string
  afterSaleNo?: string
}

/**
 * 创建退款返回
 */
export interface CreateRefundResult {
  refundNo: string
  payNo: string
  amount: string
  status: RefundStatus
  outRefundNo: string | null
  balanceResult?: BalanceRefundResult
}

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name)

  constructor(
    @InjectRepository(RefundRecord) private readonly refundRepo: Repository<RefundRecord>,
    @InjectRepository(PaymentRecord) private readonly payRepo: Repository<PaymentRecord>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PAYMENT_ADAPTER_REGISTRY)
    private readonly adapters: Map<PayMethod, IPaymentAdapter>,
    private readonly stateMachine: PaymentStateMachine,
    private readonly balanceService: BalanceService,
    @Inject(PAYMENT_EVENTS_PUBLISHER)
    private readonly publisher: PaymentEventsPublisher,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ============================================================================
   * 1. 创建退款
   * ============================================================================ */

  /**
   * 创建退款
   * 参数：input CreateRefundInput
   * 返回值：CreateRefundResult
   *
   * 错误：
   *   - BIZ_RESOURCE_NOT_FOUND 10010：支付单不存在
   *   - BIZ_ORDER_STATE_NOT_ALLOWED 10301：支付状态不允许退款
   *   - BIZ_REFUND_OVER_LIMIT 10501：超出可退余额
   *   - BIZ_REFUND_FAILED 10500：adapter 退款失败
   *   - BIZ_DATA_CONFLICT 10011：30s 内重复创建退款
   */
  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    /* 0. 参数校验 */
    if (!input.payNo) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'payNo 必填')
    }
    const amountBn = new BigNumber(input.amount)
    if (!amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `amount 非法：${input.amount}`)
    }
    if (!input.reason || input.reason.length > 255) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'reason 非法（1~255）')
    }

    /* 1. 抢占创建锁（防同 payNo + amount + reason 并发） */
    const lockHash = createHash('md5')
      .update(`${input.amount}|${input.reason}|${input.afterSaleNo ?? ''}`)
      .digest('hex')
      .slice(0, 16)
    const lockKey = CREATE_LOCK_KEY(input.payNo, lockHash)
    const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const acquired = await this.redis.set(lockKey, lockToken, 'EX', CREATE_LOCK_TTL_SECONDS, 'NX')
    if (acquired !== 'OK') {
      throw new BusinessException(
        BizErrorCode.BIZ_DATA_CONFLICT,
        `30s 内重复创建退款 payNo=${input.payNo}`
      )
    }

    try {
      /* 2. 查支付单 */
      const payment = await this.payRepo.findOne({
        where: { payNo: input.payNo, isDeleted: 0 }
      })
      if (!payment) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          `支付单不存在 payNo=${input.payNo}`
        )
      }
      if (payment.status !== PayStatus.SUCCESS && payment.status !== PayStatus.REFUNDED) {
        throw new BusinessException(
          BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
          `支付状态不允许退款：${payment.status}`
        )
      }

      /* 3. 累计已退款金额校验 */
      const finishedRefunds = await this.refundRepo.find({
        where: {
          payNo: input.payNo,
          isDeleted: 0,
          status: In([RefundStatus.PROCESSING, RefundStatus.SUCCESS])
        }
      })
      const totalRefunded = finishedRefunds.reduce(
        (sum, r) => sum.plus(new BigNumber(r.amount)),
        new BigNumber(0)
      )
      const wouldBeTotal = totalRefunded.plus(amountBn)
      const paymentAmount = new BigNumber(payment.amount)
      if (wouldBeTotal.isGreaterThan(paymentAmount)) {
        throw new BusinessException(
          BizErrorCode.BIZ_REFUND_OVER_LIMIT,
          `超出可退额：已退 ${totalRefunded.toFixed(2)} + 本次 ${amountBn.toFixed(2)} > 原支付 ${payment.amount}`
        )
      }

      /* 4. 写 refund_record（status=0 申请） */
      const refundNo = this.generateRefundNo()
      const refundId = SnowflakeId.next()
      const refundEntity = this.refundRepo.create({
        id: refundId,
        tenantId: 1,
        refundNo,
        outRefundNo: null,
        payNo: payment.payNo,
        orderNo: payment.orderNo,
        orderType: payment.orderType,
        afterSaleNo: input.afterSaleNo ?? null,
        userId: payment.userId,
        amount: input.amount,
        refundMethod: payment.payMethod === PayMethod.BALANCE ? 2 : 1,
        status: RefundStatus.APPLIED,
        refundAt: null,
        rawResponse: null,
        errorCode: null,
        errorMsg: null,
        opAdminId: input.opAdminId ?? null
      })
      await this.refundRepo.save(refundEntity)

      this.logger.log(
        `[REFUND] created refundNo=${refundNo} payNo=${input.payNo} amount=${input.amount}`
      )

      /* 5. 发 RefundCreated 事件 */
      await this.safePublish('RefundCreated', payment, refundEntity, {
        reason: input.reason,
        afterSaleNo: input.afterSaleNo ?? null
      })

      /* 6. 余额分支：直接 SUCCESS（同步退款 + state machine REFUNDED） */
      if (payment.payMethod === PayMethod.BALANCE) {
        const balanceResult = await this.balanceService.refundToBalance(
          payment.userId,
          input.amount,
          refundNo,
          payment.orderNo
        )
        await this.refundRepo.update(
          { id: refundId },
          {
            status: RefundStatus.SUCCESS,
            refundAt: new Date(),
            outRefundNo: refundNo,
            rawResponse: { synchronous: true, balanceAfter: balanceResult.balanceAfter }
          }
        )
        await this.stateMachine.transit(payment.payNo, 'RefundSucceed', {
          rawResponse: { refundNo, balanceResult }
        })
        await this.safePublish('RefundSucceed', payment, refundEntity, {
          balanceAfter: balanceResult.balanceAfter,
          flowNo: balanceResult.flowNo
        })
        if (input.opAdminId) {
          await this.writeOpLog(input.opAdminId, refundNo, payment, input)
        }
        return {
          refundNo,
          payNo: payment.payNo,
          amount: input.amount,
          status: RefundStatus.SUCCESS,
          outRefundNo: refundNo,
          balanceResult
        }
      }

      /* 7. 第三方分支：调 adapter.refund */
      const adapter = this.adapters.get(payment.payMethod)
      if (!adapter) {
        throw new BusinessException(
          BizErrorCode.SYSTEM_CONFIG_MISSING,
          `未注册 PayMethod=${payment.payMethod} 的适配器`
        )
      }

      let outRefundNo: string | null = null
      let postStatus: RefundStatus
      try {
        const refundRes = await adapter.refund({
          refundNo,
          payNo: payment.payNo,
          outTradeNo: payment.outTradeNo,
          totalAmount: payment.amount,
          refundAmount: input.amount,
          reason: input.reason,
          notifyUrl: '/api/v1/payment/refund/notify'
        })
        outRefundNo = refundRes.outRefundNo
        if (refundRes.status === 'SUCCESS') {
          postStatus = RefundStatus.SUCCESS
        } else if (refundRes.status === 'PROCESSING') {
          postStatus = RefundStatus.PROCESSING
        } else {
          postStatus = RefundStatus.FAILED
        }
        /* 用 save 而非 update：避免 TypeORM QueryDeepPartialEntity 对 JSON 字段的递归推断报错 */
        refundEntity.outRefundNo = outRefundNo
        refundEntity.status = postStatus
        refundEntity.refundAt = postStatus === RefundStatus.SUCCESS ? new Date() : null
        refundEntity.rawResponse = refundRes.rawResponse
        await this.refundRepo.save(refundEntity)
      } catch (err) {
        const msg = (err as Error).message
        await this.refundRepo.update(
          { id: refundId },
          {
            status: RefundStatus.FAILED,
            errorCode: 'ADAPTER_REFUND_ERROR',
            errorMsg: msg.slice(0, 255)
          }
        )
        await this.safePublish('RefundFailed', payment, refundEntity, { error: msg })
        throw new BusinessException(BizErrorCode.BIZ_REFUND_FAILED, `三方退款失败：${msg}`)
      }

      /* 8. 同步成功路径：转状态机 REFUNDED + 发 RefundSucceed */
      if (postStatus === RefundStatus.SUCCESS) {
        await this.stateMachine.transit(payment.payNo, 'RefundSucceed', {
          rawResponse: { refundNo, outRefundNo }
        })
        await this.safePublish('RefundSucceed', payment, refundEntity, {
          outRefundNo
        })
      }

      if (input.opAdminId) {
        await this.writeOpLog(input.opAdminId, refundNo, payment, input)
      }

      return {
        refundNo,
        payNo: payment.payNo,
        amount: input.amount,
        status: postStatus,
        outRefundNo
      }
    } finally {
      await this.releaseLock(lockKey, lockToken)
    }
  }

  /* ============================================================================
   * 2. 退款回调处理
   * ============================================================================ */

  /**
   * 退款回调处理
   * 参数：channel 'wxpay' | 'alipay'；headers / body
   * 返回值：{ ok, reason?, refundNo? }
   *
   * 设计：
   *   1) adapter.verifyNotify
   *   2) outRefundNo SETNX 30s 防重复回调
   *   3) 查 refund_record（按 out_refund_no 优先；缺则按 refund_no fallback）
   *   4) 已 SUCCESS → 直接返回 ok=true（幂等）
   *   5) UPDATE refund_record.status=2 + refund_at + raw_response
   *   6) state machine transit(payNo, 'RefundSucceed')
   *   7) 发 RefundSucceed 事件
   */
  async handleRefundNotify(
    channel: PayChannelKey,
    headers: NotifyRawInput['headers'],
    body: unknown
  ): Promise<{ ok: boolean; reason?: string; refundNo?: string }> {
    const adapter = this.findAdapterByChannelKey(channel)
    if (!adapter) {
      return { ok: false, reason: `未注册 channel=${channel} 的适配器` }
    }
    const verifyResult: VerifyNotifyResult = adapter.verifyNotify({ headers, body })
    if (!verifyResult.ok || !verifyResult.payload) {
      this.logger.warn(`[REFUND-NOTIFY] verify 失败 channel=${channel}: ${verifyResult.reason}`)
      return { ok: false, reason: verifyResult.reason }
    }

    /* 退款回调 payload 复用 verifyNotify 标准化字段：
     * 这里 payNo 解释为：refundNo（mock 模式约定 body.payNo 即退款单号；
     * 真实模式由 adapter 在 P9 接入时拆出 refund_no）。 */
    const refundNo = verifyResult.payload.payNo
    const outRefundNo = verifyResult.payload.outTradeNo
    const lockKey = NOTIFY_LOCK_KEY(outRefundNo || refundNo)
    const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const acquired = await this.redis.set(lockKey, lockToken, 'EX', NOTIFY_LOCK_TTL_SECONDS, 'NX')
    if (acquired !== 'OK') {
      this.logger.log(
        `[REFUND-NOTIFY] 30s 内重复回调（已被处理）outRefundNo=${outRefundNo} refundNo=${refundNo}`
      )
      return { ok: true, refundNo }
    }

    try {
      /* 优先按 outRefundNo 查；缺则按 refundNo */
      const refund = outRefundNo
        ? await this.refundRepo.findOne({ where: { outRefundNo, isDeleted: 0 } })
        : await this.refundRepo.findOne({ where: { refundNo, isDeleted: 0 } })
      if (!refund) {
        this.logger.warn(
          `[REFUND-NOTIFY] 找不到退款单 outRefundNo=${outRefundNo} refundNo=${refundNo}`
        )
        return { ok: false, reason: '退款单不存在' }
      }

      /* 幂等：已 SUCCESS 则直接 ok */
      if (refund.status === RefundStatus.SUCCESS) {
        this.logger.log(`[REFUND-NOTIFY] 幂等命中 refundNo=${refund.refundNo}`)
        return { ok: true, refundNo: refund.refundNo }
      }

      /* 标准化状态 → REFUND status */
      const newStatus =
        verifyResult.payload.tradeStatus === 'SUCCESS'
          ? RefundStatus.SUCCESS
          : verifyResult.payload.tradeStatus === 'FAIL'
            ? RefundStatus.FAILED
            : RefundStatus.PROCESSING

      /* 用 save 避免 JSON 字段 deep partial 推断问题 */
      refund.status = newStatus
      refund.outRefundNo = outRefundNo || refund.outRefundNo
      refund.refundAt =
        newStatus === RefundStatus.SUCCESS ? new Date(verifyResult.payload.paidAt) : null
      refund.rawResponse = verifyResult.payload.raw
      await this.refundRepo.save(refund)

      const payment = await this.payRepo.findOne({
        where: { payNo: refund.payNo, isDeleted: 0 }
      })
      if (newStatus === RefundStatus.SUCCESS && payment) {
        try {
          await this.stateMachine.transit(payment.payNo, 'RefundSucceed', {
            rawResponse: verifyResult.payload.raw,
            extra: { refundNo: refund.refundNo, outRefundNo }
          })
        } catch (err) {
          this.logger.error(
            `[REFUND-NOTIFY] state machine transit 失败 payNo=${payment.payNo}：${(err as Error).message}`
          )
        }
        await this.safePublish('RefundSucceed', payment, refund, {
          outRefundNo,
          source: 'refund-notify'
        })
      } else if (newStatus === RefundStatus.FAILED && payment) {
        await this.safePublish('RefundFailed', payment, refund, {
          reason: verifyResult.payload.tradeStatus,
          source: 'refund-notify'
        })
      }

      this.logger.log(
        `[REFUND-NOTIFY] ok refundNo=${refund.refundNo} outRefundNo=${outRefundNo} status=${newStatus}`
      )
      return { ok: true, refundNo: refund.refundNo }
    } finally {
      await this.releaseLock(lockKey, lockToken)
    }
  }

  /* ============================================================================
   * 3. 内部工具
   * ============================================================================ */

  /**
   * 生成 28 位 refundNo：'R' + yyyyMMdd(8) + HHmmss(6) + snowflake_tail(13)
   */
  private generateRefundNo(): string {
    const now = new Date()
    const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
    const y = beijing.getUTCFullYear()
    const m = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
    const d = beijing.getUTCDate().toString().padStart(2, '0')
    const hh = beijing.getUTCHours().toString().padStart(2, '0')
    const mm = beijing.getUTCMinutes().toString().padStart(2, '0')
    const ss = beijing.getUTCSeconds().toString().padStart(2, '0')
    const snowflake = SnowflakeId.next()
    const tail = snowflake.slice(-13).padStart(13, '0')
    return `R${y}${m}${d}${hh}${mm}${ss}${tail}`
  }

  /** 由 channelKey 反查 adapter（refund-notify 路由参数用） */
  private findAdapterByChannelKey(key: PayChannelKey): IPaymentAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.channelKey === key) return adapter
    }
    return null
  }

  /** 释放分布式锁（Lua 校验 token） */
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
      this.logger.warn(`[REFUND] 释放锁失败 key=${key}：${(err as Error).message}`)
    }
  }

  /** 发布事件（best-effort） */
  private async safePublish(
    eventName: 'RefundCreated' | 'RefundSucceed' | 'RefundFailed',
    payment: PaymentRecord,
    refund: RefundRecord,
    extra: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.publisher.publish({
        eventName,
        payNo: payment.payNo,
        orderNo: payment.orderNo,
        orderType: payment.orderType,
        userId: payment.userId,
        amount: refund.amount,
        payMethod: payment.payMethod,
        fromStatus: payment.status,
        toStatus: eventName === 'RefundSucceed' ? PayStatus.REFUNDED : payment.status,
        occurredAt: Date.now(),
        traceId: '',
        extra: {
          refundNo: refund.refundNo,
          outRefundNo: refund.outRefundNo,
          ...extra
        }
      })
    } catch (err) {
      this.logger.error(
        `[REFUND] 事件 ${eventName} 发布失败 refundNo=${refund.refundNo}：${(err as Error).message}`
      )
    }
  }

  /** 写操作日志（管理端人工退款） */
  private async writeOpLog(
    opAdminId: string,
    refundNo: string,
    payment: PaymentRecord,
    input: CreateRefundInput
  ): Promise<void> {
    try {
      await this.operationLogService.write({
        opAdminId,
        module: 'finance',
        action: 'refund',
        resourceType: 'refund_record',
        resourceId: refundNo,
        description: `人工退款 payNo=${payment.payNo} amount=${input.amount} reason=${input.reason}`,
        extra: {
          payNo: payment.payNo,
          orderNo: payment.orderNo,
          amount: input.amount,
          reason: input.reason,
          afterSaleNo: input.afterSaleNo ?? null
        }
      })
    } catch (err) {
      this.logger.warn(`[REFUND] 写 OperationLog 失败：${(err as Error).message}`)
    }
  }
}
