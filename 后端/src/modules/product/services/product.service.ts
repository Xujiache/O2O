/**
 * @file product.service.ts
 * @stage P4/T4.5 + T4.7（Sprint 1）
 * @desc 商品服务：CRUD + 上下架 + 排序 + 多规格切换 + 详情聚合（SKU+套餐展开）+ 缓存
 * @author 单 Agent V2.0
 *
 * 数据来源：MySQL `product` + `product_sku` + `product_combo_item` + `shop` + `product_category`
 * 缓存：
 *   - 商品详情：product:detail:{productId} TTL 300s
 *   - 店铺商品列表：shop:products:{shopId}:{categoryIdOrAll} TTL 60s
 *   - 写操作后 DEL 对应键
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { Brackets, DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '@/common'
import { Product, ProductCategory, Shop } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import { SetComboItemsDto } from '../dto/product-combo.dto'
import { SetSkuListDto } from '../dto/product-sku.dto'
import {
  AdminQueryProductDto,
  CreateProductDto,
  ForceOffDto,
  ProductDetailVo,
  ProductVo,
  QueryProductDto,
  ShopProductGroupVo,
  UpdateProductDto,
  UpdateSortDto,
  UpdateStatusDto
} from '../dto/product.dto'
import { ProductCategoryService } from './product-category.service'
import { ProductComboService } from './product-combo.service'
import { ProductSkuService } from './product-sku.service'

const DETAIL_CACHE_PREFIX = 'product:detail:'
const DETAIL_CACHE_TTL_SECONDS = 300
const SHOP_LIST_CACHE_PREFIX = 'shop:products:'
const SHOP_LIST_CACHE_TTL_SECONDS = 60
const SHOP_LIST_CACHE_ALL_TAG = 'all'

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name)

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Shop) private readonly shopRepo: Repository<Shop>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource,
    private readonly skuService: ProductSkuService,
    private readonly comboService: ProductComboService,
    private readonly categoryService: ProductCategoryService,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ============================================================
   *                    商户端
   * ============================================================ */

  /**
   * 商户端：创建商品（含默认 SKU 自动建 / 多规格 SKU 批量插 / 套餐子项）
   * 参数：merchantId / dto
   * 返回值：ProductDetailVo
   * 用途：POST /merchant/products
   */
  async create(merchantId: string, dto: CreateProductDto): Promise<ProductDetailVo> {
    await this.assertShopOwner(dto.shopId, merchantId)
    await this.categoryService.assertCategoryInShop(dto.categoryId, dto.shopId)

    const productType = dto.productType ?? 1
    if (productType === 2 && (!dto.comboItems || dto.comboItems.length === 0)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '套餐商品（productType=2）必须传入至少 1 条 comboItems'
      )
    }
    if (dto.hasSku === 1 && (!dto.skus || dto.skus.length === 0)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '多规格商品（hasSku=1）必须传入至少 1 条 SKU'
      )
    }

    const product = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Product)
      const e = repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        shopId: dto.shopId,
        categoryId: dto.categoryId,
        name: dto.name,
        brief: dto.brief ?? null,
        description: dto.description ?? null,
        mainImageUrl: dto.mainImageUrl ?? null,
        imageUrls: dto.imageUrls ?? null,
        price: dto.price,
        originalPrice: dto.originalPrice ?? null,
        packagingFee: dto.packagingFee ?? '0.00',
        minOrderQty: dto.minOrderQty ?? 1,
        limitPerOrder: dto.limitPerOrder ?? 0,
        hasSku: dto.hasSku,
        productType,
        tags: dto.tags ?? null,
        monthlySales: 0,
        totalSales: 0,
        score: 5,
        scoreCount: 0,
        isRecommend: dto.isRecommend ?? 0,
        isNew: dto.isNew ?? 0,
        auditStatus: 1,
        auditRemark: null,
        status: 1,
        sort: dto.sort ?? 0,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      await repo.save(e)
      await this.skuService.createInitialSkus(manager, e, dto.skus, dto.price)
      if (productType === 2) {
        await this.comboService.createInitialItems(manager, e, dto.comboItems)
      }
      return e
    })

    await this.invalidateShopListCache(dto.shopId)
    this.logger.log(
      `商户 ${merchantId} 在店铺 ${dto.shopId} 新建商品 ${product.id}（${product.name}）`
    )
    return this.detailInternal(product.id)
  }

  /**
   * 商户端：商品详情（含 SKU + 套餐展开）
   * 参数：merchantId / productId
   * 返回值：ProductDetailVo
   * 用途：GET /merchant/products/:id
   */
  async merchantDetail(merchantId: string, productId: string): Promise<ProductDetailVo> {
    const p = await this.findActiveById(productId)
    await this.assertShopOwner(p.shopId, merchantId)
    return this.detailInternal(productId)
  }

  /**
   * 商户端：商品分页查询
   * 参数：merchantId / query
   * 返回值：PageResult<ProductVo>
   * 用途：GET /merchant/products
   */
  async merchantList(merchantId: string, query: QueryProductDto): Promise<PageResult<ProductVo>> {
    const shopIds = await this.resolveMerchantShopIds(merchantId, query.shopId)
    if (shopIds.length === 0) {
      return makePageResult<ProductVo>([], 0, query.page ?? 1, query.pageSize ?? 20)
    }
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.shop_id IN (:...sids) AND p.is_deleted = 0', { sids: shopIds })
    if (query.categoryId) qb.andWhere('p.category_id = :cid', { cid: query.categoryId })
    if (query.status !== undefined) qb.andWhere('p.status = :st', { st: query.status })
    if (query.keyword) qb.andWhere('p.name LIKE :kw', { kw: `%${query.keyword}%` })
    qb.orderBy('p.sort', 'ASC').addOrderBy('p.created_at', 'DESC')
    qb.skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toListVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 商户端：编辑商品（基础字段；SKU/套餐请走专用接口）
   * 参数：merchantId / productId / dto
   * 返回值：ProductDetailVo
   * 用途：PUT /merchant/products/:id
   */
  async update(
    merchantId: string,
    productId: string,
    dto: UpdateProductDto
  ): Promise<ProductDetailVo> {
    const p = await this.findActiveById(productId)
    await this.assertShopOwner(p.shopId, merchantId)

    if (dto.categoryId !== undefined && dto.categoryId !== p.categoryId) {
      await this.categoryService.assertCategoryInShop(dto.categoryId, p.shopId)
      p.categoryId = dto.categoryId
    }
    if (dto.name !== undefined) p.name = dto.name
    if (dto.brief !== undefined) p.brief = dto.brief
    if (dto.description !== undefined) p.description = dto.description
    if (dto.mainImageUrl !== undefined) p.mainImageUrl = dto.mainImageUrl
    if (dto.imageUrls !== undefined) p.imageUrls = dto.imageUrls
    if (dto.price !== undefined) p.price = dto.price
    if (dto.originalPrice !== undefined) p.originalPrice = dto.originalPrice
    if (dto.packagingFee !== undefined) p.packagingFee = dto.packagingFee
    if (dto.minOrderQty !== undefined) p.minOrderQty = dto.minOrderQty
    if (dto.limitPerOrder !== undefined) p.limitPerOrder = dto.limitPerOrder
    if (dto.tags !== undefined) p.tags = dto.tags
    if (dto.isRecommend !== undefined) p.isRecommend = dto.isRecommend
    if (dto.isNew !== undefined) p.isNew = dto.isNew
    if (dto.sort !== undefined) p.sort = dto.sort

    /* hasSku 切换 */
    if (dto.hasSku !== undefined && dto.hasSku !== p.hasSku) {
      await this.handleHasSkuSwitch(p, dto.hasSku)
    }

    /* productType 切换 */
    if (dto.productType !== undefined && dto.productType !== p.productType) {
      await this.handleProductTypeSwitch(p, dto.productType)
    }

    await this.productRepo.save(p)
    await this.invalidateProductCache(productId)
    await this.invalidateShopListCache(p.shopId)
    return this.detailInternal(productId)
  }

  /**
   * 商户端：批量替换 SKU 列表（透传到 SKU 服务）
   * 参数：merchantId / productId / dto
   * 返回值：替换后的 SKU 数
   * 用途：PUT /merchant/products/:id/skus
   */
  async replaceSkus(
    merchantId: string,
    productId: string,
    dto: SetSkuListDto
  ): Promise<{ count: number }> {
    const list = await this.skuService.replaceList(merchantId, productId, dto)
    await this.invalidateShopListCacheByProductId(productId)
    return { count: list.length }
  }

  /**
   * 商户端：批量替换套餐子项
   * 参数：merchantId / productId / dto
   * 返回值：替换后的子项数
   * 用途：PUT /merchant/products/:id/combo-items
   */
  async replaceComboItems(
    merchantId: string,
    productId: string,
    dto: SetComboItemsDto
  ): Promise<{ count: number }> {
    const list = await this.comboService.replaceItems(merchantId, productId, dto)
    await this.invalidateShopListCacheByProductId(productId)
    return { count: list.length }
  }

  /**
   * 商户端：上下架（status 0/1）
   * 参数：merchantId / productId / dto
   * 返回值：ProductVo
   * 用途：PUT /merchant/products/:id/status
   */
  async updateStatus(
    merchantId: string,
    productId: string,
    dto: UpdateStatusDto
  ): Promise<ProductVo> {
    const p = await this.findActiveById(productId)
    await this.assertShopOwner(p.shopId, merchantId)
    if (p.status === dto.status) return this.toListVo(p)
    p.status = dto.status
    await this.productRepo.save(p)
    await this.invalidateProductCache(productId)
    await this.invalidateShopListCache(p.shopId)
    this.logger.log(
      `商户 ${merchantId} 切换商品 ${productId} 状态 → ${dto.status === 1 ? '上架' : '下架'}`
    )
    return this.toListVo(p)
  }

  /**
   * 商户端：调整排序
   * 参数：merchantId / productId / dto
   * 返回值：ProductVo
   * 用途：PUT /merchant/products/:id/sort
   */
  async updateSort(merchantId: string, productId: string, dto: UpdateSortDto): Promise<ProductVo> {
    const p = await this.findActiveById(productId)
    await this.assertShopOwner(p.shopId, merchantId)
    p.sort = dto.sort
    await this.productRepo.save(p)
    await this.invalidateProductCache(productId)
    await this.invalidateShopListCache(p.shopId)
    return this.toListVo(p)
  }

  /**
   * 商户端：软删商品（连同 SKU + 套餐子项软删）
   * 参数：merchantId / productId
   * 返回值：{ ok: true }
   * 用途：DELETE /merchant/products/:id
   */
  async remove(merchantId: string, productId: string): Promise<{ ok: true }> {
    const p = await this.findActiveById(productId)
    await this.assertShopOwner(p.shopId, merchantId)

    await this.dataSource.transaction(async (manager) => {
      const now = new Date()
      p.isDeleted = 1
      p.deletedAt = now
      p.status = 0
      await manager.getRepository(Product).save(p)
      await this.skuService.softDeleteAllByProductId(manager, productId)
      await this.comboService.softDeleteAllByComboId(manager, productId)
    })
    await this.invalidateProductCache(productId)
    await this.invalidateShopListCache(p.shopId)
    this.logger.log(`商户 ${merchantId} 软删商品 ${productId}`)
    return { ok: true as const }
  }

  /* ============================================================
   *                    用户端
   * ============================================================ */

  /**
   * 用户端：店铺商品列表（按分类分组）
   * 参数：shopId
   * 返回值：ShopProductGroupVo[]（按分类 sort 升序）
   * 用途：GET /shops/:shopId/products
   *
   * 可见性：店铺 status=1 + business_status=1（营业中）；商品 status=1 + audit_status=1
   */
  async publicListByShop(shopId: string): Promise<ShopProductGroupVo[]> {
    const cacheKey = `${SHOP_LIST_CACHE_PREFIX}${shopId}:${SHOP_LIST_CACHE_ALL_TAG}`
    const cached = await this.safeGetCache(cacheKey)
    if (cached) {
      return JSON.parse(cached) as ShopProductGroupVo[]
    }

    const shop = await this.shopRepo.findOne({
      where: { id: shopId, isDeleted: 0 },
      select: ['id', 'status', 'businessStatus']
    })
    if (!shop) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '店铺不存在')
    if (shop.status !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '店铺已停业')
    }
    if (shop.businessStatus !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '店铺当前不在营业')
    }

    const categories = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.shop_id = :sid AND c.status = 1 AND c.is_deleted = 0', { sid: shopId })
      .orderBy('c.sort', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .getMany()
    if (categories.length === 0) return []

    const products = await this.productRepo
      .createQueryBuilder('p')
      .where('p.shop_id = :sid AND p.is_deleted = 0', { sid: shopId })
      .andWhere('p.status = 1 AND p.audit_status = 1')
      .orderBy('p.sort', 'ASC')
      .addOrderBy('p.created_at', 'DESC')
      .getMany()

    const grouped = new Map<string, ProductVo[]>()
    for (const p of products) {
      const arr = grouped.get(p.categoryId) ?? []
      arr.push(this.toListVo(p))
      grouped.set(p.categoryId, arr)
    }
    const result: ShopProductGroupVo[] = categories.map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      categorySort: c.sort,
      products: grouped.get(c.id) ?? []
    }))
    await this.safeSetCache(cacheKey, JSON.stringify(result), SHOP_LIST_CACHE_TTL_SECONDS)
    return result
  }

  /**
   * 用户端：商品详情（售罄/下架仍可查；仅软删拒绝）
   * 参数：productId
   * 返回值：ProductDetailVo
   * 用途：GET /products/:id
   */
  async publicDetail(productId: string): Promise<ProductDetailVo> {
    return this.detailInternal(productId)
  }

  /* ============================================================
   *                    管理端
   * ============================================================ */

  /**
   * 管理端：全量分页（按 shopId/auditStatus/keyword）
   * 参数：query
   * 返回值：PageResult<ProductVo>
   * 用途：GET /admin/products
   */
  async adminList(query: AdminQueryProductDto): Promise<PageResult<ProductVo>> {
    const qb = this.productRepo.createQueryBuilder('p').where('p.is_deleted = 0')
    if (query.shopId) qb.andWhere('p.shop_id = :sid', { sid: query.shopId })
    if (query.auditStatus !== undefined) {
      qb.andWhere('p.audit_status = :a', { a: query.auditStatus })
    }
    if (query.status !== undefined) qb.andWhere('p.status = :st', { st: query.status })
    if (query.keyword) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('p.name LIKE :kw', { kw: `%${query.keyword}%` }).orWhere('p.id = :pid', {
            pid: query.keyword
          })
        })
      )
    }
    qb.orderBy('p.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toListVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 管理端：强制下架（status=0 + audit_remark + 写 OperationLog）
   * 参数：productId / dto / opAdminId
   * 返回值：ProductVo
   * 用途：POST /admin/products/:id/force-off
   */
  async adminForceOff(productId: string, dto: ForceOffDto, opAdminId: string): Promise<ProductVo> {
    const p = await this.findActiveById(productId)
    p.status = 0
    p.auditRemark = dto.remark
    await this.productRepo.save(p)

    await this.invalidateProductCache(productId)
    await this.invalidateShopListCache(p.shopId)

    await this.operationLogService.write({
      opAdminId,
      module: 'product',
      action: 'force-off',
      resourceType: 'product',
      resourceId: productId,
      description: `强制下架商品（${p.name}）：${dto.remark}`
    })
    this.logger.log(`管理员 ${opAdminId} 强制下架商品 ${productId}：${dto.remark}`)
    return this.toListVo(p)
  }

  /* ============================================================
   *                    内部工具
   * ============================================================ */

  /**
   * 内部：商品详情聚合（含 SKU + 套餐子项展开），带缓存
   * 参数：productId
   * 返回值：ProductDetailVo
   */
  private async detailInternal(productId: string): Promise<ProductDetailVo> {
    const cacheKey = `${DETAIL_CACHE_PREFIX}${productId}`
    const cached = await this.safeGetCache(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached) as ProductDetailVo
      /* 字符串 → Date 还原（缓存 JSON 化丢失原型） */
      parsed.createdAt = new Date(parsed.createdAt)
      parsed.updatedAt = new Date(parsed.updatedAt)
      return parsed
    }

    const p = await this.findActiveById(productId)
    const [skus, comboItems] = await Promise.all([
      this.skuService.listByProductId(productId),
      p.productType === 2 ? this.comboService.listExpandedByComboId(productId) : Promise.resolve([])
    ])
    const vo: ProductDetailVo = {
      ...this.toListVo(p),
      imageUrls: p.imageUrls,
      description: p.description,
      auditRemark: p.auditRemark,
      skus: skus.map((s) => this.skuService.toVo(s)),
      comboItems
    }
    await this.safeSetCache(cacheKey, JSON.stringify(vo), DETAIL_CACHE_TTL_SECONDS)
    return vo
  }

  /**
   * 内部：取活跃商品（含软删拒绝）
   */
  private async findActiveById(productId: string): Promise<Product> {
    const p = await this.productRepo.findOne({
      where: { id: productId, isDeleted: 0 }
    })
    if (!p) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '商品不存在')
    return p
  }

  /**
   * 内部：校验店铺归属
   */
  private async assertShopOwner(shopId: string, merchantId: string): Promise<void> {
    const shop = await this.shopRepo.findOne({
      where: { id: shopId, isDeleted: 0 },
      select: ['id', 'merchantId']
    })
    if (!shop) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '店铺不存在')
    }
    if (shop.merchantId !== merchantId) {
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '无权操作该店铺')
    }
  }

  /**
   * 内部：根据 merchantId 解析待查询 shopIds
   * 参数：merchantId 当前商户；shopIdInQuery 查询入参（可选）
   * 返回值：string[]（若入参 shopId 提供则校验后返回；否则返回名下全部 shop）
   */
  private async resolveMerchantShopIds(
    merchantId: string,
    shopIdInQuery?: string
  ): Promise<string[]> {
    if (shopIdInQuery) {
      await this.assertShopOwner(shopIdInQuery, merchantId)
      return [shopIdInQuery]
    }
    const shops = await this.shopRepo.find({
      where: { merchantId, isDeleted: 0 },
      select: ['id']
    })
    return shops.map((s) => s.id)
  }

  /**
   * 内部：hasSku 切换处理
   * 参数：p Product 实体（即将保存）；newHasSku 目标值
   *
   * 行为：
   *   - 0 → 1：校验已有 SKU 数 ≥ 1（spec 显式要求）
   *   - 1 → 0：保留 isDefault=1 的那条，hard delete 其余
   */
  private async handleHasSkuSwitch(p: Product, newHasSku: number): Promise<void> {
    if (p.hasSku === 0 && newHasSku === 1) {
      await this.skuService.assertHasAnySku(p.id)
      p.hasSku = 1
      return
    }
    if (p.hasSku === 1 && newHasSku === 0) {
      await this.dataSource.transaction(async (manager) => {
        const keep = await this.skuService.collapseToDefault(manager, p.id)
        /* 单规格商品 product.price 取默认 SKU.price */
        p.price = keep.price
        p.hasSku = 0
      })
    }
  }

  /**
   * 内部：productType 切换处理
   *
   * 行为：
   *   - 切到 2：必须已有套餐子项；否则拒绝
   *   - 切离 2：清空已有套餐子项
   */
  private async handleProductTypeSwitch(p: Product, newType: number): Promise<void> {
    if (newType === 2) {
      const items = await this.comboService.listExpandedByComboId(p.id)
      if (items.length === 0) {
        throw new BusinessException(
          BizErrorCode.BIZ_STATE_INVALID,
          '切换为套餐前请先调用 PUT /merchant/products/:id/combo-items 设置子项'
        )
      }
      p.productType = newType
      return
    }
    if (p.productType === 2 && newType !== 2) {
      await this.dataSource.transaction(async (manager) => {
        await this.comboService.softDeleteAllByComboId(manager, p.id)
      })
      p.productType = newType
    } else {
      p.productType = newType
    }
  }

  /**
   * 内部：失效商品详情缓存
   */
  private async invalidateProductCache(productId: string): Promise<void> {
    try {
      await this.redis.del(`${DETAIL_CACHE_PREFIX}${productId}`)
    } catch (err) {
      this.logger.warn(
        `Redis DEL ${DETAIL_CACHE_PREFIX}${productId} 失败：${(err as Error).message}`
      )
    }
  }

  /**
   * 内部：失效店铺商品列表缓存（含 :all 与 :categoryId）
   */
  private async invalidateShopListCache(shopId: string): Promise<void> {
    try {
      const pattern = `${SHOP_LIST_CACHE_PREFIX}${shopId}:*`
      const stream = this.redis.scanStream({ match: pattern, count: 100 })
      const pipeline = this.redis.pipeline()
      let queued = 0
      stream.on('data', (keys: string[]) => {
        for (const k of keys) {
          pipeline.del(k)
          queued += 1
        }
      })
      await new Promise<void>((resolve, reject) => {
        stream.on('end', () => resolve())
        stream.on('error', (err) => reject(err))
      })
      if (queued > 0) {
        await pipeline.exec()
      }
    } catch (err) {
      this.logger.warn(
        `Redis SCAN/DEL ${SHOP_LIST_CACHE_PREFIX}${shopId}:* 失败：${(err as Error).message}`
      )
    }
  }

  /**
   * 内部：通过 productId 反查 shopId 后失效缓存
   */
  private async invalidateShopListCacheByProductId(productId: string): Promise<void> {
    const p = await this.productRepo.findOne({
      where: { id: productId, isDeleted: 0 },
      select: ['id', 'shopId']
    })
    if (p) await this.invalidateShopListCache(p.shopId)
    await this.invalidateProductCache(productId)
  }

  /**
   * 安全 GET 缓存（失败仅 warn 不抛）
   */
  private async safeGetCache(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key)
    } catch (err) {
      this.logger.warn(`Redis GET ${key} 失败：${(err as Error).message}`)
      return null
    }
  }

  /**
   * 安全 SET 缓存（失败仅 warn 不抛）
   */
  private async safeSetCache(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds)
    } catch (err) {
      this.logger.warn(`Redis SET ${key} 失败：${(err as Error).message}`)
    }
  }

  /**
   * Entity → 列表/概要 VO（不含 SKU 与套餐展开）
   */
  private toListVo(p: Product): ProductVo {
    return {
      id: p.id,
      shopId: p.shopId,
      categoryId: p.categoryId,
      name: p.name,
      brief: p.brief,
      mainImageUrl: p.mainImageUrl,
      price: p.price,
      originalPrice: p.originalPrice,
      packagingFee: p.packagingFee,
      minOrderQty: p.minOrderQty,
      limitPerOrder: p.limitPerOrder,
      hasSku: p.hasSku,
      productType: p.productType,
      tags: p.tags,
      monthlySales: p.monthlySales,
      totalSales: p.totalSales,
      score: p.score,
      scoreCount: p.scoreCount,
      isRecommend: p.isRecommend,
      isNew: p.isNew,
      auditStatus: p.auditStatus,
      status: p.status,
      sort: p.sort,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }
  }

  /* 静态导出（便于其他模块复用键名） */
  static readonly DETAIL_CACHE_KEY = (id: string): string => `${DETAIL_CACHE_PREFIX}${id}`
  static readonly DETAIL_CACHE_TTL_SECONDS = DETAIL_CACHE_TTL_SECONDS
  static readonly SHOP_LIST_CACHE_TTL_SECONDS = SHOP_LIST_CACHE_TTL_SECONDS
}
