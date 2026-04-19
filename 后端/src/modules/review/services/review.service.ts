/**
 * @file review.service.ts
 * @stage P4/T4.44（Sprint 7）
 * @desc 评价服务：提交 / 修改（24h 窗口）/ 列表 / 隐藏 / 置顶 / 评分聚合更新
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 数据：MySQL `review`（uk_order_target 唯一索引）
 *
 * 关键约束（与 ACCEPTANCE V4.35 / DESIGN §9.2 对齐）：
 *   1. 提交校验：order.status=55 已完成 + (now - finished_at) ≤ 15 days，
 *      否则抛 BIZ_REVIEW_OUT_OF_PERIOD 10800
 *   2. 一单一评：uk_order_target 唯一索引；DB 唯一冲突 → BIZ_DATA_CONFLICT 10011
 *   3. 24h 内可改：UPDATE 时校验 (now - created_at) ≤ 24h；
 *      否则抛 BIZ_OPERATION_FORBIDDEN 10012「评价已锁定」
 *   4. 评价后聚合：本期同步更新 shop.score / score_count；product.score 同理
 *      （差评同样计入聚合；防 N+1：仅更新 1 行 shop 或 product）
 *   5. 越权校验：用户端 owner 必须 review.user_id === uid
 */

import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { QueryFailedError, Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Product, Review, Shop } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import {
  type HideReviewDto,
  type QueryReviewDto,
  type ReviewVo,
  type SubmitReviewDto,
  type TopReviewDto,
  type UpdateReviewDto,
  type UsefulVoteDto
} from '../dto/review.dto'
import {
  REVIEW_ALLOWED_ORDER_STATUS,
  REVIEW_DEP_ORDER_SERVICE,
  REVIEW_EDIT_WINDOW_HOURS,
  REVIEW_VALID_DAYS,
  ReviewTargetTypeEnum,
  type IReviewOrderService
} from '../types/review.types'

/** 24h 毫秒数 */
const EDIT_WINDOW_MS = REVIEW_EDIT_WINDOW_HOURS * 60 * 60 * 1000
/** 15 days 毫秒数 */
const VALID_PERIOD_MS = REVIEW_VALID_DAYS * 24 * 60 * 60 * 1000

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name)

  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Shop) private readonly shopRepo: Repository<Shop>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly operationLogService: OperationLogService,
    @Optional()
    @Inject(REVIEW_DEP_ORDER_SERVICE)
    private readonly orderService: IReviewOrderService | null
  ) {}

  /* ==========================================================================
   * 一、用户端
   * ========================================================================== */

  /**
   * 用户端：提交评价
   *
   * 流程：
   *   1. 取 OrderService.findOrderCoreByNo(orderNo) → 校验 owner / 状态 / 15 天有效期
   *   2. 写 review（事务内）；唯一冲突 → BIZ_DATA_CONFLICT
   *   3. 评分聚合更新（shop.score / product.score）
   *
   * 参数：userId / dto
   * 返回值：ReviewVo
   * 错误：
   *   - 10010 订单不存在
   *   - 10302 非本人订单
   *   - 10800 评价不在有效期（订单未完成 / 超过 15 天）
   *   - 10011 一单一评冲突
   */
  async submit(userId: string, dto: SubmitReviewDto): Promise<ReviewVo> {
    const order = await this.requireOrder(dto.orderNo)
    if (order.userId !== userId) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_NOT_OWNED,
        '非本人订单',
        HttpStatus.FORBIDDEN
      )
    }
    this.assertReviewable(order.status, order.finishedAt)

    const now = new Date()
    const review = this.reviewRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      orderNo: dto.orderNo,
      orderType: order.orderType,
      userId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      shopId: this.resolveShopId(dto, order),
      riderId: this.resolveRiderId(dto, order),
      score: dto.score,
      tasteScore: dto.tasteScore ?? null,
      packageScore: dto.packageScore ?? null,
      deliveryScore: dto.deliveryScore ?? null,
      content: dto.content ?? null,
      imageUrls: dto.imageUrls ?? null,
      tags: dto.tags ?? null,
      isAnonymous: dto.isAnonymous ?? 0,
      isTop: 0,
      isHidden: 0,
      usefulCount: 0,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })

    let saved: Review
    try {
      saved = await this.reviewRepo.save(review)
    } catch (err) {
      /* 唯一索引冲突 uk_order_target → 数据冲突 */
      if (this.isUniqueViolation(err)) {
        throw new BusinessException(
          BizErrorCode.BIZ_DATA_CONFLICT,
          '该订单已对此对象评价过，每单仅可评价一次'
        )
      }
      throw err
    }

    await this.aggregateScore(saved)
    this.logger.log(
      `用户 ${userId} 提交评价 ${saved.id}（订单 ${dto.orderNo} → target=${dto.targetType}#${dto.targetId} score=${dto.score}）`
    )
    return this.toVo(saved)
  }

  /**
   * 用户端：修改评价（24h 窗口内）
   *
   * 流程：
   *   1. 找评价 + owner 校验
   *   2. 校验 24h 窗口（now - createdAt ≤ 24h）
   *   3. 更新允许的字段（不允许改 orderNo / targetType / targetId / userId）
   *   4. 重算评分聚合（旧 score → 新 score 差额）
   *
   * 参数：reviewId / userId / dto
   * 返回值：ReviewVo
   * 错误：10010 / 10302 / 10012「评价已锁定」
   */
  async update(reviewId: string, userId: string, dto: UpdateReviewDto): Promise<ReviewVo> {
    const review = await this.requireOwn(reviewId, userId)
    if (Date.now() - review.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '评价已锁定（提交超过 24 小时不可修改）'
      )
    }

    const oldScore = review.score
    if (dto.score !== undefined) review.score = dto.score
    if (dto.tasteScore !== undefined) review.tasteScore = dto.tasteScore
    if (dto.packageScore !== undefined) review.packageScore = dto.packageScore
    if (dto.deliveryScore !== undefined) review.deliveryScore = dto.deliveryScore
    if (dto.content !== undefined) review.content = dto.content
    if (dto.imageUrls !== undefined) review.imageUrls = dto.imageUrls
    if (dto.tags !== undefined) review.tags = dto.tags
    if (dto.isAnonymous !== undefined) review.isAnonymous = dto.isAnonymous
    review.updatedAt = new Date()

    const saved = await this.reviewRepo.save(review)
    if (dto.score !== undefined && dto.score !== oldScore) {
      await this.aggregateScoreDelta(saved, oldScore, saved.score)
    }
    this.logger.log(`用户 ${userId} 修改评价 ${reviewId}（旧 score=${oldScore} → ${saved.score}）`)
    return this.toVo(saved)
  }

  /**
   * 用户端：我的评价列表（按 userId 过滤）
   * 参数：userId / query
   * 返回值：PageResult<ReviewVo>
   */
  async listForUser(userId: string, query: QueryReviewDto): Promise<PageResult<ReviewVo>> {
    const where: FindOptionsWhere<Review> = { isDeleted: 0, userId }
    if (query.targetType !== undefined) where.targetType = query.targetType
    if (query.orderNo) where.orderNo = query.orderNo
    return this.queryWithCommon(where, query, 'user')
  }

  /**
   * 商户端：查评价（按 shopId 过滤；商户必须传 owner shopId 列表 → controller 透传）
   * 参数：shopIds / query
   * 返回值：PageResult<ReviewVo>
   *
   * 注：商户可拥有多家店；若 query.shopId 已指定且不在 shopIds 内 → 抛 20003
   */
  async listForMerchant(shopIds: string[], query: QueryReviewDto): Promise<PageResult<ReviewVo>> {
    if (shopIds.length === 0) return makePageResult([], 0, query.page ?? 1, query.pageSize ?? 20)
    const filterShopId = query.shopId
    if (filterShopId && !shopIds.includes(filterShopId)) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本商户名下店铺',
        HttpStatus.FORBIDDEN
      )
    }
    const qb = this.reviewRepo.createQueryBuilder('r').where('r.is_deleted = 0')
    if (filterShopId) {
      qb.andWhere('r.shop_id = :sid', { sid: filterShopId })
    } else {
      qb.andWhere('r.shop_id IN (:...sids)', { sids: shopIds })
    }
    this.applyCommonFilter(qb, query, 'merchant')
    qb.orderBy('r.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 骑手端：查差评（按 riderId + score ≤ 3 过滤）
   * 参数：riderId / query
   * 返回值：PageResult<ReviewVo>
   */
  async listForRider(riderId: string, query: QueryReviewDto): Promise<PageResult<ReviewVo>> {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .where('r.is_deleted = 0')
      .andWhere('r.rider_id = :rid', { rid: riderId })
      .andWhere('r.score <= 3')
    this.applyCommonFilter(qb, query, 'rider')
    qb.orderBy('r.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 管理端：全量评价列表
   * 参数：query
   * 返回值：PageResult<ReviewVo>
   */
  async listForAdmin(query: QueryReviewDto): Promise<PageResult<ReviewVo>> {
    const where: FindOptionsWhere<Review> = { isDeleted: 0 }
    if (query.userId) where.userId = query.userId
    if (query.targetType !== undefined) where.targetType = query.targetType
    if (query.targetId) where.targetId = query.targetId
    if (query.shopId) where.shopId = query.shopId
    if (query.riderId) where.riderId = query.riderId
    if (query.orderNo) where.orderNo = query.orderNo
    return this.queryWithCommon(where, query, 'admin')
  }

  /* ==========================================================================
   * 二、管理端 违规处理
   * ========================================================================== */

  /**
   * 管理端：隐藏评价（违规处理）
   *
   * 参数：reviewId / opAdminId / dto
   * 返回值：ReviewVo
   * 副作用：写 OperationLog
   */
  async hide(reviewId: string, opAdminId: string, dto: HideReviewDto): Promise<ReviewVo> {
    const review = await this.requireById(reviewId)
    review.isHidden = 1
    review.updatedAt = new Date()
    const saved = await this.reviewRepo.save(review)
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'hide',
      resourceType: 'review',
      resourceId: reviewId,
      description: `隐藏评价 ${reviewId}（订单 ${review.orderNo}）：${dto.reason}`
    })
    this.logger.log(`管理员 ${opAdminId} 隐藏评价 ${reviewId} reason=${dto.reason}`)
    return this.toVo(saved)
  }

  /**
   * 管理端：置顶 / 取消置顶
   *
   * 参数：reviewId / opAdminId / dto
   * 返回值：ReviewVo
   */
  async top(reviewId: string, opAdminId: string, dto: TopReviewDto): Promise<ReviewVo> {
    const review = await this.requireById(reviewId)
    review.isTop = dto.isTop
    review.updatedAt = new Date()
    const saved = await this.reviewRepo.save(review)
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'top',
      resourceType: 'review',
      resourceId: reviewId,
      description: `${dto.isTop === 1 ? '置顶' : '取消置顶'}评价 ${reviewId}`
    })
    return this.toVo(saved)
  }

  /**
   * 通用：increment usefulCount（+1 / -1）
   *
   * 参数：reviewId / dto.delta（+1 / -1）
   * 返回值：ReviewVo
   * 用途：用户对评价投有用票（本接口供后续接入；当前仅作 service 能力）
   */
  async vote(reviewId: string, dto: UsefulVoteDto): Promise<ReviewVo> {
    const review = await this.requireById(reviewId)
    if (dto.delta < 0 && review.usefulCount === 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        'usefulCount 已为 0，不可继续 -1'
      )
    }
    review.usefulCount += dto.delta
    review.updatedAt = new Date()
    const saved = await this.reviewRepo.save(review)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 三、内部能力（暴露给同模块其它 service 复用）
   * ========================================================================== */

  /**
   * 按 ID 取评价（不限制 owner）
   * 参数：reviewId
   * 返回值：Review
   * 错误：10010 BIZ_RESOURCE_NOT_FOUND
   */
  async requireById(reviewId: string): Promise<Review> {
    const r = await this.reviewRepo.findOne({ where: { id: reviewId, isDeleted: 0 } })
    if (!r) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '评价不存在',
        HttpStatus.NOT_FOUND
      )
    }
    return r
  }

  /**
   * 按 ID 取评价并校验 owner
   * 参数：reviewId / userId
   * 返回值：Review
   * 错误：10010 / 20003
   */
  async requireOwn(reviewId: string, userId: string): Promise<Review> {
    const r = await this.requireById(reviewId)
    if (r.userId !== userId) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本人评价，禁止操作',
        HttpStatus.FORBIDDEN
      )
    }
    return r
  }

  /**
   * 查商户名下店铺 ID 列表（merchant 端 owner 校验通用辅助；不存在返回 []）
   *
   * 参数：merchantId
   * 返回值：shopId[] 已排除软删
   * 用途：merchant 控制器调 listForMerchant / merchantHandle / appeal 等接口前预查
   */
  async findShopIdsByMerchant(merchantId: string): Promise<string[]> {
    const rows = await this.shopRepo.find({
      where: { merchantId, isDeleted: 0 },
      select: ['id']
    })
    return rows.map((r) => r.id)
  }

  /**
   * 隐藏评价（内部能力，供 review-appeal.service 在审核通过后调用）
   * 参数：reviewId / actorDesc 操作者描述
   * 返回值：Review
   */
  async hideInternal(reviewId: string, actorDesc: string): Promise<Review> {
    const r = await this.requireById(reviewId)
    r.isHidden = 1
    r.updatedAt = new Date()
    const saved = await this.reviewRepo.save(r)
    this.logger.log(`${actorDesc} 因申诉通过隐藏评价 ${reviewId}`)
    return saved
  }

  /**
   * Entity → VO（统一转换）
   * 参数：r Review
   * 返回值：ReviewVo
   */
  toVo(r: Review): ReviewVo {
    return {
      id: r.id,
      orderNo: r.orderNo,
      orderType: r.orderType,
      userId: r.userId,
      targetType: r.targetType,
      targetId: r.targetId,
      shopId: r.shopId,
      riderId: r.riderId,
      score: r.score,
      tasteScore: r.tasteScore,
      packageScore: r.packageScore,
      deliveryScore: r.deliveryScore,
      content: r.content,
      imageUrls: r.imageUrls,
      tags: r.tags,
      isAnonymous: r.isAnonymous,
      isTop: r.isTop,
      isHidden: r.isHidden,
      usefulCount: r.usefulCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  }

  /* ==========================================================================
   * 四、私有实现
   * ========================================================================== */

  /**
   * 通过 OrderService 反查订单核心视图（订单不存在 → 10010）
   *
   * 注：在 Subagent 1 OrderService 装配前，本依赖可能为 null（测试 / 早期集成）
   *     此时直接抛 BIZ_OPERATION_FORBIDDEN 提示「订单服务未就绪」
   */
  private async requireOrder(orderNo: string): Promise<{
    orderType: number
    userId: string
    shopId: string | null
    riderId: string | null
    status: number
    payNo: string | null
    payAmount: string
    finishedAt: Date | null
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
    return order
  }

  /**
   * 校验评价是否在有效期内（status=55 + finishedAt 非空 + ≤ 15 天）
   */
  private assertReviewable(orderStatus: number, finishedAt: Date | null): void {
    if (orderStatus !== REVIEW_ALLOWED_ORDER_STATUS) {
      throw new BusinessException(BizErrorCode.BIZ_REVIEW_OUT_OF_PERIOD, '订单尚未完成，暂不可评价')
    }
    if (!finishedAt) {
      throw new BusinessException(
        BizErrorCode.BIZ_REVIEW_OUT_OF_PERIOD,
        '订单完成时间缺失，暂不可评价'
      )
    }
    if (Date.now() - finishedAt.getTime() > VALID_PERIOD_MS) {
      throw new BusinessException(
        BizErrorCode.BIZ_REVIEW_OUT_OF_PERIOD,
        `评价不在有效期（订单完成后 ${REVIEW_VALID_DAYS} 天内可评价）`
      )
    }
  }

  /**
   * 解析评价行的 shopId 冗余字段
   *   - targetType=1 店铺：dto.targetId
   *   - 否则：order.shopId（外卖订单才有）
   */
  private resolveShopId(dto: SubmitReviewDto, order: { shopId: string | null }): string | null {
    if (dto.targetType === ReviewTargetTypeEnum.SHOP) return dto.targetId
    return order.shopId
  }

  /**
   * 解析评价行的 riderId 冗余字段
   *   - targetType=3 骑手：dto.targetId
   *   - 否则：order.riderId
   */
  private resolveRiderId(dto: SubmitReviewDto, order: { riderId: string | null }): string | null {
    if (dto.targetType === ReviewTargetTypeEnum.RIDER) return dto.targetId
    return order.riderId
  }

  /**
   * 评分聚合更新（首次提交评价 → shop / product 加权平均 + 计数 +1）
   *
   * 防 N+1：仅更新 1 张表 1 行；本期同步更新（写库压力可忽略，量级千行/天）。
   * 后续优化：CDC + Redis pre-aggregate + 定时刷库。
   */
  private async aggregateScore(review: Review): Promise<void> {
    if (review.targetType === ReviewTargetTypeEnum.SHOP) {
      await this.bumpShopScore(review.targetId, review.score)
      return
    }
    if (review.targetType === ReviewTargetTypeEnum.PRODUCT) {
      await this.bumpProductScore(review.targetId, review.score)
      return
    }
    /* targetType=3 骑手 / 4 综合：本期不聚合到 shop/product；骑手评分聚合见 P5 优化 */
  }

  /**
   * 修改评价时的评分差额聚合更新
   * 公式：newAvg = (oldAvg * count - oldScore + newScore) / count
   */
  private async aggregateScoreDelta(
    review: Review,
    oldScore: number,
    newScore: number
  ): Promise<void> {
    if (oldScore === newScore) return
    if (review.targetType === ReviewTargetTypeEnum.SHOP) {
      await this.replaceShopScore(review.targetId, oldScore, newScore)
      return
    }
    if (review.targetType === ReviewTargetTypeEnum.PRODUCT) {
      await this.replaceProductScore(review.targetId, oldScore, newScore)
      return
    }
  }

  /**
   * shop.score / score_count 加权增量
   * 注：原子更新用 SQL 表达式避免并发覆盖
   */
  private async bumpShopScore(shopId: string, score: number): Promise<void> {
    try {
      await this.shopRepo
        .createQueryBuilder()
        .update(Shop)
        .set({
          score: () => `(score * score_count + ${score}) / (score_count + 1)`,
          scoreCount: () => 'score_count + 1',
          updatedAt: new Date()
        })
        .where('id = :id', { id: shopId })
        .execute()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`shop 评分聚合失败 shopId=${shopId} score=${score}：${msg}`)
    }
  }

  /**
   * shop.score 修改评价时的差额更新
   *   newAvg = (oldAvg * count - oldScore + newScore) / count
   */
  private async replaceShopScore(
    shopId: string,
    oldScore: number,
    newScore: number
  ): Promise<void> {
    try {
      await this.shopRepo
        .createQueryBuilder()
        .update(Shop)
        .set({
          score: () => `(score * score_count - ${oldScore} + ${newScore}) / score_count`,
          updatedAt: new Date()
        })
        .where('id = :id AND score_count > 0', { id: shopId })
        .execute()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`shop 评分差额更新失败 shopId=${shopId}：${msg}`)
    }
  }

  /**
   * product.score / score_count 加权增量
   */
  private async bumpProductScore(productId: string, score: number): Promise<void> {
    try {
      await this.productRepo
        .createQueryBuilder()
        .update(Product)
        .set({
          score: () => `(score * score_count + ${score}) / (score_count + 1)`,
          scoreCount: () => 'score_count + 1',
          updatedAt: new Date()
        })
        .where('id = :id', { id: productId })
        .execute()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`product 评分聚合失败 productId=${productId} score=${score}：${msg}`)
    }
  }

  /**
   * product.score 修改评价时的差额更新
   */
  private async replaceProductScore(
    productId: string,
    oldScore: number,
    newScore: number
  ): Promise<void> {
    try {
      await this.productRepo
        .createQueryBuilder()
        .update(Product)
        .set({
          score: () => `(score * score_count - ${oldScore} + ${newScore}) / score_count`,
          updatedAt: new Date()
        })
        .where('id = :id AND score_count > 0', { id: productId })
        .execute()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`product 评分差额更新失败 productId=${productId}：${msg}`)
    }
  }

  /**
   * 列表查询通用方法（同 where 条件 + 通用过滤 + 分页）
   */
  private async queryWithCommon(
    where: FindOptionsWhere<Review>,
    query: QueryReviewDto,
    scope: 'user' | 'merchant' | 'rider' | 'admin'
  ): Promise<PageResult<ReviewVo>> {
    const qb = this.reviewRepo.createQueryBuilder('r').where(where)
    this.applyCommonFilter(qb, query, scope)
    qb.orderBy('r.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 通用过滤：score 区间 + onlyVisible / onlyTop
   *
   * scope 语义：
   *   - 'user'/'merchant'/'rider'：默认隐藏被 is_hidden=1 的评价（除非显式 onlyVisible=0）
   *   - 'admin'：默认全部，按 onlyVisible 过滤
   */
  private applyCommonFilter(
    qb: ReturnType<Repository<Review>['createQueryBuilder']>,
    query: QueryReviewDto,
    scope: 'user' | 'merchant' | 'rider' | 'admin'
  ): void {
    if (query.scoreMin !== undefined) qb.andWhere('r.score >= :smin', { smin: query.scoreMin })
    if (query.scoreMax !== undefined) qb.andWhere('r.score <= :smax', { smax: query.scoreMax })
    const visibleDefault = scope === 'admin' ? 0 : 1
    const visible = query.onlyVisible ?? visibleDefault
    if (visible === 1) qb.andWhere('r.is_hidden = 0')
    if (query.onlyTop === 1) qb.andWhere('r.is_top = 1')
  }

  /**
   * 是否唯一约束冲突（MySQL ER_DUP_ENTRY）
   */
  private isUniqueViolation(err: unknown): boolean {
    if (err instanceof QueryFailedError) {
      const driverErr = (
        err as QueryFailedError & {
          driverError?: { code?: string; errno?: number }
        }
      ).driverError
      if (driverErr?.code === 'ER_DUP_ENTRY' || driverErr?.errno === 1062) return true
    }
    return false
  }
}
