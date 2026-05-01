/**
 * @file shop.service.ts
 * @stage P4/T4.1 + T4.3（Sprint 1）
 * @desc 店铺服务：CRUD + 公告 + 自动接单 + 营业状态 + 审核 / 封禁 + 用户端列表（GEO+排序+筛选+缓存）
 * @author 单 Agent V2.0
 *
 * 数据：MySQL `shop`
 * 缓存：
 *   - shop:detail:{shopId}                                TTL 300s
 *   - shop:list:{cityCode}:{md5(JSON.stringify(params))}  TTL 120s
 *
 * 敏感字段：contact_mobile 三件套（enc/hash/tail4）；返回 VO 时只给 tail4，对店主/admin 视角额外给 mask
 *
 * 审核流：
 *   - audit_status = 0 待审 / 1 通过 / 2 驳回
 *   - 创建：默认 0 待审
 *   - 更新命中敏感字段（name/address/lng/lat/contactMobile/industryCode）→ 重置为 0
 *   - 管理端 audit(action=pass) → 1；audit(action=reject) → 2 + remark
 */

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import type Redis from 'ioredis'
import { Brackets, Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Product, Shop } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { haversineDistanceM, isLngLatValid } from '@/modules/map/geo.util'
import { CryptoUtil, SnowflakeId } from '@/utils'
import {
  type AdminListShopQueryDto,
  type AuditShopDto,
  type BanShopDto,
  type ContactMobileVo,
  type CreateShopDto,
  type QueryShopDto,
  type SetAnnouncementDto,
  type SetAutoAcceptDto,
  type SetBusinessStatusDto,
  type ShopVo,
  type UpdateShopDto
} from '../dto/shop.dto'
import { type PublicShopListItemVo, type PublicShopListQueryDto } from '../dto/shop-list.dto'
import { ShopBusinessHourService } from './shop-business-hour.service'

/* ============================================================================
 * Redis 缓存键 + TTL
 * ============================================================================ */
const SHOP_DETAIL_KEY = (shopId: string): string => `shop:detail:${shopId}`
const SHOP_DETAIL_TTL_SECONDS = 300

const SHOP_LIST_KEY = (cityCode: string, paramsHash: string): string =>
  `shop:list:${cityCode}:${paramsHash}`
const SHOP_LIST_TTL_SECONDS = 120

/** 命中后必须重置 audit_status=0 的敏感字段集合 */
const SENSITIVE_FIELDS = ['name', 'address', 'lng', 'lat', 'contactMobile', 'industryCode'] as const

/* ============================================================================
 * 搜索 - 商品 / 跑腿模板（W6.E.1 用户端真接入）
 * ============================================================================ */

/**
 * 搜索商品 VO（用户端）
 * 用途：POST /search/products
 */
export interface SearchProductItemVo {
  id: string
  name: string
  brief: string | null
  mainImageUrl: string | null
  price: string
  originalPrice: string | null
  monthlySales: number
  score: string
  scoreCount: number
  shopId: string
  shopName: string
  shopShortName: string | null
  shopLogoUrl: string | null
  shopBusinessStatus: number
}

/**
 * 搜索跑腿模板 VO（用户端）
 * 用途：POST /search/errand-templates
 */
export interface SearchErrandTemplateItemVo {
  /** service_type：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队 */
  serviceType: 1 | 2 | 3 | 4
  /** 模板名称 */
  name: string
  /** 简介 */
  description: string
  /** 默认起价（元，字符串） */
  basePrice: string
  /** 标签 */
  tags: string[]
}

/**
 * 跑腿模板字典（4 类 service_type 对应固定文案）
 * 注：basePrice 仅是前端检索引导文案，真实定价以 ErrandPricingService 为准
 */
const ERRAND_TEMPLATE_DICT: ReadonlyArray<SearchErrandTemplateItemVo> = [
  {
    serviceType: 1,
    name: '帮送',
    description: '帮我把东西送到指定地址',
    basePrice: '8.00',
    tags: ['送物', '同城', '快速']
  },
  {
    serviceType: 2,
    name: '帮取',
    description: '帮我从指定地址取东西',
    basePrice: '8.00',
    tags: ['取件', '快递', '代取']
  },
  {
    serviceType: 3,
    name: '帮买',
    description: '帮我从指定商家代购物品',
    basePrice: '12.00',
    tags: ['代购', '超市', '药品']
  },
  {
    serviceType: 4,
    name: '帮排队',
    description: '帮我去指定地点排队（医院/餐厅/政务）',
    basePrice: '15.00',
    tags: ['排队', '挂号', '取号']
  }
]

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name)

  constructor(
    @InjectRepository(Shop) private readonly shopRepo: Repository<Shop>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly businessHourService: ShopBusinessHourService
  ) {}

  /* ==========================================================================
   * 商户端 CRUD
   * ========================================================================== */

  /**
   * 创建店铺（商户端）
   * 参数：merchantId 商户 ID（来自 currentUser.uid）；dto
   * 返回值：ShopVo（audit_status=0 待审）
   * 用途：POST /api/v1/merchant/shop
   */
  async create(merchantId: string, dto: CreateShopDto): Promise<ShopVo> {
    const now = new Date()
    const entity = this.shopRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      merchantId,
      name: dto.name,
      shortName: dto.shortName ?? null,
      logoUrl: dto.logoUrl ?? null,
      coverUrl: dto.coverUrl ?? null,
      industryCode: dto.industryCode,
      provinceCode: dto.provinceCode,
      cityCode: dto.cityCode,
      districtCode: dto.districtCode,
      address: dto.address,
      lng: dto.lng,
      lat: dto.lat,
      contactMobileEnc: CryptoUtil.encrypt(dto.contactMobile),
      contactMobileHash: CryptoUtil.hmac(dto.contactMobile),
      contactMobileTail4: CryptoUtil.tail4(dto.contactMobile),
      businessHoursSummary: dto.businessHoursSummary ?? null,
      minOrderAmount: dto.minOrderAmount ?? '0.00',
      baseDeliveryFee: dto.baseDeliveryFee ?? '0.00',
      packagingFee: dto.packagingFee ?? '0.00',
      deliveryDistanceMax: dto.deliveryDistanceMax ?? 5000,
      avgPrepareMin: dto.avgPrepareMin ?? 15,
      score: 5,
      scoreCount: 0,
      monthlySales: 0,
      autoAccept: 0,
      announcement: null,
      businessStatus: 0,
      auditStatus: 0,
      auditRemark: null,
      status: 1,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.shopRepo.save(entity)
    this.logger.log(`商户 ${merchantId} 创建店铺 ${saved.id}（${saved.name}），audit=0`)
    return this.toVo(saved, { ownerView: true, plainMobile: dto.contactMobile })
  }

  /**
   * 更新店铺（商户端，带敏感字段重审）
   * 参数：shopId / merchantId 当前商户 ID（用于鉴权）/ dto
   * 返回值：ShopVo
   * 用途：PUT /api/v1/merchant/shop/:id
   */
  async update(shopId: string, merchantId: string, dto: UpdateShopDto): Promise<ShopVo> {
    const shop = await this.assertOwner(shopId, merchantId)
    const sensitiveHit = this.applyUpdate(shop, dto)
    if (sensitiveHit) {
      shop.auditStatus = 0
      shop.auditRemark = null
    }
    const saved = await this.shopRepo.save(shop)
    await this.invalidateDetailCache(shopId)
    await this.invalidateListCache(saved.cityCode)
    this.logger.log(
      `商户 ${merchantId} 更新店铺 ${shopId}${sensitiveHit ? '（命中敏感字段，重置审核）' : ''}`
    )
    /* 更新场景：若入参带 contactMobile 则可附带回 mask 视图，否则解密原密文获得 mask */
    return this.toVo(saved, {
      ownerView: true,
      plainMobile: dto.contactMobile ?? this.tryDecryptMobile(saved)
    })
  }

  /**
   * 商户端取自家店铺详情（含完整 mask 后电话）
   * 参数：shopId / merchantId
   * 返回值：ShopVo
   * 用途：GET /api/v1/merchant/shop/:id
   */
  async detailForMerchant(shopId: string, merchantId: string): Promise<ShopVo> {
    const shop = await this.assertOwner(shopId, merchantId)
    return this.toVo(shop, { ownerView: true, plainMobile: this.tryDecryptMobile(shop) })
  }

  /**
   * 商户端店铺列表（仅自家名下）
   * 参数：merchantId / query
   * 返回值：PageResult<ShopVo>
   * 用途：GET /api/v1/merchant/shop
   */
  async listForMerchant(merchantId: string, query: QueryShopDto): Promise<PageResult<ShopVo>> {
    const where: FindOptionsWhere<Shop> = { merchantId, isDeleted: 0 }
    if (query.auditStatus !== undefined) where.auditStatus = query.auditStatus
    if (query.status !== undefined) where.status = query.status
    const qb = this.shopRepo.createQueryBuilder('s').where(where)
    if (query.name) qb.andWhere('s.name LIKE :n', { n: `%${query.name}%` })
    qb.orderBy('s.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r, { ownerView: true, plainMobile: this.tryDecryptMobile(r) })),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 切换自动接单
   * 参数：shopId / merchantId / dto
   * 返回值：ShopVo
   * 用途：PUT /api/v1/merchant/shop/:id/auto-accept
   */
  async setAutoAccept(shopId: string, merchantId: string, dto: SetAutoAcceptDto): Promise<ShopVo> {
    const shop = await this.assertOwner(shopId, merchantId)
    shop.autoAccept = dto.autoAccept
    const saved = await this.shopRepo.save(shop)
    await this.invalidateDetailCache(shopId)
    return this.toVo(saved, { ownerView: true, plainMobile: this.tryDecryptMobile(saved) })
  }

  /**
   * 设置店铺公告
   * 参数：shopId / merchantId / dto
   * 返回值：ShopVo
   * 用途：PUT /api/v1/merchant/shop/:id/announcement
   */
  async setAnnouncement(
    shopId: string,
    merchantId: string,
    dto: SetAnnouncementDto
  ): Promise<ShopVo> {
    const shop = await this.assertOwner(shopId, merchantId)
    shop.announcement = dto.announcement
    const saved = await this.shopRepo.save(shop)
    await this.invalidateDetailCache(shopId)
    await this.invalidateListCache(saved.cityCode)
    return this.toVo(saved, { ownerView: true, plainMobile: this.tryDecryptMobile(saved) })
  }

  /**
   * 切换营业状态（0 打烊 / 1 营业中 / 2 临时歇业）
   * 参数：shopId / merchantId / dto
   * 返回值：ShopVo
   * 用途：PUT /api/v1/merchant/shop/:id/business-status
   */
  async setBusinessStatus(
    shopId: string,
    merchantId: string,
    dto: SetBusinessStatusDto
  ): Promise<ShopVo> {
    const shop = await this.assertOwner(shopId, merchantId)
    /* 未通过审核不允许切换为「营业中」 */
    if (dto.businessStatus === 1 && shop.auditStatus !== 1) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '店铺尚未通过审核，不能切换为营业中'
      )
    }
    /* 封禁状态下不允许切换为「营业中」 */
    if (dto.businessStatus === 1 && shop.status !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '店铺已封禁')
    }
    shop.businessStatus = dto.businessStatus
    const saved = await this.shopRepo.save(shop)
    await this.invalidateDetailCache(shopId)
    await this.invalidateListCache(saved.cityCode)
    this.logger.log(`商户 ${merchantId} 修改店铺 ${shopId} business_status → ${dto.businessStatus}`)
    return this.toVo(saved, { ownerView: true, plainMobile: this.tryDecryptMobile(saved) })
  }

  /* ==========================================================================
   * 用户端
   * ========================================================================== */

  /**
   * 用户端店铺列表（GEO + 排序 + 筛选 + 缓存）
   * 参数：query
   * 返回值：PageResult<PublicShopListItemVo>
   * 用途：GET /api/v1/shops
   *
   * 设计：
   *   1. 先按 cityCode + md5(params) 查 Redis 缓存（命中直返）
   *   2. 未命中：where: city_code=cityCode AND status=1 AND audit_status=1（关键：仅展示已审核通过的店）
   *      - keyword：name LIKE OR short_name LIKE
   *      - industry：industry_code = ?
   *      - 排序：
   *          distance（需 lng/lat）：数据库取候选集后应用层算距离再排序（首期实现），
   *                                  当 lng/lat 缺失时退化为 score DESC（兜底，避免 422）
   *          sales：monthly_sales DESC
   *          score：score DESC
   *          price：min_order_amount ASC
   *      - 分页：skip/take
   *   3. 批量查营业时段聚合 isOpenNow
   *   4. 写缓存 120s 后返回
   */
  async listForPublic(query: PublicShopListQueryDto): Promise<PageResult<PublicShopListItemVo>> {
    const cacheKey = SHOP_LIST_KEY(query.cityCode, this.md5(JSON.stringify(query)))
    const cached = await this.safeGet<PageResult<PublicShopListItemVo>>(cacheKey)
    if (cached) return cached

    const sort = query.sort ?? 'distance'
    const hasGeo =
      query.lng !== undefined && query.lat !== undefined && isLngLatValid(query.lng, query.lat)
    const useDistance = sort === 'distance' && hasGeo

    const qb = this.shopRepo
      .createQueryBuilder('s')
      .where('s.city_code = :cc', { cc: query.cityCode })
      .andWhere('s.status = 1')
      .andWhere('s.audit_status = 1')
      .andWhere('s.is_deleted = 0')

    if (query.keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('s.name LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('s.short_name LIKE :kw', { kw: `%${query.keyword}%` })
        })
      )
    }
    if (query.industry) {
      qb.andWhere('s.industry_code = :ic', { ic: query.industry })
    }

    if (useDistance) {
      /* distance 排序：取候选集（最多 1000 条同城）后应用层算距离 → 全局排序 → 再分页 */
      qb.orderBy('s.score', 'DESC').take(1000)
      const candidates = await qb.getMany()
      const lngP = query.lng as number
      const latP = query.lat as number
      const itemsAll = candidates
        .map((s) => ({ shop: s, dist: haversineDistanceM(lngP, latP, s.lng, s.lat) }))
        .sort((a, b) => a.dist - b.dist)
      const total = itemsAll.length
      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 20
      const sliced = itemsAll.slice((page - 1) * pageSize, page * pageSize)
      const list = await this.assemblePublicVoList(sliced)
      const result = makePageResult(list, total, page, pageSize)
      await this.safeSet(cacheKey, result, SHOP_LIST_TTL_SECONDS)
      return result
    }

    /* 数据库内排序 */
    if (sort === 'sales') qb.orderBy('s.monthly_sales', 'DESC')
    else if (sort === 'price') qb.orderBy('s.min_order_amount', 'ASC')
    else qb.orderBy('s.score', 'DESC') /* score 或 distance 但缺 lng/lat 兜底 */

    qb.skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    const distanceItems = rows.map((s) => ({
      shop: s,
      dist: hasGeo ? haversineDistanceM(query.lng as number, query.lat as number, s.lng, s.lat) : -1
    }))
    const list = await this.assemblePublicVoList(distanceItems)
    const result = makePageResult(list, total, query.page ?? 1, query.pageSize ?? 20)
    await this.safeSet(cacheKey, result, SHOP_LIST_TTL_SECONDS)
    return result
  }

  /**
   * 用户端店铺详情（公开视图，无电话）
   * 参数：shopId
   * 返回值：PublicShopListItemVo
   * 用途：GET /api/v1/shops/:id
   *
   * 注：详情缓存 5min；同样要求 status=1 && audit_status=1
   */
  async detailForPublic(shopId: string): Promise<PublicShopListItemVo> {
    const cacheKey = SHOP_DETAIL_KEY(shopId)
    const cached = await this.safeGet<PublicShopListItemVo>(cacheKey)
    if (cached) return cached
    const shop = await this.shopRepo.findOne({
      where: { id: shopId, isDeleted: 0 }
    })
    if (!shop || shop.status !== 1 || shop.auditStatus !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '店铺不存在或未通过审核')
    }
    const list = await this.assemblePublicVoList([{ shop, dist: -1 }])
    const vo = list[0]!
    await this.safeSet(cacheKey, vo, SHOP_DETAIL_TTL_SECONDS)
    return vo
  }

  /* ==========================================================================
   * 搜索（用户端）
   * ========================================================================== */

  /**
   * 用户端：商品搜索（LIKE 模糊匹配）
   * 参数：keyword 关键字 / page / pageSize / cityCode（可选，过滤同城）
   * 返回值：PageResult<SearchProductItemVo>
   * 用途：POST /search/products
   *
   * 设计：
   *   - product.status=1 上架 + audit_status=1 审核通过 + is_deleted=0
   *   - 关联 shop（仅 status=1 + audit_status=1 + 可选 city_code 同城）
   *   - LIKE：name OR brief
   *   - 排序：score DESC, monthly_sales DESC, id DESC（结合 idx_shop_recommend 局部命中；
   *           无 keyword 时退化为整表 N 范围扫，故强制 keyword 必填）
   */
  async searchProducts(query: {
    keyword: string
    cityCode?: string
    page?: number
    pageSize?: number
  }): Promise<PageResult<SearchProductItemVo>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const kw = query.keyword.trim()
    if (!kw) {
      return makePageResult([], 0, page, pageSize)
    }

    const qb = this.productRepo
      .createQueryBuilder('p')
      .innerJoin(Shop, 's', 's.id = p.shop_id')
      .where('p.is_deleted = 0')
      .andWhere('p.status = 1')
      .andWhere('p.audit_status = 1')
      .andWhere('s.is_deleted = 0')
      .andWhere('s.status = 1')
      .andWhere('s.audit_status = 1')
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('p.name LIKE :kw', { kw: `%${kw}%` })
            .orWhere('p.brief LIKE :kw', { kw: `%${kw}%` })
        })
      )

    if (query.cityCode) {
      qb.andWhere('s.city_code = :cc', { cc: query.cityCode })
    }

    qb.orderBy('p.score', 'DESC')
      .addOrderBy('p.monthly_sales', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    /* 同时取 product 字段 + shop.name（DTO 需要） */
    qb.addSelect(['s.id', 's.name', 's.short_name', 's.logo_url', 's.business_status'])

    const [rows, total] = await qb.getManyAndCount()

    /* shopId → 简要信息批量取 */
    const shopIds = Array.from(new Set(rows.map((p) => p.shopId)))
    const shopMap = new Map<string, Shop>()
    if (shopIds.length > 0) {
      const shops = await this.shopRepo.find({
        where: shopIds.map((id) => ({ id, isDeleted: 0 })),
        select: ['id', 'name', 'shortName', 'logoUrl', 'businessStatus']
      })
      for (const s of shops) shopMap.set(s.id, s)
    }

    const list: SearchProductItemVo[] = rows.map((p) => {
      const shop = shopMap.get(p.shopId)
      return {
        id: p.id,
        name: p.name,
        brief: p.brief,
        mainImageUrl: p.mainImageUrl,
        price: p.price,
        originalPrice: p.originalPrice,
        monthlySales: p.monthlySales,
        score: this.scoreToString(p.score),
        scoreCount: p.scoreCount,
        shopId: p.shopId,
        shopName: shop?.name ?? '',
        shopShortName: shop?.shortName ?? null,
        shopLogoUrl: shop?.logoUrl ?? null,
        shopBusinessStatus: shop?.businessStatus ?? 0
      }
    })
    return makePageResult(list, total, page, pageSize)
  }

  /**
   * 用户端：跑腿模板搜索
   *
   * 跑腿无独立模板表（service_type 1/2/3/4 为枚举），本端口返回静态模板
   * 用 keyword 做内存级 LIKE 匹配；未来可拓展为 sys_dict 配置化。
   *
   * 参数：keyword
   * 返回值：SearchErrandTemplateItemVo[]
   * 用途：POST /search/errand-templates
   */
  async searchErrandTemplates(query: {
    keyword: string
  }): Promise<{ list: SearchErrandTemplateItemVo[]; total: number }> {
    const kw = query.keyword.trim().toLowerCase()
    if (!kw) {
      return { list: [], total: 0 }
    }
    const filtered = ERRAND_TEMPLATE_DICT.filter((t) => {
      const text = `${t.name}${t.description}${t.tags.join('')}`.toLowerCase()
      return text.includes(kw)
    })
    return { list: filtered, total: filtered.length }
  }

  /* ==========================================================================
   * 管理端
   * ========================================================================== */

  /**
   * 管理端审核
   * 参数：shopId / dto / opAdminId 用于日志
   * 返回值：ShopVo
   * 用途：POST /api/v1/admin/shops/:id/audit
   */
  async audit(shopId: string, dto: AuditShopDto, _opAdminId: string): Promise<ShopVo> {
    const shop = await this.findActiveById(shopId)
    if (dto.action === 'reject' && (!dto.remark || dto.remark.trim() === '')) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '驳回必须填写备注')
    }
    shop.auditStatus = dto.action === 'pass' ? 1 : 2
    shop.auditRemark = dto.remark ?? null
    const saved = await this.shopRepo.save(shop)
    await this.invalidateDetailCache(shopId)
    await this.invalidateListCache(saved.cityCode)
    return this.toVo(saved, { ownerView: false })
  }

  /**
   * 管理端封禁
   * 参数：shopId / dto / opAdminId
   * 返回值：ShopVo
   * 用途：POST /api/v1/admin/shops/:id/ban
   *
   * 副作用：status=0 + business_status=0；audit_remark 追加封禁原因；缓存失效
   */
  async ban(shopId: string, dto: BanShopDto, _opAdminId: string): Promise<ShopVo> {
    const shop = await this.findActiveById(shopId)
    shop.status = 0
    shop.businessStatus = 0
    shop.auditRemark = `[封禁] ${dto.reason}`
    const saved = await this.shopRepo.save(shop)
    await this.invalidateDetailCache(shopId)
    await this.invalidateListCache(saved.cityCode)
    return this.toVo(saved, { ownerView: false })
  }

  /**
   * 管理端解封
   * 参数：shopId / opAdminId
   * 返回值：ShopVo
   * 用途：POST /api/v1/admin/shops/:id/unban
   *
   * 副作用：status=1（business_status 不自动恢复，需商户手动切换；避免破坏歇业意图）
   */
  async unban(shopId: string, _opAdminId: string): Promise<ShopVo> {
    const shop = await this.findActiveById(shopId)
    shop.status = 1
    if (shop.auditRemark?.startsWith('[封禁] ')) {
      shop.auditRemark = null
    }
    const saved = await this.shopRepo.save(shop)
    await this.invalidateDetailCache(shopId)
    await this.invalidateListCache(saved.cityCode)
    return this.toVo(saved, { ownerView: false })
  }

  /**
   * 管理端店铺列表（全量分页）
   * 参数：query
   * 返回值：PageResult<ShopVo>
   * 用途：GET /api/v1/admin/shops
   */
  async adminList(query: AdminListShopQueryDto): Promise<PageResult<ShopVo>> {
    const qb = this.shopRepo.createQueryBuilder('s').where('s.is_deleted = 0')
    if (query.name) qb.andWhere('s.name LIKE :n', { n: `%${query.name}%` })
    if (query.cityCode) qb.andWhere('s.city_code = :cc', { cc: query.cityCode })
    if (query.industryCode) qb.andWhere('s.industry_code = :ic', { ic: query.industryCode })
    if (query.auditStatus !== undefined)
      qb.andWhere('s.audit_status = :a', { a: query.auditStatus })
    if (query.businessStatus !== undefined) {
      qb.andWhere('s.business_status = :b', { b: query.businessStatus })
    }
    if (query.status !== undefined) qb.andWhere('s.status = :st', { st: query.status })
    qb.orderBy('s.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r, { ownerView: false })),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /* ==========================================================================
   * 共用工具
   * ========================================================================== */

  /**
   * 找一个未删除的店铺；不存在抛 BIZ_RESOURCE_NOT_FOUND
   */
  async findActiveById(shopId: string): Promise<Shop> {
    const shop = await this.shopRepo.findOne({ where: { id: shopId, isDeleted: 0 } })
    if (!shop) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '店铺不存在')
    return shop
  }

  /**
   * 校验店铺归属，不通过抛 AUTH_PERMISSION_DENIED
   * 参数：shopId / merchantId
   * 返回值：Shop entity
   */
  async assertOwner(shopId: string, merchantId: string): Promise<Shop> {
    const shop = await this.findActiveById(shopId)
    if (shop.merchantId !== merchantId) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本人店铺，禁止操作',
        HttpStatus.FORBIDDEN
      )
    }
    return shop
  }

  /**
   * 失效详情缓存
   */
  async invalidateDetailCache(shopId: string): Promise<void> {
    try {
      await this.redis.del(SHOP_DETAIL_KEY(shopId))
    } catch (err) {
      this.logger.warn(`Redis DEL ${SHOP_DETAIL_KEY(shopId)} 失败：${(err as Error).message}`)
    }
  }

  /**
   * 失效某城市的列表缓存（SCAN 后批删；命中数通常 ≤ 数十条，开销可接受）
   * 设计：scanStream 异步迭代，UNLINK 批删，避免阻塞 Redis
   */
  async invalidateListCache(cityCode: string): Promise<void> {
    const pattern = `shop:list:${cityCode}:*`
    try {
      const keys: string[] = []
      const stream = this.redis.scanStream({ match: pattern, count: 100 })
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (batch: string[]) => keys.push(...batch))
        stream.on('end', () => resolve())
        stream.on('error', (e) => reject(e))
      })
      if (keys.length > 0) {
        await this.redis.unlink(keys)
      }
    } catch (err) {
      this.logger.warn(`Redis SCAN/DEL ${pattern} 失败：${(err as Error).message}`)
    }
  }

  /**
   * 应用更新 dto 到实体；返回是否命中敏感字段
   */
  private applyUpdate(shop: Shop, dto: UpdateShopDto): boolean {
    let sensitiveHit = false
    if (dto.name !== undefined && dto.name !== shop.name) {
      shop.name = dto.name
      sensitiveHit = sensitiveHit || SENSITIVE_FIELDS.includes('name')
    }
    if (dto.shortName !== undefined) shop.shortName = dto.shortName
    if (dto.logoUrl !== undefined) shop.logoUrl = dto.logoUrl
    if (dto.coverUrl !== undefined) shop.coverUrl = dto.coverUrl
    if (dto.industryCode !== undefined && dto.industryCode !== shop.industryCode) {
      shop.industryCode = dto.industryCode
      sensitiveHit = true
    }
    if (dto.provinceCode !== undefined) shop.provinceCode = dto.provinceCode
    if (dto.cityCode !== undefined) shop.cityCode = dto.cityCode
    if (dto.districtCode !== undefined) shop.districtCode = dto.districtCode
    if (dto.address !== undefined && dto.address !== shop.address) {
      shop.address = dto.address
      sensitiveHit = true
    }
    if (dto.lng !== undefined && dto.lng !== shop.lng) {
      shop.lng = dto.lng
      sensitiveHit = true
    }
    if (dto.lat !== undefined && dto.lat !== shop.lat) {
      shop.lat = dto.lat
      sensitiveHit = true
    }
    if (dto.contactMobile !== undefined) {
      const newHash = CryptoUtil.hmac(dto.contactMobile)
      if (newHash !== shop.contactMobileHash) {
        shop.contactMobileEnc = CryptoUtil.encrypt(dto.contactMobile)
        shop.contactMobileHash = newHash
        shop.contactMobileTail4 = CryptoUtil.tail4(dto.contactMobile)
        sensitiveHit = true
      }
    }
    if (dto.businessHoursSummary !== undefined) shop.businessHoursSummary = dto.businessHoursSummary
    if (dto.minOrderAmount !== undefined) shop.minOrderAmount = dto.minOrderAmount
    if (dto.baseDeliveryFee !== undefined) shop.baseDeliveryFee = dto.baseDeliveryFee
    if (dto.packagingFee !== undefined) shop.packagingFee = dto.packagingFee
    if (dto.deliveryDistanceMax !== undefined) shop.deliveryDistanceMax = dto.deliveryDistanceMax
    if (dto.avgPrepareMin !== undefined) shop.avgPrepareMin = dto.avgPrepareMin
    return sensitiveHit
  }

  /**
   * 尝试解密手机号（失败时返回 ''；用于 owner/admin 视角脱敏 mask）
   * 注：开发环境密钥未配置时 catch 后返回空串，避免影响主业务
   */
  private tryDecryptMobile(shop: Shop): string {
    try {
      if (!shop.contactMobileEnc) return ''
      return CryptoUtil.decrypt(shop.contactMobileEnc, 1)
    } catch (err) {
      this.logger.warn(`解密 shop ${shop.id} 电话失败：${(err as Error).message}`)
      return ''
    }
  }

  /**
   * 组装用户端 VO 列表（含 isOpenNow 聚合）
   */
  private async assemblePublicVoList(
    items: Array<{ shop: Shop; dist: number }>
  ): Promise<PublicShopListItemVo[]> {
    const ids = items.map((i) => i.shop.id)
    const hourMap = await this.businessHourService.listByShops(ids)
    return items.map(({ shop, dist }) => {
      const hours = hourMap.get(shop.id) ?? []
      const isOpenNow = this.businessHourService.isOpenNow(shop.businessStatus, hours)
      const vo: PublicShopListItemVo = {
        id: shop.id,
        name: shop.name,
        shortName: shop.shortName,
        logoUrl: shop.logoUrl,
        coverUrl: shop.coverUrl,
        industryCode: shop.industryCode,
        address: shop.address,
        lng: shop.lng,
        lat: shop.lat,
        distance: dist >= 0 ? Math.round(dist) : -1,
        score: this.scoreToString(shop.score),
        scoreCount: shop.scoreCount,
        monthlySales: shop.monthlySales,
        minOrderAmount: shop.minOrderAmount,
        baseDeliveryFee: shop.baseDeliveryFee,
        packagingFee: shop.packagingFee,
        avgPrepareMin: shop.avgPrepareMin,
        businessStatus: shop.businessStatus,
        isOpenNow,
        announcement: shop.announcement,
        businessHoursSummary: shop.businessHoursSummary,
        cityCode: shop.cityCode,
        districtCode: shop.districtCode
      }
      return vo
    })
  }

  /**
   * 把数据库的 score（number，已被 entity transformer 转）格式化为「N.NN」字符串
   * 用途：金额/评分类字段统一以 string 形式回传，避免前端浮点误差
   */
  private scoreToString(score: number): string {
    return Number.isFinite(score) ? score.toFixed(2) : '0.00'
  }

  /**
   * Entity → VO（默认隐藏完整电话）
   * 参数：shop；opts.ownerView=true 时附带 mask 中段；opts.plainMobile 可选完整明文用于 mask 计算
   */
  private toVo(shop: Shop, opts: { ownerView: boolean; plainMobile?: string }): ShopVo {
    const mobile: ContactMobileVo = { tail4: shop.contactMobileTail4 }
    if (opts.ownerView && opts.plainMobile) {
      mobile.mask = CryptoUtil.mask(opts.plainMobile)
    }
    return {
      id: shop.id,
      merchantId: shop.merchantId,
      name: shop.name,
      shortName: shop.shortName,
      logoUrl: shop.logoUrl,
      coverUrl: shop.coverUrl,
      industryCode: shop.industryCode,
      provinceCode: shop.provinceCode,
      cityCode: shop.cityCode,
      districtCode: shop.districtCode,
      address: shop.address,
      lng: shop.lng,
      lat: shop.lat,
      contactMobile: mobile,
      businessHoursSummary: shop.businessHoursSummary,
      minOrderAmount: shop.minOrderAmount,
      baseDeliveryFee: shop.baseDeliveryFee,
      packagingFee: shop.packagingFee,
      deliveryDistanceMax: shop.deliveryDistanceMax,
      avgPrepareMin: shop.avgPrepareMin,
      score: this.scoreToString(shop.score),
      scoreCount: shop.scoreCount,
      monthlySales: shop.monthlySales,
      autoAccept: shop.autoAccept,
      announcement: shop.announcement,
      businessStatus: shop.businessStatus,
      auditStatus: shop.auditStatus,
      auditRemark: shop.auditRemark,
      status: shop.status,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt
    }
  }

  /**
   * 安全读 Redis（异常不抛，返回 null）
   */
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

  /**
   * 安全写 Redis（异常不抛，仅日志）
   */
  private async safeSet<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl)
    } catch (err) {
      this.logger.warn(`Redis SET 失败 ${key}：${(err as Error).message}`)
    }
  }

  /**
   * MD5 helper（缓存键参数 hash）
   */
  private md5(input: string): string {
    return createHash('md5').update(input).digest('hex')
  }
}
