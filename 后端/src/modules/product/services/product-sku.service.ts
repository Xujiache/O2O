/**
 * @file product-sku.service.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc SKU 服务：批量替换（先删后插事务） + 单 SKU 查询；不实现 Redis 原子扣减
 * @author 单 Agent V2.0
 *
 * 数据来源：MySQL `product_sku`
 * 库存约定：
 *   - stock_qty=-1 → 无限库存（单规格商品默认值）
 *   - 实际原子扣减由 Agent C 的 InventoryService（Redis Lua）实现，本服务仅负责落库
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Product, ProductSku, Shop } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { SnowflakeId } from '@/utils'
import { SetSkuListDto, SkuItemDto, SkuVo } from '../dto/product-sku.dto'

const PRODUCT_DETAIL_CACHE_PREFIX = 'product:detail:'

@Injectable()
export class ProductSkuService {
  private readonly logger = new Logger(ProductSkuService.name)

  constructor(
    @InjectRepository(ProductSku)
    private readonly skuRepo: Repository<ProductSku>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource
  ) {}

  /**
   * 商户端：批量替换 SKU 列表（先 hard delete 后 insert，事务一致）
   * 参数：merchantId / productId / dto
   * 返回值：SkuVo[]
   * 用途：PUT /merchant/products/:id/skus
   *
   * 校验：店铺 owner、商品存在；多规格商品至少 1 条 isDefault=1（未标时取首条）
   */
  async replaceList(merchantId: string, productId: string, dto: SetSkuListDto): Promise<SkuVo[]> {
    const product = await this.findActiveProductById(productId)
    await this.assertShopOwner(product.shopId, merchantId)

    const normalized = this.normalizeSkuList(dto.skus, product)

    const inserted = await this.dataSource.transaction(async (manager) => {
      await this.hardDeleteAllByProductId(manager, productId)
      const entities = normalized.map((s) =>
        manager.getRepository(ProductSku).create({
          id: SnowflakeId.next(),
          tenantId: 1,
          productId,
          skuCode: s.skuCode ?? null,
          specName: s.specName ?? null,
          specJson: s.specJson ?? null,
          price: s.price,
          originalPrice: s.originalPrice ?? null,
          packagingFee: s.packagingFee ?? '0.00',
          stockQty: s.stockQty,
          sales: 0,
          weightG: s.weightG ?? null,
          volumeMl: s.volumeMl ?? null,
          isDefault: s.isDefault ?? 0,
          status: s.status ?? 1,
          isDeleted: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        })
      )
      await manager.getRepository(ProductSku).save(entities)
      /* 同步商品 price = SKU 最低价（多规格商品 price 字段是冗余最低价） */
      const minPrice = this.computeMinPrice(entities.map((e) => e.price))
      product.price = minPrice
      await manager.getRepository(Product).save(product)
      return entities
    })

    await this.invalidateProductCache(productId)
    this.logger.log(`商户 ${merchantId} 替换商品 ${productId} 的 SKU（${inserted.length} 条）`)
    return inserted.map((e) => this.toVo(e))
  }

  /**
   * 商户端：取单条 SKU 详情
   * 参数：skuId
   * 返回值：SkuVo
   * 用途：内部接口或调试使用；无对外 controller 暴露
   */
  async detail(skuId: string): Promise<SkuVo> {
    const e = await this.skuRepo.findOne({ where: { id: skuId, isDeleted: 0 } })
    if (!e) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, 'SKU 不存在')
    return this.toVo(e)
  }

  /**
   * 内部：取商品下全部活跃 SKU（按 is_default desc, id asc）
   * 参数：productId
   * 返回值：ProductSku[]
   * 用途：product.service 详情接口拼装；combo 子项展开取价
   */
  async listByProductId(productId: string): Promise<ProductSku[]> {
    return this.skuRepo
      .createQueryBuilder('s')
      .where('s.product_id = :pid AND s.is_deleted = 0', { pid: productId })
      .orderBy('s.is_default', 'DESC')
      .addOrderBy('s.id', 'ASC')
      .getMany()
  }

  /**
   * 内部：批量取多个 SKU（活跃）
   * 参数：skuIds
   * 返回值：Map<id, ProductSku>
   * 用途：套餐子项展开时一次性查全
   */
  async findManyByIds(skuIds: string[]): Promise<Map<string, ProductSku>> {
    const map = new Map<string, ProductSku>()
    if (skuIds.length === 0) return map
    const rows = await this.skuRepo
      .createQueryBuilder('s')
      .where('s.id IN (:...ids) AND s.is_deleted = 0', { ids: skuIds })
      .getMany()
    for (const r of rows) map.set(r.id, r)
    return map
  }

  /**
   * 内部：商品创建时由 product.service 调用——根据 hasSku 自动建 SKU
   * 参数：manager 事务管理器；product 已落库的商品；skus 用户传入；defaultPrice 单规格时回退价
   * 返回值：ProductSku[]（已落库）
   *
   * 行为：
   *   - hasSku=0：忽略 skus 入参，自建 1 条 isDefault=1 + stockQty=-1 + price=defaultPrice
   *   - hasSku=1：要求 skus.length >= 1；service 自动确保恰好一条 isDefault=1
   */
  async createInitialSkus(
    manager: EntityManager,
    product: Product,
    skus: SkuItemDto[] | undefined,
    defaultPrice: string
  ): Promise<ProductSku[]> {
    const repo = manager.getRepository(ProductSku)

    if (product.hasSku === 0) {
      const e = repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        productId: product.id,
        skuCode: null,
        specName: null,
        specJson: null,
        price: defaultPrice,
        originalPrice: null,
        packagingFee: '0.00',
        stockQty: -1,
        sales: 0,
        weightG: null,
        volumeMl: null,
        isDefault: 1,
        status: 1,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      await repo.save(e)
      return [e]
    }

    if (!skus || skus.length === 0) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '多规格商品（hasSku=1）必须传入至少 1 条 SKU'
      )
    }
    const normalized = this.normalizeSkuList(skus, product)
    const entities = normalized.map((s) =>
      repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        productId: product.id,
        skuCode: s.skuCode ?? null,
        specName: s.specName ?? null,
        specJson: s.specJson ?? null,
        price: s.price,
        originalPrice: s.originalPrice ?? null,
        packagingFee: s.packagingFee ?? '0.00',
        stockQty: s.stockQty,
        sales: 0,
        weightG: s.weightG ?? null,
        volumeMl: s.volumeMl ?? null,
        isDefault: s.isDefault ?? 0,
        status: s.status ?? 1,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
    )
    await repo.save(entities)
    return entities
  }

  /**
   * 内部：商品 hasSku 由 1 → 0 时调用——保留 isDefault=1 的那条，hard delete 其余
   * 参数：manager / productId
   * 返回值：保留下来的默认 SKU
   */
  async collapseToDefault(manager: EntityManager, productId: string): Promise<ProductSku> {
    const repo = manager.getRepository(ProductSku)
    const all = await repo
      .createQueryBuilder('s')
      .where('s.product_id = :pid AND s.is_deleted = 0', { pid: productId })
      .getMany()
    if (all.length === 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        '商品当前无 SKU，无法切换为单规格'
      )
    }
    let keep = all.find((s) => s.isDefault === 1)
    if (!keep) {
      keep = all[0] as ProductSku
      keep.isDefault = 1
      await repo.save(keep)
    }
    const removeIds = all.filter((s) => s.id !== keep.id).map((s) => s.id)
    if (removeIds.length > 0) {
      await repo.delete(removeIds)
    }
    return keep
  }

  /**
   * 内部：商品 hasSku 由 0 → 1 时调用——校验已有 SKU 数 ≥ 1（spec 显式要求）
   * 参数：productId
   * 返回值：当前 SKU 数
   */
  async assertHasAnySku(productId: string): Promise<number> {
    const cnt = await this.skuRepo.count({ where: { productId, isDeleted: 0 } })
    if (cnt < 1) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        '当前无 SKU，无法切换为多规格；请先调用 PUT /merchant/products/:id/skus 添加'
      )
    }
    return cnt
  }

  /**
   * 内部：商品软删时联动软删全部 SKU
   * 参数：manager / productId
   */
  async softDeleteAllByProductId(manager: EntityManager, productId: string): Promise<void> {
    await manager
      .getRepository(ProductSku)
      .createQueryBuilder()
      .update()
      .set({ isDeleted: 1, deletedAt: new Date() })
      .where('product_id = :pid AND is_deleted = 0', { pid: productId })
      .execute()
  }

  /**
   * Entity → VO（公开，供 product.service 复用）
   */
  toVo(e: ProductSku): SkuVo {
    return {
      id: e.id,
      productId: e.productId,
      skuCode: e.skuCode,
      specName: e.specName,
      specJson: e.specJson,
      price: e.price,
      originalPrice: e.originalPrice,
      packagingFee: e.packagingFee,
      stockQty: e.stockQty,
      sales: e.sales,
      weightG: e.weightG,
      volumeMl: e.volumeMl,
      isDefault: e.isDefault,
      status: e.status,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    }
  }

  /* ========== 内部工具 ========== */

  private async findActiveProductById(productId: string): Promise<Product> {
    const p = await this.productRepo.findOne({ where: { id: productId, isDeleted: 0 } })
    if (!p) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '商品不存在')
    return p
  }

  private async assertShopOwner(shopId: string, merchantId: string): Promise<void> {
    const shop = await this.shopRepo.findOne({
      where: { id: shopId, isDeleted: 0 },
      select: ['id', 'merchantId']
    })
    if (!shop) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '店铺不存在')
    }
    if (shop.merchantId !== merchantId) {
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '无权操作该店铺商品')
    }
  }

  private async hardDeleteAllByProductId(manager: EntityManager, productId: string): Promise<void> {
    /* hard delete 以避开 uk_product_sku_code 唯一约束（product_id+sku_code 不含 is_deleted） */
    await manager.getRepository(ProductSku).delete({ productId })
  }

  /**
   * 规范化用户传入的 SKU 列表：
   *   - 多规格商品：恰好一条 isDefault=1（用户标记的首条优先；未标记时自动取首条）
   *   - 单规格商品（hasSku=0）调用本方法时：仅允许 1 条且强制 isDefault=1
   *   - 校验 sku_code 不重复
   * 参数：skus 用户传入；product 商品实体
   * 返回值：归一化后的新数组（不影响入参）
   */
  private normalizeSkuList(skus: SkuItemDto[], product: Product): SkuItemDto[] {
    if (product.hasSku === 0 && skus.length > 1) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '单规格商品（hasSku=0）SKU 列表只能有 1 条；如需多 SKU 请先把 hasSku 改为 1'
      )
    }
    const codes = new Set<string>()
    for (const s of skus) {
      if (s.skuCode) {
        if (codes.has(s.skuCode)) {
          throw new BusinessException(
            BizErrorCode.BIZ_DATA_CONFLICT,
            `SKU 编码 "${s.skuCode}" 在本批次内重复`
          )
        }
        codes.add(s.skuCode)
      }
    }
    /* 选出默认 SKU 的索引：用户首条标记 isDefault=1 → 用之；否则取 0 */
    let defaultIdx = skus.findIndex((s) => s.isDefault === 1)
    if (defaultIdx < 0) defaultIdx = 0
    return skus.map((s, idx) => ({
      ...s,
      isDefault: idx === defaultIdx ? 1 : 0
    }))
  }

  /**
   * 计算最低价（按字符串保留原精度比较，避免 Number 丢精度）
   */
  private computeMinPrice(prices: string[]): string {
    if (prices.length === 0) return '0.00'
    let min = prices[0] as string
    for (let i = 1; i < prices.length; i++) {
      const cur = prices[i] as string
      if (this.compareDecimalString(cur, min) < 0) min = cur
    }
    return min
  }

  /**
   * 字符串小数比较：返回 a-b 的符号（不考虑千分位）
   */
  private compareDecimalString(a: string, b: string): number {
    const [ai, af = ''] = a.split('.')
    const [bi, bf = ''] = b.split('.')
    const aiNorm = (ai ?? '0').padStart(Math.max((ai ?? '').length, (bi ?? '').length), '0')
    const biNorm = (bi ?? '0').padStart(Math.max((ai ?? '').length, (bi ?? '').length), '0')
    if (aiNorm !== biNorm) return aiNorm < biNorm ? -1 : 1
    const len = Math.max(af.length, bf.length)
    const afNorm = af.padEnd(len, '0')
    const bfNorm = bf.padEnd(len, '0')
    if (afNorm === bfNorm) return 0
    return afNorm < bfNorm ? -1 : 1
  }

  private async invalidateProductCache(productId: string): Promise<void> {
    try {
      await this.redis.del(`${PRODUCT_DETAIL_CACHE_PREFIX}${productId}`)
    } catch (err) {
      this.logger.warn(
        `Redis DEL ${PRODUCT_DETAIL_CACHE_PREFIX}${productId} 失败：${(err as Error).message}`
      )
    }
  }
}
