/**
 * @file shop.module.ts
 * @stage P4/T4.1 + T4.2 + T4.3（Sprint 1）
 * @desc 店铺模块：CRUD / 营业时段 / 配送范围 / 用户端列表 / 管理端审核-封禁
 * @author 单 Agent V2.0
 *
 * Controllers：
 *   - ShopController         /api/v1/merchant/shop  商户端 CRUD + business-hour + delivery-area + auto-accept + announcement + business-status
 *   - ShopPublicController   /api/v1/shops          用户端 列表（GEO+排序+筛选+缓存）+ 详情
 *   - ShopAdminController    /api/v1/admin/shops    管理端 列表 + 审核 + 封禁/解封
 *
 * Providers：
 *   - ShopService                    主 service：CRUD / 公告 / 自动接单 / 营业状态 / 审核 / 封禁 / 用户端列表+缓存
 *   - ShopBusinessHourService        营业时段 7×N 维护 + isOpenNow
 *   - DeliveryAreaService            polygon CRUD + 调 MapService.setShopArea 写缓存
 *
 * Imports：
 *   - TypeOrmModule.forFeature(Shop / ShopBusinessHour / DeliveryArea)
 *   - HealthModule（注入 REDIS_CLIENT）
 *   - MapModule（DeliveryAreaService 注入 MapService）
 *   - UserModule（ShopAdminController 注入 OperationLogService）
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DeliveryArea, Shop, ShopBusinessHour } from '@/entities'
import { HealthModule } from '@/health/health.module'
import { MapModule } from '@/modules/map/map.module'
import { UserModule } from '@/modules/user/user.module'
import { ShopAdminController } from './controllers/shop-admin.controller'
import { ShopPublicController } from './controllers/shop-public.controller'
import { ShopController } from './controllers/shop.controller'
import { DeliveryAreaService } from './services/delivery-area.service'
import { ShopBusinessHourService } from './services/shop-business-hour.service'
import { ShopService } from './services/shop.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, ShopBusinessHour, DeliveryArea]),
    HealthModule,
    MapModule,
    UserModule
  ],
  controllers: [ShopController, ShopPublicController, ShopAdminController],
  providers: [ShopService, ShopBusinessHourService, DeliveryAreaService],
  exports: [ShopService, ShopBusinessHourService, DeliveryAreaService]
})
export class ShopModule {}
