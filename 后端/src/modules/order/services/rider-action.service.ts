/**
 * @file rider-action.service.ts
 * @stage P4/T4.21（Sprint 3）
 * @desc 骑手端 4 项动作服务：取件 / 送达 / 异常上报 / 转单（外卖+跑腿共用）
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 状态机调用：
 *   - pickup：外卖 30→40 OrderPicked / 跑腿 20→30 OrderPicked
 *   - deliver：外卖 40→50 OrderDelivered / 跑腿 30→40 或 40→50 OrderDelivered（按当前状态自动）
 *   - abnormal / transfer：状态保持不变（运营介入）
 *
 * 越权校验（spec §7.5）：
 *   - 所有 4 个接口都先 assertRiderOwn(orderNo, currentUser.uid, orderType)
 *   - rider_id NULL 抛 BIZ_OPERATION_FORBIDDEN '订单尚未分配骑手'
 *   - rider_id 不匹配抛 AUTH_PERMISSION_DENIED 20003
 *
 * 凭证：
 *   - pickup：可选 0~6 张图片入 order_proof（proof_type=1 取件凭证）
 *   - deliver：必填 1~6 张图片入 order_proof（proof_type=2 送达凭证）
 *
 * 事件发布：
 *   - pickup / deliver：由 OrderStateMachine 内部调用 OrderEventsPublisher 自动发；本服务不重复发
 *   - abnormal / transfer：本期 OrderEventName 联合类型未含 OrderAbnormal/OrderTransferRequested，
 *     仅 logger.log 提示；待 Sprint 6/8 扩展事件枚举后接入 publisher
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { AbnormalReport, OrderProof } from '@/entities'
import type { AuthUser } from '@/modules/auth/decorators'
import { TransferService } from '@/modules/dispatch/services/transfer.service'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import { OrderShardingHelper } from '../order-sharding.helper'
import { OrderStateMachine } from '../state-machine/order-state-machine'
import { OrderOpTypeEnum, OrderTypeEnum, type OrderType } from '../types/order.types'
import {
  type AbnormalReportDto,
  type AbnormalReportVo,
  type DeliverOrderDto,
  type DeliverOrderVo,
  type PickupOrderDto,
  type PickupOrderVo,
  type TransferOrderDto,
  type TransferOrderVo
} from '../dto/rider-action.dto'
import { PickupCodeUtil } from './pickup-code.util'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 骑手操作来源（status_log.op_type） */
const OP_TYPE_RIDER = OrderOpTypeEnum.RIDER

/** 凭证表 uploader_type=3 骑手 */
const UPLOADER_TYPE_RIDER = 3

/** 凭证类型 */
const PROOF_TYPE_PICKUP = 1
const PROOF_TYPE_DELIVER = 2

/** 上报方类型（abnormal_report.reporter_type）：3 骑手 */
const REPORTER_TYPE_RIDER = 3

/** 转单初始状态：0 申请中（用于返回 vo） */
const TRANSFER_STATUS_PENDING = 0

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class RiderActionService {
  private readonly logger = new Logger(RiderActionService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(OrderProof) private readonly orderProofRepo: Repository<OrderProof>,
    @InjectRepository(AbnormalReport)
    private readonly abnormalRepo: Repository<AbnormalReport>,
    private readonly stateMachine: OrderStateMachine,
    private readonly pickupCodeUtil: PickupCodeUtil,
    private readonly operationLogService: OperationLogService,
    /**
     * I-02 R1 修复：注入 dispatch 模块的 TransferService。
     *   - 由 TransferService.createTransfer 内部完成 status ∈ [20,30,40] 校验 + 防重复申请；
     *   - 本 service 只负责 owner 校验 + 写 OperationLog，不再直接 INSERT transfer_record。
     */
    private readonly transferService: TransferService
  ) {}

  /* ==========================================================================
   * 一、取件 / 取餐
   * ========================================================================== */

  /**
   * 骑手取件 / 取餐（T4.21 V4.14）
   *
   * 流程：
   *   1) 解析 orderType 并查 rider_id（assertRiderOwn）
   *   2) 校验 pickupCode（PickupCodeUtil.verify）
   *   3) stateMachine.transit('OrderPicked', { additionalFields: { pickedAt }, ... }）
   *   4) 写 order_proof（proof_type=1）
   *   5) 失效 pickup code（防重放）
   *   6) 写操作日志
   *
   * 注：状态机内部已发 OrderPicked 事件；本服务不重复发。
   */
  async pickup(
    currentUser: AuthUser,
    orderNo: string,
    dto: PickupOrderDto
  ): Promise<PickupOrderVo> {
    const orderType = this.detectOrderType(orderNo)
    await this.assertRiderOwn(orderNo, currentUser.uid, orderType)

    /* 取件码核验 */
    await this.pickupCodeUtil.verify(orderNo, dto.pickupCode)

    /* 状态机：picked_at 同事务更新到主表 */
    const pickedAt = new Date()
    const result = await this.stateMachine.transit(orderNo, orderType, 'OrderPicked', {
      opType: OP_TYPE_RIDER,
      opId: currentUser.uid,
      remark: dto.remark ?? null,
      additionalFields: { pickedAt },
      eventPayloadExtra: {
        riderId: currentUser.uid,
        evidenceUrlCount: dto.evidenceUrls?.length ?? 0,
        lng: dto.lng,
        lat: dto.lat
      }
    })

    /* 凭证（best-effort：状态机已成功，即使凭证写失败也不回滚状态） */
    let proofId: string | null = null
    try {
      const saved = await this.savePickupProof(currentUser.uid, orderNo, orderType, dto)
      proofId = saved
    } catch (err) {
      this.logger.error(
        `[pickup] order_proof 写失败 orderNo=${orderNo}：${(err as Error).message}（状态已迁移，需运维补凭证）`
      )
    }

    /* 失效取件码（best-effort） */
    await this.pickupCodeUtil.invalidate(orderNo)

    /* 操作日志 */
    await this.operationLogService
      .write({
        opAdminId: currentUser.uid,
        module: 'order',
        action: orderType === OrderTypeEnum.TAKEOUT ? 'takeout_pickup' : 'errand_pickup',
        resourceType: orderType === OrderTypeEnum.TAKEOUT ? 'order_takeout' : 'order_errand',
        resourceId: orderNo,
        description: `骑手取${orderType === OrderTypeEnum.TAKEOUT ? '餐' : '件'} ${orderNo}（${result.fromStatus}→${result.toStatus}）`,
        extra: { proofId, evidenceUrlCount: dto.evidenceUrls?.length ?? 0 }
      })
      .catch((err: unknown) => {
        this.logger.warn(`OPLOG 写入失败 orderNo=${orderNo}：${(err as Error).message}`)
      })

    return {
      orderNo,
      orderType,
      fromStatus: result.fromStatus ?? 0,
      toStatus: result.toStatus,
      pickedAt,
      proofId
    }
  }

  /* ==========================================================================
   * 二、送达
   * ========================================================================== */

  /**
   * 骑手送达（T4.21 V4.14）
   *
   * 流程：
   *   1) 解析 orderType 并查 rider_id（assertRiderOwn）
   *   2) stateMachine.transit('OrderDelivered'，按当前 status 自动迁移：
   *      - 外卖 40→50；跑腿 30→40 或 40→50）
   *   3) 写 order_proof（proof_type=2 必传图片）
   *   4) 写操作日志
   */
  async deliver(
    currentUser: AuthUser,
    orderNo: string,
    dto: DeliverOrderDto
  ): Promise<DeliverOrderVo> {
    const orderType = this.detectOrderType(orderNo)
    await this.assertRiderOwn(orderNo, currentUser.uid, orderType)

    if (!dto.evidenceUrls || dto.evidenceUrls.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '送达凭证至少 1 张图片')
    }

    /* 状态机：delivered_at 同事务更新到主表 */
    const deliveredAt = new Date()
    const result = await this.stateMachine.transit(orderNo, orderType, 'OrderDelivered', {
      opType: OP_TYPE_RIDER,
      opId: currentUser.uid,
      remark: dto.remark ?? null,
      additionalFields: { deliveredAt },
      eventPayloadExtra: {
        riderId: currentUser.uid,
        evidenceUrlCount: dto.evidenceUrls.length,
        lng: dto.lng,
        lat: dto.lat
      }
    })

    /* 凭证（必填；写失败 → 业务异常，但状态已变迁，需运维补凭证） */
    const proofId = await this.saveDeliverProof(currentUser.uid, orderNo, orderType, dto)

    /* 操作日志 */
    await this.operationLogService
      .write({
        opAdminId: currentUser.uid,
        module: 'order',
        action: orderType === OrderTypeEnum.TAKEOUT ? 'takeout_deliver' : 'errand_deliver',
        resourceType: orderType === OrderTypeEnum.TAKEOUT ? 'order_takeout' : 'order_errand',
        resourceId: orderNo,
        description: `骑手送达 ${orderNo}（${result.fromStatus}→${result.toStatus}）`,
        extra: { proofId, evidenceUrlCount: dto.evidenceUrls.length }
      })
      .catch((err: unknown) => {
        this.logger.warn(`OPLOG 写入失败 orderNo=${orderNo}：${(err as Error).message}`)
      })

    return {
      orderNo,
      orderType,
      fromStatus: result.fromStatus ?? 0,
      toStatus: result.toStatus,
      deliveredAt,
      proofId
    }
  }

  /* ==========================================================================
   * 三、异常上报
   * ========================================================================== */

  /**
   * 骑手异常上报（T4.21 V4.21）
   *
   * 流程：
   *   1) 解析 orderType 并查 rider_id（assertRiderOwn）
   *   2) 写 abnormal_report 表（status=0 待处理）
   *   3) 订单状态保持不变；运营介入处理
   *   4) 暂不发 OrderAbnormal 事件（OrderEventName 未含；待 Sprint 6/8 扩展）
   */
  async reportAbnormal(
    currentUser: AuthUser,
    orderNo: string,
    dto: AbnormalReportDto
  ): Promise<AbnormalReportVo> {
    const orderType = this.detectOrderType(orderNo)
    await this.assertRiderOwn(orderNo, currentUser.uid, orderType)

    const now = new Date()
    const id = SnowflakeId.next()
    const entity = this.abnormalRepo.create({
      id,
      orderNo,
      orderType,
      reporterType: REPORTER_TYPE_RIDER,
      reporterId: currentUser.uid,
      abnormalType: dto.abnormalType,
      description: dto.description,
      evidenceUrls: dto.evidenceUrls ?? null,
      lng: dto.lng ?? null,
      lat: dto.lat ?? null,
      status: 0,
      handleAdminId: null,
      handleAt: null,
      handleResult: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    await this.abnormalRepo.save(entity)

    this.logger.log(
      `[abnormal] 骑手 ${currentUser.uid} 上报异常 orderNo=${orderNo} type=${dto.abnormalType}（abnormal_report.id=${id}）`
    )

    await this.operationLogService
      .write({
        opAdminId: currentUser.uid,
        module: 'order',
        action: 'abnormal_report',
        resourceType: 'abnormal_report',
        resourceId: id,
        description: `骑手对 ${orderNo} 上报异常 ${dto.abnormalType}`,
        extra: { orderType, evidenceUrlCount: dto.evidenceUrls?.length ?? 0 }
      })
      .catch((err: unknown) => {
        this.logger.warn(`OPLOG 写入失败 orderNo=${orderNo}：${(err as Error).message}`)
      })

    return {
      id,
      orderNo,
      orderType,
      abnormalType: dto.abnormalType,
      status: 0,
      createdAt: now
    }
  }

  /* ==========================================================================
   * 四、转单申请
   * ========================================================================== */

  /**
   * 骑手转单申请（T4.21 V4.30 入口）
   *
   * P4-REVIEW-01 / I-02 修复：
   *   ① 不再直接 INSERT transfer_record（旧实现遗漏 status ∈ [20,30,40] 校验，会让"待接单/未接单"
   *      订单也能写转单记录，后续审核环节才暴露问题）；
   *   ② 改为调 dispatch 模块的 `TransferService.createTransfer`，由其内部一并校验：
   *      - 防重复申请（同 orderNo + fromRiderId + status=PENDING 不可重复）
   *      - rider_id 与 fromRiderId 一致（防越权）
   *      - 订单状态在 [20, 30, 40] 范围（已接单 / 出餐完成 / 配送中 才能转单）
   *
   * 流程（修复后）：
   *   1) 解析 orderType 并 assertRiderOwn（早抛错，提供更友好的错误信息）
   *   2) 调 transferService.createTransfer({ orderNo, orderType, reasonCode, reasonDetail }, fromRiderId)
   *   3) 写 OperationLog（best-effort）
   *   4) 转换 TransferVo → TransferOrderVo（保持 controller 出参不变）
   */
  async requestTransfer(
    currentUser: AuthUser,
    orderNo: string,
    dto: TransferOrderDto
  ): Promise<TransferOrderVo> {
    const orderType = this.detectOrderType(orderNo)
    await this.assertRiderOwn(orderNo, currentUser.uid, orderType)

    /* I-02 R1：委托给 dispatch.TransferService（含状态 / 防重复 / 越权 三层校验） */
    const tv = await this.transferService.createTransfer(
      {
        orderNo,
        orderType: orderType === OrderTypeEnum.TAKEOUT ? 1 : 2,
        reasonCode: dto.reasonCode,
        reasonDetail: dto.reasonDetail
      },
      currentUser.uid
    )

    this.logger.log(
      `[transfer] 骑手 ${currentUser.uid} 申请转单 orderNo=${orderNo} reason=${dto.reasonCode}（transfer_record.id=${tv.id}，待管理审核）`
    )

    await this.operationLogService
      .write({
        opAdminId: currentUser.uid,
        module: 'order',
        action: 'transfer_request',
        resourceType: 'transfer_record',
        resourceId: tv.id,
        description: `骑手对 ${orderNo} 申请转单（${dto.reasonCode}）`,
        extra: { orderType, reasonDetail: dto.reasonDetail ?? null }
      })
      .catch((err: unknown) => {
        this.logger.warn(`OPLOG 写入失败 orderNo=${orderNo}：${(err as Error).message}`)
      })

    return {
      id: tv.id,
      orderNo: tv.orderNo,
      orderType: tv.orderType,
      fromRiderId: tv.fromRiderId,
      reasonCode: tv.reasonCode,
      status: tv.status === TRANSFER_STATUS_PENDING ? TRANSFER_STATUS_PENDING : tv.status,
      createdAt: tv.createdAt
    }
  }

  /* ==========================================================================
   * 共享 owner 校验 + 订单类型解析
   * ========================================================================== */

  /**
   * 校验骑手是否拥有该订单
   * 参数：orderNo / riderId / orderType
   * 异常：
   *   - 10300 BIZ_ORDER_NOT_FOUND        订单不存在
   *   - 10012 BIZ_OPERATION_FORBIDDEN    订单尚未分配骑手
   *   - 20003 AUTH_PERMISSION_DENIED     非本人订单
   */
  async assertRiderOwn(orderNo: string, riderId: string, orderType: OrderType): Promise<void> {
    const tbl = this.mainTableFromOrderNo(orderType, orderNo)
    const rows = await this.dataSource.query<Array<{ rider_id: string | null; status: number }>>(
      `SELECT rider_id, status FROM \`${tbl}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`,
      [orderNo]
    )
    const first = rows[0]
    if (!first) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    if (first.rider_id == null) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '订单尚未分配骑手，无法操作'
      )
    }
    if (String(first.rider_id) !== riderId) {
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '非本人订单，无权操作')
    }
  }

  /**
   * 解析订单类型：从订单号前缀（T 外卖 / E 跑腿）
   * 异常：前缀非 T/E → PARAM_INVALID
   */
  private detectOrderType(orderNo: string): OrderType {
    if (!orderNo || orderNo.length !== 18) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `orderNo ${orderNo} 非法（必须 18 位）`
      )
    }
    const prefix = orderNo.charAt(0)
    if (prefix === 'T') return OrderTypeEnum.TAKEOUT
    if (prefix === 'E') return OrderTypeEnum.ERRAND
    throw new BusinessException(
      BizErrorCode.PARAM_INVALID,
      `orderNo ${orderNo} 前缀非法（应为 T/E）`
    )
  }

  /**
   * 根据 orderNo + orderType 反推主表名
   */
  private mainTableFromOrderNo(orderType: OrderType, orderNo: string): string {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `订单号 ${orderNo} 非法（无法解析分表月份）`
      )
    }
    const y = Number(yyyymm.slice(0, 4))
    const m = Number(yyyymm.slice(4, 6))
    const d = new Date(Date.UTC(y, m - 1, 1))
    return orderType === OrderTypeEnum.TAKEOUT
      ? OrderShardingHelper.takeout(d)
      : OrderShardingHelper.errand(d)
  }

  /* ==========================================================================
   * 内部：order_proof 写入
   * ========================================================================== */

  /**
   * 写入取件凭证（proof_type=1）
   * 参数：riderId / orderNo / orderType / dto
   * 返回值：order_proof.id；无图片时 returns null（不入库）
   */
  private async savePickupProof(
    riderId: string,
    orderNo: string,
    orderType: OrderType,
    dto: PickupOrderDto
  ): Promise<string | null> {
    /* 跑腿 / 外卖 都允许 0 张取件凭证（仅口头交接） */
    const urls = dto.evidenceUrls ?? []
    if (urls.length === 0) return null
    const id = SnowflakeId.next()
    const now = new Date()
    const entity = this.orderProofRepo.create({
      id,
      orderNo,
      orderType,
      proofType: PROOF_TYPE_PICKUP,
      uploaderType: UPLOADER_TYPE_RIDER,
      uploaderId: riderId,
      imageUrls: urls,
      signatureUrl: null,
      lng: dto.lng ?? null,
      lat: dto.lat ?? null,
      ocrText: null,
      remark: dto.remark ?? null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    await this.orderProofRepo.save(entity)
    return id
  }

  /**
   * 写入送达凭证（proof_type=2，evidenceUrls 必填）
   */
  private async saveDeliverProof(
    riderId: string,
    orderNo: string,
    orderType: OrderType,
    dto: DeliverOrderDto
  ): Promise<string> {
    const id = SnowflakeId.next()
    const now = new Date()
    const entity = this.orderProofRepo.create({
      id,
      orderNo,
      orderType,
      proofType: PROOF_TYPE_DELIVER,
      uploaderType: UPLOADER_TYPE_RIDER,
      uploaderId: riderId,
      imageUrls: dto.evidenceUrls,
      signatureUrl: dto.signatureUrl ?? null,
      lng: dto.lng ?? null,
      lat: dto.lat ?? null,
      ocrText: null,
      remark: dto.remark ?? null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    await this.orderProofRepo.save(entity)
    return id
  }
}
