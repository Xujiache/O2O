/**
 * @file review-reply.service.ts
 * @stage P4/T4.44（Sprint 7）
 * @desc 评价回复服务：商户回复 + 平台官方回复 + 列表 + 软删
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 数据：MySQL `review_reply`
 *
 * 业务规则：
 *   - 商户回复（replierType=1）：必须是评价对应 shop 的 owner（controller 端校验 shopId 归属，
 *     service 仅校验 review.shop_id 是否在商户的 shopIds 列表中）
 *   - 平台官方回复（replierType=2）：admin 任何人可写
 *   - 同一评价同一回复方多次回复：允许（不做唯一约束；一条评价可有多条回复）
 *   - 软删（is_deleted=1）：仅 admin 可执行
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { ReviewReply } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import { type CreateReplyDto, type ReplyVo } from '../dto/review-reply.dto'
import { ReplierTypeEnum } from '../types/review.types'
import { ReviewService } from './review.service'

@Injectable()
export class ReviewReplyService {
  private readonly logger = new Logger(ReviewReplyService.name)

  constructor(
    @InjectRepository(ReviewReply)
    private readonly replyRepo: Repository<ReviewReply>,
    private readonly reviewService: ReviewService,
    private readonly operationLogService: OperationLogService
  ) {}

  /**
   * 商户回复评价
   *
   * 流程：
   *   1. 取评价 + 校验 review.shop_id 在商户 shopIds 名单内（多店铺场景）
   *   2. 写 review_reply（replierType=1，replierId=merchantId）
   *
   * 参数：reviewId / merchantId / shopIds 商户名下店铺 ID 数组 / dto
   * 返回值：ReplyVo
   * 错误：10010 / 20003
   */
  async merchantReply(
    reviewId: string,
    merchantId: string,
    shopIds: string[],
    dto: CreateReplyDto
  ): Promise<ReplyVo> {
    const review = await this.reviewService.requireById(reviewId)
    if (!review.shopId || !shopIds.includes(review.shopId)) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '该评价非本商户名下店铺，禁止回复',
        HttpStatus.FORBIDDEN
      )
    }
    const saved = await this.persist(reviewId, ReplierTypeEnum.MERCHANT, merchantId, dto.content)
    this.logger.log(`商户 ${merchantId} 回复评价 ${reviewId} → reply ${saved.id}`)
    return this.toVo(saved)
  }

  /**
   * 平台官方回复评价
   *
   * 流程：
   *   1. 取评价（任何评价均可）
   *   2. 写 review_reply（replierType=2，replierId=adminId）+ OperationLog
   *
   * 参数：reviewId / opAdminId / dto
   * 返回值：ReplyVo
   */
  async adminReply(reviewId: string, opAdminId: string, dto: CreateReplyDto): Promise<ReplyVo> {
    await this.reviewService.requireById(reviewId)
    const saved = await this.persist(reviewId, ReplierTypeEnum.PLATFORM, opAdminId, dto.content)
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'reply',
      resourceType: 'review',
      resourceId: reviewId,
      description: `平台官方回复评价 ${reviewId}`
    })
    return this.toVo(saved)
  }

  /**
   * 列出某条评价的全部回复（按 created_at ASC）
   * 参数：reviewId / includeHidden 是否包含 is_hidden=1
   * 返回值：ReplyVo[]
   * 用途：查评价详情时附带；admin 端 includeHidden=true
   */
  async listByReview(reviewId: string, includeHidden = false): Promise<ReplyVo[]> {
    const qb = this.replyRepo
      .createQueryBuilder('rp')
      .where('rp.review_id = :rid AND rp.is_deleted = 0', { rid: reviewId })
    if (!includeHidden) qb.andWhere('rp.is_hidden = 0')
    qb.orderBy('rp.created_at', 'ASC')
    const rows = await qb.getMany()
    return rows.map((r) => this.toVo(r))
  }

  /**
   * 管理端：隐藏回复
   * 参数：replyId / opAdminId
   * 返回值：ReplyVo
   */
  async adminHide(replyId: string, opAdminId: string): Promise<ReplyVo> {
    const reply = await this.requireById(replyId)
    reply.isHidden = 1
    reply.updatedAt = new Date()
    const saved = await this.replyRepo.save(reply)
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'hide-reply',
      resourceType: 'review_reply',
      resourceId: replyId,
      description: `隐藏回复 ${replyId}（review=${reply.reviewId}）`
    })
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 内部
   * ========================================================================== */

  /**
   * 取一条 reply，不存在抛 10010
   * 参数：replyId
   * 返回值：ReviewReply
   */
  async requireById(replyId: string): Promise<ReviewReply> {
    const r = await this.replyRepo.findOne({ where: { id: replyId, isDeleted: 0 } })
    if (!r) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '回复不存在',
        HttpStatus.NOT_FOUND
      )
    }
    return r
  }

  /**
   * Entity → VO
   */
  toVo(r: ReviewReply): ReplyVo {
    return {
      id: r.id,
      reviewId: r.reviewId,
      replierType: r.replierType,
      replierId: r.replierId,
      content: r.content,
      isHidden: r.isHidden,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  }

  /**
   * 落库 review_reply
   */
  private async persist(
    reviewId: string,
    replierType: number,
    replierId: string,
    content: string
  ): Promise<ReviewReply> {
    const now = new Date()
    const entity = this.replyRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      reviewId,
      replierType,
      replierId,
      content,
      isHidden: 0,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    return this.replyRepo.save(entity)
  }
}
