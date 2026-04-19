/**
 * @file review-appeal.service.ts
 * @stage P4/T4.45（Sprint 7）
 * @desc 评价申诉服务：商户/骑手提交差评申诉 + 平台审核（pass → review.is_hidden=1）
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 数据：MySQL `review_appeal`
 *
 * 业务规则（与 ACCEPTANCE V4.36 / DESIGN §9.3 对齐）：
 *   1. 仅差评（score ≤ 3）可申诉
 *   2. 申诉有效期：自 review.created_at 起 7 天内
 *   3. 同一评价同一申诉方多次提交 PENDING（status=0）→ 拒绝重复（BIZ_DATA_CONFLICT）
 *      已驳回（status=2）的允许重新申诉（业务上少见但允许）
 *   4. 商户申诉（appellantType=1）：必须 review.shop_id 在商户名下
 *   5. 骑手申诉（appellantType=2）：必须 review.rider_id === riderId
 *   6. admin 审核：pass → review.is_hidden=1 + appeal.status=1；reject → appeal.status=2
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { ReviewAppeal } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import {
  type AppealVo,
  type AuditAppealDto,
  type CreateAppealDto,
  type QueryAppealDto
} from '../dto/review-appeal.dto'
import {
  AppealStatusEnum,
  AppellantTypeEnum,
  REVIEW_APPEAL_VALID_DAYS,
  REVIEW_BAD_SCORE_MAX
} from '../types/review.types'
import { ReviewService } from './review.service'

/** 7 天毫秒数 */
const APPEAL_VALID_PERIOD_MS = REVIEW_APPEAL_VALID_DAYS * 24 * 60 * 60 * 1000

@Injectable()
export class ReviewAppealService {
  private readonly logger = new Logger(ReviewAppealService.name)

  constructor(
    @InjectRepository(ReviewAppeal) private readonly appealRepo: Repository<ReviewAppeal>,
    private readonly reviewService: ReviewService,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ==========================================================================
   * 一、商户提交申诉
   * ========================================================================== */

  /**
   * 商户提交差评申诉
   *
   * 参数：reviewId / merchantId / shopIds 商户名下店铺数组 / dto
   * 返回值：AppealVo
   * 错误：10010 / 20003 / 10012 / 10011
   */
  async submitByMerchant(
    reviewId: string,
    merchantId: string,
    shopIds: string[],
    dto: CreateAppealDto
  ): Promise<AppealVo> {
    const review = await this.reviewService.requireById(reviewId)
    if (!review.shopId || !shopIds.includes(review.shopId)) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '该评价非本商户名下店铺，禁止申诉',
        HttpStatus.FORBIDDEN
      )
    }
    this.assertAppealable(review.score, review.createdAt)
    await this.assertNoPending(reviewId, AppellantTypeEnum.MERCHANT, merchantId)

    const saved = await this.persist({
      reviewId,
      appellantType: AppellantTypeEnum.MERCHANT,
      appellantId: merchantId,
      reasonCode: dto.reasonCode,
      reasonDetail: dto.reasonDetail,
      evidenceUrls: dto.evidenceUrls
    })
    this.logger.log(`商户 ${merchantId} 申诉评价 ${reviewId} → appeal ${saved.id}`)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 二、骑手提交申诉
   * ========================================================================== */

  /**
   * 骑手提交差评申诉
   *
   * 参数：reviewId / riderId / dto
   * 返回值：AppealVo
   */
  async submitByRider(reviewId: string, riderId: string, dto: CreateAppealDto): Promise<AppealVo> {
    const review = await this.reviewService.requireById(reviewId)
    if (!review.riderId || review.riderId !== riderId) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '该评价非本骑手相关，禁止申诉',
        HttpStatus.FORBIDDEN
      )
    }
    this.assertAppealable(review.score, review.createdAt)
    await this.assertNoPending(reviewId, AppellantTypeEnum.RIDER, riderId)

    const saved = await this.persist({
      reviewId,
      appellantType: AppellantTypeEnum.RIDER,
      appellantId: riderId,
      reasonCode: dto.reasonCode,
      reasonDetail: dto.reasonDetail,
      evidenceUrls: dto.evidenceUrls
    })
    this.logger.log(`骑手 ${riderId} 申诉评价 ${reviewId} → appeal ${saved.id}`)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 三、管理端 审核
   * ========================================================================== */

  /**
   * 管理端审核申诉
   *
   * 流程：
   *   - pass：reviewService.hideInternal(reviewId) + appeal.status=1
   *   - reject：appeal.status=2
   *
   * 参数：appealId / opAdminId / dto
   * 返回值：AppealVo
   * 错误：10010 / 10013（已审过的申诉）
   */
  async audit(appealId: string, opAdminId: string, dto: AuditAppealDto): Promise<AppealVo> {
    const appeal = await this.requireById(appealId)
    if (appeal.status !== AppealStatusEnum.PENDING) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '该申诉已审核，不可重复审核')
    }

    const now = new Date()
    if (dto.action === 'pass') {
      await this.reviewService.hideInternal(appeal.reviewId, `管理员 ${opAdminId} 申诉通过`)
      appeal.status = AppealStatusEnum.PASSED
    } else {
      appeal.status = AppealStatusEnum.REJECTED
    }
    appeal.auditAdminId = opAdminId
    appeal.auditAt = now
    appeal.auditRemark = dto.remark
    appeal.updatedAt = now
    const saved = await this.appealRepo.save(appeal)

    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: dto.action === 'pass' ? 'appeal-pass' : 'appeal-reject',
      resourceType: 'review_appeal',
      resourceId: appealId,
      description: `${dto.action === 'pass' ? '通过' : '驳回'}申诉 ${appealId}（review=${appeal.reviewId}）：${dto.remark}`
    })
    this.logger.log(
      `管理员 ${opAdminId} ${dto.action} 申诉 ${appealId}（review=${appeal.reviewId}）`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 四、列表查询
   * ========================================================================== */

  /**
   * 申诉方查我的申诉列表
   * 参数：appellantType / appellantId / query
   * 返回值：PageResult<AppealVo>
   */
  async listByAppellant(
    appellantType: number,
    appellantId: string,
    query: QueryAppealDto
  ): Promise<PageResult<AppealVo>> {
    const where: FindOptionsWhere<ReviewAppeal> = {
      isDeleted: 0,
      appellantType,
      appellantId
    }
    if (query.status !== undefined) where.status = query.status
    if (query.reviewId) where.reviewId = query.reviewId
    return this.queryWith(where, query)
  }

  /**
   * 管理端：申诉工作台（按状态 / 申诉方 / reviewId 筛）
   * 参数：query
   * 返回值：PageResult<AppealVo>
   */
  async listForAdmin(query: QueryAppealDto): Promise<PageResult<AppealVo>> {
    const where: FindOptionsWhere<ReviewAppeal> = { isDeleted: 0 }
    if (query.status !== undefined) where.status = query.status
    if (query.appellantType !== undefined) where.appellantType = query.appellantType
    if (query.appellantId) where.appellantId = query.appellantId
    if (query.reviewId) where.reviewId = query.reviewId
    return this.queryWith(where, query)
  }

  /* ==========================================================================
   * 五、内部
   * ========================================================================== */

  /**
   * 取一条 appeal，不存在抛 10010
   */
  async requireById(appealId: string): Promise<ReviewAppeal> {
    const a = await this.appealRepo.findOne({ where: { id: appealId, isDeleted: 0 } })
    if (!a) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '申诉不存在',
        HttpStatus.NOT_FOUND
      )
    }
    return a
  }

  /**
   * Entity → VO
   */
  toVo(a: ReviewAppeal): AppealVo {
    return {
      id: a.id,
      reviewId: a.reviewId,
      appellantType: a.appellantType,
      appellantId: a.appellantId,
      reasonCode: a.reasonCode,
      reasonDetail: a.reasonDetail,
      evidenceUrls: a.evidenceUrls,
      status: a.status,
      auditAdminId: a.auditAdminId,
      auditAt: a.auditAt,
      auditRemark: a.auditRemark,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }
  }

  /**
   * 校验评价可申诉（差评 ≤ 3 + 7 天内）
   */
  private assertAppealable(score: number, reviewCreatedAt: Date): void {
    if (score > REVIEW_BAD_SCORE_MAX) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `仅差评（score ≤ ${REVIEW_BAD_SCORE_MAX}）可申诉`
      )
    }
    if (Date.now() - reviewCreatedAt.getTime() > APPEAL_VALID_PERIOD_MS) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `申诉已超出有效期（评价后 ${REVIEW_APPEAL_VALID_DAYS} 天内可申诉）`
      )
    }
  }

  /**
   * 校验同一评价同一申诉方无 PENDING 申诉
   */
  private async assertNoPending(
    reviewId: string,
    appellantType: number,
    appellantId: string
  ): Promise<void> {
    const exists = await this.appealRepo.findOne({
      where: {
        reviewId,
        appellantType,
        appellantId,
        status: AppealStatusEnum.PENDING,
        isDeleted: 0
      }
    })
    if (exists) {
      throw new BusinessException(
        BizErrorCode.BIZ_DATA_CONFLICT,
        '已存在审核中的申诉，请等待平台审核'
      )
    }
  }

  /**
   * 落库
   */
  private async persist(input: {
    reviewId: string
    appellantType: number
    appellantId: string
    reasonCode: string
    reasonDetail: string
    evidenceUrls?: string[]
  }): Promise<ReviewAppeal> {
    const now = new Date()
    const entity = this.appealRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      reviewId: input.reviewId,
      appellantType: input.appellantType,
      appellantId: input.appellantId,
      reasonCode: input.reasonCode,
      reasonDetail: input.reasonDetail,
      evidenceUrls: input.evidenceUrls ?? null,
      status: AppealStatusEnum.PENDING,
      auditAdminId: null,
      auditAt: null,
      auditRemark: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    return this.appealRepo.save(entity)
  }

  /**
   * 通用列表查询
   */
  private async queryWith(
    where: FindOptionsWhere<ReviewAppeal>,
    query: QueryAppealDto
  ): Promise<PageResult<AppealVo>> {
    const [rows, total] = await this.appealRepo.findAndCount({
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
