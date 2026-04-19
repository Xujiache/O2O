/**
 * @file route-match.service.ts
 * @stage P4/T4.41（Sprint 6）
 * @desc 顺路单匹配：夹角 ≤ 45° + 距离增量 ≤ 1.5km
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 顺路判定（DESIGN_P4 §5.3）：
 *   骑手 X 当前进行中订单 P（status IN [20,30,40]）+ 新订单 N
 *   顺路 = 起点夹角 ≤ 45° AND 距离增量 ≤ 1.5km
 *
 * 增量公式：
 *   inc = (P.pickup→N.pickup + N.pickup→P.delivery + P.delivery→N.delivery)
 *         - (P.pickup→P.delivery + N.pickup→N.delivery)
 *   ※ 简化模型：假设 X 已在 P.pickup 出发，先去 N.pickup 取件，再回到 P.delivery，
 *     最后去 N.delivery；与单独跑两趟相比的额外路程
 *
 * 数据来源：
 *   - 骑手活跃订单 Set：rider:active:{riderId}（CandidateService 维护）
 *   - 已结算订单不存放在该 Set；进行中订单数据由 OrderModule 提供（本期不直接跨表查 order_takeout/errand）
 *   - 简化方案：顺路单匹配通过 Redis Hash 缓存 dispatch:active:{orderNo} = {pickupLng,pickupLat,deliveryLng,deliveryLat}
 *     由 GrabService.grab + DispatchService.acceptDispatch 在订单接受时回写；
 *     抢单完成后即认为骑手处于该订单"配送中"，可用于顺路计算
 *
 * 不在本期做：
 *   - 真正调高德路径规划计算；本期用 Haversine 直线近似
 *   - 多个候选活跃订单的全排列；本期取与新订单最匹配的一条
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import type Redis from 'ioredis'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { haversineDistanceM } from '@/modules/map/geo.util'
import type { DispatchOrderContext } from '../types/dispatch.types'

/* ============================================================================
 * 常量（DESIGN_P4 §5.3 阈值）
 * ============================================================================ */

/** 顺路最大夹角（度） */
const MAX_ANGLE_DEG = 45

/** 顺路最大额外距离（米） */
const MAX_EXTRA_DISTANCE_M = 1500

/** 活跃订单 Hash Key（GrabService 在订单接受后写入） */
const ACTIVE_ORDER_KEY = (orderNo: string): string => `dispatch:active:${orderNo}`

/** 骑手活跃订单 Set Key（CandidateService 维护） */
const RIDER_ACTIVE_KEY = (riderId: string): string => `rider:active:${riderId}`

/* ============================================================================
 * 数据契约
 * ============================================================================ */

/**
 * 进行中订单的几何上下文
 */
interface ActiveOrderGeo {
  orderNo: string
  pickupLng: number
  pickupLat: number
  deliveryLng: number
  deliveryLat: number
}

/**
 * 单次顺路匹配的明细（service 内部使用）
 */
interface RouteMatchDetail {
  matched: boolean
  withOrder: string | null
  angleDeg: number | null
  extraDistanceM: number | null
}

@Injectable()
export class RouteMatchService {
  private readonly logger = new Logger(RouteMatchService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /* ============================================================================
   * 公共 API
   * ============================================================================ */

  /**
   * 计算骑手对新订单的顺路评分（0 / 1）
   *
   * 流程：
   *   1) 取骑手活跃订单集合 → 解析每个订单的几何信息
   *   2) 对每个活跃订单与新订单做"顺路判定"
   *   3) 任意一条满足 → score=1；否则 0
   *
   * 参数：riderId / 新订单上下文
   * 返回值：1.0 顺路；0 不顺路
   * 注：deliveryLng / deliveryLat 缺失（如外卖订单未存终点）→ 返回 0（无法判定）
   */
  async scoreFor(riderId: string, newOrder: DispatchOrderContext): Promise<number> {
    if (newOrder.deliveryLng == null || newOrder.deliveryLat == null) {
      return 0
    }
    const activeOrders = await this.loadActiveOrders(riderId)
    if (activeOrders.length === 0) return 0

    for (const active of activeOrders) {
      const detail = this.computeRouteMatch(active, {
        orderNo: newOrder.orderNo,
        pickupLng: newOrder.pickupLng,
        pickupLat: newOrder.pickupLat,
        deliveryLng: newOrder.deliveryLng,
        deliveryLat: newOrder.deliveryLat
      })
      if (detail.matched) return 1
    }
    return 0
  }

  /**
   * 写入活跃订单几何信息（GrabService / DispatchService.acceptDispatch 调用）
   * 参数：geo 几何信息；ttlSeconds 默认 3 小时
   * 返回值：void
   */
  async cacheActiveOrderGeo(geo: ActiveOrderGeo, ttlSeconds: number = 3 * 3600): Promise<void> {
    try {
      const key = ACTIVE_ORDER_KEY(geo.orderNo)
      await this.redis.hset(key, {
        pickupLng: String(geo.pickupLng),
        pickupLat: String(geo.pickupLat),
        deliveryLng: String(geo.deliveryLng),
        deliveryLat: String(geo.deliveryLat)
      })
      await this.redis.expire(key, ttlSeconds)
    } catch (err) {
      this.logger.warn(
        `cacheActiveOrderGeo 失败 order=${geo.orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 清除活跃订单几何信息（订单送达 / 取消时调用）
   * 参数：orderNo
   * 返回值：void
   */
  async evictActiveOrderGeo(orderNo: string): Promise<void> {
    try {
      await this.redis.del(ACTIVE_ORDER_KEY(orderNo))
    } catch (err) {
      this.logger.warn(
        `evictActiveOrderGeo 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /* ============================================================================
   * 内部：加载骑手活跃订单几何
   * ============================================================================ */

  /**
   * 读取骑手活跃订单集合，并解析每条订单的几何
   * 参数：riderId
   * 返回值：ActiveOrderGeo[]
   */
  private async loadActiveOrders(riderId: string): Promise<ActiveOrderGeo[]> {
    let orderNos: string[] = []
    try {
      orderNos = await this.redis.smembers(RIDER_ACTIVE_KEY(riderId))
    } catch (err) {
      this.logger.warn(
        `loadActiveOrders smembers 失败 rider=${riderId}：${err instanceof Error ? err.message : String(err)}`
      )
      return []
    }
    if (orderNos.length === 0) return []

    const result: ActiveOrderGeo[] = []
    for (const orderNo of orderNos) {
      try {
        const hash = await this.redis.hgetall(ACTIVE_ORDER_KEY(orderNo))
        if (!hash || !hash.pickupLng || !hash.deliveryLng) continue
        const geo: ActiveOrderGeo = {
          orderNo,
          pickupLng: Number(hash.pickupLng),
          pickupLat: Number(hash.pickupLat),
          deliveryLng: Number(hash.deliveryLng),
          deliveryLat: Number(hash.deliveryLat)
        }
        if (
          [geo.pickupLng, geo.pickupLat, geo.deliveryLng, geo.deliveryLat].every((v) =>
            Number.isFinite(v)
          )
        ) {
          result.push(geo)
        }
      } catch (err) {
        this.logger.warn(
          `loadActiveOrders hgetall 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return result
  }

  /* ============================================================================
   * 内部：顺路判定
   * ============================================================================ */

  /**
   * 单条活跃订单 P 与新订单 N 的顺路判定
   * 参数：active P；candidate N（含 4 个端点）
   * 返回值：RouteMatchDetail
   */
  private computeRouteMatch(active: ActiveOrderGeo, candidate: ActiveOrderGeo): RouteMatchDetail {
    /* 起点夹角：用方向向量 P.pickup→P.delivery vs N.pickup→N.delivery */
    const angleDeg = this.angleBetweenSegmentsDeg(
      active.pickupLng,
      active.pickupLat,
      active.deliveryLng,
      active.deliveryLat,
      candidate.pickupLng,
      candidate.pickupLat,
      candidate.deliveryLng,
      candidate.deliveryLat
    )

    /* 距离增量 */
    const baseDist =
      haversineDistanceM(
        active.pickupLng,
        active.pickupLat,
        active.deliveryLng,
        active.deliveryLat
      ) +
      haversineDistanceM(
        candidate.pickupLng,
        candidate.pickupLat,
        candidate.deliveryLng,
        candidate.deliveryLat
      )
    const combinedDist =
      haversineDistanceM(
        active.pickupLng,
        active.pickupLat,
        candidate.pickupLng,
        candidate.pickupLat
      ) +
      haversineDistanceM(
        candidate.pickupLng,
        candidate.pickupLat,
        active.deliveryLng,
        active.deliveryLat
      ) +
      haversineDistanceM(
        active.deliveryLng,
        active.deliveryLat,
        candidate.deliveryLng,
        candidate.deliveryLat
      )
    const extraDistanceM = combinedDist - baseDist

    const matched = angleDeg <= MAX_ANGLE_DEG && extraDistanceM <= MAX_EXTRA_DISTANCE_M
    return {
      matched,
      withOrder: active.orderNo,
      angleDeg,
      extraDistanceM
    }
  }

  /**
   * 两条线段方向向量的夹角（度，范围 [0, 180]）
   *
   * 公式：cosθ = (v1·v2) / (|v1|·|v2|)
   * 注：若任一线段长度为 0，返回 180（视为完全不顺路）
   */
  private angleBetweenSegmentsDeg(
    aLng1: number,
    aLat1: number,
    aLng2: number,
    aLat2: number,
    bLng1: number,
    bLat1: number,
    bLng2: number,
    bLat2: number
  ): number {
    const v1x = aLng2 - aLng1
    const v1y = aLat2 - aLat1
    const v2x = bLng2 - bLng1
    const v2y = bLat2 - bLat1
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y)
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y)
    if (mag1 === 0 || mag2 === 0) return 180
    let cos = (v1x * v2x + v1y * v2y) / (mag1 * mag2)
    /* 浮点误差兜底 */
    if (cos > 1) cos = 1
    if (cos < -1) cos = -1
    return (Math.acos(cos) * 180) / Math.PI
  }
}
