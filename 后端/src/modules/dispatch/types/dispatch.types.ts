/**
 * @file dispatch.types.ts
 * @stage P4/T4.36~T4.43（Sprint 6）
 * @desc Dispatch 模块共享枚举、类型与契约定义
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 与 06_dispatch.sql 严格对齐：
 *   dispatch_record.dispatch_mode 1=系统 / 2=抢单 / 3=人工
 *   dispatch_record.status        0=派单中 / 1=接受 / 2=拒绝 / 3=超时 / 4=取消
 *   transfer_record.status        0=申请中 / 1=已转出 / 2=已驳回 / 3=已取消
 *   rider_preference.accept_mode  1=系统派单 / 2=抢单 / 3=派单+抢单
 *
 * 评分细分由 ScoringService 写回 dispatch_record.extra.scoring，便于运营审计算法决策。
 */

/* ============================================================================
 * 1) 派单模式枚举（dispatch_record.dispatch_mode）
 * ============================================================================ */

/**
 * 派单模式
 *   SYSTEM   1 系统智能派单（候选 → 评分 → Top1 → 推送 → 15s 应答）
 *   GRAB     2 抢单（公开抢单池；首抢成功）
 *   MANUAL   3 人工指派（管理后台强制 / 转单审核新指派）
 */
export const DispatchModeEnum = {
  SYSTEM: 1,
  GRAB: 2,
  MANUAL: 3
} as const

/** DispatchMode 取值 */
export type DispatchMode = (typeof DispatchModeEnum)[keyof typeof DispatchModeEnum]

/* ============================================================================
 * 2) 派单状态枚举（dispatch_record.status）
 * ============================================================================ */

/**
 * 派单状态
 *   PENDING   0 派单中（已推送，等待应答）
 *   ACCEPTED  1 已接受
 *   REJECTED  2 拒绝
 *   TIMEOUT   3 超时未应答（worker 触发）
 *   CANCELED  4 取消（运营撤回 / 上游取消订单）
 */
export const DispatchStatusEnum = {
  PENDING: 0,
  ACCEPTED: 1,
  REJECTED: 2,
  TIMEOUT: 3,
  CANCELED: 4
} as const

/** DispatchStatus 取值 */
export type DispatchStatus = (typeof DispatchStatusEnum)[keyof typeof DispatchStatusEnum]

/* ============================================================================
 * 3) 转单状态枚举（transfer_record.status）
 * ============================================================================ */

/**
 * 转单状态
 *   PENDING   0 申请中（骑手已提交，待运营审核）
 *   PASSED    1 已转出（运营 pass，原骑手释放，触发重新派单 / 直接指派 toRider）
 *   REJECTED  2 已驳回
 *   CANCELED  3 已取消（骑手撤回）
 */
export const TransferStatusEnum = {
  PENDING: 0,
  PASSED: 1,
  REJECTED: 2,
  CANCELED: 3
} as const

/** TransferStatus 取值 */
export type TransferStatus = (typeof TransferStatusEnum)[keyof typeof TransferStatusEnum]

/* ============================================================================
 * 4) 接单模式枚举（rider_preference.accept_mode）
 * ============================================================================ */

/**
 * 接单模式
 *   SYSTEM_ONLY  1 仅系统派单
 *   GRAB_ONLY    2 仅抢单
 *   BOTH         3 派单 + 抢单（兼容两端）
 */
export const AcceptModeEnum = {
  SYSTEM_ONLY: 1,
  GRAB_ONLY: 2,
  BOTH: 3
} as const

/** AcceptMode 取值 */
export type AcceptMode = (typeof AcceptModeEnum)[keyof typeof AcceptModeEnum]

/* ============================================================================
 * 5) 订单类型 / 黑名单 type 复用
 *    避免循环依赖，本模块不直接 import @/modules/order/types
 * ============================================================================ */

/** 订单类型：1 外卖 / 2 跑腿（与 OrderTypeEnum 对齐） */
export const OrderTypeForDispatch = {
  TAKEOUT: 1,
  ERRAND: 2
} as const

/** 订单类型联合 */
export type OrderTypeForDispatch = (typeof OrderTypeForDispatch)[keyof typeof OrderTypeForDispatch]

/* ============================================================================
 * 6) 派单评分细分（写入 dispatch_record.extra.scoring）
 * ============================================================================ */

/**
 * 评分明细：用于审计算法决策与运营调权
 *   - distanceScore     [0,1] 距离衰减分（exp(-distKm/3)）
 *   - capacityScore     [0,1] 运力剩余比例（1 - currentOrders/maxConcurrent）
 *   - routeMatchScore   {0|1} 顺路 1.0；否则 0
 *   - riderRatingScore  [0,1] 骑手评分归一化（rider.score / 5）
 *   - penalty           ≥0   罚分（近 2h 拒单次数 * 0.1）
 *   - distanceM         整数  骑手到取件点距离（米）
 *   - finalScore        最终加权后的总分（service 层落库存到 dispatch_record.score）
 *   - weights           本次评分使用的权重（便于审计 sys_config 调整效果）
 */
export interface ScoringBreakdown {
  distanceScore: number
  capacityScore: number
  routeMatchScore: number
  riderRatingScore: number
  penalty: number
  distanceM: number
  finalScore: number
  weights: ScoringWeights
}

/* ============================================================================
 * 7) 评分权重配置
 *    权重值为相对比例（默认 40/30/20/10 = 100），相加无需必为 1；
 *    评分公式：sum(wi * subScoreI) - penalty
 * ============================================================================ */

/**
 * 评分权重（PRD/CONSENSUS §2.3）
 *   distance   距离权重（默认 40）
 *   capacity   运力权重（默认 30）
 *   routeMatch 顺路权重（默认 20）
 *   rating     骑手评分权重（默认 10）
 */
export interface ScoringWeights {
  distance: number
  capacity: number
  routeMatch: number
  rating: number
}

/** 默认评分权重（sys_config.dispatch.scoring 缺失时兜底） */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  distance: 40,
  capacity: 30,
  routeMatch: 20,
  rating: 10
}

/* ============================================================================
 * 8) 候选骑手 + 派单订单上下文
 * ============================================================================ */

/**
 * 派单订单上下文
 * 用途：CandidateService / ScoringService / RouteMatchService 共用入参
 *
 * 字段：
 *   - orderNo      订单号 18 位
 *   - orderType    1 外卖 / 2 跑腿
 *   - serviceType  跑腿子类型（1 帮送 / 2 帮买 / 3 帮取 / 4 帮排队），外卖为 null
 *   - cityCode     城市编码（GEO key 用 rider:online:{cityCode}）
 *   - pickupLng/Lat 取件点经纬度
 *   - deliveryLng/Lat 送达点经纬度（用于顺路单方向计算；可空 null 时跳过 routeMatch）
 */
export interface DispatchOrderContext {
  orderNo: string
  orderType: OrderTypeForDispatch
  serviceType: number | null
  cityCode: string
  pickupLng: number
  pickupLat: number
  deliveryLng: number | null
  deliveryLat: number | null
}

/**
 * 候选骑手
 * 用途：CandidateService 输出 → ScoringService 输入
 *
 * 字段：
 *   - riderId       骑手 ID
 *   - lng / lat     当前位置（GEO 取出）
 *   - distanceKm    骑手到取件点直线距离（GEO ASC 排序）
 *   - distanceM     上一字段乘 1000 取整
 *   - riderScore    骑手评分（0~5；缺失时 service 层补 5 满分）
 *   - currentOrders 当前进行中订单数（来自 Redis Set 计数）
 *   - maxConcurrent 偏好同时配送最大数（rider_preference.accept_max_concurrent）
 */
export interface RiderCandidate {
  riderId: string
  lng: number
  lat: number
  distanceKm: number
  distanceM: number
  riderScore: number
  currentOrders: number
  maxConcurrent: number
}

/**
 * 评分后的候选 + 排名信息
 * 用途：DispatchService 选 Top1 后入库 dispatch_record
 */
export interface RankedCandidate {
  candidate: RiderCandidate
  breakdown: ScoringBreakdown
}
