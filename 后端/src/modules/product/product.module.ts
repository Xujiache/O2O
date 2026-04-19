/**
 * @file product.module.ts
 * @stage P4/T4.4 + T4.5 + T4.6 + T4.7（Sprint 1）
 * @desc 商品模块：分类 / 商品 / SKU / 套餐 / 库存原子扣减
 * @author 单 Agent V2.0
 *
 * Controllers (4)：
 *   - MerchantProductCategoryController  /merchant/product-categories
 *   - MerchantProductController          /merchant/products  (CRUD + SKU + Combo + 上下架/排序)
 *   - ProductPublicController            /shops/:shopId/products + /products/:id
 *   - AdminProductController             /admin/products + force-off
 *
 * Providers (5)：
 *   - ProductCategoryService / ProductService / ProductSkuService / ProductComboService
 *   - InventoryService（T4.6 Redis Lua 原子扣减 + DB CAS 兜底）
 *
 * Exports：以上 5 个 service 全部 export，供 Order/Marketing 等下游模块注入
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Product, ProductCategory, ProductComboItem, ProductSku, Shop } from '@/entities'
import { HealthModule } from '@/health/health.module'
import { UserModule } from '@/modules/user/user.module'
import { AdminProductController } from './controllers/product-admin.controller'
import { ProductPublicController } from './controllers/product-public.controller'
import {
  MerchantProductCategoryController,
  MerchantProductController
} from './controllers/product.controller'
import { InventoryService } from './inventory.service'
import { ProductCategoryService } from './services/product-category.service'
import { ProductComboService } from './services/product-combo.service'
import { ProductSkuService } from './services/product-sku.service'
import { ProductService } from './services/product.service'

@Module({
  imports: [
    HealthModule,
    UserModule,
    TypeOrmModule.forFeature([Shop, ProductCategory, Product, ProductSku, ProductComboItem])
  ],
  controllers: [
    MerchantProductCategoryController,
    MerchantProductController,
    ProductPublicController,
    AdminProductController
  ],
  providers: [
    ProductCategoryService,
    ProductSkuService,
    ProductComboService,
    ProductService,
    InventoryService
  ],
  exports: [
    ProductCategoryService,
    ProductSkuService,
    ProductComboService,
    ProductService,
    InventoryService
  ]
})
export class ProductModule {}
