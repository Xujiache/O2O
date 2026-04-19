/**
 * @file product-combo.service.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc 套餐子项服务：批量替换（先删后插事务）+ 详情接口展开（取子商品名/SKU 规格名/价）
 * @author 单 Agent V2.0
 *
 * 数据来源：MySQL `product_combo_item` + `product` + `product_sku`
 * 仅当 product.product_type=2（套餐）时允许写入子项
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { DataSource, EntityManager, In, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Product, ProductComboItem, ProductSku, Shop } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { SnowflakeId } from '@/utils'
import { ComboItemDto, ComboItemVo, SetComboItemsDto } from '../dto/product-combo.dto'

const PRODUCT_DETAIL_CACHE_PREFIX = 'product:detail:'

@Injectable()
export class ProductComboService {
  private readonly logger = new Logger(ProductComboService.name)

  constructor(
    @InjectRepository(ProductComboItem)
    private readonly comboRepo: Repository<ProductComboItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductSku)
    private readonly skuRepo: Repository<ProductSku>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource
  ) {}

  /**
   * 商户端：批量替换套餐子项（事务内 hard delete + insert）
   * 参数：merchantId / comboProductId / dto
   * 返回值：ComboItemVo[]
   * 用途：PUT /merchant/products/:id/combo-items
   *
   * 校验：店铺 owner、主商品存在且 product_type=2、所有子 SKU 存在且属于同店铺
   */
  async replaceItems(
    merchantId: string,
    comboProductId: string,
    dto: SetComboItemsDto
  ): Promise<ComboItemVo[]> {
    const combo = await this.findActiveProductById(comboProductId)
    await this.assertShopOwner(combo.shopId, merchantId)

    if (combo.productType !== 2) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '仅商品类型为套餐（productType=2）的商品才允许设置子项'
      )
    }

    await this.assertItemsValid(combo, dto.items)

    const inserted = await this.dataSource.transaction(async (manager) => {
      await this.hardDeleteAllByComboId(manager, comboProductId)
      const repo = manager.getRepository(ProductComboItem)
      const entities = dto.items.map((it, idx) =>
        repo.create({
          id: SnowflakeId.next(),
          tenantId: 1,
          comboProductId,
          itemProductId: it.itemProductId,
          itemSkuId: it.itemSkuId,
          qty: it.qty,
          sort: it.sort ?? idx * 10,
          isDeleted: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        })
      )
      await repo.save(entities)
      return entities
    })

    await this.invalidateProductCache(comboProductId)
    this.logger.log(`商户 ${merchantId} 替换套餐 ${comboProductId} 子项（${inserted.length} 条）`)
    return inserted.map((e) => this.toVo(e))
  }

  /**
   * 内部：商品创建时由 product.service 调用——若 productType=2 且有 comboItems 入参则一并写入
   * 参数：manager 事务管理器；combo 已落库的套餐主商品；items 子项入参
   * 返回值：ProductComboItem[]
   */
  async createInitialItems(
    manager: EntityManager,
    combo: Product,
    items: ComboItemDto[] | undefined
  ): Promise<ProductComboItem[]> {
    if (combo.productType !== 2) {
      /* 非套餐：忽略 items 入参（DTO 已过滤，但此处兜底） */
      return []
    }
    if (!items || items.length === 0) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '套餐商品（productType=2）必须传入至少 1 条 comboItems'
      )
    }
    await this.assertItemsValid(combo, items)
    const repo = manager.getRepository(ProductComboItem)
    const entities = items.map((it, idx) =>
      repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        comboProductId: combo.id,
        itemProductId: it.itemProductId,
        itemSkuId: it.itemSkuId,
        qty: it.qty,
        sort: it.sort ?? idx * 10,
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
   * 内部：取套餐子项 + 关联展开（详情接口使用）
   * 参数：comboProductId
   * 返回值：ComboItemVo[]（含 itemProductName/itemSpecName/itemPrice）
   */
  async listExpandedByComboId(comboProductId: string): Promise<ComboItemVo[]> {
    const items = await this.comboRepo
      .createQueryBuilder('ci')
      .where('ci.combo_product_id = :pid AND ci.is_deleted = 0', { pid: comboProductId })
      .orderBy('ci.sort', 'ASC')
      .addOrderBy('ci.id', 'ASC')
      .getMany()
    if (items.length === 0) return []

    const productIds = Array.from(new Set(items.map((i) => i.itemProductId)))
    const skuIds = Array.from(new Set(items.map((i) => i.itemSkuId)))
    const [products, skus] = await Promise.all([
      this.productRepo.find({
        where: { id: In(productIds), isDeleted: 0 },
        select: ['id', 'name']
      }),
      this.skuRepo.find({
        where: { id: In(skuIds), isDeleted: 0 },
        select: ['id', 'specName', 'price']
      })
    ])
    const productMap = new Map(products.map((p) => [p.id, p]))
    const skuMap = new Map(skus.map((s) => [s.id, s]))
    return items.map((it) => {
      const vo = this.toVo(it)
      const p = productMap.get(it.itemProductId)
      const s = skuMap.get(it.itemSkuId)
      vo.itemProductName = p?.name ?? null
      vo.itemSpecName = s?.specName ?? null
      vo.itemPrice = s?.price ?? null
      return vo
    })
  }

  /**
   * 内部：商品软删时联动软删全部套餐子项
   * 参数：manager / comboProductId
   */
  async softDeleteAllByComboId(manager: EntityManager, comboProductId: string): Promise<void> {
    await manager
      .getRepository(ProductComboItem)
      .createQueryBuilder()
      .update()
      .set({ isDeleted: 1, deletedAt: new Date() })
      .where('combo_product_id = :pid AND is_deleted = 0', { pid: comboProductId })
      .execute()
  }

  /**
   * Entity → VO（不含展开字段）
   */
  toVo(e: ProductComboItem): ComboItemVo {
    return {
      id: e.id,
      comboProductId: e.comboProductId,
      itemProductId: e.itemProductId,
      itemSkuId: e.itemSkuId,
      qty: e.qty,
      sort: e.sort
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

  private async hardDeleteAllByComboId(
    manager: EntityManager,
    comboProductId: string
  ): Promise<void> {
    await manager.getRepository(ProductComboItem).delete({ comboProductId })
  }

  /**
   * 校验：每个子项的 product 与 sku 都存在、属于同店铺、sku 归属对应 product，且不能引用自己
   */
  private async assertItemsValid(combo: Product, items: ComboItemDto[]): Promise<void> {
    const productIds = Array.from(new Set(items.map((i) => i.itemProductId)))
    const skuIds = Array.from(new Set(items.map((i) => i.itemSkuId)))
    if (productIds.includes(combo.id)) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '套餐子项不能引用套餐自身')
    }

    const [products, skus] = await Promise.all([
      this.productRepo.find({
        where: { id: In(productIds), isDeleted: 0 },
        select: ['id', 'shopId', 'productType']
      }),
      this.skuRepo.find({
        where: { id: In(skuIds), isDeleted: 0 },
        select: ['id', 'productId']
      })
    ])
    const productMap = new Map(products.map((p) => [p.id, p]))
    const skuMap = new Map(skus.map((s) => [s.id, s]))

    for (const it of items) {
      const p = productMap.get(it.itemProductId)
      if (!p) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          `子商品 ${it.itemProductId} 不存在`
        )
      }
      if (p.shopId !== combo.shopId) {
        throw new BusinessException(
          BizErrorCode.BIZ_OPERATION_FORBIDDEN,
          `子商品 ${it.itemProductId} 不属于本店铺`
        )
      }
      if (p.productType === 2) {
        throw new BusinessException(
          BizErrorCode.BIZ_OPERATION_FORBIDDEN,
          `子商品 ${it.itemProductId} 本身是套餐，不允许嵌套套餐`
        )
      }
      const s = skuMap.get(it.itemSkuId)
      if (!s) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          `子 SKU ${it.itemSkuId} 不存在`
        )
      }
      if (s.productId !== it.itemProductId) {
        throw new BusinessException(
          BizErrorCode.BIZ_DATA_CONFLICT,
          `子 SKU ${it.itemSkuId} 不属于子商品 ${it.itemProductId}`
        )
      }
    }
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
