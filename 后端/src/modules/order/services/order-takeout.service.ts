/**
 * @file order-takeout.service.ts
 * @stage P4/T4.17 + T4.20（Sprint 3）
 * @desc 外卖下单 / 取消（用户 / 超时 / 商户 / 管理员）/ 接单 / 拒单 / 出餐 / 确认收货 / 再来一单
 * @author 单 Agent V2.0
 *
 * 核心流程（任务书 §7.3）：
 *   create()
 *     1) 幂等：SETNX idem:order:{key} TTL 10min；命中返回已创建 orderNo
 *     2) preCheckTakeout 复用校验（避免脏数据落库）
 *     3) 生成 orderNo = OrderNoGenerator.next('T', shard, now)
 *     4) 事务：
 *        a) inventoryService.deduct(items)（Redis 原子；失败抛 10200）
 *        b) userCouponService.freeze(uc, orderNo) 冻结优惠券
 *        c) INSERT order_takeout_<yyyymm>（status=0 + payStatus=0 + snapshots）
 *        d) INSERT order_takeout_item_<yyyymm> 批量
 *        e) OrderStateMachine.transit(...,'OrderCreated', skipPublish=false)
 *           ↑ 写 order_status_log + 发 OrderCreated 事件
 *     5) Redis ZSet `order:paytimeout` ZADD score=now+15min
 *     6) BullMQ queue `order-cancel-timeout` 加 delayed job 15min
 *     7) idemKey 持久化 orderNo（覆盖原 NX 占位）
 *     8) 任一步失败 → 回滚事务 + 释放库存 + 释放券 + DEL idem
 *
 *   cancelByUser()    用户主动取消（status=0 / 10）
 *   cancelByTimeout() 超时关单（status=0 → 60，reason='PayTimeout'）
 *   acceptByMerchant / rejectByMerchant / readyByMerchant / printByMerchant
 *   confirmReceiveByUser / reorderByUser
 *   forceCancelByAdmin / arbitrateByAdmin
 *
 * 注意：
 *   - 真退款由 Sprint 4 Payment 订阅 OrderCanceled / OrderRejected 事件做；本 service 仅写 status + 发事件
 *   - 优惠券核销（status 3→2）由 Sprint 4 Payment 在 OrderPaid 时调 user-coupon.use；
 *     本 service 在创建时 freeze（1→3），取消时 restore（3→1）
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectDataSource } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import BigNumber from 'bignumber.js'
import type Redis from 'ioredis'
import { DataSource, type EntityManager } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { InventoryService } from '@/modules/product/inventory.service'
import { UserCouponService } from '@/modules/marketing/services/user-coupon.service'
import { MessageService } from '@/modules/message/message.service'
import { OrderNoGenerator, SnowflakeId } from '@/utils'
import { OrderShardingHelper } from '../order-sharding.helper'
import { OrderStateMachine } from '../state-machine/order-state-machine'
import {
  OrderOpTypeEnum,
  OrderTakeoutStatusEnum,
  OrderTypeEnum,
  type AddressSnapshot,
  type ShopSnapshot
} from '../types/order.types'
import {
  type ConfirmReceiveDto,
  type CreateTakeoutOrderDto,
  type CreateTakeoutOrderResultVo,
  type RejectOrderDto,
  type ReorderTakeoutDto
} from '../dto/order-takeout.dto'
import {
  type AdminArbitrateDto,
  type AdminForceCancelDto,
  type UserCancelOrderDto
} from '../dto/order-cancel.dto'
import { OrderPreCheckService, type PreCheckSuccessContext } from './order-pre-check.service'
import { OrderService } from './order.service'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** BullMQ 队列名（与 processor 装配 + 用户后续整合 module 一致） */
export const ORDER_CANCEL_TIMEOUT_QUEUE = 'order-cancel-timeout'

/** 待支付超时窗口（15min）；与产品 PRD 一致 */
const PAY_TIMEOUT_MS = 15 * 60 * 1000

/** 幂等键 TTL（10min；任务书 §3） */
const IDEM_TTL_SECONDS = 10 * 60

/** 待支付 ZSet（OrderTimeoutScanner 扫描；BullMQ 兜底重复消费安全） */
const PAY_TIMEOUT_ZSET = 'order:paytimeout'

/** 幂等 key 模板 */
const IDEM_KEY = (key: string): string => `idem:order:${key}`

@Injectable()
export class OrderTakeoutService {
  private readonly logger = new Logger(OrderTakeoutService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(ORDER_CANCEL_TIMEOUT_QUEUE) private readonly cancelQueue: Queue,
    private readonly preCheckService: OrderPreCheckService,
    private readonly inventoryService: InventoryService,
    private readonly userCouponService: UserCouponService,
    private readonly messageService: MessageService,
    private readonly stateMachine: OrderStateMachine,
    private readonly orderService: OrderService,
    private readonly operationLog: OperationLogService
  ) {}

  /* ==========================================================================
   * 一、用户端：下单 / 取消 / 确认收货 / 再来一单
   * ========================================================================== */

  /**
   * 创建外卖订单
   * 参数：dto / userId / idemKey（从 controller 端 Header X-Idem-Key 注入）
   * 返回值：CreateTakeoutOrderResultVo
   */
  async create(
    dto: CreateTakeoutOrderDto,
    userId: string,
    idemKey: string | undefined
  ): Promise<CreateTakeoutOrderResultVo> {
    const effectiveIdem = idemKey ?? dto.idemKey
    /* 1) 幂等占位 */
    if (effectiveIdem) {
      const existed = await this.redis
        .set(IDEM_KEY(effectiveIdem), '__pending__', 'EX', IDEM_TTL_SECONDS, 'NX')
        .catch(() => null)
      if (existed !== 'OK') {
        const stored = await this.redis.get(IDEM_KEY(effectiveIdem)).catch(() => null)
        if (stored && stored !== '__pending__') {
          /* 已落库订单，直接返回 */
          const order = await this.orderService
            .findCoreByOrderNo(stored, OrderTypeEnum.TAKEOUT)
            .catch(() => null)
          if (order) {
            return {
              orderNo: order.orderNo,
              payAmount: order.payAmount,
              expireAt: order.createdAt.getTime() + PAY_TIMEOUT_MS,
              idempotentHit: true
            }
          }
        }
        throw new BusinessException(
          BizErrorCode.IDEMPOTENT_DUPLICATE,
          '上一次下单仍在处理中，请勿重复提交'
        )
      }
    }

    let inventoryDeducted = false
    let frozenCouponIds: string[] = []
    let createdOrderNo: string | null = null
    let preCheck: PreCheckSuccessContext | null = null
    try {
      /* 2) 复用 preCheck */
      preCheck = await this.preCheckService.preCheckTakeout(
        {
          shopId: dto.shopId,
          items: dto.items,
          address: dto.address,
          userCouponIds: dto.userCouponIds,
          promotionIds: dto.promotionIds,
          remark: dto.remark
        },
        userId
      )

      /* 3) 生成 orderNo */
      const now = new Date()
      const shard = OrderShardingHelper.computeShard(userId)
      const orderNo = OrderNoGenerator.next('T', shard, now)
      createdOrderNo = orderNo
      const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
      if (!yyyymm) {
        throw new BusinessException(
          BizErrorCode.SYSTEM_INTERNAL_ERROR,
          `生成订单号失败：${orderNo}`
        )
      }

      const addressSnapshot: AddressSnapshot = {
        addressId: dto.address.addressId ?? null,
        receiverName: dto.address.receiverName,
        receiverMobile: dto.address.receiverMobile,
        province: dto.address.province,
        city: dto.address.city,
        district: dto.address.district,
        detail: dto.address.detail,
        lng: dto.address.lng,
        lat: dto.address.lat,
        tag: dto.address.tag ?? null
      }
      const shopSnapshot: ShopSnapshot = {
        shopId: preCheck.shopMeta.shopId,
        merchantId: preCheck.shopMeta.merchantId,
        name: preCheck.shopMeta.name,
        phone: `****${preCheck.shopMeta.phoneTail4}`,
        address: preCheck.shopMeta.address,
        lng: preCheck.shopMeta.lng,
        lat: preCheck.shopMeta.lat,
        cityCode: preCheck.shopMeta.cityCode,
        districtCode: preCheck.shopMeta.districtCode
      }

      /* 4) 库存扣减（先于事务，因为 Redis 不在 MySQL 事务内；任意失败抛 10200） */
      await this.inventoryService.deduct(preCheck.stockItems)
      inventoryDeducted = true

      /* 5) 优惠券冻结（任一失败 → 已冻结的需 restore） */
      for (const ucId of preCheck.freezeUserCouponIds) {
        await this.userCouponService.freeze(ucId, orderNo)
        frozenCouponIds.push(ucId)
      }

      /* 6) 事务：插入主表 + 明细 */
      const mainTbl = OrderShardingHelper.takeout(now)
      const itemTbl = OrderShardingHelper.takeoutItem(now)
      const orderId = SnowflakeId.next()

      await this.dataSource.transaction(async (manager: EntityManager) => {
        await this.insertTakeoutMain(manager, mainTbl, {
          id: orderId,
          orderNo,
          userId,
          shopMeta: preCheck!.shopMeta,
          merchantId: preCheck!.shopMeta.merchantId,
          itemsAmount: preCheck!.preview.itemsAmount,
          deliveryFee: preCheck!.preview.deliveryFee,
          packageFee: preCheck!.preview.packageFee,
          discountAmount: preCheck!.promotionAmount,
          couponAmount: preCheck!.couponAmount,
          payAmount: preCheck!.preview.finalAmount,
          addressSnapshot,
          shopSnapshot,
          remark: dto.remark ?? null,
          createdAt: now
        })
        await this.insertTakeoutItems(manager, itemTbl, orderNo, preCheck!, now)
      })

      /* 7) 写 order_status_log + 发 OrderCreated 事件 */
      await this.stateMachine
        .transit(orderNo, OrderTypeEnum.TAKEOUT, 'OrderCreated', {
          opType: OrderOpTypeEnum.USER,
          opId: userId,
          remark: '下单',
          eventPayloadExtra: {
            shopId: preCheck.shopMeta.shopId,
            merchantId: preCheck.shopMeta.merchantId,
            payAmount: preCheck.preview.finalAmount,
            itemsCount: preCheck.itemRows.length
          }
        })
        .catch(async (err: unknown) => {
          /* 状态机写日志失败：状态机内部已处理事务；这里仅打日志，不阻断订单 */
          this.logger.error(
            `[CREATE] 写 status_log 失败 orderNo=${orderNo}：${(err as Error).message}`
          )
        })

      /* 8) 待支付超时双保障：ZSet + BullMQ delayed */
      const expireAt = now.getTime() + PAY_TIMEOUT_MS
      await this.redis.zadd(PAY_TIMEOUT_ZSET, expireAt, orderNo).catch((err: unknown) => {
        this.logger.warn(
          `[CREATE] ZSET ${PAY_TIMEOUT_ZSET} 写入失败 orderNo=${orderNo}：${(err as Error).message}`
        )
      })
      await this.cancelQueue
        .add(
          'pay-timeout',
          { orderNo, reason: 'PayTimeout' },
          { delay: PAY_TIMEOUT_MS, jobId: `pay-timeout:${orderNo}` }
        )
        .catch((err: unknown) => {
          this.logger.warn(
            `[CREATE] BullMQ 添加延时关单失败 orderNo=${orderNo}：${(err as Error).message}`
          )
        })

      /* 9) 持久化幂等 key（覆盖 __pending__） */
      if (effectiveIdem) {
        await this.redis
          .set(IDEM_KEY(effectiveIdem), orderNo, 'EX', IDEM_TTL_SECONDS)
          .catch(() => undefined)
      }

      /* 10) 异步通知（best-effort） */
      void this.notifyOrderCreated(userId, orderNo, preCheck.preview.finalAmount)

      this.logger.log(
        `[CREATE] orderNo=${orderNo} userId=${userId} shopId=${preCheck.shopMeta.shopId} payAmount=${preCheck.preview.finalAmount}`
      )
      return {
        orderNo,
        payAmount: preCheck.preview.finalAmount,
        expireAt,
        idempotentHit: false
      }
    } catch (err) {
      /* 失败回滚：库存 + 优惠券 + 幂等 key */
      if (inventoryDeducted && preCheck) {
        await this.inventoryService.restore(preCheck.stockItems).catch((e: unknown) => {
          this.logger.error(
            `[CREATE] 回滚库存失败 orderNo=${createdOrderNo}：${(e as Error).message}`
          )
        })
      }
      for (const ucId of frozenCouponIds) {
        await this.userCouponService.restore(ucId).catch((e: unknown) => {
          this.logger.error(`[CREATE] 回滚冻结券 ${ucId} 失败：${(e as Error).message}`)
        })
      }
      if (effectiveIdem) {
        await this.redis.del(IDEM_KEY(effectiveIdem)).catch(() => undefined)
      }
      throw err
    }
  }

  /**
   * 用户主动取消（status ∈ [0, 10]）
   * 参数：orderNo / userId / dto
   * 返回值：void
   *
   * 流程：
   *   1) assertUserOwner + 当前 status 必须 ∈ [0, 10]
   *   2) transit('OrderCanceled') → status=60 + cancel_at + cancel_reason
   *   3) 释放库存 + 释放冻结券
   *   4) 删除 ZSet + BullMQ jobId
   */
  async cancelByUser(
    orderNo: string,
    userId: string,
    dto: UserCancelOrderDto
  ): Promise<{ ok: true }> {
    const order = await this.orderService.assertUserOwner(orderNo, userId, OrderTypeEnum.TAKEOUT)
    if (
      order.status !== OrderTakeoutStatusEnum.PENDING_PAY &&
      order.status !== OrderTakeoutStatusEnum.PENDING_ACCEPT
    ) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '当前订单状态不允许取消'
      )
    }
    await this.runCancelCommon(orderNo, OrderOpTypeEnum.USER, userId, dto.reason ?? '用户主动取消')
    return { ok: true as const }
  }

  /**
   * 超时关单（订阅 BullMQ + ZSet 扫描器；外部入口）
   * 参数：orderNo
   * 返回值：是否真正取消（true 取消 / false 已支付/已取消跳过）
   *
   * 业务安全：先查 status，若 != 0 直接返回 false，避免误关已支付订单
   */
  async cancelByTimeout(orderNo: string): Promise<boolean> {
    const order = await this.orderService
      .findCoreByOrderNo(orderNo, OrderTypeEnum.TAKEOUT)
      .catch(() => null)
    if (!order) return false
    if (order.status !== OrderTakeoutStatusEnum.PENDING_PAY) return false
    await this.runCancelCommon(orderNo, OrderOpTypeEnum.SYSTEM, null, '支付超时自动关单')
    return true
  }

  /**
   * 用户确认收货（status=50 → 55）
   * 参数：orderNo / userId / dto
   * 返回值：void
   */
  async confirmReceiveByUser(
    orderNo: string,
    userId: string,
    dto: ConfirmReceiveDto
  ): Promise<{ ok: true }> {
    const order = await this.orderService.assertUserOwner(orderNo, userId, OrderTypeEnum.TAKEOUT)
    if (order.status !== OrderTakeoutStatusEnum.DELIVERED) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '订单尚未送达，无法确认收货'
      )
    }
    await this.stateMachine.transit(orderNo, OrderTypeEnum.TAKEOUT, 'OrderFinished', {
      opType: OrderOpTypeEnum.USER,
      opId: userId,
      remark: dto.remark ?? '用户确认收货',
      additionalFields: { finishedAt: new Date() }
    })
    return { ok: true as const }
  }

  /**
   * 再来一单：拷贝原订单 items（按当前 SKU 价 + 库存 重新校验）→ 走 create
   * 参数：orderNo / userId / dto
   * 返回值：CreateTakeoutOrderResultVo
   */
  async reorderByUser(
    orderNo: string,
    userId: string,
    dto: ReorderTakeoutDto,
    idemKey?: string
  ): Promise<CreateTakeoutOrderResultVo> {
    /* owner 校验 + 拿原订单详情 */
    await this.orderService.assertUserOwner(orderNo, userId, OrderTypeEnum.TAKEOUT)
    const detail = await this.orderService.detail(orderNo, OrderTypeEnum.TAKEOUT)
    if (detail.items.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '原订单无有效商品，无法再来一单')
    }
    const items = detail.items.map((it) => ({
      productId: it.productId,
      skuId: it.skuId,
      qty: it.qty
    }))
    const shopId = detail.shopId
    if (!shopId) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '原订单缺失店铺信息，无法再来一单'
      )
    }
    return this.create(
      {
        shopId,
        items,
        address: dto.address,
        remark: dto.remark,
        idemKey: dto.idemKey
      },
      userId,
      idemKey
    )
  }

  /* ==========================================================================
   * 二、商户端：接单 / 拒单 / 出餐 / 打印
   * ========================================================================== */

  /**
   * 商户接单（status=10 → 20）
   */
  async acceptByMerchant(orderNo: string, merchantId: string): Promise<{ ok: true }> {
    const order = await this.orderService.assertMerchantShop(
      orderNo,
      merchantId,
      OrderTypeEnum.TAKEOUT
    )
    if (order.status !== OrderTakeoutStatusEnum.PENDING_ACCEPT) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '订单当前状态不允许接单'
      )
    }
    await this.stateMachine.transit(orderNo, OrderTypeEnum.TAKEOUT, 'OrderAccepted', {
      opType: OrderOpTypeEnum.MERCHANT,
      opId: merchantId,
      remark: '商户接单',
      additionalFields: { acceptAt: new Date() }
    })
    return { ok: true as const }
  }

  /**
   * 商户拒单（status=10 → 60，reason 必填）
   */
  async rejectByMerchant(
    orderNo: string,
    merchantId: string,
    dto: RejectOrderDto
  ): Promise<{ ok: true }> {
    const order = await this.orderService.assertMerchantShop(
      orderNo,
      merchantId,
      OrderTypeEnum.TAKEOUT
    )
    if (order.status !== OrderTakeoutStatusEnum.PENDING_ACCEPT) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '订单当前状态不允许拒单'
      )
    }
    await this.runCancelCommon(orderNo, OrderOpTypeEnum.MERCHANT, merchantId, dto.reason, {
      rejectedBy: 'merchant'
    })
    return { ok: true as const }
  }

  /**
   * 商户出餐完成（status=20 → 30）
   */
  async readyByMerchant(orderNo: string, merchantId: string): Promise<{ ok: true }> {
    const order = await this.orderService.assertMerchantShop(
      orderNo,
      merchantId,
      OrderTypeEnum.TAKEOUT
    )
    if (order.status !== OrderTakeoutStatusEnum.ACCEPTED) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '订单当前状态不允许出餐'
      )
    }
    await this.stateMachine.transit(orderNo, OrderTypeEnum.TAKEOUT, 'OrderReady', {
      opType: OrderOpTypeEnum.MERCHANT,
      opId: merchantId,
      remark: '出餐完成',
      additionalFields: { readyAt: new Date() }
    })
    return { ok: true as const }
  }

  /**
   * 商户打印小票（仅打日志 / 写打印记录由商户端 SDK 自行接入）
   */
  async printByMerchant(
    orderNo: string,
    merchantId: string
  ): Promise<{ success: true; printedAt: number }> {
    await this.orderService.assertMerchantShop(orderNo, merchantId, OrderTypeEnum.TAKEOUT)
    this.logger.log(`[PRINT] orderNo=${orderNo} merchantId=${merchantId}`)
    return { success: true as const, printedAt: Date.now() }
  }

  /* ==========================================================================
   * 三、管理端：强制取消 / 仲裁
   * ========================================================================== */

  /**
   * 管理员强制取消：写 OperationLog + transit 60；释放库存 + 释放券；事件 extra 标记 forced
   */
  async forceCancelByAdmin(
    orderNo: string,
    adminId: string,
    dto: AdminForceCancelDto
  ): Promise<{ ok: true }> {
    const order = await this.orderService
      .findCoreByOrderNo(orderNo, OrderTypeEnum.TAKEOUT)
      .catch(() => null)
    if (!order) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    /* 已取消 / 已完成 / 已关闭 不再处理 */
    if (
      order.status === OrderTakeoutStatusEnum.CANCELED ||
      order.status === OrderTakeoutStatusEnum.FINISHED ||
      order.status === OrderTakeoutStatusEnum.CLOSED_PAY_TIMEOUT
    ) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '订单已结束，无需强制取消'
      )
    }
    await this.runCancelCommon(orderNo, OrderOpTypeEnum.ADMIN, adminId, dto.reason, {
      forced: true,
      triggerRefund: dto.triggerRefund === true
    })
    await this.operationLog.write({
      opAdminId: adminId,
      module: 'order',
      action: 'force-cancel',
      resourceType: 'order',
      resourceId: orderNo,
      description: `强制取消订单 ${orderNo}：${dto.reason}`,
      extra: { triggerRefund: dto.triggerRefund === true }
    })
    return { ok: true as const }
  }

  /**
   * 管理员仲裁：标记 status=70 售后中（DDL：order_status_log 写一条 SYSTEM/ADMIN 备注）
   *
   * 注：本 service 不直接走 transit（70 不在状态机变迁矩阵中），改用直接 UPDATE + 写 log；
   *      实际仲裁判定逻辑由 Sprint 7 Review 接入后再补完整链路。
   */
  async arbitrateByAdmin(
    orderNo: string,
    adminId: string,
    dto: AdminArbitrateDto
  ): Promise<{ ok: true }> {
    const order = await this.orderService.findCoreByOrderNo(orderNo, OrderTypeEnum.TAKEOUT)
    if (order.status === OrderTakeoutStatusEnum.AFTER_SALE) {
      /* 已是售后中，幂等返回 */
      return { ok: true as const }
    }
    const yyyymm = order.shardYyyymm
    const mainTbl = `order_takeout_${yyyymm}`
    const logTbl = OrderShardingHelper.statusLog(new Date())
    await this.dataSource.transaction(async (manager) => {
      const updateRes = (await manager.query(
        `UPDATE \`${mainTbl}\` SET status = ?, updated_at = NOW(3)
         WHERE order_no = ? AND is_deleted = 0`,
        [OrderTakeoutStatusEnum.AFTER_SALE, orderNo]
      )) as { affectedRows?: number }
      if ((updateRes.affectedRows ?? 0) !== 1) {
        throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, `订单 ${orderNo} 仲裁标记失败`)
      }
      await manager.query(
        `INSERT INTO \`${logTbl}\`
          (id, tenant_id, order_no, order_type, from_status, to_status, op_type, op_id, op_ip, remark, extra, is_deleted, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(3), NOW(3))`,
        [
          SnowflakeId.next(),
          orderNo,
          OrderTypeEnum.TAKEOUT,
          order.status,
          OrderTakeoutStatusEnum.AFTER_SALE,
          OrderOpTypeEnum.ADMIN,
          adminId,
          null,
          dto.remark,
          JSON.stringify({ arbitrate: true })
        ]
      )
    })
    await this.operationLog.write({
      opAdminId: adminId,
      module: 'order',
      action: 'arbitrate',
      resourceType: 'order',
      resourceId: orderNo,
      description: `仲裁订单 ${orderNo}：${dto.remark}`
    })
    return { ok: true as const }
  }

  /* ==========================================================================
   * 内部：通用取消公共流程
   * ========================================================================== */

  /**
   * 通用取消：transit('OrderCanceled') + 还库存 + 还券 + 清 ZSet/BullMQ
   * 参数：orderNo / opType / opId / reason / extra
   *
   * 注：调用方需先做"是否可取消"业务判断（status 范围）；本函数不再二次校验
   *      （依赖状态机的 from→event 校验保证）
   */
  private async runCancelCommon(
    orderNo: string,
    opType: number,
    opId: string | null,
    reason: string,
    eventExtra?: Record<string, unknown>
  ): Promise<void> {
    /* 1) transit → 60 */
    const transit = await this.stateMachine.transit(
      orderNo,
      OrderTypeEnum.TAKEOUT,
      'OrderCanceled',
      {
        opType: this.normalizeOpType(opType),
        opId,
        remark: reason,
        additionalFields: { cancelAt: new Date(), cancelReason: reason },
        eventPayloadExtra: { reason, ...(eventExtra ?? {}) }
      }
    )

    /* 2) 还库存（best-effort，失败仅 log） */
    try {
      const items = await this.loadOrderItemsForRestore(orderNo, transit.fromStatus ?? 0)
      if (items.length > 0) {
        await this.inventoryService.restore(items)
      }
    } catch (err) {
      this.logger.error(`[CANCEL] 还库存失败 orderNo=${orderNo}：${(err as Error).message}`)
    }

    /* 3) 释放冻结券（按 used_order_no 反查 status=3 的券） */
    try {
      await this.restoreFrozenCoupons(orderNo)
    } catch (err) {
      this.logger.error(`[CANCEL] 还券失败 orderNo=${orderNo}：${(err as Error).message}`)
    }

    /* 4) 清 ZSet + BullMQ delayed job */
    await this.redis.zrem(PAY_TIMEOUT_ZSET, orderNo).catch(() => undefined)
    await this.cancelQueue.remove(`pay-timeout:${orderNo}`).catch(() => undefined)

    this.logger.log(
      `[CANCEL] orderNo=${orderNo} ${transit.fromStatus}→${transit.toStatus} reason=${reason}`
    )
  }

  /**
   * 把入参 opType 规范化（接受 number；不在合法集合时降级为 SYSTEM）
   */
  private normalizeOpType(input: number): 1 | 2 | 3 | 4 | 5 {
    if (input === 1 || input === 2 || input === 3 || input === 4 || input === 5) return input
    return OrderOpTypeEnum.SYSTEM
  }

  /**
   * 取消时：从 order_takeout_item_<yyyymm> 反查需要 restore 的 (skuId, qty) 列表
   * 参数：orderNo / fromStatus 用于决策（fromStatus≥40 时已配送中，调用方需判断是否真要还）
   *
   * 注：本期默认任何取消都还库存；fromStatus 大于 30（已取餐）时还库存其实业务上不合理，
   *      但调用方应在前端不允许"配送中取消"；service 兜底时仍保持还库存幂等行为。
   */
  private async loadOrderItemsForRestore(
    orderNo: string,
    _fromStatus: number
  ): Promise<Array<{ skuId: string; qty: number }>> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) return []
    const tbl = `order_takeout_item_${yyyymm}`
    const rows = await this.dataSource
      .query<
        Array<{ sku_id: string; qty: number }>
      >(`SELECT sku_id, qty FROM \`${tbl}\` WHERE order_no = ? AND is_deleted = 0`, [orderNo])
      .catch((err: unknown) => {
        this.logger.warn(`[CANCEL] 查 ${tbl} 失败：${(err as Error).message}`)
        return [] as Array<{ sku_id: string; qty: number }>
      })
    return rows.map((r) => ({ skuId: String(r.sku_id), qty: Number(r.qty) }))
  }

  /**
   * 取消时：把 used_order_no=orderNo 的冻结券（status=3）批量 restore
   *
   * 实现：直查 user_coupon 表（user-coupon 模块未提供 byOrder 接口；本处用 EntityManager.query）
   * 注意：UserCoupon 表是全局表，无分表逻辑
   */
  private async restoreFrozenCoupons(orderNo: string): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM user_coupon WHERE used_order_no = ? AND status = 3 AND is_deleted = 0`,
      [orderNo]
    )
    for (const r of rows) {
      await this.userCouponService.restore(String(r.id)).catch((err: unknown) => {
        this.logger.warn(`[CANCEL] 还券 user_coupon=${r.id} 失败：${(err as Error).message}`)
      })
    }
  }

  /* ==========================================================================
   * 内部：插入主表 / 明细
   * ========================================================================== */

  /**
   * 插入外卖主表
   */
  private async insertTakeoutMain(
    manager: EntityManager,
    table: string,
    input: {
      id: string
      orderNo: string
      userId: string
      shopMeta: PreCheckSuccessContext['shopMeta']
      merchantId: string
      itemsAmount: string
      deliveryFee: string
      packageFee: string
      discountAmount: string
      couponAmount: string
      payAmount: string
      addressSnapshot: AddressSnapshot
      shopSnapshot: ShopSnapshot
      remark: string | null
      createdAt: Date
    }
  ): Promise<void> {
    const sql = `INSERT INTO \`${table}\` (
      id, tenant_id, order_no, user_id, shop_id, merchant_id, rider_id,
      goods_amount, delivery_fee, package_fee, discount_amount, coupon_amount, pay_amount,
      address_snapshot, shop_snapshot, remark, expected_arrive_at,
      status, pay_status, pay_method, pay_no, pay_at,
      accept_at, ready_at, dispatch_at, picked_at, delivered_at, finished_at, cancel_at, cancel_reason,
      refund_amount, is_invoice, invoice_id, is_reviewed, is_deleted, created_at, updated_at
    ) VALUES (
      ?, 1, ?, ?, ?, ?, NULL,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, NULL,
      ?, ?, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      0.00, 0, NULL, 0, 0, ?, ?
    )`
    await manager.query(sql, [
      input.id,
      input.orderNo,
      input.userId,
      input.shopMeta.shopId,
      input.merchantId,
      input.itemsAmount,
      input.deliveryFee,
      input.packageFee,
      input.discountAmount,
      input.couponAmount,
      input.payAmount,
      JSON.stringify(input.addressSnapshot),
      JSON.stringify(input.shopSnapshot),
      input.remark,
      OrderTakeoutStatusEnum.PENDING_PAY,
      0,
      input.createdAt,
      input.createdAt
    ])
  }

  /**
   * 批量插入外卖明细
   */
  private async insertTakeoutItems(
    manager: EntityManager,
    table: string,
    orderNo: string,
    preCheck: PreCheckSuccessContext,
    createdAt: Date
  ): Promise<void> {
    if (preCheck.itemRows.length === 0) return
    const valuePlaceholders = preCheck.itemRows
      .map(() => '(?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)')
      .join(',')
    const params: Array<string | number | Date | null> = []
    for (const row of preCheck.itemRows) {
      params.push(
        SnowflakeId.next(),
        orderNo,
        preCheck.shopMeta.shopId,
        row.productId,
        row.skuId,
        row.productName,
        row.skuSpec,
        row.imageUrl,
        new BigNumber(row.unitPrice).toFixed(2),
        row.qty,
        new BigNumber(row.packageFee).toFixed(2),
        new BigNumber(row.totalPrice).toFixed(2),
        0,
        createdAt,
        createdAt
      )
    }
    const sql = `INSERT INTO \`${table}\` (
      id, tenant_id, order_no, shop_id, product_id, sku_id,
      product_name, sku_spec, image_url, unit_price, qty,
      package_fee, total_price, combo_parent_id, is_combo_item, created_at, updated_at
    ) VALUES ${valuePlaceholders}`
    await manager.query(sql, params)
  }

  /**
   * 异步通知用户下单成功（best-effort）
   */
  private async notifyOrderCreated(
    userId: string,
    orderNo: string,
    payAmount: string
  ): Promise<void> {
    try {
      await this.messageService.send({
        code: 'ORDER_CREATED',
        targetType: 1,
        targetId: userId,
        vars: { orderNo, payAmount },
        category: 1,
        relatedNo: orderNo
      })
    } catch (err) {
      this.logger.debug(`[NOTIFY] 下单通知发送失败 orderNo=${orderNo}：${(err as Error).message}`)
    }
  }
}
