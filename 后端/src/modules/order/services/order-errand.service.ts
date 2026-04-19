/**
 * @file order-errand.service.ts
 * @stage P4/T4.18（Sprint 3）
 * @desc 跑腿订单服务：4 类 service_type 下单 + 取消 + 共享 internals（pre-check/INSERT/状态机/冻券/超时）
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 4 类下单：
 *   1 帮送 createHelpDeliver / 2 帮取 createHelpFetch / 3 帮买 createHelpBuy / 4 帮排队 createHelpQueue
 *   - 各方法转调 createOrderInternal，按 serviceType 分支字段校验
 *
 * 状态机用法：
 *   - 下单：INSERT 订单（status=0）+ 直接写 order_status_log（fromStatus=null）+ 直接 publish OrderCreated；
 *     不调 stateMachine.transit('OrderCreated') —— 该事件未在 states-config 注册（subagent 1 设计为
 *     初始 status=0 即创建态，无前序状态可迁移）
 *   - 取消（待支付）：stateMachine.transit(orderNo, 2, 'OrderCanceled', ctx) → 0 → 60
 *   - 取消（已接单）：仍 OrderCanceled → 0|10|20→ 60（按 ERRAND_TRANSITIONS 注册）
 *
 * 幂等：
 *   - X-Idem-Key SETNX `idem:order:{key}` TTL 10min；命中则查本地映射返回原 orderNo
 *
 * 超时关单：
 *   - Redis ZSET `order:paytimeout` ZADD <expireTs> <orderNo>，由 Sprint 3 timeout-scanner（subagent 1 写）扫
 */

import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import type Redis from 'ioredis'
import { DataSource, type EntityManager } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { haversineDistanceM } from '@/modules/map/geo.util'
import { MessageService } from '@/modules/message/message.service'
import { DiscountCalcService } from '@/modules/marketing/services/discount-calc.service'
import { UserCouponService } from '@/modules/marketing/services/user-coupon.service'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import type { AuthUser } from '@/modules/auth/decorators'
import { OrderNoGenerator, SnowflakeId } from '@/utils'
import { ORDER_EVENTS_PUBLISHER, type OrderEventPayload } from '../events/order-events.constants'
import type { OrderEventsPublisher } from '../events/order-events.publisher'
import { OrderShardingHelper } from '../order-sharding.helper'
import { OrderStateMachine } from '../state-machine/order-state-machine'
import {
  OrderErrandStatusEnum,
  OrderOpTypeEnum,
  OrderPayStatusEnum,
  OrderTypeEnum,
  type OrderErrandStatus
} from '../types/order.types'
import {
  type CreateErrandOrderDto,
  type ErrandAddressDto,
  type ErrandOrderVo,
  type EstimateErrandPriceDto
} from '../dto/errand.dto'
import { ErrandPricingService, type ErrandPricingConfig } from './errand-pricing.service'
import { PickupCodeUtil } from './pickup-code.util'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 订单类型字面量（跑腿） */
const ORDER_TYPE_ERRAND = OrderTypeEnum.ERRAND

/** 用户操作来源（status_log.op_type） */
const OP_TYPE_USER = OrderOpTypeEnum.USER

/** 待支付超时（15min；与 DESIGN_P4 §2.3 一致） */
const PAY_TIMEOUT_MINUTES = 15

/** 幂等 key TTL（10min；DESIGN_P4 §2.4） */
const IDEM_KEY_TTL_SECONDS = 10 * 60

/** 幂等 key Redis 前缀 */
const IDEM_KEY = (key: string): string => `idem:order:${key}`

/** 待支付订单 ZSET（用 score=expireTs 便于扫描超时） */
const PAY_TIMEOUT_ZSET = 'order:paytimeout'

/* ============================================================================
 * 内部类型
 * ============================================================================ */

/**
 * 主 INSERT 入参（service 内 helper 使用）
 */
interface ErrandInsertParams {
  orderNo: string
  userId: string
  serviceType: number
  pickupSnapshot: Record<string, unknown> | null
  deliverySnapshot: Record<string, unknown> | null
  itemType: string | null
  itemWeightG: number | null
  itemValue: string | null
  buyList: Array<Record<string, unknown>> | null
  buyBudget: string | null
  queuePlace: string | null
  queueType: string | null
  queueDurationMin: number | null
  pickupCode: string
  expectedPickupAt: Date | null
  serviceFee: string
  tipFee: string
  insuranceFee: string
  estimatedGoods: string
  payAmount: string
  remark: string | null
  createdAt: Date
}

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class OrderErrandService {
  private readonly logger = new Logger(OrderErrandService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ORDER_EVENTS_PUBLISHER) private readonly publisher: OrderEventsPublisher,
    /* OrderStateMachine 与 OrderErrandService 同模块；forwardRef 防 Subagent 1 后续若把
       state-machine 也注入回 service 时引发循环依赖（保险措施，本期无循环） */
    @Inject(forwardRef(() => OrderStateMachine))
    private readonly stateMachine: OrderStateMachine,
    private readonly pricingService: ErrandPricingService,
    private readonly pickupCodeUtil: PickupCodeUtil,
    private readonly discountCalc: DiscountCalcService,
    private readonly userCouponService: UserCouponService,
    private readonly operationLogService: OperationLogService,
    @Optional() private readonly messageService?: MessageService
  ) {}

  /* ==========================================================================
   * 一、4 类 service_type 下单（公共 API）
   * ========================================================================== */

  /**
   * 帮送（service_type=1）
   * 参数：currentUser / dto / idemKey
   * 返回值：ErrandOrderVo
   */
  async createHelpDeliver(
    currentUser: AuthUser,
    dto: CreateErrandOrderDto,
    idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.createOrderInternal({ ...dto, serviceType: 1 }, currentUser, idemKey)
  }

  /**
   * 帮取（service_type=2）
   */
  async createHelpFetch(
    currentUser: AuthUser,
    dto: CreateErrandOrderDto,
    idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.createOrderInternal({ ...dto, serviceType: 2 }, currentUser, idemKey)
  }

  /**
   * 帮买（service_type=3）
   */
  async createHelpBuy(
    currentUser: AuthUser,
    dto: CreateErrandOrderDto,
    idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.createOrderInternal({ ...dto, serviceType: 3 }, currentUser, idemKey)
  }

  /**
   * 帮排队（service_type=4）
   */
  async createHelpQueue(
    currentUser: AuthUser,
    dto: CreateErrandOrderDto,
    idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.createOrderInternal({ ...dto, serviceType: 4 }, currentUser, idemKey)
  }

  /**
   * 通用入口：按 dto.serviceType 分发到对应分支（前端可不显式选 4 个接口而走统一入口）
   */
  async create(
    currentUser: AuthUser,
    dto: CreateErrandOrderDto,
    idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.createOrderInternal(dto, currentUser, idemKey)
  }

  /* ==========================================================================
   * 二、取消订单
   * ========================================================================== */

  /**
   * 取消跑腿订单（用户主动）
   *
   * 流程：
   *   1) 校验 owner（user_id 一致；否则 10302）
   *   2) 调 stateMachine.transit(orderNo, 2, 'OrderCanceled', ctx) → 60
   *      - 仅 status ∈ [0, 10, 20] 允许（ERRAND_TRANSITIONS 已配；其余抛 10301）
   *   3) 后置：恢复用户券（best-effort） + 移除 ZSet 待支付项 + 发"已取消"通知
   */
  async cancel(orderNo: string, userId: string, reason: string): Promise<void> {
    await this.assertUserOwner(orderNo, userId)
    await this.stateMachine.transit(orderNo, ORDER_TYPE_ERRAND, 'OrderCanceled', {
      opType: OP_TYPE_USER,
      opId: userId,
      remark: reason,
      additionalFields: {
        cancelAt: new Date(),
        cancelReason: reason
      },
      eventPayloadExtra: { reason }
    })

    /* 后置：清 ZSet + 通知（best-effort，不阻断主业务） */
    try {
      await this.redis.zrem(PAY_TIMEOUT_ZSET, orderNo)
    } catch (err) {
      this.logger.warn(`ZSet ZREM 失败 orderNo=${orderNo}：${(err as Error).message}`)
    }
    void this.notifyOrderCanceled(userId, orderNo, reason)

    await this.operationLogService
      .write({
        opAdminId: userId,
        module: 'order',
        action: 'errand_cancel',
        resourceType: 'order_errand',
        resourceId: orderNo,
        description: `用户取消跑腿订单 ${orderNo}（原因：${reason}）`
      })
      .catch((err: unknown) => {
        this.logger.warn(`OPLOG 写入失败 orderNo=${orderNo}：${(err as Error).message}`)
      })
  }

  /* ==========================================================================
   * 三、共享 owner 校验
   * ========================================================================== */

  /**
   * 校验某跑腿订单 user_id 与 currentUser.uid 一致
   * 参数：orderNo / userId
   * 异常：
   *   - 10300 BIZ_ORDER_NOT_FOUND
   *   - 10302 BIZ_ORDER_NOT_OWNED
   */
  async assertUserOwner(orderNo: string, userId: string): Promise<void> {
    const tbl = this.errandTableFromOrderNo(orderNo)
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT user_id FROM \`${tbl}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`,
      [orderNo]
    )
    const first = rows[0]
    if (!first) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `跑腿订单 ${orderNo} 不存在`)
    }
    if (String(first.user_id) !== userId) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_OWNED, '非本人订单')
    }
  }

  /* ==========================================================================
   * 四、内部：创建订单主流程
   * ========================================================================== */

  /**
   * 创建订单主流程（被 4 个公共 API 转调）
   *
   * 流程：
   *   1) 按 serviceType 校验必填字段
   *   2) 幂等：SETNX idem:order:{key} → 命中则查并返回原 orderNo（本期占位返回 BIZ_DATA_CONFLICT）
   *   3) 加载城市定价规则 + 计算服务费
   *   4) 冻结优惠券（如有）
   *   5) 计算最终 pay_amount = serviceFee + insuranceFee + estimatedGoods + tipFee - discountTotal
   *   6) 生成 orderNo + pickup_code
   *   7) 事务：
   *      a. INSERT order_errand_YYYYMM
   *      b. INSERT order_status_log_YYYYMM（fromStatus=null → toStatus=0；op_type=USER）
   *   8) 写 ZSet 待支付超时
   *   9) 发 OrderCreated 事件
   *  10) 写 idem 映射（key → orderNo） + 发"下单成功"站内信
   */
  private async createOrderInternal(
    dto: CreateErrandOrderDto,
    currentUser: AuthUser,
    idemKey?: string
  ): Promise<ErrandOrderVo> {
    /* 1. 业务字段校验（基础类型校验在 DTO；这里做 serviceType 关联校验） */
    this.assertServiceTypeRequiredFields(dto)

    /* 2. 幂等：SETNX */
    if (idemKey) {
      const occupiedOrderNo = await this.tryAcquireIdem(idemKey)
      if (occupiedOrderNo) {
        /* 幂等命中（前端重复提交）：返回已建订单的概要查询 */
        return this.fetchOrderVoByOrderNo(occupiedOrderNo)
      }
    }

    /* 3. 取价（pickup/delivery 地址决定距离；helpBuy/helpQueue 缺 pickup 时退回 delivery，距离 0） */
    const { pickupAddress, deliveryAddress } = this.resolveAddressPair(dto)
    const pricingConfig = await this.pricingService.loadPricing(dto.cityCode)
    const estimateInput = this.buildEstimateInput(dto, pickupAddress, deliveryAddress)
    const distanceM = Math.round(
      haversineDistanceM(
        estimateInput.pickupLng,
        estimateInput.pickupLat,
        estimateInput.deliveryLng,
        estimateInput.deliveryLat
      )
    )
    const estimate = this.pricingService.computeWith(estimateInput, pricingConfig, distanceM)

    /* 4. 冻结优惠券（若有；任意一张失败则恢复已冻结的并抛错） */
    const tipFee = new BigNumber(dto.tipFee ?? '0')
    if (!tipFee.isFinite() || tipFee.lt(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'tipFee 非法')
    }

    const orderNo = OrderNoGenerator.next('E', OrderShardingHelper.computeShard(currentUser.uid))
    const frozenUserCouponIds: string[] = []
    let discountTotal = new BigNumber(0)
    try {
      if (dto.userCouponIds && dto.userCouponIds.length > 0) {
        for (const ucId of dto.userCouponIds) {
          await this.userCouponService.freeze(ucId, orderNo)
          frozenUserCouponIds.push(ucId)
        }
      }
      const discountVo = await this.discountCalc.calc({
        userId: currentUser.uid,
        orderType: 2,
        itemsAmount: estimate.serviceFee,
        deliveryFee: '0',
        packageFee: '0',
        userCouponIds: dto.userCouponIds,
        promotionIds: dto.promotionIds
      })
      discountTotal = new BigNumber(discountVo.discountTotal)
    } catch (err) {
      /* 任一冻结失败：把已冻结的解冻，避免死券 */
      for (const ucId of frozenUserCouponIds) {
        await this.userCouponService.restore(ucId).catch(() => undefined)
      }
      throw err
    }

    /* 5. 计算最终金额：service+insurance+goods+tip-discount，下限 0.01 */
    const serviceFeeBn = new BigNumber(estimate.serviceFee)
    const insuranceFeeBn = new BigNumber(estimate.insuranceFee)
    const estimatedGoodsBn = new BigNumber(estimate.estimatedGoods)
    let payAmount = serviceFeeBn
      .plus(insuranceFeeBn)
      .plus(estimatedGoodsBn)
      .plus(tipFee)
      .minus(discountTotal)
    if (payAmount.lt(new BigNumber('0.01'))) payAmount = new BigNumber('0.01')

    /* 6. pickup_code（生成 + Redis SETEX；此后落库一并写入 order_errand.pickup_code 列） */
    const pickupCode = await this.pickupCodeUtil.generateAndStore(orderNo)

    /* 7. 事务：INSERT 主单 + 写 status log */
    const createdAt = new Date()
    const insertParams: ErrandInsertParams = {
      orderNo,
      userId: currentUser.uid,
      serviceType: dto.serviceType,
      pickupSnapshot: pickupAddress ? this.toSnapshot(pickupAddress) : null,
      deliverySnapshot: this.toSnapshot(deliveryAddress),
      itemType: dto.itemType ?? null,
      itemWeightG: dto.itemWeightG ?? null,
      itemValue: dto.itemValue ?? null,
      buyList:
        dto.serviceType === 3 && dto.helpBuy ? dto.helpBuy.buyList.map((bi) => ({ ...bi })) : null,
      buyBudget: dto.serviceType === 3 ? (dto.helpBuy?.buyBudget ?? null) : null,
      queuePlace: dto.serviceType === 4 ? (dto.helpQueue?.queuePlace ?? null) : null,
      queueType: dto.serviceType === 4 ? (dto.helpQueue?.queueType ?? null) : null,
      queueDurationMin: dto.serviceType === 4 ? (dto.helpQueue?.queueDurationMin ?? null) : null,
      pickupCode,
      expectedPickupAt: this.parseDate(dto.expectedPickupAt),
      serviceFee: this.fmt(serviceFeeBn),
      tipFee: this.fmt(tipFee),
      insuranceFee: this.fmt(insuranceFeeBn),
      estimatedGoods: this.fmt(estimatedGoodsBn),
      payAmount: this.fmt(payAmount),
      remark: dto.remark ?? null,
      createdAt
    }

    let orderId: string
    try {
      orderId = await this.dataSource.transaction(async (manager) => {
        const id = await this.insertErrandOrder(manager, insertParams)
        await this.insertCreationLog(manager, orderNo, currentUser.uid, createdAt)
        return id
      })
    } catch (err) {
      /* 事务失败：恢复已冻结的券（best-effort） */
      for (const ucId of frozenUserCouponIds) {
        await this.userCouponService.restore(ucId).catch(() => undefined)
      }
      /* 取件码 Redis 项可保留（30 天 TTL 自然过期） */
      throw err
    }

    /* 8. 待支付超时 ZSet（best-effort） */
    const expireTs = createdAt.getTime() + PAY_TIMEOUT_MINUTES * 60 * 1000
    try {
      await this.redis.zadd(PAY_TIMEOUT_ZSET, expireTs, orderNo)
    } catch (err) {
      this.logger.warn(
        `ZSET ${PAY_TIMEOUT_ZSET} ZADD 失败 orderNo=${orderNo}：${(err as Error).message}（不影响下单）`
      )
    }

    /* 9. 发 OrderCreated 事件（best-effort） */
    const payload: OrderEventPayload = {
      eventName: 'OrderCreated',
      orderNo,
      orderType: ORDER_TYPE_ERRAND,
      fromStatus: null,
      toStatus: OrderErrandStatusEnum.PENDING_PAY,
      occurredAt: createdAt.getTime(),
      traceId: '',
      extra: {
        userId: currentUser.uid,
        serviceType: dto.serviceType,
        cityCode: dto.cityCode,
        payAmount: this.fmt(payAmount),
        pickupCode /* 内部事件 payload 含取件码，便于调试；外发推送由 Sprint 8 编排时按需脱敏 */
      }
    }
    void this.publisher.publish(payload).catch((err: unknown) => {
      this.logger.error(`OrderCreated publish 失败 orderNo=${orderNo}：${(err as Error).message}`)
    })

    /* 10. 写 idem 映射 + 站内信（best-effort） */
    if (idemKey) {
      await this.redis
        .set(IDEM_KEY(idemKey), orderNo, 'EX', IDEM_KEY_TTL_SECONDS)
        .catch((err: unknown) => {
          this.logger.warn(`SET idem:${idemKey}=${orderNo} 失败：${(err as Error).message}`)
        })
    }
    void this.notifyOrderCreated(currentUser.uid, orderNo, payAmount.toFixed(2))

    /* 输出 VO */
    const vo: ErrandOrderVo = {
      orderNo,
      id: orderId,
      serviceType: dto.serviceType,
      status: OrderErrandStatusEnum.PENDING_PAY,
      payStatus: OrderPayStatusEnum.UNPAID,
      payAmount: this.fmt(payAmount),
      serviceFee: this.fmt(serviceFeeBn),
      tipFee: this.fmt(tipFee),
      insuranceFee: this.fmt(insuranceFeeBn),
      estimatedGoods: this.fmt(estimatedGoodsBn),
      pickupCode,
      expectedPickupAt: insertParams.expectedPickupAt,
      createdAt
    }
    this.logger.log(
      `下单成功 跑腿 orderNo=${orderNo} userId=${currentUser.uid} serviceType=${dto.serviceType} payAmount=${vo.payAmount} pickupCode=已生成`
    )
    return vo
  }

  /* ==========================================================================
   * 五、内部：分支字段校验
   * ========================================================================== */

  /**
   * 按 serviceType 校验关联字段
   */
  private assertServiceTypeRequiredFields(dto: CreateErrandOrderDto): void {
    switch (dto.serviceType) {
      case 1:
      case 2: {
        if (!dto.pickupAddress) {
          throw new BusinessException(
            BizErrorCode.PARAM_INVALID,
            'serviceType=1/2 必须传 pickupAddress'
          )
        }
        if (!dto.deliveryAddress) {
          throw new BusinessException(
            BizErrorCode.PARAM_INVALID,
            'serviceType=1/2 必须传 deliveryAddress'
          )
        }
        break
      }
      case 3: {
        if (!dto.helpBuy || !dto.helpBuy.buyList || dto.helpBuy.buyList.length === 0) {
          throw new BusinessException(
            BizErrorCode.PARAM_INVALID,
            'serviceType=3 必须传 helpBuy.buyList'
          )
        }
        if (!dto.deliveryAddress) {
          throw new BusinessException(
            BizErrorCode.PARAM_INVALID,
            'serviceType=3 必须传 deliveryAddress'
          )
        }
        break
      }
      case 4: {
        if (!dto.helpQueue || !dto.helpQueue.queuePlace) {
          throw new BusinessException(
            BizErrorCode.PARAM_INVALID,
            'serviceType=4 必须传 helpQueue.queuePlace + queueType + queueDurationMin'
          )
        }
        break
      }
      default:
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `serviceType 必须为 1/2/3/4（当前 ${dto.serviceType}）`
        )
    }
  }

  /* ==========================================================================
   * 六、内部：地址 / 价格 / 快照 helper
   * ========================================================================== */

  /**
   * 解析下单 dto 的取/送地址对
   *  - serviceType=3 (帮买)：pickup 缺时回退到 deliveryAddress（取/送同地，距离 0）
   *  - serviceType=4 (帮排队)：pickup 缺时回退到 deliveryAddress
   *  - serviceType=1/2：必传，前置校验已确保
   */
  private resolveAddressPair(dto: CreateErrandOrderDto): {
    pickupAddress: ErrandAddressDto | null
    deliveryAddress: ErrandAddressDto
  } {
    const deliveryAddress = dto.deliveryAddress
    const pickupAddress = dto.pickupAddress ?? deliveryAddress
    return { pickupAddress, deliveryAddress }
  }

  /**
   * 构造 EstimateErrandPriceDto 入参（复用价格 service）
   */
  private buildEstimateInput(
    dto: CreateErrandOrderDto,
    pickupAddress: ErrandAddressDto | null,
    deliveryAddress: ErrandAddressDto
  ): EstimateErrandPriceDto {
    const pickup = pickupAddress ?? deliveryAddress
    return {
      serviceType: dto.serviceType,
      cityCode: dto.cityCode,
      pickupLng: pickup.lng,
      pickupLat: pickup.lat,
      deliveryLng: deliveryAddress.lng,
      deliveryLat: deliveryAddress.lat,
      itemWeightG: dto.itemWeightG,
      itemValue: dto.itemValue,
      withInsurance: dto.withInsurance,
      expectedPickupAt: dto.expectedPickupAt,
      queueDurationMin: dto.serviceType === 4 ? dto.helpQueue?.queueDurationMin : undefined,
      buyBudget: dto.serviceType === 3 ? dto.helpBuy?.buyBudget : undefined
    }
  }

  /**
   * 把 ErrandAddressDto 转地址快照 JSON
   */
  private toSnapshot(addr: ErrandAddressDto): Record<string, unknown> {
    return {
      addressId: addr.addressId ?? null,
      contactName: addr.contactName,
      contactMobile: addr.contactMobile,
      mobileTail4: addr.contactMobile.slice(-4),
      province: addr.province,
      city: addr.city,
      district: addr.district,
      detail: addr.detail,
      lng: addr.lng,
      lat: addr.lat
    }
  }

  /* ==========================================================================
   * 七、内部：DB INSERT
   * ========================================================================== */

  /**
   * INSERT order_errand_YYYYMM；返回新主键
   */
  private async insertErrandOrder(manager: EntityManager, p: ErrandInsertParams): Promise<string> {
    const tbl = OrderShardingHelper.errand(p.createdAt)
    const id = SnowflakeId.next()
    await manager.query(
      `INSERT INTO \`${tbl}\` (
        id, tenant_id, order_no, user_id, rider_id, service_type,
        pickup_snapshot, delivery_snapshot,
        item_type, item_weight_g, item_value,
        buy_list, buy_budget,
        queue_place, queue_type, queue_duration_min,
        pickup_code, expected_pickup_at,
        service_fee, tip_fee, insurance_fee, estimated_goods, pay_amount,
        remark, status, pay_status, pay_method, pay_no, pay_at,
        accept_at, dispatch_at, picked_at, delivered_at, finished_at,
        cancel_at, cancel_reason, refund_amount, is_reviewed, is_deleted,
        created_at, updated_at, deleted_at
      ) VALUES (
        ?, 1, ?, ?, NULL, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, 0, 0, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, 0.00, 0, 0,
        ?, ?, NULL
      )`,
      [
        id,
        p.orderNo,
        p.userId,
        p.serviceType,
        p.pickupSnapshot ? JSON.stringify(p.pickupSnapshot) : null,
        p.deliverySnapshot ? JSON.stringify(p.deliverySnapshot) : null,
        p.itemType,
        p.itemWeightG,
        p.itemValue,
        p.buyList ? JSON.stringify(p.buyList) : null,
        p.buyBudget,
        p.queuePlace,
        p.queueType,
        p.queueDurationMin,
        p.pickupCode,
        p.expectedPickupAt,
        p.serviceFee,
        p.tipFee,
        p.insuranceFee,
        p.estimatedGoods,
        p.payAmount,
        p.remark,
        p.createdAt,
        p.createdAt
      ]
    )
    return id
  }

  /**
   * 写一条创建日志（fromStatus=null → toStatus=0）
   */
  private async insertCreationLog(
    manager: EntityManager,
    orderNo: string,
    userId: string,
    createdAt: Date
  ): Promise<void> {
    const tbl = OrderShardingHelper.statusLog(createdAt)
    const id = SnowflakeId.next()
    await manager.query(
      `INSERT INTO \`${tbl}\` (
        id, tenant_id, order_no, order_type, from_status, to_status,
        op_type, op_id, op_ip, remark, extra,
        is_deleted, created_at, updated_at, deleted_at
      ) VALUES (
        ?, 1, ?, ?, NULL, ?,
        ?, ?, NULL, ?, NULL,
        0, ?, ?, NULL
      )`,
      [
        id,
        orderNo,
        ORDER_TYPE_ERRAND,
        OrderErrandStatusEnum.PENDING_PAY,
        OP_TYPE_USER,
        userId,
        '订单创建',
        createdAt,
        createdAt
      ]
    )
  }

  /* ==========================================================================
   * 八、内部：幂等
   * ========================================================================== */

  /**
   * 抢占幂等 key
   * 返回值：null 抢到（首次）；否则返回已存在的 orderNo
   *
   * 注：Redis SET NX 失败时，会再次 GET 拿到先到的 orderNo（可能是空字符串占位）；
   *     若 GET 仍为空（极小窗口）则视为业务冲突 BIZ_DATA_CONFLICT。
   */
  private async tryAcquireIdem(idemKey: string): Promise<string | null> {
    try {
      const ok = await this.redis.set(
        IDEM_KEY(idemKey),
        'pending',
        'EX',
        IDEM_KEY_TTL_SECONDS,
        'NX'
      )
      if (ok === 'OK') return null
      const existing = await this.redis.get(IDEM_KEY(idemKey))
      if (!existing || existing === 'pending') {
        throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '检测到重复提交，请稍后重试')
      }
      return existing
    } catch (err) {
      if (err instanceof BusinessException) throw err
      this.logger.warn(
        `Redis 幂等 SETNX 失败 key=${idemKey}：${(err as Error).message}（降级放行）`
      )
      return null
    }
  }

  /* ==========================================================================
   * 九、内部：查询
   * ========================================================================== */

  /**
   * 按 orderNo 查跑腿订单 → ErrandOrderVo（用于幂等命中后返回原订单）
   */
  private async fetchOrderVoByOrderNo(orderNo: string): Promise<ErrandOrderVo> {
    const tbl = this.errandTableFromOrderNo(orderNo)
    const rows = await this.dataSource.query<
      Array<{
        id: string
        order_no: string
        service_type: number
        status: number
        pay_status: number
        pay_amount: string
        service_fee: string
        tip_fee: string
        insurance_fee: string
        estimated_goods: string
        pickup_code: string | null
        expected_pickup_at: Date | null
        created_at: Date
      }>
    >(
      `SELECT id, order_no, service_type, status, pay_status, pay_amount,
              service_fee, tip_fee, insurance_fee, estimated_goods,
              pickup_code, expected_pickup_at, created_at
       FROM \`${tbl}\`
       WHERE order_no = ? AND is_deleted = 0
       LIMIT 1`,
      [orderNo]
    )
    const r = rows[0]
    if (!r) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `跑腿订单 ${orderNo} 不存在`)
    }
    return {
      orderNo: r.order_no,
      id: String(r.id),
      serviceType: Number(r.service_type),
      status: Number(r.status) as OrderErrandStatus,
      payStatus: Number(r.pay_status),
      payAmount: String(r.pay_amount),
      serviceFee: String(r.service_fee),
      tipFee: String(r.tip_fee),
      insuranceFee: String(r.insurance_fee),
      estimatedGoods: String(r.estimated_goods),
      pickupCode: r.pickup_code ? String(r.pickup_code) : null,
      expectedPickupAt: r.expected_pickup_at,
      createdAt: r.created_at
    }
  }

  /**
   * 根据 orderNo 反推物理表名（订单号已编码 yyyymmdd）
   */
  private errandTableFromOrderNo(orderNo: string): string {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `订单号 ${orderNo} 非法（无法解析分表）`
      )
    }
    const y = Number(yyyymm.slice(0, 4))
    const m = Number(yyyymm.slice(4, 6))
    return OrderShardingHelper.errand(new Date(Date.UTC(y, m - 1, 1)))
  }

  /* ==========================================================================
   * 十、内部：通用工具
   * ========================================================================== */

  /**
   * 解析 ISO 字符串 → Date；失败返回 null
   */
  private parseDate(value: string | undefined): Date | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  /**
   * BigNumber → 元，2 位小数字符串
   */
  private fmt(n: BigNumber): string {
    return n.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2)
  }

  /**
   * 异步发送"下单成功"站内信
   */
  private async notifyOrderCreated(userId: string, orderNo: string, amount: string): Promise<void> {
    if (!this.messageService) return
    try {
      await this.messageService.send({
        code: 'ORDER_CREATED',
        targetType: 1,
        targetId: userId,
        vars: { orderNo, amount },
        category: 1,
        relatedNo: orderNo
      })
    } catch (err) {
      this.logger.warn(
        `[ORDER_CREATED] 站内信发送失败 user=${userId} order=${orderNo}：${(err as Error).message}`
      )
    }
  }

  /**
   * 异步发送"订单已取消"站内信
   */
  private async notifyOrderCanceled(
    userId: string,
    orderNo: string,
    reason: string
  ): Promise<void> {
    if (!this.messageService) return
    try {
      await this.messageService.send({
        code: 'ORDER_CANCELED',
        targetType: 1,
        targetId: userId,
        vars: { orderNo, reason },
        category: 1,
        relatedNo: orderNo
      })
    } catch (err) {
      this.logger.warn(
        `[ORDER_CANCELED] 站内信发送失败 user=${userId} order=${orderNo}：${(err as Error).message}`
      )
    }
  }
}
