/**
 * @file transfer.service.ts
 * @stage P4/T4.42（Sprint 6）
 * @desc 转单服务：申请 + 管理端审核（pass → 释放原骑手 + 触发新派单 / reject）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 流程（V4.30 转单）：
 *   申请：
 *     1) 校验骑手是当前订单的派送人
 *     2) 校验订单状态在 [20,30,40] 范围
 *     3) INSERT transfer_record(status=0)
 *
 *   管理端审核：
 *     pass：
 *       1) UPDATE 主表 rider_id=NULL（如果指定了 toRiderId 则直接置 toRiderId，订单 status=20）
 *       2) UPDATE transfer_record(status=1, audit_admin_id, audit_at, audit_remark, to_rider_id?)
 *       3) 释放 / 转移活跃订单 Set
 *       4) 释放原骑手抢占 Key（dispatch:grabbed:{orderNo} DEL）
 *       5) 若未指定 toRiderId → 调 dispatchService.dispatchOrder 触发系统派单
 *          若指定 toRiderId → 直接保存 dispatch_record(dispatch_mode=3 manual, status=1)
 *
 *     reject：
 *       1) UPDATE transfer_record(status=2, audit_remark)
 */

import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '@/common'
import { TransferRecord } from '@/entities'
import { OrderShardingHelper } from '@/modules/order/order-sharding.helper'
import { SnowflakeId } from '@/utils'
import {
  type AuditTransferDto,
  type CreateTransferDto,
  type TransferListQueryDto,
  type TransferVo
} from '../dto/transfer.dto'
import {
  OrderTypeForDispatch,
  TransferStatusEnum,
  type OrderTypeForDispatch as OrderTypeForDispatchValue
} from '../types/dispatch.types'
import { CandidateService } from './candidate.service'
import { DispatchService } from './dispatch.service'
import { GrabService } from './grab.service'
import { RouteMatchService } from './route-match.service'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 订单允许转单的状态范围（含取餐前后到送达前） */
const TRANSFER_ALLOWED_STATUSES = [20, 30, 40] as const

/** 转单后订单回到的 status（释放原骑手后等待重新派单） */
const ORDER_PENDING_ACCEPT = 10

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name)

  constructor(
    @InjectRepository(TransferRecord)
    private readonly transferRepo: Repository<TransferRecord>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly candidateService: CandidateService,
    private readonly grabService: GrabService,
    private readonly routeMatchService: RouteMatchService,
    @Inject(forwardRef(() => DispatchService))
    private readonly dispatchService: DispatchService
  ) {}

  /* ============================================================================
   * 骑手端：申请转单
   * ============================================================================ */

  /**
   * 骑手提交转单申请
   * 参数：dto / fromRiderId
   * 返回值：TransferVo
   * 错误：
   *   - 10300 订单不存在
   *   - 10302 非本人订单
   *   - 10301 状态不允许
   *   - 10011 重复申请（同 order 已存在 status=0）
   */
  async createTransfer(dto: CreateTransferDto, fromRiderId: string): Promise<TransferVo> {
    /* 重复申请校验 */
    const exist = await this.transferRepo.findOne({
      where: {
        orderNo: dto.orderNo,
        fromRiderId,
        status: TransferStatusEnum.PENDING,
        isDeleted: 0
      }
    })
    if (exist) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '订单已存在待审核转单申请')
    }

    /* 主表校验：rider_id + status */
    const orderType: OrderTypeForDispatchValue =
      dto.orderType === OrderTypeForDispatch.ERRAND
        ? OrderTypeForDispatch.ERRAND
        : OrderTypeForDispatch.TAKEOUT
    const orderRow = await this.fetchOrderForTransfer(dto.orderNo, orderType)
    if (!orderRow) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${dto.orderNo} 不存在`)
    }
    if (orderRow.riderId !== fromRiderId) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_OWNED, `非本人订单`)
    }
    if (!TRANSFER_ALLOWED_STATUSES.includes(orderRow.status as 20 | 30 | 40)) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        `订单状态 ${orderRow.status} 不允许转单`
      )
    }

    const now = new Date()
    const entity = this.transferRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      orderNo: dto.orderNo,
      orderType: dto.orderType,
      fromRiderId,
      toRiderId: null,
      reasonCode: dto.reasonCode,
      reasonDetail: dto.reasonDetail ?? null,
      status: TransferStatusEnum.PENDING,
      auditAdminId: null,
      auditAt: null,
      auditRemark: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    await this.transferRepo.save(entity)
    this.logger.log(
      `[TRANSFER] create id=${entity.id} order=${dto.orderNo} fromRider=${fromRiderId} reason=${dto.reasonCode}`
    )
    return this.toVo(entity)
  }

  /* ============================================================================
   * 骑手端：撤回申请
   * ============================================================================ */

  /**
   * 骑手撤回转单申请
   * 参数：transferId / fromRiderId
   * 返回值：TransferVo
   */
  async cancelTransfer(transferId: string, fromRiderId: string): Promise<TransferVo> {
    const record = await this.transferRepo.findOne({
      where: { id: transferId, isDeleted: 0 }
    })
    if (!record) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '转单记录不存在')
    }
    if (record.fromRiderId !== fromRiderId) {
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '非本人转单')
    }
    if (record.status !== TransferStatusEnum.PENDING) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '当前状态不允许撤回')
    }
    record.status = TransferStatusEnum.CANCELED
    record.updatedAt = new Date()
    await this.transferRepo.save(record)
    return this.toVo(record)
  }

  /* ============================================================================
   * 管理端：审核
   * ============================================================================ */

  /**
   * 审核转单（pass / reject）
   * 参数：transferId / dto / opAdminId
   * 返回值：TransferVo
   * 错误：
   *   - 10010 转单不存在
   *   - 10013 非待审核状态
   *   - pass 时若 toRiderId 不存在或未在线 → 由 manualDispatch 抛业务异常
   */
  async auditTransfer(
    transferId: string,
    dto: AuditTransferDto,
    opAdminId: string
  ): Promise<TransferVo> {
    const record = await this.transferRepo.findOne({
      where: { id: transferId, isDeleted: 0 }
    })
    if (!record) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '转单记录不存在')
    }
    if (record.status !== TransferStatusEnum.PENDING) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '当前状态不可审核')
    }

    if (dto.action === 'reject') {
      record.status = TransferStatusEnum.REJECTED
      record.auditAdminId = opAdminId
      record.auditAt = new Date()
      record.auditRemark = dto.remark ?? null
      record.updatedAt = new Date()
      await this.transferRepo.save(record)
      return this.toVo(record)
    }

    /* === pass 分支 === */
    const orderType = record.orderType as OrderTypeForDispatchValue
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(record.orderNo)
    if (!yyyymm) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `订单号 ${record.orderNo} 无法解析分表月份`
      )
    }
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const mainTable =
      orderType === OrderTypeForDispatch.TAKEOUT
        ? OrderShardingHelper.tableName('order_takeout', date)
        : OrderShardingHelper.tableName('order_errand', date)

    const now = new Date()
    /* 1) 主表 UPDATE：rider_id 置 NULL，status 回到 10 待接单（等待 dispatchService 重派） */
    await this.dataSource.query(
      `UPDATE \`${mainTable}\`
          SET rider_id = NULL, status = ?, updated_at = ?
        WHERE order_no = ? AND rider_id = ? AND is_deleted = 0`,
      [ORDER_PENDING_ACCEPT, now, record.orderNo, record.fromRiderId]
    )
    /* 2) 释放原骑手活跃订单 + 几何缓存 */
    await this.candidateService.removeActiveOrder(record.fromRiderId, record.orderNo)
    await this.routeMatchService.evictActiveOrderGeo(record.orderNo)
    await this.grabService.releaseGrabKey(record.orderNo)

    /* 3) UPDATE 转单记录 */
    record.status = TransferStatusEnum.PASSED
    record.auditAdminId = opAdminId
    record.auditAt = now
    record.auditRemark = dto.remark ?? null
    record.toRiderId = dto.toRiderId ?? null
    record.updatedAt = now
    await this.transferRepo.save(record)

    /* 4) 触发新派单：指定 toRider → manualDispatch；否则 dispatchOrder */
    try {
      if (dto.toRiderId) {
        await this.dispatchService.manualDispatch(
          record.orderNo,
          orderType,
          dto.toRiderId,
          opAdminId
        )
      } else {
        await this.dispatchService.dispatchOrder(record.orderNo, orderType, 0)
      }
    } catch (err) {
      this.logger.warn(
        `[TRANSFER] pass 后触发派单失败 order=${record.orderNo}：` +
          (err instanceof Error ? err.message : String(err))
      )
    }

    return this.toVo(record)
  }

  /* ============================================================================
   * 管理端：列表 / 详情
   * ============================================================================ */

  /**
   * 转单工作台列表
   */
  async listTransfers(query: TransferListQueryDto): Promise<PageResult<TransferVo>> {
    const qb = this.transferRepo.createQueryBuilder('t').where('t.is_deleted = 0')
    if (query.status !== undefined) qb.andWhere('t.status = :st', { st: query.status })
    if (query.orderType !== undefined) qb.andWhere('t.order_type = :ot', { ot: query.orderType })
    if (query.fromRiderId) qb.andWhere('t.from_rider_id = :fr', { fr: query.fromRiderId })
    if (query.orderNo) qb.andWhere('t.order_no LIKE :no', { no: `%${query.orderNo}%` })
    qb.orderBy('t.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 详情
   */
  async findById(id: string): Promise<TransferVo> {
    const r = await this.transferRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!r) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '转单记录不存在')
    }
    return this.toVo(r)
  }

  /* ============================================================================
   * 内部
   * ============================================================================ */

  /**
   * 读取订单 rider_id + status（跨分表）
   */
  private async fetchOrderForTransfer(
    orderNo: string,
    orderType: OrderTypeForDispatchValue
  ): Promise<{ status: number; riderId: string | null } | null> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) return null
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const table =
      orderType === OrderTypeForDispatch.TAKEOUT
        ? OrderShardingHelper.tableName('order_takeout', date)
        : OrderShardingHelper.tableName('order_errand', date)
    const rows = await this.dataSource.query<Array<{ status: number; rider_id: string | null }>>(
      `SELECT status, rider_id FROM \`${table}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`,
      [orderNo]
    )
    const first = rows[0]
    if (!first) return null
    return {
      status: Number(first.status),
      riderId: first.rider_id != null ? String(first.rider_id) : null
    }
  }

  private toVo(record: TransferRecord): TransferVo {
    return {
      id: record.id,
      orderNo: record.orderNo,
      orderType: record.orderType,
      fromRiderId: record.fromRiderId,
      toRiderId: record.toRiderId,
      reasonCode: record.reasonCode,
      reasonDetail: record.reasonDetail,
      status: record.status,
      auditAdminId: record.auditAdminId,
      auditAt: record.auditAt,
      auditRemark: record.auditRemark,
      createdAt: record.createdAt
    }
  }
}
