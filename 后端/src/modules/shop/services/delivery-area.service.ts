/**
 * @file delivery-area.service.ts
 * @stage P4/T4.2（Sprint 1）
 * @desc 配送区域服务：polygon CRUD（area_type=1, owner_id=shopId）+ 调 MapService.setShopArea 写缓存
 * @author 单 Agent V2.0
 *
 * 数据：MySQL `delivery_area`
 * 缓存：`shop:deliveryArea:{shopId}` 5min（由 MapService.setShopArea 内部维护）
 *
 * 注：本服务仅负责商户配送圈（area_type=1）；平台跑腿服务区（area_type=2）由 P3/MapService 负责
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { DeliveryArea, type GeoJsonPolygon } from '@/entities'
import { MapService } from '@/modules/map/map.service'
import { SnowflakeId } from '@/utils'
import {
  type DeliveryAreaVo,
  type GeoJsonPolygonVo,
  type SetDeliveryAreaDto
} from '../dto/delivery-area.dto'

@Injectable()
export class DeliveryAreaService {
  private readonly logger = new Logger(DeliveryAreaService.name)

  constructor(
    @InjectRepository(DeliveryArea)
    private readonly areaRepo: Repository<DeliveryArea>,
    private readonly mapService: MapService
  ) {}

  /**
   * 设置店铺配送范围（覆盖：先停用既有 area_type=1 同店记录，再插入新条 + 写缓存）
   * 参数：shopId / dto / shopName 用于默认 name
   * 返回值：DeliveryAreaVo
   * 用途：PUT /api/v1/merchant/shop/:id/delivery-area
   *
   * 设计：
   *   1. 校验 polygon 合法（外环 ≥ 4 点首尾闭合 + 经纬度合法）
   *   2. 软删该店之前的 area_type=1 记录（status→0 + is_deleted→1，便于审计）
   *   3. 插入新 DeliveryArea（status=1, priority 默认 0）
   *   4. 调 MapService.setShopArea 把 polygon + 配送费/起送价写入 Redis 5min 缓存
   */
  async setForShop(
    shopId: string,
    dto: SetDeliveryAreaDto,
    shopName?: string
  ): Promise<DeliveryAreaVo> {
    this.assertPolygon(dto.polygon)

    /* 1. 软删既有 */
    await this.areaRepo
      .createQueryBuilder()
      .update(DeliveryArea)
      .set({ status: 0, isDeleted: 1, deletedAt: new Date() })
      .where('area_type = 1 AND owner_id = :sid AND is_deleted = 0', { sid: shopId })
      .execute()

    /* 2. 插入新 */
    const now = new Date()
    const polygonGeo: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: dto.polygon.coordinates
    }
    const entity = this.areaRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      areaType: 1,
      ownerId: shopId,
      name: dto.name ?? `店铺#${shopName ?? shopId} 配送圈`,
      cityCode: dto.cityCode,
      polygon: polygonGeo,
      deliveryFee: dto.deliveryFee ?? null,
      minOrder: dto.minOrder ?? null,
      extraFeeRule: dto.extraFeeRule ?? null,
      priority: dto.priority ?? 0,
      status: 1,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.areaRepo.save(entity)

    /* 3. 写缓存（5min；MapService.setShopArea 内部已实现 TTL/失败兜底） */
    await this.mapService.setShopArea({
      shopId,
      polygon: polygonGeo,
      deliveryFee: dto.deliveryFee != null ? Number(dto.deliveryFee) : undefined,
      minOrder: dto.minOrder != null ? Number(dto.minOrder) : undefined,
      overwrite: true
    })

    this.logger.log(`shop ${shopId} 配送范围已更新（areaId=${saved.id}）`)
    return this.toVo(saved)
  }

  /**
   * 查询店铺当前生效的配送范围（取 priority DESC 第一条）
   * 参数：shopId
   * 返回值：DeliveryAreaVo | null
   * 用途：GET /api/v1/merchant/shop/:id/delivery-area
   */
  async getForShop(shopId: string): Promise<DeliveryAreaVo | null> {
    const row = await this.areaRepo.findOne({
      where: { areaType: 1, ownerId: shopId, status: 1, isDeleted: 0 },
      order: { priority: 'DESC', createdAt: 'DESC' }
    })
    return row ? this.toVo(row) : null
  }

  /**
   * 校验 GeoJSON Polygon 合法
   * 规则：
   *   - type 必须 'Polygon'
   *   - coordinates 是 number[][][]，至少含 1 个外环
   *   - 外环 ≥ 4 个点，首尾相同
   *   - 每点 [lng, lat] 经纬度合法
   * 不合法抛 BusinessException(PARAM_INVALID, message)
   */
  private assertPolygon(polygon: GeoJsonPolygonVo): void {
    if (!polygon || polygon.type !== 'Polygon') {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'polygon.type 必须为 "Polygon"',
        HttpStatus.BAD_REQUEST
      )
    }
    const rings = polygon.coordinates
    if (!Array.isArray(rings) || rings.length === 0) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'polygon.coordinates 必须包含至少 1 个外环',
        HttpStatus.BAD_REQUEST
      )
    }
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r]
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `polygon 第 ${r + 1} 环点数不足 4`,
          HttpStatus.BAD_REQUEST
        )
      }
      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2) {
          throw new BusinessException(
            BizErrorCode.PARAM_INVALID,
            'polygon 坐标点必须为 [lng, lat]',
            HttpStatus.BAD_REQUEST
          )
        }
        const [lng, lat] = pt
        if (
          typeof lng !== 'number' ||
          typeof lat !== 'number' ||
          !Number.isFinite(lng) ||
          !Number.isFinite(lat) ||
          lng < -180 ||
          lng > 180 ||
          lat < -90 ||
          lat > 90
        ) {
          throw new BusinessException(
            BizErrorCode.PARAM_INVALID,
            'polygon 坐标点经纬度越界',
            HttpStatus.BAD_REQUEST
          )
        }
      }
      const first = ring[0]!
      const last = ring[ring.length - 1]!
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `polygon 第 ${r + 1} 环首尾必须闭合`,
          HttpStatus.BAD_REQUEST
        )
      }
    }
  }

  private toVo(e: DeliveryArea): DeliveryAreaVo {
    return {
      id: e.id,
      areaType: e.areaType,
      ownerId: e.ownerId,
      name: e.name,
      cityCode: e.cityCode,
      polygon: { type: 'Polygon', coordinates: e.polygon.coordinates },
      deliveryFee: e.deliveryFee,
      minOrder: e.minOrder,
      extraFeeRule: e.extraFeeRule,
      priority: e.priority,
      status: e.status,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    }
  }
}
