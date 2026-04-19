/**
 * @file product-category.service.ts
 * @stage P4/T4.4（Sprint 1）
 * @desc 商品分类服务：2 级分类 CRUD + 同 shop 内 name 唯一 + 删除前校验子分类/商品引用
 * @author 单 Agent V2.0
 *
 * 数据来源：MySQL `product_category` + `product`
 * 缓存：本服务仅做读后裁剪，不单独缓存（分类数量通常 < 50，店铺商品列表缓存负担足够）
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Product, ProductCategory, Shop } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { SnowflakeId } from '@/utils'
import { CategoryVo, CreateCategoryDto, UpdateCategoryDto } from '../dto/product-category.dto'

const ROOT_PARENT_ID = '0'
const SHOP_PRODUCTS_CACHE_PREFIX = 'shop:products:'

@Injectable()
export class ProductCategoryService {
  private readonly logger = new Logger(ProductCategoryService.name)

  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * 商户端创建分类
   * 参数：merchantId 当前登录商户；dto 创建入参
   * 返回值：CategoryVo
   * 用途：POST /merchant/product-categories
   *
   * 校验：店铺 owner、parent 存在且为根、同店铺 name 唯一（含跨级）
   */
  async create(merchantId: string, dto: CreateCategoryDto): Promise<CategoryVo> {
    await this.assertShopOwner(dto.shopId, merchantId)

    const parentId = this.normalizeParentId(dto.parentId)
    if (parentId !== ROOT_PARENT_ID) {
      const parent = await this.categoryRepo.findOne({
        where: { id: parentId, shopId: dto.shopId, isDeleted: 0 }
      })
      if (!parent) {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '父分类不存在')
      }
      if (parent.parentId !== ROOT_PARENT_ID) {
        /* 仅支持 2 级 → 父级必须是根 */
        throw new BusinessException(
          BizErrorCode.BIZ_OPERATION_FORBIDDEN,
          '商品分类仅支持 2 级，无法在二级分类下再建子分类'
        )
      }
    }

    await this.assertNameUnique(dto.shopId, dto.name)

    const e = this.categoryRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      shopId: dto.shopId,
      parentId,
      name: dto.name,
      iconUrl: dto.iconUrl ?? null,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.categoryRepo.save(e)
    await this.invalidateShopProductsCache(dto.shopId)
    this.logger.log(`商户 ${merchantId} 在店铺 ${dto.shopId} 新建分类 ${e.id}（${e.name}）`)
    return this.toVo(e)
  }

  /**
   * 商户端取分类树（按 sort 升序）
   * 参数：merchantId 当前登录商户；shopId 目标店铺
   * 返回值：CategoryVo[] 含 children
   * 用途：GET /merchant/product-categories?shopId=xxx
   */
  async tree(merchantId: string, shopId: string): Promise<CategoryVo[]> {
    await this.assertShopOwner(shopId, merchantId)
    return this.publicTree(shopId)
  }

  /**
   * 商户端编辑分类
   * 参数：merchantId / categoryId / dto
   * 返回值：CategoryVo
   * 用途：PUT /merchant/product-categories/:id
   */
  async update(
    merchantId: string,
    categoryId: string,
    dto: UpdateCategoryDto
  ): Promise<CategoryVo> {
    const c = await this.findActiveById(categoryId)
    await this.assertShopOwner(c.shopId, merchantId)

    if (dto.name !== undefined && dto.name !== c.name) {
      await this.assertNameUnique(c.shopId, dto.name, categoryId)
      c.name = dto.name
    }
    if (dto.iconUrl !== undefined) c.iconUrl = dto.iconUrl
    if (dto.sort !== undefined) c.sort = dto.sort
    if (dto.status !== undefined) c.status = dto.status

    await this.categoryRepo.save(c)
    await this.invalidateShopProductsCache(c.shopId)
    return this.toVo(c)
  }

  /**
   * 商户端删除分类（软删）
   * 参数：merchantId / categoryId
   * 返回值：{ ok: true }
   * 用途：DELETE /merchant/product-categories/:id
   *
   * 拒绝场景：仍存在子分类 / 仍存在商品引用
   */
  async remove(merchantId: string, categoryId: string): Promise<{ ok: true }> {
    const c = await this.findActiveById(categoryId)
    await this.assertShopOwner(c.shopId, merchantId)

    const childCount = await this.categoryRepo.count({
      where: { parentId: categoryId, isDeleted: 0 }
    })
    if (childCount > 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `分类下存在 ${childCount} 个子分类，无法删除`
      )
    }
    const productCount = await this.productRepo.count({
      where: { categoryId, isDeleted: 0 }
    })
    if (productCount > 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `分类下存在 ${productCount} 件商品，无法删除`
      )
    }

    c.isDeleted = 1
    c.deletedAt = new Date()
    await this.categoryRepo.save(c)
    await this.invalidateShopProductsCache(c.shopId)
    this.logger.log(`商户 ${merchantId} 删除分类 ${categoryId}`)
    return { ok: true as const }
  }

  /**
   * 用户端 / 内部：取店铺分类树（不做 owner 校验）
   * 参数：shopId
   * 返回值：CategoryVo[] 含 children
   * 用途：用户端 GET /shops/:shopId/products 内部按分类分组时复用
   */
  async publicTree(shopId: string): Promise<CategoryVo[]> {
    const rows = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.shop_id = :sid AND c.is_deleted = 0', { sid: shopId })
      .orderBy('c.parent_id', 'ASC')
      .addOrderBy('c.sort', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .getMany()
    return this.buildTree(rows)
  }

  /**
   * 内部：校验分类归属指定店铺并返回实体
   * 参数：categoryId / shopId
   * 返回值：ProductCategory
   * 用途：product.service 创建商品前确保 categoryId 与 shopId 匹配
   */
  async assertCategoryInShop(categoryId: string, shopId: string): Promise<ProductCategory> {
    const c = await this.categoryRepo.findOne({
      where: { id: categoryId, shopId, isDeleted: 0 }
    })
    if (!c) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '分类不存在或与店铺不匹配')
    }
    return c
  }

  /* ========== 内部工具 ========== */

  private async findActiveById(categoryId: string): Promise<ProductCategory> {
    const c = await this.categoryRepo.findOne({
      where: { id: categoryId, isDeleted: 0 }
    })
    if (!c) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '分类不存在')
    return c
  }

  /**
   * 校验同店铺内分类名唯一（不含已软删）
   * 参数：shopId / name / excludeId 编辑时排除自身
   */
  private async assertNameUnique(shopId: string, name: string, excludeId?: string): Promise<void> {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .where('c.shop_id = :sid AND c.name = :n AND c.is_deleted = 0', { sid: shopId, n: name })
    if (excludeId) {
      qb.andWhere('c.id != :id', { id: excludeId })
    }
    const dup = await qb.getCount()
    if (dup > 0) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, `分类名称 "${name}" 已存在`)
    }
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
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '无权操作该店铺')
    }
  }

  private normalizeParentId(parentId?: string): string {
    if (parentId === undefined || parentId === null || parentId === '') return ROOT_PARENT_ID
    return parentId
  }

  private toVo(c: ProductCategory): CategoryVo {
    return {
      id: c.id,
      shopId: c.shopId,
      parentId: c.parentId,
      name: c.name,
      iconUrl: c.iconUrl,
      sort: c.sort,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }
  }

  /**
   * 把扁平列表组装成 2 级树（一级带 children）
   * 参数：rows 已按 parent_id ASC, sort ASC 排序的实体数组
   * 返回值：CategoryVo[]
   */
  private buildTree(rows: ProductCategory[]): CategoryVo[] {
    const rootList: CategoryVo[] = []
    const childMap = new Map<string, CategoryVo[]>()
    for (const r of rows) {
      const vo = this.toVo(r)
      if (r.parentId === ROOT_PARENT_ID) {
        vo.children = []
        rootList.push(vo)
      } else {
        const arr = childMap.get(r.parentId) ?? []
        arr.push(vo)
        childMap.set(r.parentId, arr)
      }
    }
    for (const root of rootList) {
      root.children = childMap.get(root.id) ?? []
    }
    return rootList
  }

  /**
   * 失效该店铺商品列表缓存（K：shop:products:{shopId}:{categoryIdOrAll}）
   * 参数：shopId
   */
  private async invalidateShopProductsCache(shopId: string): Promise<void> {
    try {
      const pattern = `${SHOP_PRODUCTS_CACHE_PREFIX}${shopId}:*`
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
        `Redis SCAN/DEL ${SHOP_PRODUCTS_CACHE_PREFIX}${shopId}:* 失败：${(err as Error).message}`
      )
    }
  }
}
