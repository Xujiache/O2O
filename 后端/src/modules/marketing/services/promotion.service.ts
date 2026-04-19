/**
 * @file promotion.service.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc 营销活动模板 CRUD + 状态流转 + 用户端店铺活动列表（含 Redis 缓存）
 * @author 单 Agent V2.0
 *
 * 数据：MySQL `promotion`
 * 缓存：promotion:shop:{shopId} TTL 60s（用户端店铺活动列表）
 * 校验：rule_json 强 schema 由 PromotionRuleValidatorService 提供
 * 鉴权：商户 owner 校验在 service 层 assertOwner（issuerType=2 && issuerId === merchantId）
 *
 * 状态机（promotion.status）：
 *   0 草稿 → 1 启用 / 2 暂停 / 3 已结束
 *   1 启用 ↔ 2 暂停； 1/2 → 3 已结束
 *   3 已结束 不可逆
 *
 * 编辑约束：
 *   - used_qty > 0 时仅允许改 status / description（防影响已成交订单的优惠规则）
 */

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { Brackets, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Promotion } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { SnowflakeId, generateBizNo } from '@/utils'
import {
  type CreatePromotionDto,
  type PromotionVo,
  type QueryPromotionDto,
  type QueryShopPromotionDto,
  type UpdatePromotionDto,
  type UpdatePromotionStatusDto
} from '../dto/promotion.dto'
import { PromotionRuleValidatorService } from './promotion-rule-validator.service'

/* ============================================================================
 * Redis 缓存键
 * ============================================================================ */
const SHOP_PROMOTION_KEY = (shopId: string): string => `promotion:shop:${shopId}`
const SHOP_PROMOTION_TTL_SECONDS = 60

/** status 流转矩阵：from → 允许的 to 集合 */
const STATUS_TRANSITIONS: Record<number, number[]> = {
  0: [1, 3], // 草稿 → 启用 / 已结束
  1: [2, 3], // 启用 → 暂停 / 已结束
  2: [1, 3], // 暂停 → 启用 / 已结束
  3: [] // 已结束（终态）
}

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name)

  constructor(
    @InjectRepository(Promotion) private readonly promotionRepo: Repository<Promotion>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly ruleValidator: PromotionRuleValidatorService
  ) {}

  /* ==========================================================================
   * 创建（商户 / 平台 共用底层；issuerType + issuerId 由 controller 层注入）
   * ========================================================================== */

  /**
   * 创建活动
   * 参数：dto / issuerType (1 平台 / 2 商户) / issuerId（平台 = null；商户 = currentUser.uid）
   * 返回值：PromotionVo
   * 用途：POST /merchant/promotions、POST /admin/promotions
   *
   * 副作用：失效适用店铺缓存（applicableShops 全部）
   */
  async create(
    dto: CreatePromotionDto,
    issuerType: number,
    issuerId: string | null
  ): Promise<PromotionVo> {
    /* 1. rule_json schema 强校验（按 promoType） */
    this.ruleValidator.validate(dto.promoType, dto.ruleJson)

    /* 2. 时间区间校验 */
    const validFrom = new Date(dto.validFrom)
    const validTo = new Date(dto.validTo)
    if (
      Number.isNaN(validFrom.getTime()) ||
      Number.isNaN(validTo.getTime()) ||
      validTo.getTime() <= validFrom.getTime()
    ) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'validTo 必须晚于 validFrom')
    }

    /* 3. 商户端要求 issuerId 非空 */
    if (issuerType === 2 && !issuerId) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '商户端创建活动必须携带 issuerId'
      )
    }

    /* 4. 秒杀活动 totalQty 与 rule_json.qty 强一致校验 */
    if (dto.promoType === 5) {
      const seckill = this.ruleValidator.parseSeckill(dto.ruleJson)
      if (dto.totalQty !== undefined && dto.totalQty !== 0 && dto.totalQty !== seckill.qty) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `秒杀活动 totalQty(${dto.totalQty}) 与 rule_json.qty(${seckill.qty}) 必须一致`
        )
      }
    }

    const now = new Date()
    const entity = this.promotionRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      promotionCode: this.generatePromotionCode(),
      name: dto.name,
      promoType: dto.promoType,
      issuerType,
      issuerId,
      scene: dto.scene,
      applicableShops: dto.applicableShops ?? null,
      applicableProducts: dto.applicableProducts ?? null,
      ruleJson: dto.ruleJson,
      totalQty: dto.totalQty ?? 0,
      usedQty: 0,
      perUserLimit: dto.perUserLimit ?? 1,
      validFrom,
      validTo,
      priority: dto.priority ?? 0,
      isStackable: dto.isStackable ?? 0,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl ?? null,
      status: 0, // 默认草稿
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.promotionRepo.save(entity)
    await this.invalidateShopCacheBatch(saved.applicableShops)
    this.logger.log(
      `创建活动 ${saved.id}（${saved.name} type=${saved.promoType} issuer=${issuerType}/${issuerId ?? 'null'}）`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 编辑
   * ========================================================================== */

  /**
   * 编辑活动
   * 参数：id / dto / 鉴权 ctx（issuerType + issuerId；issuerType=1 平台跳过 owner 校验）
   * 返回值：PromotionVo
   *
   * 关键约束：used_qty > 0 时仅允许改 status / description（其余字段抛 BIZ_OPERATION_FORBIDDEN）
   */
  async update(
    id: string,
    dto: UpdatePromotionDto,
    ctx: { issuerType: number; issuerId: string | null }
  ): Promise<PromotionVo> {
    const promotion = await this.assertEditable(id, ctx)

    /* used_qty > 0 时收紧编辑范围 */
    if (promotion.usedQty > 0) {
      const lockedFieldsTouched = this.detectNonAllowedFieldsForLocked(dto)
      if (lockedFieldsTouched.length > 0) {
        throw new BusinessException(
          BizErrorCode.BIZ_OPERATION_FORBIDDEN,
          `活动已被使用（used_qty=${promotion.usedQty}），仅允许修改 status / description；命中受限字段：${lockedFieldsTouched.join(',')}`
        )
      }
    }

    /* rule_json 修改时同样走强校验 */
    if (dto.ruleJson !== undefined) {
      this.ruleValidator.validate(promotion.promoType, dto.ruleJson)
      promotion.ruleJson = dto.ruleJson
    }

    /* 时间窗修改：先各自单独更新，最后统一校验 from < to */
    let nextValidFrom = promotion.validFrom
    let nextValidTo = promotion.validTo
    if (dto.validFrom !== undefined) {
      const d = new Date(dto.validFrom)
      if (Number.isNaN(d.getTime())) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'validFrom 不是合法 ISO 时间')
      }
      nextValidFrom = d
    }
    if (dto.validTo !== undefined) {
      const d = new Date(dto.validTo)
      if (Number.isNaN(d.getTime())) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'validTo 不是合法 ISO 时间')
      }
      nextValidTo = d
    }
    if (nextValidTo.getTime() <= nextValidFrom.getTime()) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'validTo 必须晚于 validFrom')
    }
    promotion.validFrom = nextValidFrom
    promotion.validTo = nextValidTo

    const oldShops = promotion.applicableShops
    if (dto.name !== undefined) promotion.name = dto.name
    if (dto.applicableShops !== undefined) promotion.applicableShops = dto.applicableShops
    if (dto.applicableProducts !== undefined) promotion.applicableProducts = dto.applicableProducts
    if (dto.totalQty !== undefined) promotion.totalQty = dto.totalQty
    if (dto.perUserLimit !== undefined) promotion.perUserLimit = dto.perUserLimit
    if (dto.priority !== undefined) promotion.priority = dto.priority
    if (dto.isStackable !== undefined) promotion.isStackable = dto.isStackable
    if (dto.description !== undefined) promotion.description = dto.description
    if (dto.imageUrl !== undefined) promotion.imageUrl = dto.imageUrl

    const saved = await this.promotionRepo.save(promotion)
    /* 旧 + 新店铺缓存均失效 */
    await this.invalidateShopCacheBatch(oldShops)
    await this.invalidateShopCacheBatch(saved.applicableShops)
    this.logger.log(`更新活动 ${id}`)
    return this.toVo(saved)
  }

  /**
   * 状态流转（商户/管理共用）
   * 参数：id / dto / ctx
   * 返回值：PromotionVo
   * 校验：from→to 必须在 STATUS_TRANSITIONS 矩阵内
   */
  async updateStatus(
    id: string,
    dto: UpdatePromotionStatusDto,
    ctx: { issuerType: number; issuerId: string | null }
  ): Promise<PromotionVo> {
    const promotion = await this.assertEditable(id, ctx)
    const allowed = STATUS_TRANSITIONS[promotion.status] ?? []
    if (!allowed.includes(dto.status)) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `状态流转非法：${promotion.status} → ${dto.status}（允许：${allowed.join(',') || '无'}）`
      )
    }
    promotion.status = dto.status
    const saved = await this.promotionRepo.save(promotion)
    await this.invalidateShopCacheBatch(saved.applicableShops)
    this.logger.log(`活动 ${id} 状态变更 → ${dto.status}`)
    return this.toVo(saved)
  }

  /**
   * 软删
   * 参数：id / ctx
   * 返回值：void
   * 校验：used_qty > 0 → 拒绝
   */
  async softDelete(
    id: string,
    ctx: { issuerType: number; issuerId: string | null }
  ): Promise<void> {
    const promotion = await this.assertEditable(id, ctx)
    if (promotion.usedQty > 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `活动已被使用（used_qty=${promotion.usedQty}），拒绝删除`
      )
    }
    promotion.isDeleted = 1
    promotion.deletedAt = new Date()
    await this.promotionRepo.save(promotion)
    await this.invalidateShopCacheBatch(promotion.applicableShops)
    this.logger.log(`软删活动 ${id}`)
  }

  /**
   * 管理端强制停用：不论当前 status 直接置 2 暂停（保留可恢复路径）
   * 参数：id / reason 由 controller 写 OperationLog
   */
  async forceStop(id: string): Promise<PromotionVo> {
    const promotion = await this.findActiveById(id)
    promotion.status = 2
    const saved = await this.promotionRepo.save(promotion)
    await this.invalidateShopCacheBatch(saved.applicableShops)
    this.logger.log(`管理端强制停用活动 ${id}`)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 查询
   * ========================================================================== */

  /**
   * 商户端：我的活动列表（issuerType=2 + issuerId=merchantId）
   */
  async listForMerchant(
    merchantId: string,
    query: QueryPromotionDto
  ): Promise<PageResult<PromotionVo>> {
    const qb = this.buildListQb(query)
      .andWhere('p.issuer_type = 2')
      .andWhere('p.issuer_id = :iid', { iid: merchantId })
    qb.orderBy('p.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 管理端：全量活动列表
   */
  async listForAdmin(query: QueryPromotionDto): Promise<PageResult<PromotionVo>> {
    const qb = this.buildListQb(query)
    if (query.issuerType !== undefined) {
      qb.andWhere('p.issuer_type = :it', { it: query.issuerType })
    }
    qb.orderBy('p.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 商户端 / 管理端 详情
   * 参数：id / ctx —— 商户视角带 issuerId 校验；管理视角 issuerType=1 跳过校验
   */
  async detail(
    id: string,
    ctx: { issuerType: number; issuerId: string | null }
  ): Promise<PromotionVo> {
    const promotion = await this.assertEditable(id, ctx)
    return this.toVo(promotion)
  }

  /**
   * 用户端：店铺当前进行中活动列表（缓存 60s）
   * 参数：shopId / query (scene 过滤)
   * 返回值：PromotionVo[]
   * 用途：GET /shops/:shopId/promotions
   *
   * 命中条件：status=1 + 当前时间在 [validFrom, validTo] + 适用店铺包含 shopId（或 NULL=全部）
   *           + scene 匹配（场景=3 通用 兜底命中）
   */
  async listForPublic(shopId: string, query: QueryShopPromotionDto): Promise<PromotionVo[]> {
    const cacheKey = SHOP_PROMOTION_KEY(shopId)
    const cached = await this.safeGet<PromotionVo[]>(cacheKey)
    if (cached) {
      return this.filterByScene(cached, query.scene)
    }

    const now = new Date()
    const qb = this.promotionRepo
      .createQueryBuilder('p')
      .where('p.is_deleted = 0')
      .andWhere('p.status = 1')
      .andWhere('p.valid_from <= :now', { now })
      .andWhere('p.valid_to >= :now', { now })
      .andWhere(
        new Brackets((sub) => {
          /* MySQL JSON_CONTAINS：未 cast 的 shopId 字符串需要双引号包裹 */
          sub
            .where('p.applicable_shops IS NULL')
            .orWhere('JSON_CONTAINS(p.applicable_shops, JSON_QUOTE(:shopId)) = 1', { shopId })
        })
      )
      .orderBy('p.priority', 'DESC')
      .addOrderBy('p.created_at', 'DESC')
      .take(200)

    const rows = await qb.getMany()
    const vos = rows.map((r) => this.toVo(r))
    await this.safeSet(cacheKey, vos, SHOP_PROMOTION_TTL_SECONDS)
    return this.filterByScene(vos, query.scene)
  }

  /**
   * 内部：按 IDs 拉取活动；DiscountCalc 服务调用
   * 参数：ids
   * 返回值：Promotion[]（保留原始 entity，便于 calc 直接读 ruleJson）
   */
  async findByIds(ids: string[]): Promise<Promotion[]> {
    if (ids.length === 0) return []
    return this.promotionRepo
      .createQueryBuilder('p')
      .where('p.is_deleted = 0')
      .andWhere('p.id IN (:...ids)', { ids })
      .getMany()
  }

  /**
   * 内部：店铺当前所有 status=1 进行中的活动（DiscountCalc 默认数据源）
   * 参数：shopId / now
   * 返回值：Promotion[]
   */
  async findActiveByShop(shopId: string, now: Date = new Date()): Promise<Promotion[]> {
    return this.promotionRepo
      .createQueryBuilder('p')
      .where('p.is_deleted = 0')
      .andWhere('p.status = 1')
      .andWhere('p.valid_from <= :now', { now })
      .andWhere('p.valid_to >= :now', { now })
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('p.applicable_shops IS NULL')
            .orWhere('JSON_CONTAINS(p.applicable_shops, JSON_QUOTE(:shopId)) = 1', {
              shopId
            })
        })
      )
      .getMany()
  }

  /**
   * 失效一个店铺的活动列表缓存
   */
  async invalidateShopCache(shopId: string): Promise<void> {
    try {
      await this.redis.del(SHOP_PROMOTION_KEY(shopId))
    } catch (err) {
      this.logger.warn(`Redis DEL ${SHOP_PROMOTION_KEY(shopId)} 失败：${(err as Error).message}`)
    }
  }

  /* ==========================================================================
   * 内部 helpers
   * ========================================================================== */

  /** 失效一组适用店铺的活动列表缓存（applicableShops=null 时跳过） */
  private async invalidateShopCacheBatch(shops: string[] | null | undefined): Promise<void> {
    if (!shops || shops.length === 0) return
    for (const shopId of shops) {
      await this.invalidateShopCache(shopId)
    }
  }

  /** 找一个未删除的活动；不存在抛 BIZ_RESOURCE_NOT_FOUND */
  async findActiveById(id: string): Promise<Promotion> {
    const promotion = await this.promotionRepo.findOne({
      where: { id, isDeleted: 0 }
    })
    if (!promotion) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '活动不存在')
    }
    return promotion
  }

  /**
   * 校验可编辑：商户端必须为本人活动；平台端任意
   */
  private async assertEditable(
    id: string,
    ctx: { issuerType: number; issuerId: string | null }
  ): Promise<Promotion> {
    const promotion = await this.findActiveById(id)
    /* 商户视角：issuerType=2 + 必须本人 */
    if (ctx.issuerType === 2) {
      if (promotion.issuerType !== 2 || promotion.issuerId !== ctx.issuerId) {
        throw new BusinessException(
          BizErrorCode.AUTH_PERMISSION_DENIED,
          '非本人活动，禁止操作',
          HttpStatus.FORBIDDEN
        )
      }
    }
    /* 平台视角（issuerType=1）放行 */
    return promotion
  }

  /**
   * 检查 update dto 是否触碰了 used_qty>0 时禁改字段
   */
  private detectNonAllowedFieldsForLocked(dto: UpdatePromotionDto): string[] {
    const ALLOWED = new Set(['description'])
    const touched: string[] = []
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue
      if (!ALLOWED.has(k)) touched.push(k)
    }
    return touched
  }

  /** 列表查询 QueryBuilder（共用基础 where） */
  private buildListQb(
    query: QueryPromotionDto
  ): ReturnType<Repository<Promotion>['createQueryBuilder']> {
    const qb = this.promotionRepo.createQueryBuilder('p').where('p.is_deleted = 0')
    if (query.name) qb.andWhere('p.name LIKE :n', { n: `%${query.name}%` })
    if (query.promoType !== undefined) {
      qb.andWhere('p.promo_type = :pt', { pt: query.promoType })
    }
    if (query.status !== undefined) qb.andWhere('p.status = :st', { st: query.status })
    if (query.scene !== undefined) qb.andWhere('p.scene = :sc', { sc: query.scene })
    return qb
  }

  /** scene 过滤：传入 scene 时仅保留匹配项 + 场景=3 通用 */
  private filterByScene(list: PromotionVo[], scene: number | undefined): PromotionVo[] {
    if (scene === undefined) return list
    return list.filter((p) => p.scene === scene || p.scene === 3)
  }

  /** Promotion entity → VO（无 tenantId / isDeleted / deletedAt 等内部字段） */
  private toVo(p: Promotion): PromotionVo {
    return {
      id: p.id,
      promotionCode: p.promotionCode,
      name: p.name,
      promoType: p.promoType,
      issuerType: p.issuerType,
      issuerId: p.issuerId,
      scene: p.scene,
      applicableShops: p.applicableShops,
      applicableProducts: p.applicableProducts,
      ruleJson: p.ruleJson,
      totalQty: p.totalQty,
      usedQty: p.usedQty,
      perUserLimit: p.perUserLimit,
      validFrom: p.validFrom,
      validTo: p.validTo,
      priority: p.priority,
      isStackable: p.isStackable,
      description: p.description,
      imageUrl: p.imageUrl,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }
  }

  /** 生成活动编码：P + yyyymmdd + 6 位序号 = 15 位 */
  private generatePromotionCode(): string {
    return generateBizNo('P')
  }

  /* ----- Redis 缓存辅助 ----- */

  private async safeGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch (err) {
      this.logger.warn(`Redis GET 失败 ${key}：${(err as Error).message}`)
      return null
    }
  }

  private async safeSet<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl)
    } catch (err) {
      this.logger.warn(`Redis SET 失败 ${key}：${(err as Error).message}`)
    }
  }
}
