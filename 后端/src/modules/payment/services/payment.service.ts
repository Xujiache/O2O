/**
 * @file payment.service.ts
 * @stage P4/T4.24 + T4.25 + T4.26（Sprint 4）
 * @desc 支付主入口：create / queryStatus
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 接口：
 *   - create(orderNo, payMethod, payerClientType, ctx)
 *       1) 生成 payNo（28 位）
 *       2) 写 payment_record（status=0 创建）
 *       3) 选择 adapter（PayMethod → IPaymentAdapter）
 *       4) 调 adapter.createPay
 *       5) 余额支付 → BalanceService.payByBalance（事务内 status=2 直接成功）
 *          其他 → 状态机 transit(payNo, 'PaymentCreated' 等价于已 0 态; PaymentCreated→PAYING)
 *                 写入 prepayParams 后转 status=1 支付中
 *       6) 发 PaymentCreated 事件
 *
 *   - queryStatus(payNo, currentUid)
 *       owner 校验 user_id===uid，否则 BIZ_ORDER_NOT_OWNED
 *
 * payNo 生成规则（28 位）：
 *   'P' + yyyyMMdd(8) + HHmmss(6) + snowflake_tail(13)
 *   示例：P2026041902301512345678901234
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { PaymentRecord } from '@/entities'
import { SnowflakeId } from '@/utils'
import {
  PAYMENT_ADAPTER_REGISTRY,
  type IPaymentAdapter
} from '../adapters/payment-adapter.interface'
import {
  PayMethod,
  PayStatus,
  resolvePayChannel,
  type PayerClientType
} from '../types/payment.types'
import { BalanceService, type BalancePayResult } from './balance.service'
import { PAYMENT_EVENTS_PUBLISHER, type PaymentEventsPublisher } from './payment-events.publisher'
import { PaymentStateMachine } from './payment-state-machine'

/* ============================================================================
 * 入参 / 出参
 * ============================================================================ */

/**
 * 创建支付请求（service 层）
 *
 * 字段：
 *   - orderNo            订单号（18 位）
 *   - orderType          1 外卖 / 2 跑腿
 *   - userId             付款用户 ID
 *   - amount             订单金额（string）
 *   - payMethod          支付方式
 *   - payerClientType    客户端类型（jsapi/app/native/wap，余额可空）
 *   - openId             jsapi 必传
 *   - clientIp           客户端 IP（可选）
 *   - description        商品描述
 */
export interface CreatePaymentInput {
  orderNo: string
  orderType: number
  userId: string
  amount: string
  payMethod: PayMethod
  payerClientType?: PayerClientType
  openId?: string
  clientIp?: string
  description?: string
}

/**
 * 创建支付返回
 *
 * 字段：
 *   - payNo          平台支付单号
 *   - payMethod      支付方式（透传）
 *   - status         支付状态（余额支付一步到位=2；其他=1 支付中）
 *   - amount         金额
 *   - prepayParams   前端唤起参数（adapter 返回；余额支付为空对象）
 *   - mockMode       是否 mock（前端可据此跳过真实唤起，直接联调 mock 回调）
 *   - balanceResult  余额支付返回的账户流水信息（仅 method=BALANCE 时填）
 */
export interface CreatePaymentResult {
  payNo: string
  payMethod: PayMethod
  status: PayStatus
  amount: string
  prepayParams: Record<string, unknown>
  mockMode: boolean
  balanceResult?: BalancePayResult
}

/**
 * 支付状态查询返回
 *
 * 字段：
 *   - payNo / orderNo / amount / payMethod / status / payAt / outTradeNo / channel
 */
export interface PaymentStatusInfo {
  payNo: string
  orderNo: string
  orderType: number
  amount: string
  payMethod: number
  status: number
  payAt: Date | null
  outTradeNo: string | null
  channel: string | null
}

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name)

  constructor(
    @InjectRepository(PaymentRecord) private readonly payRepo: Repository<PaymentRecord>,
    @Inject(PAYMENT_ADAPTER_REGISTRY)
    private readonly adapters: Map<PayMethod, IPaymentAdapter>,
    private readonly stateMachine: PaymentStateMachine,
    private readonly balanceService: BalanceService,
    @Inject(PAYMENT_EVENTS_PUBLISHER)
    private readonly publisher: PaymentEventsPublisher
  ) {}

  /* ============================================================================
   * 1. 创建支付
   * ============================================================================ */

  /**
   * 创建支付
   * 参数：input CreatePaymentInput
   * 返回值：CreatePaymentResult
   *
   * 流程：
   *   1) 校验参数 + 解析 channel
   *   2) 防重复支付：查 payment_record WHERE order_no=? AND status IN (0,1,2,5)，
   *      若存在 status=2/5 → BIZ_PAYMENT_DUPLICATED 10401
   *      若存在 status=0/1 同 method → 直接复用其 payNo（幂等）
   *   3) 生成 payNo + 写 payment_record（status=0）
   *   4) 余额支付分支：调 BalanceService → 直接 SUCCESS（事务内）
   *   5) 第三方分支：调 adapter.createPay → state machine 转 PAYING
   *   6) 发 PaymentCreated 事件
   */
  async create(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    /* 1. 参数校验 */
    if (!input.orderNo || input.orderNo.length !== 18) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'orderNo 必须为 18 位')
    }
    if (!input.userId) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'userId 必填')
    }
    if (!input.amount || Number.isNaN(Number(input.amount))) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `amount 非法：${input.amount}`)
    }
    if (Number(input.amount) <= 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'amount 必须 > 0')
    }
    if (![1, 2].includes(input.orderType)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'orderType 仅支持 1/2')
    }

    const channel = resolvePayChannel(input.payMethod, input.payerClientType)
    if (!channel) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `不支持的 (payMethod=${input.payMethod}, clientType=${input.payerClientType ?? 'null'}) 组合`
      )
    }
    if (
      input.payMethod === PayMethod.WX_PAY &&
      input.payerClientType === 'jsapi' &&
      !input.openId
    ) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '微信 jsapi 必须传 openId')
    }

    const adapter = this.adapters.get(input.payMethod)
    if (!adapter) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_CONFIG_MISSING,
        `未注册 PayMethod=${input.payMethod} 的适配器`
      )
    }

    /* 2. 防重复 + 幂等复用 */
    const existings = await this.payRepo.find({
      where: { orderNo: input.orderNo, isDeleted: 0 }
    })
    const finished = existings.find(
      (r) => r.status === PayStatus.SUCCESS || r.status === PayStatus.REFUNDED
    )
    if (finished) {
      throw new BusinessException(
        BizErrorCode.BIZ_PAYMENT_DUPLICATED,
        `订单 ${input.orderNo} 已有支付（payNo=${finished.payNo} status=${finished.status}）`
      )
    }
    const reusable = existings.find(
      (r) =>
        (r.status === PayStatus.CREATED || r.status === PayStatus.PAYING) &&
        r.payMethod === input.payMethod
    )
    let payNo: string
    let recordId: string
    if (reusable) {
      payNo = reusable.payNo
      recordId = reusable.id
      this.logger.log(
        `[PAY] 复用未完成支付 payNo=${payNo} orderNo=${input.orderNo} method=${input.payMethod}`
      )
    } else {
      payNo = this.generatePayNo()
      recordId = SnowflakeId.next()
      const now = new Date()
      const newRecord = this.payRepo.create({
        id: recordId,
        tenantId: 1,
        payNo,
        outTradeNo: null,
        orderNo: input.orderNo,
        orderType: input.orderType,
        userId: input.userId,
        amount: input.amount,
        payMethod: input.payMethod,
        channel,
        status: PayStatus.CREATED,
        payAt: null,
        clientIp: null,
        deviceInfo: null,
        notifyUrl: this.buildNotifyUrl(input.payMethod),
        rawRequest: { source: 'payment.create', input: this.maskInput(input) },
        rawResponse: null,
        errorCode: null,
        errorMsg: null
      })
      await this.payRepo.save(newRecord)
      this.logger.log(
        `[PAY] 新建支付单 payNo=${payNo} orderNo=${input.orderNo} method=${input.payMethod} amount=${input.amount} channel=${channel}`
      )
    }

    /* 3. 余额支付：直接走 BalanceService（事务内 status=2 SUCCESS） */
    if (input.payMethod === PayMethod.BALANCE) {
      /* 余额场景：删除 reusable 中已存在的占位行，统一由 BalanceService 写一行 SUCCESS
       * 复用占位行会导致 INSERT payNo 唯一冲突；这里改为：
       *   - 若有占位行（reusable）→ 直接软删，并复用其 payNo */
      if (reusable) {
        await this.payRepo.update({ id: recordId }, { isDeleted: 1, deletedAt: new Date() })
      } else {
        /* 把刚才插入的占位行删除，让 BalanceService 重新插入 */
        await this.payRepo.delete({ id: recordId })
      }

      const balanceResult = await this.balanceService.payByBalance(
        payNo,
        input.orderNo,
        input.orderType,
        input.userId,
        input.amount
      )

      /* 余额支付直接发 PaymentCreated + PaymentSucceed 事件 */
      await this.safePublishCreated(payNo, input, PayStatus.SUCCESS)
      await this.publisher.publish({
        eventName: 'PaymentSucceed',
        payNo,
        orderNo: input.orderNo,
        orderType: input.orderType,
        userId: input.userId,
        amount: input.amount,
        payMethod: input.payMethod,
        fromStatus: PayStatus.CREATED,
        toStatus: PayStatus.SUCCESS,
        occurredAt: Date.now(),
        traceId: '',
        extra: { channel: 'balance', flowNo: balanceResult.flowNo }
      })

      return {
        payNo,
        payMethod: input.payMethod,
        status: PayStatus.SUCCESS,
        amount: input.amount,
        prepayParams: { synchronous: true, balanceAfter: balanceResult.balanceAfter },
        mockMode: false,
        balanceResult
      }
    }

    /* 4. 第三方支付：调 adapter.createPay */
    const adapterResult = await adapter.createPay({
      payNo,
      orderNo: input.orderNo,
      orderType: input.orderType,
      userId: input.userId,
      amount: input.amount,
      method: input.payMethod,
      clientType: input.payerClientType,
      channel,
      notifyUrl: this.buildNotifyUrl(input.payMethod),
      clientIp: input.clientIp,
      description: input.description,
      openId: input.openId
    })

    /* 5. 写 raw_response + 转 PAYING（除非 adapter 已 alreadyPaid） */
    const persisted = await this.payRepo.findOne({ where: { id: recordId, isDeleted: 0 } })
    if (persisted) {
      persisted.rawResponse = adapterResult.rawResponse
      persisted.outTradeNo = adapterResult.prepayId
      await this.payRepo.save(persisted)
    }

    let finalStatus: PayStatus
    if (adapterResult.alreadyPaid) {
      finalStatus = PayStatus.SUCCESS
      await this.stateMachine.transit(payNo, 'PaymentSucceed', {
        outTradeNo: adapterResult.prepayId,
        paidAt: Date.now(),
        rawResponse: adapterResult.rawResponse
      })
    } else {
      finalStatus = PayStatus.PAYING
      try {
        await this.payRepo.update({ id: recordId }, { status: PayStatus.PAYING })
      } catch (err) {
        this.logger.warn(
          `[PAY] 切 PAYING 失败（不影响主流程，回调到达后会修正）payNo=${payNo}：${(err as Error).message}`
        )
      }
    }

    /* 6. 发 PaymentCreated 事件 */
    await this.safePublishCreated(payNo, input, finalStatus)

    return {
      payNo,
      payMethod: input.payMethod,
      status: finalStatus,
      amount: input.amount,
      prepayParams: adapterResult.prepayParams,
      mockMode: adapter.mockMode
    }
  }

  /* ============================================================================
   * 2. 查询支付状态
   * ============================================================================ */

  /**
   * 查询支付状态
   * 参数：payNo / currentUid
   * 返回值：PaymentStatusInfo
   * 错误：BIZ_RESOURCE_NOT_FOUND / BIZ_ORDER_NOT_OWNED
   */
  async queryStatus(payNo: string, currentUid: string): Promise<PaymentStatusInfo> {
    const record = await this.payRepo.findOne({ where: { payNo, isDeleted: 0 } })
    if (!record) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, `支付单 ${payNo} 不存在`)
    }
    if (record.userId !== currentUid) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_OWNED, `非本人支付单 payNo=${payNo}`)
    }
    return {
      payNo: record.payNo,
      orderNo: record.orderNo,
      orderType: record.orderType,
      amount: record.amount,
      payMethod: record.payMethod,
      status: record.status,
      payAt: record.payAt,
      outTradeNo: record.outTradeNo,
      channel: record.channel
    }
  }

  /**
   * 由 payNo 查 payment_record（内部 / 退款 service 复用）
   * 参数：payNo
   * 返回值：PaymentRecord 或 null
   */
  async findByPayNo(payNo: string): Promise<PaymentRecord | null> {
    return this.payRepo.findOne({ where: { payNo, isDeleted: 0 } })
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /**
   * 生成 28 位 payNo：'P' + yyyyMMdd(8) + HHmmss(6) + snowflake_tail(13)
   */
  private generatePayNo(): string {
    const now = new Date()
    const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
    const y = beijing.getUTCFullYear()
    const m = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
    const d = beijing.getUTCDate().toString().padStart(2, '0')
    const hh = beijing.getUTCHours().toString().padStart(2, '0')
    const mm = beijing.getUTCMinutes().toString().padStart(2, '0')
    const ss = beijing.getUTCSeconds().toString().padStart(2, '0')
    const snowflake = SnowflakeId.next()
    /* 取末 13 位拼齐 28 字符（'P' + 8 + 6 + 13 = 28） */
    const tail = snowflake.slice(-13).padStart(13, '0')
    return `P${y}${m}${d}${hh}${mm}${ss}${tail}`
  }

  /** 拼装回调 URL（按 PayMethod 路由到 wx/alipay 通知接口） */
  private buildNotifyUrl(method: PayMethod): string {
    if (method === PayMethod.WX_PAY) return '/api/v1/payment/wx/notify'
    if (method === PayMethod.ALIPAY) return '/api/v1/payment/alipay/notify'
    return '/api/v1/payment/balance/notify'
  }

  /** 入参脱敏（写入 raw_request） */
  private maskInput(input: CreatePaymentInput): Record<string, unknown> {
    return {
      orderNo: input.orderNo,
      orderType: input.orderType,
      userId: input.userId,
      amount: input.amount,
      payMethod: input.payMethod,
      payerClientType: input.payerClientType ?? null,
      openId: input.openId ? `${input.openId.slice(0, 4)}***` : null,
      clientIp: input.clientIp ?? null,
      description: input.description ?? null
    }
  }

  /** PaymentCreated 发布兜底（best-effort） */
  private async safePublishCreated(
    payNo: string,
    input: CreatePaymentInput,
    toStatus: PayStatus
  ): Promise<void> {
    try {
      await this.publisher.publish({
        eventName: 'PaymentCreated',
        payNo,
        orderNo: input.orderNo,
        orderType: input.orderType,
        userId: input.userId,
        amount: input.amount,
        payMethod: input.payMethod,
        fromStatus: null,
        toStatus,
        occurredAt: Date.now(),
        traceId: '',
        extra: {
          payerClientType: input.payerClientType ?? null
        }
      })
    } catch (err) {
      this.logger.error(`[PAY] PaymentCreated 发布失败 payNo=${payNo}：${(err as Error).message}`)
    }
  }
}
