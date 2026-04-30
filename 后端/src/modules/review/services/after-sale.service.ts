/**
 * @file after-sale.service.ts
 * @stage P4/T4.48（Sprint 7）
 * @desc 售后工单服务：用户申请 + 商户处理 + 用户升级仲裁 + 管理端仲裁 + 状态机
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 数据：MySQL `order_after_sale`（不分表）
 *
 * 状态机（与 04_order.sql 文件头一致）：
 *
 *   0 申请中
 *      ├─ create() ─► 0 申请中
 *      └─ merchantHandle(reject) ─► 立即可被商户拒绝吗？设计上：
 *         先经商户接单 → 10 商户处理中（本期允许 0 → 30/40 直跳，简化后端节奏）
 *
 *   0 申请中 → 10 商户处理中（merchantAccept；本期与 merchantHandle 合并）
 *   10 商户处理中 → 30 已同意（agree + actualAmount → 触发 refund）
 *                    → 40 已拒绝（reject）
 *   40 已拒绝 → 20 平台仲裁中（用户 escalate）
 *   20 平台仲裁中 → 30/40（admin resolve）
 *   30 已同意 → 50 已退款（refund 回调成功 / 同步退款成功）
 *   60 已关闭（用户撤销 / 超时无操作 / admin 强制）
 *
 * 业务规则：
 *   - 申请：order.status=55 已完成 + 当前用户是 order.user_id；type / applyAmount 必填；
 *           applyAmount 必须 ≤ order.payAmount；同订单允许多笔售后（不去重）
 *   - 商户处理：商户必须是订单 shop 的 owner（controller 端校验 shopIds）；
 *               agree 时 actualAmount 必填且 ≤ applyAmount → status=30 → 同步触发 refund → 50
 *               reject 时 merchantReply 必填 → status=40
 *   - 用户升级：仅 status=40 时；新建 arbitration（source_type=1）+ status=20
 *   - admin 仲裁：仅 status=20 时；调用 arbitrationService 通过 markByArbitration 反向触达
 *   - 用户撤销 / 关闭：status ∈ {0, 10, 40} 可关闭 → 60
 *
 * 越权校验：
 *   - 用户端 owner：as.user_id === uid
 *   - 商户端 owner：as.shop_id ∈ shopIds（controller 端注入）
 */

import { HttpStatus, Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common'
import BigNumber from 'bignumber.js'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { OrderAfterSale } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId, generateBizNo } from '@/utils'
import {
  type AfterSaleVo,
  type CreateAfterSaleDto,
  type EscalateAfterSaleByUserDto,
  type HandleAfterSaleByMerchantDto,
  type QueryAfterSaleDto,
  type ResolveAfterSaleDto
} from '../dto/after-sale.dto'
import {
  AFTER_SALE_TERMINAL_STATUSES,
  AFTER_SALE_TRANSITION_MAP,
  AfterSaleStatusEnum,
  ArbitrationDecisionEnum,
  ArbitrationPartyTypeEnum,
  REVIEW_DEP_ORDER_SERVICE,
  REVIEW_DEP_REFUND_SERVICE,
  type AfterSaleStatus,
  type IReviewOrderService,
  type IReviewRefundService
} from '../types/review.types'
import { ArbitrationService } from './arbitration.service'

@Injectable()
export class AfterSaleService {
  private readonly logger = new Logger(AfterSaleService.name)

  constructor(
    @InjectRepository(OrderAfterSale)
    private readonly afterSaleRepo: Repository<OrderAfterSale>,
    private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService,
    @Inject(forwardRef(() => ArbitrationService))
    private readonly arbitrationService: ArbitrationService,
    @Optional()
    @Inject(REVIEW_DEP_ORDER_SERVICE)
    private readonly orderService: IReviewOrderService | null,
    @Optional()
    @Inject(REVIEW_DEP_REFUND_SERVICE)
    private readonly refundService: IReviewRefundService | null
  ) {}

  /* ==========================================================================
   * 一、用户申请售后
   * ========================================================================== */

  /**
   * 用户申请售后
   *
   * 流程：
   *   1. 取订单 + 校验 owner / 状态 / 金额
   *   2. 写 order_after_sale（status=0 申请中）
   *
   * 参数：userId / orderNo / dto
   * 返回值：AfterSaleVo
   */
  async create(userId: string, orderNo: string, dto: CreateAfterSaleDto): Promise<AfterSaleVo> {
    const order = await this.requireOrderForUser(orderNo, userId)
    if (order.status !== 55) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '订单未完成（status≠55），暂不支持申请售后'
      )
    }
    const apply = new BigNumber(dto.applyAmount)
    const pay = new BigNumber(order.payAmount)
    if (!apply.isFinite() || apply.lte(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'applyAmount 必须 > 0')
    }
    if (apply.gt(pay)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `applyAmount(¥${dto.applyAmount}) 不能超过订单实付金额(¥${order.payAmount})`
      )
    }

    const now = new Date()
    const entity = this.afterSaleRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      afterSaleNo: generateBizNo('S'),
      orderNo,
      orderType: order.orderType,
      userId,
      shopId: order.shopId,
      riderId: order.riderId,
      type: dto.type,
      reasonCode: dto.reasonCode,
      reasonDetail: dto.reasonDetail ?? null,
      evidenceUrls: dto.evidenceUrls ?? null,
      applyAmount: dto.applyAmount,
      actualAmount: null,
      status: AfterSaleStatusEnum.APPLYING,
      merchantReply: null,
      merchantReplyAt: null,
      arbitrationId: null,
      opAdminId: null,
      finishAt: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.afterSaleRepo.save(entity)
    this.logger.log(
      `用户 ${userId} 申请售后 ${saved.afterSaleNo}（订单 ${orderNo}，¥${dto.applyAmount}）`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 二、商户处理售后（agree / reject）
   * ========================================================================== */

  /**
   * 商户处理售后
   *
   * 流程：
   *   1. 取售后 + 校验商户 shopIds 包含 as.shop_id
   *   2. 校验 status ∈ {0, 10}（允许 0 直跳；先把 status 流转到 10）
   *   3. agree：必须 actualAmount ≤ applyAmount；status=10 → 30 → 同步调 refund → 50
   *      reject：merchantReply 必填；status=10 → 40
   *
   * 参数：afterSaleId / merchantId / shopIds 商户名下店铺数组 / dto
   * 返回值：AfterSaleVo
   */
  async merchantHandle(
    afterSaleId: string,
    merchantId: string,
    shopIds: string[],
    dto: HandleAfterSaleByMerchantDto
  ): Promise<AfterSaleVo> {
    const as = await this.requireById(afterSaleId)
    if (!as.shopId || !shopIds.includes(as.shopId)) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '该售后工单非本商户名下店铺，禁止处理',
        HttpStatus.FORBIDDEN
      )
    }
    if (
      as.status !== AfterSaleStatusEnum.APPLYING &&
      as.status !== AfterSaleStatusEnum.MERCHANT_HANDLING
    ) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态(${as.status})不允许商户处理`
      )
    }

    const now = new Date()

    if (dto.action === 'reject') {
      this.assertTransit(as.status as AfterSaleStatus, AfterSaleStatusEnum.REJECTED)
      as.status = AfterSaleStatusEnum.REJECTED
      as.merchantReply = dto.merchantReply
      as.merchantReplyAt = now
      as.updatedAt = now
      const saved = await this.afterSaleRepo.save(as)
      this.logger.log(
        `商户 ${merchantId} 拒绝售后 ${as.afterSaleNo}：${dto.merchantReply.slice(0, 100)}`
      )
      return this.toVo(saved)
    }

    /* agree 分支 */
    if (!dto.actualAmount) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'agree 时必须传 actualAmount')
    }
    const actual = new BigNumber(dto.actualAmount)
    const apply = new BigNumber(as.applyAmount)
    if (!actual.isFinite() || actual.lte(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'actualAmount 必须 > 0')
    }
    if (actual.gt(apply)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `actualAmount(¥${dto.actualAmount}) 不能超过 applyAmount(¥${as.applyAmount})`
      )
    }

    /* 更新到 30 已同意（事务） */
    const agreed = await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(OrderAfterSale, {
        where: { id: afterSaleId, isDeleted: 0 }
      })
      if (!tx) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          '售后不存在',
          HttpStatus.NOT_FOUND
        )
      }
      this.assertTransit(tx.status as AfterSaleStatus, AfterSaleStatusEnum.AGREED)
      tx.status = AfterSaleStatusEnum.AGREED
      tx.actualAmount = dto.actualAmount as string
      tx.merchantReply = dto.merchantReply
      tx.merchantReplyAt = now
      tx.updatedAt = now
      return manager.save(OrderAfterSale, tx)
    })

    /* 同步触发退款（事务外）→ 成功后更新 status=50 */
    const refunded = await this.tryRefund(agreed, null)
    if (refunded) {
      agreed.status = AfterSaleStatusEnum.REFUNDED
      agreed.finishAt = new Date()
      agreed.updatedAt = new Date()
      await this.afterSaleRepo.save(agreed)
    }
    this.logger.log(
      `商户 ${merchantId} 同意售后 ${agreed.afterSaleNo} actualAmount=¥${dto.actualAmount}` +
        ` ${refunded ? '退款已触发' : '退款未触发（依赖未就绪 / 跳过）'}`
    )
    return this.toVo(agreed)
  }

  /* ==========================================================================
   * 三、用户升级仲裁
   * ========================================================================== */

  /**
   * 用户升级仲裁（仅 status=40 已拒绝时）
   *
   * 流程（事务）：
   *   1. 取售后 + owner 校验 + status=40
   *   2. 调 ArbitrationService.createFromAfterSale（source_type=1）
   *   3. 更新 as.status=20 + arbitration_id
   *
   * 参数：afterSaleId / userId / dto
   * 返回值：AfterSaleVo
   */
  async userEscalate(
    afterSaleId: string,
    userId: string,
    dto: EscalateAfterSaleByUserDto
  ): Promise<AfterSaleVo> {
    const as = await this.requireById(afterSaleId)
    if (as.userId !== userId) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本人售后工单，禁止操作',
        HttpStatus.FORBIDDEN
      )
    }
    if (as.status !== AfterSaleStatusEnum.REJECTED) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态(${as.status})不允许升级仲裁，仅已拒绝(40) 可升级`
      )
    }
    if (!as.shopId) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '订单关联商户缺失，无法升级仲裁'
      )
    }
    this.assertTransit(as.status as AfterSaleStatus, AfterSaleStatusEnum.ARBITRATING)

    const merchantOrShop = as.shopId
    const arbVo = await this.arbitrationService.createFromAfterSale({
      afterSaleId: as.id,
      orderNo: as.orderNo,
      orderType: as.orderType,
      applicantType: ArbitrationPartyTypeEnum.USER,
      applicantId: userId,
      respondentType: ArbitrationPartyTypeEnum.MERCHANT,
      respondentId: merchantOrShop,
      disputeAmount: as.applyAmount,
      disputeContent: dto.disputeContent,
      evidenceUrls: dto.evidenceUrls ?? as.evidenceUrls
    })

    as.status = AfterSaleStatusEnum.ARBITRATING
    as.arbitrationId = arbVo.id
    as.updatedAt = new Date()
    const saved = await this.afterSaleRepo.save(as)
    this.logger.log(`用户 ${userId} 升级售后 ${as.afterSaleNo} → 仲裁 ${arbVo.arbitrationNo}`)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 四、管理端 仲裁售后
   * ========================================================================== */

  /**
   * 管理端：仲裁售后（agree → 触发 refund → 50；reject → 40）
   *
   * 流程（事务）：
   *   1. 取售后 + 校验 status=20 平台仲裁中
   *   2. agree：actualAmount 必填 → status=30 → 同步退款 → 50
   *      reject：handleResult 必填 → status=40
   *   3. 写 OperationLog
   *
   * 注：本接口设计为「直接对售后单仲裁」入口；通常入口走 arbitrationService.judge，
   *     judge 内部会回写 markByArbitration（参见下方）。本接口提供给「售后无显式 arbitration
   *     单的快速仲裁」场景使用，业务效果与 judge 一致。
   *
   * 参数：afterSaleId / opAdminId / dto
   * 返回值：AfterSaleVo
   */
  async adminResolve(
    afterSaleId: string,
    opAdminId: string,
    dto: ResolveAfterSaleDto
  ): Promise<AfterSaleVo> {
    const as = await this.requireById(afterSaleId)
    if (as.status !== AfterSaleStatusEnum.ARBITRATING) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态(${as.status})不允许仲裁，仅平台仲裁中(20) 可处理`
      )
    }

    const now = new Date()

    if (dto.action === 'reject') {
      this.assertTransit(as.status as AfterSaleStatus, AfterSaleStatusEnum.REJECTED)
      as.status = AfterSaleStatusEnum.REJECTED
      as.opAdminId = opAdminId
      as.merchantReply = dto.handleResult /* 复用字段记录 admin 仲裁结论 */
      as.merchantReplyAt = now
      as.updatedAt = now
      const saved = await this.afterSaleRepo.save(as)
      await this.operationLogService.write({
        opAdminId,
        module: 'review',
        action: 'aftersale-arbitrate-reject',
        resourceType: 'order_after_sale',
        resourceId: afterSaleId,
        description: `管理员仲裁拒绝售后 ${as.afterSaleNo}：${dto.handleResult.slice(0, 100)}`
      })
      this.logger.log(`管理员 ${opAdminId} 仲裁售后 ${as.afterSaleNo} → 拒绝`)
      return this.toVo(saved)
    }

    /* agree 分支 */
    if (!dto.actualAmount) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'agree 时必须传 actualAmount')
    }
    const actual = new BigNumber(dto.actualAmount)
    const apply = new BigNumber(as.applyAmount)
    if (!actual.isFinite() || actual.lte(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'actualAmount 必须 > 0')
    }
    if (actual.gt(apply)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `actualAmount(¥${dto.actualAmount}) 不能超过 applyAmount(¥${as.applyAmount})`
      )
    }

    const agreed = await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(OrderAfterSale, {
        where: { id: afterSaleId, isDeleted: 0 }
      })
      if (!tx) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          '售后不存在',
          HttpStatus.NOT_FOUND
        )
      }
      this.assertTransit(tx.status as AfterSaleStatus, AfterSaleStatusEnum.AGREED)
      tx.status = AfterSaleStatusEnum.AGREED
      tx.actualAmount = dto.actualAmount as string
      tx.opAdminId = opAdminId
      tx.merchantReply = dto.handleResult
      tx.merchantReplyAt = new Date()
      tx.updatedAt = new Date()
      return manager.save(OrderAfterSale, tx)
    })

    const refunded = await this.tryRefund(agreed, opAdminId)
    if (refunded) {
      agreed.status = AfterSaleStatusEnum.REFUNDED
      agreed.finishAt = new Date()
      agreed.updatedAt = new Date()
      await this.afterSaleRepo.save(agreed)
    }
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'aftersale-arbitrate-agree',
      resourceType: 'order_after_sale',
      resourceId: afterSaleId,
      description: `管理员仲裁同意售后 ${as.afterSaleNo} actualAmount=¥${dto.actualAmount}${refunded ? ' 退款已触发' : ''}`
    })
    this.logger.log(
      `管理员 ${opAdminId} 仲裁售后 ${agreed.afterSaleNo} → 同意 actualAmount=¥${dto.actualAmount}`
    )
    return this.toVo(agreed)
  }

  /**
   * 仲裁回写：被 ArbitrationService.judge 调用，按裁决结果更新售后状态
   *
   * 入参由仲裁 service 装配；此处不再校验金额（仲裁 service 已校验），
   * 仅根据 decision 选定目标状态：
   *   - decision=1 申请方胜 / 3 部分支持：status=30 → （refundedByArbitration=true 时）50
   *   - decision=2 被申请方胜 / 4 驳回：status=40 已拒绝
   */
  async markByArbitration(input: {
    afterSaleId: string
    arbitrationId: string
    decision: number
    actualAmount: string | null
    decisionDetail: string
    opAdminId: string
    refundedByArbitration: boolean
  }): Promise<void> {
    const as = await this.afterSaleRepo.findOne({
      where: { id: input.afterSaleId, isDeleted: 0 }
    })
    if (!as) return
    /* 仲裁过来的售后必然在 ARBITRATING(20)；防御性兼容 PENDING(0) */
    if (
      as.status !== AfterSaleStatusEnum.ARBITRATING &&
      as.status !== AfterSaleStatusEnum.APPLYING &&
      as.status !== AfterSaleStatusEnum.MERCHANT_HANDLING
    ) {
      this.logger.warn(
        `markByArbitration: 售后 ${as.afterSaleNo} 状态(${as.status})不在可仲裁集合，跳过同步`
      )
      return
    }
    const now = new Date()
    as.opAdminId = input.opAdminId
    as.arbitrationId = input.arbitrationId
    if (
      input.decision === ArbitrationDecisionEnum.APPLICANT_WIN ||
      input.decision === ArbitrationDecisionEnum.PARTIAL
    ) {
      as.actualAmount = input.actualAmount
      if (input.refundedByArbitration) {
        as.status = AfterSaleStatusEnum.REFUNDED
        as.finishAt = now
      } else {
        as.status = AfterSaleStatusEnum.AGREED
      }
    } else {
      as.status = AfterSaleStatusEnum.REJECTED
    }
    as.merchantReply = `仲裁结论：${input.decisionDetail.slice(0, 400)}`
    as.merchantReplyAt = now
    as.updatedAt = now
    await this.afterSaleRepo.save(as)
  }

  /* ==========================================================================
   * 五、用户撤销 / 关闭
   * ========================================================================== */

  /**
   * 用户撤销售后（仅 status ∈ {0, 10, 40} 可关）
   * 参数：afterSaleId / userId
   * 返回值：AfterSaleVo
   */
  async userClose(afterSaleId: string, userId: string): Promise<AfterSaleVo> {
    const as = await this.requireById(afterSaleId)
    if (as.userId !== userId) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本人售后，禁止操作',
        HttpStatus.FORBIDDEN
      )
    }
    if (
      as.status !== AfterSaleStatusEnum.APPLYING &&
      as.status !== AfterSaleStatusEnum.MERCHANT_HANDLING &&
      as.status !== AfterSaleStatusEnum.REJECTED
    ) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态(${as.status})不允许撤销`
      )
    }
    this.assertTransit(as.status as AfterSaleStatus, AfterSaleStatusEnum.CLOSED)
    as.status = AfterSaleStatusEnum.CLOSED
    as.finishAt = new Date()
    as.updatedAt = new Date()
    return this.toVo(await this.afterSaleRepo.save(as))
  }

  /* ==========================================================================
   * 六、列表查询
   * ========================================================================== */

  /**
   * 用户端：我的售后列表
   * 参数：userId / query
   * 返回值：PageResult<AfterSaleVo>
   */
  async listForUser(userId: string, query: QueryAfterSaleDto): Promise<PageResult<AfterSaleVo>> {
    const where: FindOptionsWhere<OrderAfterSale> = { isDeleted: 0, userId }
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /**
   * 商户端：售后工作台
   * 参数：shopIds 商户名下店铺；query
   * 返回值：PageResult<AfterSaleVo>
   */
  async listForMerchant(
    shopIds: string[],
    query: QueryAfterSaleDto
  ): Promise<PageResult<AfterSaleVo>> {
    if (shopIds.length === 0) {
      return makePageResult([], 0, query.page ?? 1, query.pageSize ?? 20)
    }
    const filterShopId = query.shopId
    if (filterShopId && !shopIds.includes(filterShopId)) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本商户名下店铺',
        HttpStatus.FORBIDDEN
      )
    }
    const qb = this.afterSaleRepo.createQueryBuilder('a').where('a.is_deleted = 0')
    if (filterShopId) qb.andWhere('a.shop_id = :sid', { sid: filterShopId })
    else qb.andWhere('a.shop_id IN (:...sids)', { sids: shopIds })
    this.applyCommonQb(qb, query)
    qb.orderBy('a.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 管理端：售后工作台
   * 参数：query
   * 返回值：PageResult<AfterSaleVo>
   */
  async listForAdmin(query: QueryAfterSaleDto): Promise<PageResult<AfterSaleVo>> {
    const where: FindOptionsWhere<OrderAfterSale> = { isDeleted: 0 }
    if (query.userId) where.userId = query.userId
    if (query.shopId) where.shopId = query.shopId
    if (query.riderId) where.riderId = query.riderId
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /* ==========================================================================
   * 七、内部
   * ========================================================================== */

  /**
   * 取一条 after_sale，不存在抛 10010
   */
  async requireById(afterSaleId: string): Promise<OrderAfterSale> {
    const a = await this.afterSaleRepo.findOne({
      where: { id: afterSaleId, isDeleted: 0 }
    })
    if (!a) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '售后工单不存在',
        HttpStatus.NOT_FOUND
      )
    }
    return a
  }

  /**
   * Entity → VO
   */
  toVo(a: OrderAfterSale): AfterSaleVo {
    return {
      id: a.id,
      afterSaleNo: a.afterSaleNo,
      orderNo: a.orderNo,
      orderType: a.orderType,
      userId: a.userId,
      shopId: a.shopId,
      riderId: a.riderId,
      type: a.type,
      reasonCode: a.reasonCode,
      reasonDetail: a.reasonDetail,
      evidenceUrls: a.evidenceUrls,
      applyAmount: a.applyAmount,
      actualAmount: a.actualAmount,
      status: a.status,
      merchantReply: a.merchantReply,
      merchantReplyAt: a.merchantReplyAt,
      arbitrationId: a.arbitrationId,
      opAdminId: a.opAdminId,
      finishAt: a.finishAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }
  }

  /**
   * 校验状态机迁移合法
   */
  private assertTransit(from: AfterSaleStatus, to: AfterSaleStatus): void {
    if (AFTER_SALE_TERMINAL_STATUSES.includes(from)) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `售后已是终态(${from})，不可再次流转`
      )
    }
    const allowed = AFTER_SALE_TRANSITION_MAP[from]
    if (!allowed.includes(to)) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `售后状态机：${from} → ${to} 非法`
      )
    }
  }

  /**
   * 触发退款（依赖未就绪时返回 false 由调用方保留 status=30 待补单）
   */
  private async tryRefund(as: OrderAfterSale, opAdminId: string | null): Promise<boolean> {
    if (!this.refundService) {
      this.logger.warn(
        `RefundService 未注入：售后 ${as.afterSaleNo} 状态保留为 30 已同意，待人工补单`
      )
      return false
    }
    if (!this.orderService) {
      this.logger.warn(`OrderService 未注入：售后 ${as.afterSaleNo} 无法反查 payNo，保留 30 已同意`)
      return false
    }
    const order = await this.orderService.findOrderCoreByNo(as.orderNo)
    if (!order || !order.payNo) {
      this.logger.warn(
        `订单 ${as.orderNo} 缺少 payNo（未支付？），售后 ${as.afterSaleNo} 保留 30 已同意`
      )
      return false
    }
    try {
      const result = await this.refundService.createRefund({
        payNo: order.payNo,
        amount: as.actualAmount as string,
        reason: opAdminId ? 'aftersale_arbitrate' : 'aftersale_agree',
        bizSourceType: 1,
        bizSourceId: as.id,
        opAdminId,
        remark: `售后退款（售后单 ${as.afterSaleNo}）`
      })
      this.logger.log(
        `售后 ${as.afterSaleNo} 触发退款 → ${result.refundNo}（status=${result.status}）`
      )
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`售后 ${as.afterSaleNo} 退款失败：${msg}`)
      return false
    }
  }

  /**
   * 取订单 + owner 校验
   */
  private async requireOrderForUser(
    orderNo: string,
    userId: string
  ): Promise<{
    orderType: number
    userId: string
    shopId: string | null
    riderId: string | null
    status: number
    payAmount: string
    payNo: string | null
  }> {
    if (!this.orderService) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '依赖 OrderService 未就绪，无法校验订单'
      )
    }
    const order = await this.orderService.findOrderCoreByNo(orderNo)
    if (!order) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_NOT_FOUND,
        '订单不存在',
        HttpStatus.NOT_FOUND
      )
    }
    if (order.userId !== userId) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_NOT_OWNED,
        '非本人订单',
        HttpStatus.FORBIDDEN
      )
    }
    return order
  }

  /**
   * 通用 where：status / type / orderType / orderNo
   */
  private applyCommonWhere(
    where: FindOptionsWhere<OrderAfterSale>,
    query: QueryAfterSaleDto
  ): void {
    if (query.status !== undefined) where.status = query.status
    if (query.type !== undefined) where.type = query.type
    if (query.orderType !== undefined) where.orderType = query.orderType
    if (query.orderNo) where.orderNo = query.orderNo
  }

  /**
   * 通用 qb 过滤（QB 形式，便于商户端 IN sids 与 status 联用）
   */
  private applyCommonQb(
    qb: ReturnType<Repository<OrderAfterSale>['createQueryBuilder']>,
    query: QueryAfterSaleDto
  ): void {
    if (query.status !== undefined) qb.andWhere('a.status = :st', { st: query.status })
    if (query.type !== undefined) qb.andWhere('a.type = :tp', { tp: query.type })
    if (query.orderType !== undefined) qb.andWhere('a.order_type = :ot', { ot: query.orderType })
    if (query.orderNo) qb.andWhere('a.order_no = :ono', { ono: query.orderNo })
  }

  /**
   * 通用列表
   */
  private async queryWith(
    where: FindOptionsWhere<OrderAfterSale>,
    query: QueryAfterSaleDto
  ): Promise<PageResult<AfterSaleVo>> {
    const [rows, total] = await this.afterSaleRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query.skip(),
      take: query.take()
    })
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }
}
