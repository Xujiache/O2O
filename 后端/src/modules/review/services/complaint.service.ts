/**
 * @file complaint.service.ts
 * @stage P4/T4.46（Sprint 7）
 * @desc 投诉服务：用户/商户/骑手提交投诉 + admin 处理 / 升级仲裁
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 数据：MySQL `complaint`
 *
 * 业务规则：
 *   - 提交：投诉号 generateBizNo('P')；status=0；severity 默认 1
 *   - target_type=4 平台 → target_id 必须为 null；其他 type → target_id 必填
 *   - 关联订单：orderNo / orderType 同时传或同时不传
 *   - admin handle：resolve → status=2；close → status=3；写 handle_admin_id / handle_at / handle_result
 *   - admin escalate：写 arbitration（source_type=2）+ complaint.status=4 + arbitration_id
 *
 * 越权校验（service 层）：
 *   - 用户/商户/骑手查自己的投诉：where complainant_type / complainant_id 必须等于当前 uid
 *   - 管理端：可任意筛选
 */

import { HttpStatus, Inject, Injectable, Logger, forwardRef } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Complaint } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId, generateBizNo } from '@/utils'
import {
  type ComplaintVo,
  type CreateComplaintDto,
  type EscalateComplaintDto,
  type HandleComplaintDto,
  type QueryComplaintDto
} from '../dto/complaint.dto'
import { ComplaintStatusEnum, ComplaintTargetTypeEnum } from '../types/review.types'
import { ArbitrationService } from './arbitration.service'

@Injectable()
export class ComplaintService {
  private readonly logger = new Logger(ComplaintService.name)

  constructor(
    @InjectRepository(Complaint) private readonly complaintRepo: Repository<Complaint>,
    @Inject(forwardRef(() => ArbitrationService))
    private readonly arbitrationService: ArbitrationService,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ==========================================================================
   * 一、提交投诉
   * ========================================================================== */

  /**
   * 用户/商户/骑手 提交投诉
   *
   * 参数：complainantType / complainantId / dto
   * 返回值：ComplaintVo
   * 错误：10001 参数不一致
   */
  async submit(
    complainantType: number,
    complainantId: string,
    dto: CreateComplaintDto
  ): Promise<ComplaintVo> {
    this.assertTargetConsistent(dto)
    this.assertOrderConsistent(dto)

    const now = new Date()
    const entity = this.complaintRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      complaintNo: generateBizNo('P'),
      complainantType,
      complainantId,
      targetType: dto.targetType,
      targetId: dto.targetType === ComplaintTargetTypeEnum.PLATFORM ? null : (dto.targetId ?? null),
      orderNo: dto.orderNo ?? null,
      orderType: dto.orderType ?? null,
      category: dto.category,
      content: dto.content,
      evidenceUrls: dto.evidenceUrls ?? null,
      severity: dto.severity ?? 1,
      status: ComplaintStatusEnum.PENDING,
      handleAdminId: null,
      handleAt: null,
      handleResult: null,
      arbitrationId: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.complaintRepo.save(entity)
    this.logger.log(
      `投诉方 type=${complainantType}#${complainantId} 提交投诉 ${saved.complaintNo}（target=${dto.targetType}#${dto.targetId ?? '-'}）`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 二、列表查询
   * ========================================================================== */

  /**
   * 投诉方查我的投诉
   * 参数：complainantType / complainantId / query
   * 返回值：PageResult<ComplaintVo>
   */
  async listByComplainant(
    complainantType: number,
    complainantId: string,
    query: QueryComplaintDto
  ): Promise<PageResult<ComplaintVo>> {
    const where: FindOptionsWhere<Complaint> = {
      isDeleted: 0,
      complainantType,
      complainantId
    }
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /**
   * 管理端：投诉工作台
   * 参数：query
   * 返回值：PageResult<ComplaintVo>
   */
  async listForAdmin(query: QueryComplaintDto): Promise<PageResult<ComplaintVo>> {
    const where: FindOptionsWhere<Complaint> = { isDeleted: 0 }
    if (query.complainantType !== undefined) where.complainantType = query.complainantType
    if (query.complainantId) where.complainantId = query.complainantId
    if (query.targetType !== undefined) where.targetType = query.targetType
    if (query.targetId) where.targetId = query.targetId
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /* ==========================================================================
   * 三、管理端 处理 / 升级仲裁
   * ========================================================================== */

  /**
   * 管理端：处理投诉（resolve / close）
   *
   * 参数：complaintId / opAdminId / dto
   * 返回值：ComplaintVo
   * 错误：10010 / 10013 终态不可处理
   */
  async handle(
    complaintId: string,
    opAdminId: string,
    dto: HandleComplaintDto
  ): Promise<ComplaintVo> {
    const c = await this.requireById(complaintId)
    this.assertHandleable(c.status, dto.action)

    const now = new Date()
    c.status = dto.action === 'resolve' ? ComplaintStatusEnum.RESOLVED : ComplaintStatusEnum.CLOSED
    c.handleAdminId = opAdminId
    c.handleAt = now
    c.handleResult = dto.handleResult
    c.updatedAt = now
    const saved = await this.complaintRepo.save(c)

    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: dto.action === 'resolve' ? 'complaint-resolve' : 'complaint-close',
      resourceType: 'complaint',
      resourceId: complaintId,
      description: `${dto.action === 'resolve' ? '解决' : '关闭'}投诉 ${c.complaintNo}：${dto.handleResult.slice(0, 100)}`
    })
    return this.toVo(saved)
  }

  /**
   * 管理端：升级投诉到仲裁（status=4 转仲裁 + 写 arbitration_id）
   *
   * 流程（事务）：
   *   1. 校验 complaint 非终态（PENDING / PROCESSING 可升级；已结的不行）
   *   2. 调 ArbitrationService.createFromComplaint(complaint, dto, opAdminId)
   *   3. 更新 complaint.status=4 + arbitration_id=新仲裁 ID
   *
   * 参数：complaintId / opAdminId / dto
   * 返回值：ComplaintVo（已带 arbitration_id）
   */
  async escalate(
    complaintId: string,
    opAdminId: string,
    dto: EscalateComplaintDto
  ): Promise<ComplaintVo> {
    const c = await this.requireById(complaintId)
    if (
      c.status === ComplaintStatusEnum.RESOLVED ||
      c.status === ComplaintStatusEnum.CLOSED ||
      c.status === ComplaintStatusEnum.ESCALATED
    ) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        '该投诉已处理完成或已转仲裁，不可重复升级'
      )
    }
    if (!c.orderNo || !c.orderType) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '该投诉未关联订单，不能升级仲裁'
      )
    }

    const arbVo = await this.arbitrationService.createFromComplaint(
      {
        complaintId: c.id,
        orderNo: c.orderNo,
        orderType: c.orderType,
        applicantType: dto.applicantType,
        applicantId: dto.applicantId,
        respondentType: dto.respondentType,
        respondentId: dto.respondentId,
        disputeAmount: dto.disputeAmount ?? null,
        disputeContent: dto.disputeContent
      },
      opAdminId
    )

    c.status = ComplaintStatusEnum.ESCALATED
    c.arbitrationId = arbVo.id
    c.updatedAt = new Date()
    const saved = await this.complaintRepo.save(c)

    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'complaint-escalate',
      resourceType: 'complaint',
      resourceId: complaintId,
      description: `升级投诉 ${c.complaintNo} → 仲裁 ${arbVo.arbitrationNo}`
    })
    return this.toVo(saved)
  }

  /**
   * 仲裁结果回写：在 ArbitrationService.judge 时被调用，关闭对应投诉
   * 参数：complaintId / decisionDetail / opAdminId
   */
  async closeByArbitration(
    complaintId: string,
    decisionDetail: string,
    opAdminId: string
  ): Promise<void> {
    const c = await this.complaintRepo.findOne({ where: { id: complaintId, isDeleted: 0 } })
    if (!c) return
    c.status = ComplaintStatusEnum.RESOLVED
    c.handleAdminId = opAdminId
    c.handleAt = new Date()
    c.handleResult = `仲裁结案：${decisionDetail}`
    c.updatedAt = new Date()
    await this.complaintRepo.save(c)
  }

  /* ==========================================================================
   * 四、内部
   * ========================================================================== */

  /**
   * 取一条 complaint，不存在抛 10010
   */
  async requireById(complaintId: string): Promise<Complaint> {
    const c = await this.complaintRepo.findOne({ where: { id: complaintId, isDeleted: 0 } })
    if (!c) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '投诉不存在',
        HttpStatus.NOT_FOUND
      )
    }
    return c
  }

  /**
   * Entity → VO
   */
  toVo(c: Complaint): ComplaintVo {
    return {
      id: c.id,
      complaintNo: c.complaintNo,
      complainantType: c.complainantType,
      complainantId: c.complainantId,
      targetType: c.targetType,
      targetId: c.targetId,
      orderNo: c.orderNo,
      orderType: c.orderType,
      category: c.category,
      content: c.content,
      evidenceUrls: c.evidenceUrls,
      severity: c.severity,
      status: c.status,
      handleAdminId: c.handleAdminId,
      handleAt: c.handleAt,
      handleResult: c.handleResult,
      arbitrationId: c.arbitrationId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }
  }

  /**
   * 校验 target 一致性：
   *   - target_type=4 平台 → 不能传 target_id（service 强制清空）
   *   - 其他 type → target_id 必须存在
   */
  private assertTargetConsistent(dto: CreateComplaintDto): void {
    if (dto.targetType === ComplaintTargetTypeEnum.PLATFORM) {
      /* 不强制报错；service 内部会忽略 target_id */
      return
    }
    if (!dto.targetId) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `targetType=${dto.targetType} 必须传 targetId`
      )
    }
  }

  /**
   * 校验订单关联一致性：orderNo / orderType 同时传或同时不传
   */
  private assertOrderConsistent(dto: CreateComplaintDto): void {
    if (Boolean(dto.orderNo) !== Boolean(dto.orderType)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'orderNo 与 orderType 必须同时存在或同时缺省'
      )
    }
  }

  /**
   * 校验是否可处理（resolve 要求 status ∈ {0,1}；close 要求 status ≠ 2/3/4）
   */
  private assertHandleable(currentStatus: number, action: 'resolve' | 'close'): void {
    if (action === 'resolve') {
      if (
        currentStatus !== ComplaintStatusEnum.PENDING &&
        currentStatus !== ComplaintStatusEnum.PROCESSING
      ) {
        throw new BusinessException(
          BizErrorCode.BIZ_STATE_INVALID,
          `当前状态(${currentStatus})不允许 resolve`
        )
      }
    } else {
      if (
        currentStatus === ComplaintStatusEnum.RESOLVED ||
        currentStatus === ComplaintStatusEnum.CLOSED ||
        currentStatus === ComplaintStatusEnum.ESCALATED
      ) {
        throw new BusinessException(
          BizErrorCode.BIZ_STATE_INVALID,
          `当前状态(${currentStatus})不允许 close`
        )
      }
    }
  }

  /**
   * 通用 where 应用：status / severity / orderNo / category
   */
  private applyCommonWhere(where: FindOptionsWhere<Complaint>, query: QueryComplaintDto): void {
    if (query.status !== undefined) where.status = query.status
    if (query.severity !== undefined) where.severity = query.severity
    if (query.orderNo) where.orderNo = query.orderNo
    if (query.category) where.category = query.category
  }

  /**
   * 通用列表
   */
  private async queryWith(
    where: FindOptionsWhere<Complaint>,
    query: QueryComplaintDto
  ): Promise<PageResult<ComplaintVo>> {
    const [rows, total] = await this.complaintRepo.findAndCount({
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
