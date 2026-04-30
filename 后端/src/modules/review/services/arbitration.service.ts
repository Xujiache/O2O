/**
 * @file arbitration.service.ts
 * @stage P4/T4.47（Sprint 7）
 * @desc 仲裁服务：主动申请 / 售后转 / 投诉转 + admin 裁决（触发退款 / 同步关联 source）
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 数据：MySQL `arbitration`
 *
 * 业务规则（与 ACCEPTANCE V4.38 / DESIGN §9.3 对齐）：
 *   1. 主动申请（source_type=3）：用户/商户/骑手提交；source_id 为占位（自身 id）
 *   2. 售后转（source_type=1）：由 AfterSaleService.userEscalate 调 createFromAfterSale
 *   3. 投诉转（source_type=2）：由 ComplaintService.escalate 调 createFromComplaint
 *   4. 裁决 judge：
 *      - 事务更新 arbitration: status=2 + decision + decision_amount + decision_detail +
 *        judge_admin_id + decision_at
 *      - decision=1 申请方胜 / 3 部分支持 + decision_amount > 0 + 申请方=用户
 *        → 调 RefundService.createRefund({ payNo, amount, reason, opAdminId, ... }）
 *      - 同步更新关联 source（after_sale → REFUNDED/REJECTED；complaint → RESOLVED）
 *      - 写 OperationLog
 *
 * 越权校验：
 *   - 主动申请：applicantType / applicantId 由 controller 端类型注入
 *   - admin 端：可裁决任意仲裁
 */

import { HttpStatus, Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { DataSource, Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Arbitration } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId, generateBizNo } from '@/utils'
import {
  type ArbitrationVo,
  type CreateArbitrationDto,
  type JudgeArbitrationDto,
  type QueryArbitrationDto
} from '../dto/arbitration.dto'
import {
  ArbitrationDecisionEnum,
  ArbitrationPartyTypeEnum,
  ArbitrationSourceTypeEnum,
  ArbitrationStatusEnum,
  REVIEW_DEP_ORDER_SERVICE,
  REVIEW_DEP_REFUND_SERVICE,
  type IReviewOrderService,
  type IReviewRefundService
} from '../types/review.types'
import { AfterSaleService } from './after-sale.service'
import { ComplaintService } from './complaint.service'

@Injectable()
export class ArbitrationService {
  private readonly logger = new Logger(ArbitrationService.name)

  constructor(
    @InjectRepository(Arbitration)
    private readonly arbitrationRepo: Repository<Arbitration>,
    private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService,
    @Inject(forwardRef(() => AfterSaleService))
    private readonly afterSaleService: AfterSaleService,
    @Inject(forwardRef(() => ComplaintService))
    private readonly complaintService: ComplaintService,
    @Optional()
    @Inject(REVIEW_DEP_ORDER_SERVICE)
    private readonly orderService: IReviewOrderService | null,
    @Optional()
    @Inject(REVIEW_DEP_REFUND_SERVICE)
    private readonly refundService: IReviewRefundService | null
  ) {}

  /* ==========================================================================
   * 一、主动申请（source_type=3）
   * ========================================================================== */

  /**
   * 用户/商户/骑手 主动申请仲裁
   *
   * 流程：
   *   1. 校验订单存在（OrderService.findOrderCoreByNo）
   *   2. 校验 applicant 与申请来源端一致
   *   3. 写 arbitration（status=0；source_type=3；source_id 暂填 sourceId 占位 或写自身 id）
   *
   * 参数：applicantType / applicantId / dto
   * 返回值：ArbitrationVo
   */
  async createDirect(
    applicantType: number,
    applicantId: string,
    dto: CreateArbitrationDto
  ): Promise<ArbitrationVo> {
    /* 校验订单存在 */
    if (this.orderService) {
      const order = await this.orderService.findOrderCoreByNo(dto.orderNo)
      if (!order) {
        throw new BusinessException(
          BizErrorCode.BIZ_ORDER_NOT_FOUND,
          '订单不存在',
          HttpStatus.NOT_FOUND
        )
      }
      if (order.orderType !== dto.orderType) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `orderType 与订单实际类型不匹配（实际 ${order.orderType}，传入 ${dto.orderType}）`
        )
      }
    }

    const id = SnowflakeId.next()
    const saved = await this.persist({
      id,
      sourceType: ArbitrationSourceTypeEnum.DIRECT,
      sourceId: id /* 主动申请：source_id 占位为自身 id（语义上 source = self） */,
      orderNo: dto.orderNo,
      orderType: dto.orderType,
      applicantType,
      applicantId,
      respondentType: dto.respondentType,
      respondentId: dto.respondentId,
      disputeAmount: dto.disputeAmount ?? null,
      disputeContent: dto.disputeContent,
      evidenceUrls: dto.evidenceUrls ?? null
    })
    this.logger.log(
      `主动仲裁：申请方 type=${applicantType}#${applicantId} → 仲裁 ${saved.arbitrationNo}（订单 ${dto.orderNo}）`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 二、售后转仲裁（source_type=1）
   *     被 AfterSaleService.userEscalate 调用
   * ========================================================================== */

  /**
   * 售后转仲裁
   * 参数：input.afterSaleId / orderNo / orderType / applicant / respondent / dispute*
   * 返回值：ArbitrationVo
   *
   * 注：source_id = afterSaleId；不再二次校验订单存在（上层 AfterSaleService 已校验）
   */
  async createFromAfterSale(input: {
    afterSaleId: string
    orderNo: string
    orderType: number
    applicantType: number
    applicantId: string
    respondentType: number
    respondentId: string
    disputeAmount: string | null
    disputeContent: string
    evidenceUrls?: string[] | null
  }): Promise<ArbitrationVo> {
    const saved = await this.persist({
      id: SnowflakeId.next(),
      sourceType: ArbitrationSourceTypeEnum.AFTER_SALE,
      sourceId: input.afterSaleId,
      orderNo: input.orderNo,
      orderType: input.orderType,
      applicantType: input.applicantType,
      applicantId: input.applicantId,
      respondentType: input.respondentType,
      respondentId: input.respondentId,
      disputeAmount: input.disputeAmount,
      disputeContent: input.disputeContent,
      evidenceUrls: input.evidenceUrls ?? null
    })
    this.logger.log(`售后转仲裁：after_sale#${input.afterSaleId} → 仲裁 ${saved.arbitrationNo}`)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 三、投诉转仲裁（source_type=2）
   *     被 ComplaintService.escalate 调用
   * ========================================================================== */

  /**
   * 投诉转仲裁
   * 参数：input.complaintId / orderNo / orderType / applicant / respondent / dispute*
   * 返回值：ArbitrationVo
   */
  async createFromComplaint(
    input: {
      complaintId: string
      orderNo: string
      orderType: number
      applicantType: number
      applicantId: string
      respondentType: number
      respondentId: string
      disputeAmount: string | null
      disputeContent: string
      evidenceUrls?: string[] | null
    },
    opAdminId: string
  ): Promise<ArbitrationVo> {
    const saved = await this.persist({
      id: SnowflakeId.next(),
      sourceType: ArbitrationSourceTypeEnum.COMPLAINT,
      sourceId: input.complaintId,
      orderNo: input.orderNo,
      orderType: input.orderType,
      applicantType: input.applicantType,
      applicantId: input.applicantId,
      respondentType: input.respondentType,
      respondentId: input.respondentId,
      disputeAmount: input.disputeAmount,
      disputeContent: input.disputeContent,
      evidenceUrls: input.evidenceUrls ?? null
    })
    this.logger.log(
      `管理员 ${opAdminId} 投诉转仲裁：complaint#${input.complaintId} → 仲裁 ${saved.arbitrationNo}`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 四、管理端 裁决
   * ========================================================================== */

  /**
   * 管理端：裁决
   *
   * 流程（事务）：
   *   1. 取仲裁 + 校验 status ∈ {0, 1}（PENDING/REVIEWING）
   *   2. 校验金额（decision=1/3 且申请方=用户 → decision_amount 必须 > 0 且 ≤ 订单 payAmount）
   *   3. 事务更新 arbitration: status=2 + decision + decision_amount + decision_detail +
   *      judge_admin_id + decision_at
   *   4. decision ∈ {1, 3} + decision_amount > 0 + 申请方=用户：调 RefundService.createRefund
   *      （payNo 来自 OrderService 反查）
   *   5. 同步关联 source：
   *      - source_type=1 售后：调 afterSaleService.markByArbitration
   *      - source_type=2 投诉：调 complaintService.closeByArbitration
   *   6. 写 OperationLog
   *
   * 参数：arbitrationId / opAdminId / dto
   * 返回值：ArbitrationVo
   */
  async judge(
    arbitrationId: string,
    opAdminId: string,
    dto: JudgeArbitrationDto
  ): Promise<ArbitrationVo> {
    const arb = await this.requireById(arbitrationId)
    if (
      arb.status !== ArbitrationStatusEnum.PENDING &&
      arb.status !== ArbitrationStatusEnum.REVIEWING
    ) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `仲裁当前状态(${arb.status})不允许裁决`
      )
    }

    const willRefund = this.shouldTriggerRefund(arb, dto)
    if (willRefund) {
      const da = dto.decisionAmount ? new BigNumber(dto.decisionAmount) : null
      if (!da || !da.isFinite() || da.lte(0)) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          '申请方胜 / 部分支持 + 申请方为用户：必须传 decisionAmount > 0'
        )
      }
    }

    /* 事务：更新 arbitration + 同步 source */
    const saved = await this.dataSource.transaction(async (manager) => {
      const txArb = await manager.findOne(Arbitration, {
        where: { id: arbitrationId, isDeleted: 0 }
      })
      if (!txArb) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          '仲裁不存在',
          HttpStatus.NOT_FOUND
        )
      }
      txArb.status = ArbitrationStatusEnum.JUDGED
      txArb.decision = dto.decision
      txArb.decisionAmount = dto.decisionAmount ?? null
      txArb.decisionDetail = dto.decisionDetail
      txArb.judgeAdminId = opAdminId
      txArb.decisionAt = new Date()
      txArb.updatedAt = new Date()
      return manager.save(Arbitration, txArb)
    })

    /* 触发退款（事务外，避免长事务持有连接 + 退款失败不阻塞裁决记录） */
    let refundResult: { refundNo: string; status: number } | null = null
    if (willRefund) {
      refundResult = await this.triggerRefund(saved, opAdminId)
    }

    /**
     * P4-REVIEW-01 / I-03 修复：
     *   willRefund=true 但 refundResult=null（RefundService 未注入或调用失败）→
     *   仲裁本身的 JUDGED 状态保留（saved 已落库），但**不推进 source（after_sale / complaint）状态**，
     *   防止"仲裁说赔但钱没退"的资金不一致；留待运维人工补偿（OperationLog 已写）。
     */
    if (willRefund && !refundResult) {
      this.logger.error(
        `[ARBITRATION] judge ${saved.arbitrationNo} willRefund=true 但 refundResult=null，` +
          `不推进 source 状态，留待运维人工补偿`
      )
      await this.operationLogService.write({
        opAdminId,
        module: 'review',
        action: 'arbitration-judge-refund-pending',
        resourceType: 'arbitration',
        resourceId: arbitrationId,
        description:
          `仲裁 ${saved.arbitrationNo} JUDGED 但 RefundService 未就绪或调用失败，` +
          `source 状态未推进，待人工补偿（decision=${dto.decision} amount=¥${dto.decisionAmount ?? '-'}）`
      })
      return this.toVo(saved)
    }

    /* 同步关联 source 状态（仅在不需退款 or 退款已成功发起时执行） */
    await this.syncSource(saved, opAdminId, refundResult)

    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'arbitration-judge',
      resourceType: 'arbitration',
      resourceId: arbitrationId,
      description:
        `裁决仲裁 ${saved.arbitrationNo} → decision=${dto.decision}` +
        `${dto.decisionAmount ? ` amount=¥${dto.decisionAmount}` : ''}` +
        `${refundResult ? ` 退款单 ${refundResult.refundNo}` : ''}`
    })
    this.logger.log(
      `管理员 ${opAdminId} 裁决仲裁 ${arbitrationId} decision=${dto.decision} amount=${dto.decisionAmount ?? '-'}`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 五、列表查询
   * ========================================================================== */

  /**
   * 申请方查我的仲裁
   * 参数：applicantType / applicantId / query
   * 返回值：PageResult<ArbitrationVo>
   */
  async listByApplicant(
    applicantType: number,
    applicantId: string,
    query: QueryArbitrationDto
  ): Promise<PageResult<ArbitrationVo>> {
    const where: FindOptionsWhere<Arbitration> = {
      isDeleted: 0,
      applicantType,
      applicantId
    }
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /**
   * 管理端：仲裁工作台
   * 参数：query
   * 返回值：PageResult<ArbitrationVo>
   */
  async listForAdmin(query: QueryArbitrationDto): Promise<PageResult<ArbitrationVo>> {
    const where: FindOptionsWhere<Arbitration> = { isDeleted: 0 }
    if (query.applicantType !== undefined) where.applicantType = query.applicantType
    if (query.applicantId) where.applicantId = query.applicantId
    if (query.respondentType !== undefined) where.respondentType = query.respondentType
    if (query.respondentId) where.respondentId = query.respondentId
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /* ==========================================================================
   * 六、内部
   * ========================================================================== */

  /**
   * 取一条 arbitration，不存在抛 10010
   */
  async requireById(arbitrationId: string): Promise<Arbitration> {
    const a = await this.arbitrationRepo.findOne({
      where: { id: arbitrationId, isDeleted: 0 }
    })
    if (!a) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '仲裁不存在',
        HttpStatus.NOT_FOUND
      )
    }
    return a
  }

  /**
   * Entity → VO
   */
  toVo(a: Arbitration): ArbitrationVo {
    return {
      id: a.id,
      arbitrationNo: a.arbitrationNo,
      sourceType: a.sourceType,
      sourceId: a.sourceId,
      orderNo: a.orderNo,
      orderType: a.orderType,
      applicantType: a.applicantType,
      applicantId: a.applicantId,
      respondentType: a.respondentType,
      respondentId: a.respondentId,
      disputeAmount: a.disputeAmount,
      disputeContent: a.disputeContent,
      evidenceUrls: a.evidenceUrls,
      status: a.status,
      decision: a.decision,
      decisionAmount: a.decisionAmount,
      decisionDetail: a.decisionDetail,
      judgeAdminId: a.judgeAdminId,
      decisionAt: a.decisionAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }
  }

  /**
   * 是否触发退款（decision=1 申请方胜 / decision=3 部分支持，且申请方=用户）
   */
  private shouldTriggerRefund(arb: Arbitration, dto: JudgeArbitrationDto): boolean {
    if (
      dto.decision !== ArbitrationDecisionEnum.APPLICANT_WIN &&
      dto.decision !== ArbitrationDecisionEnum.PARTIAL
    ) {
      return false
    }
    if (arb.applicantType !== ArbitrationPartyTypeEnum.USER) return false
    if (!dto.decisionAmount) return false
    const da = new BigNumber(dto.decisionAmount)
    return da.isFinite() && da.gt(0)
  }

  /**
   * 触发退款（要求 RefundService 已注入；OrderService 反查 payNo）
   *
   * P4-REVIEW-01 / I-03 修复：RefundService 缺失时升级为 logger.error + OperationLog（人工补偿入口），
   *   不再仅 warn 日志便静默返回；上游 judge 会基于 null 返回值停止推进 source 状态。
   */
  private async triggerRefund(
    arb: Arbitration,
    opAdminId: string
  ): Promise<{ refundNo: string; status: number } | null> {
    if (!this.refundService) {
      this.logger.error(
        `[ARBITRATION] RefundService 未注入：仲裁 ${arb.arbitrationNo} 无法触发退款，` +
          `仲裁结论已落库（JUDGED）但 source 不推进，待运维人工补单`
      )
      try {
        await this.operationLogService.write({
          opAdminId,
          module: 'review',
          action: 'arbitration-refund-missing-service',
          resourceType: 'arbitration',
          resourceId: arb.id,
          description:
            `仲裁 ${arb.arbitrationNo} 触发退款失败：RefundService 未注入；` +
            `decisionAmount=¥${arb.decisionAmount ?? '-'}，需运维人工补单`
        })
      } catch (logErr) {
        this.logger.warn(
          `[ARBITRATION] OPLOG 写入失败 arb=${arb.arbitrationNo}：${(logErr as Error).message}`
        )
      }
      return null
    }
    if (!this.orderService) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '依赖 OrderService 未就绪，无法反查支付单号'
      )
    }
    const order = await this.orderService.findOrderCoreByNo(arb.orderNo)
    if (!order || !order.payNo) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `订单 ${arb.orderNo} 未支付或缺少 payNo，无法触发退款`
      )
    }
    const result = await this.refundService.createRefund({
      payNo: order.payNo,
      amount: arb.decisionAmount as string,
      reason: 'arbitration',
      bizSourceType: 2,
      bizSourceId: arb.id,
      opAdminId,
      remark: `仲裁裁决退款（仲裁单 ${arb.arbitrationNo}）`
    })
    this.logger.log(
      `仲裁 ${arb.arbitrationNo} 触发退款 → ${result.refundNo}（status=${result.status}）`
    )
    return { refundNo: result.refundNo, status: result.status }
  }

  /**
   * 同步关联 source（after_sale → 已退款 / 已拒绝；complaint → 已结案）
   */
  private async syncSource(
    arb: Arbitration,
    opAdminId: string,
    refundResult: { refundNo: string; status: number } | null
  ): Promise<void> {
    if (arb.sourceType === ArbitrationSourceTypeEnum.AFTER_SALE) {
      await this.afterSaleService.markByArbitration({
        afterSaleId: arb.sourceId,
        arbitrationId: arb.id,
        decision: arb.decision as number,
        actualAmount: arb.decisionAmount,
        decisionDetail: arb.decisionDetail ?? '',
        opAdminId,
        refundedByArbitration: refundResult !== null
      })
      return
    }
    if (arb.sourceType === ArbitrationSourceTypeEnum.COMPLAINT) {
      await this.complaintService.closeByArbitration(
        arb.sourceId,
        arb.decisionDetail ?? '',
        opAdminId
      )
      return
    }
    /* 主动申请 source_type=3：source_id 为自身，无需回写其他表 */
  }

  /**
   * 落库 arbitration
   */
  private async persist(input: {
    id: string
    sourceType: number
    sourceId: string
    orderNo: string
    orderType: number
    applicantType: number
    applicantId: string
    respondentType: number
    respondentId: string
    disputeAmount: string | null
    disputeContent: string
    evidenceUrls: string[] | null
  }): Promise<Arbitration> {
    const now = new Date()
    const entity = this.arbitrationRepo.create({
      id: input.id,
      tenantId: 1,
      arbitrationNo: generateBizNo('A'),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      orderNo: input.orderNo,
      orderType: input.orderType,
      applicantType: input.applicantType,
      applicantId: input.applicantId,
      respondentType: input.respondentType,
      respondentId: input.respondentId,
      disputeAmount: input.disputeAmount,
      disputeContent: input.disputeContent,
      evidenceUrls: input.evidenceUrls,
      status: ArbitrationStatusEnum.PENDING,
      decision: null,
      decisionAmount: null,
      decisionDetail: null,
      judgeAdminId: null,
      decisionAt: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    return this.arbitrationRepo.save(entity)
  }

  /**
   * 通用 where：status / sourceType / orderNo
   */
  private applyCommonWhere(where: FindOptionsWhere<Arbitration>, query: QueryArbitrationDto): void {
    if (query.status !== undefined) where.status = query.status
    if (query.sourceType !== undefined) where.sourceType = query.sourceType
    if (query.orderNo) where.orderNo = query.orderNo
  }

  /**
   * 通用列表
   */
  private async queryWith(
    where: FindOptionsWhere<Arbitration>,
    query: QueryArbitrationDto
  ): Promise<PageResult<ArbitrationVo>> {
    const [rows, total] = await this.arbitrationRepo.findAndCount({
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
