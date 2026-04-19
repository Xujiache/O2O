/**
 * @file order.types.ts
 * @stage P4/T4.14（Sprint 3）
 * @desc 订单领域常量 / 状态枚举 / 操作来源 / 业务事件名 / 通用 type 出口
 * @author 单 Agent V2.0
 *
 * 设计依据（不要再创造新枚举）：
 *   - P2 04_order.sql 文件头：外卖 / 跑腿 各 10 档状态
 *   - DESIGN_P4 §二 Order 状态机
 *   - CONSENSUS_P4 §2.9 事件总线
 *
 * 本文件提供：
 *   1) OrderTypeEnum / OrderTakeoutStatusEnum / OrderErrandStatusEnum / OrderPayStatusEnum
 *      / OrderOpTypeEnum 五大枚举常量（const + 字面量类型）
 *   2) OrderEventName 字面量联合（与 events/order-events.constants.ts 同源）
 *   3) TransitionContext / TransitionResult 状态机交互结构
 *   4) AddressSnapshot / ShopSnapshot 下单时冻结的快照结构
 *   5) OrderRecord（service 通用查询拼装的 raw 行精简型）
 */

/* ============================================================================
 * 1) 订单类型
 * ============================================================================ */

/**
 * 订单类型枚举
 * - 1 外卖（OrderTakeout，order_takeout_YYYYMM）
 * - 2 跑腿（OrderErrand，order_errand_YYYYMM；本 Subagent 不实现，仅常量供其他 service 引用）
 */
export const OrderTypeEnum = {
  TAKEOUT: 1,
  ERRAND: 2
} as const

/** OrderType 取值（1 / 2） */
export type OrderType = (typeof OrderTypeEnum)[keyof typeof OrderTypeEnum]

/* ============================================================================
 * 2) 状态枚举
 *    严格对齐 P2 04_order.sql 文件头注释：禁止增删枚举档位
 * ============================================================================ */

/**
 * 外卖订单状态（10 档）
 *   0  待支付
 *   5  已关闭（支付超时）
 *   10 待接单
 *   20 已接单待出餐
 *   30 出餐完成待取
 *   40 配送中
 *   50 已送达待确认
 *   55 已完成
 *   60 已取消
 *   70 售后中
 */
export const OrderTakeoutStatusEnum = {
  PENDING_PAY: 0,
  CLOSED_PAY_TIMEOUT: 5,
  PENDING_ACCEPT: 10,
  ACCEPTED: 20,
  READY: 30,
  IN_DELIVERY: 40,
  DELIVERED: 50,
  FINISHED: 55,
  CANCELED: 60,
  AFTER_SALE: 70
} as const

/** 外卖状态值联合（0 / 5 / 10 / 20 / 30 / 40 / 50 / 55 / 60 / 70） */
export type OrderTakeoutStatus =
  (typeof OrderTakeoutStatusEnum)[keyof typeof OrderTakeoutStatusEnum]

/**
 * 跑腿订单状态（10 档）
 *   0  待支付
 *   5  已关闭（支付超时）
 *   10 待接单
 *   20 骑手已接单
 *   30 已取件
 *   40 配送中
 *   50 已送达待确认
 *   55 已完成
 *   60 已取消
 *   70 售后中
 */
export const OrderErrandStatusEnum = {
  PENDING_PAY: 0,
  CLOSED_PAY_TIMEOUT: 5,
  PENDING_ACCEPT: 10,
  ACCEPTED: 20,
  PICKED: 30,
  IN_DELIVERY: 40,
  DELIVERED: 50,
  FINISHED: 55,
  CANCELED: 60,
  AFTER_SALE: 70
} as const

/** 跑腿状态值联合 */
export type OrderErrandStatus = (typeof OrderErrandStatusEnum)[keyof typeof OrderErrandStatusEnum]

/** 终态状态：到达后不再迁移 */
export const ORDER_TERMINAL_STATUSES: ReadonlyArray<number> = [
  OrderTakeoutStatusEnum.CLOSED_PAY_TIMEOUT,
  OrderTakeoutStatusEnum.FINISHED,
  OrderTakeoutStatusEnum.CANCELED
]

/**
 * 支付状态
 *   0 未支付 / 1 支付中 / 2 已支付 / 3 已退款 / 4 部分退款
 */
export const OrderPayStatusEnum = {
  UNPAID: 0,
  PAYING: 1,
  PAID: 2,
  REFUNDED: 3,
  PARTIAL_REFUNDED: 4
} as const

/** 支付状态值联合 */
export type OrderPayStatus = (typeof OrderPayStatusEnum)[keyof typeof OrderPayStatusEnum]

/**
 * 状态变更操作来源（写 order_status_log.op_type）
 *   1 用户 / 2 商户 / 3 骑手 / 4 管理员 / 5 系统
 */
export const OrderOpTypeEnum = {
  USER: 1,
  MERCHANT: 2,
  RIDER: 3,
  ADMIN: 4,
  SYSTEM: 5
} as const

/** OpType 值联合 */
export type OrderOpType = (typeof OrderOpTypeEnum)[keyof typeof OrderOpTypeEnum]

/* ============================================================================
 * 3) 业务事件名
 *    与 events/order-events.constants.ts 中 OrderEventNames 同源；这里只引用
 *    类型字面量；常量定义保留在 events/ 目录避免重复导出
 * ============================================================================ */

/**
 * 订单业务事件字面量
 *
 * 对齐 CONSENSUS_P4 §2.9 事件总线 + 用户给定接口表：
 *   OrderCreated     —— 下单成功（Agent 1，本 Subagent）
 *   OrderPaid        —— 支付成功（Sprint 4 Payment 触发）
 *   OrderAccepted    —— 商户接单 / 骑手接跑腿单
 *   OrderRejected    —— 商户拒单
 *   OrderReady       —— 商户出餐完成
 *   OrderPicked      —— 骑手取餐 / 取件
 *   OrderDelivered   —— 骑手送达
 *   OrderFinished    —— 用户确认收货 / 自动确认
 *   OrderCanceled    —— 取消（用户 / 超时 / 商户拒单 / 强制 / 售后退款）
 */
export type OrderEventName =
  | 'OrderCreated'
  | 'OrderPaid'
  | 'OrderAccepted'
  | 'OrderRejected'
  | 'OrderReady'
  | 'OrderPicked'
  | 'OrderDelivered'
  | 'OrderFinished'
  | 'OrderCanceled'

/* ============================================================================
 * 4) 状态机交互结构
 * ============================================================================ */

/**
 * 状态机迁移上下文
 * 用途：OrderStateMachine.transit(orderNo, orderType, event, ctx)
 *
 * 字段：
 *   - opType   操作来源（必传，写 order_status_log.op_type）
 *   - opId     操作者 ID（系统操作时为 null）
 *   - opIp     操作 IP（可选；存 VARBINARY(16)）
 *   - remark   备注（如取消原因 / 拒单原因）
 *   - extra    扩展（如经纬度 / 设备号；写入 order_status_log.extra JSON）
 *   - additionalFields 同事务内更新到主单的额外字段 key→DB 列 / value（如 acceptAt / readyAt）
 *   - eventPayloadExtra 事件 payload 透传给 OrderEventsPublisher 的 extra 字段
 *   - skipPublish 是否跳过事件发布（默认 false；批量内部迁移时可置 true，自行汇总后再发）
 */
export interface TransitionContext {
  opType: OrderOpType
  opId: string | null
  opIp?: Buffer | null
  remark?: string | null
  extra?: Record<string, unknown> | null
  additionalFields?: Record<string, string | number | Date | null>
  eventPayloadExtra?: Record<string, unknown>
  skipPublish?: boolean
}

/**
 * 状态机迁移结果
 * 字段：
 *   - orderNo / orderType / event：透传
 *   - fromStatus / toStatus：本次迁移前后状态
 *   - statusLogId：order_status_log_YYYYMM 新增日志主键
 *   - occurredAt：事务提交时间（毫秒时间戳，用于事件 payload）
 */
export interface TransitionResult {
  orderNo: string
  orderType: OrderType
  event: OrderEventName
  fromStatus: number | null
  toStatus: number
  statusLogId: string
  occurredAt: number
}

/* ============================================================================
 * 5) 下单时冻结的快照结构（service 写 JSON 列）
 * ============================================================================ */

/**
 * 收货地址快照（写入 order_takeout.address_snapshot JSON）
 *
 * 字段说明：
 *   - addressId        引用的用户地址 ID（user_address.id；可能为 null：临时一次性地址）
 *   - receiverName     收货人姓名（必传）
 *   - receiverMobile   收货人手机（明文 / 调用方决定是否脱敏；本 Subagent 直接落 JSON）
 *   - province / city / district 行政区
 *   - detail           详细地址
 *   - lng / lat        坐标（用于 withinArea / 派单距离计算）
 *   - tag              标签（家 / 公司 / 学校 等）
 */
export interface AddressSnapshot {
  addressId: string | null
  receiverName: string
  receiverMobile: string
  province: string
  city: string
  district: string
  detail: string
  lng: number
  lat: number
  tag?: string | null
  [extra: string]: unknown
}

/**
 * 店铺快照（写入 order_takeout.shop_snapshot JSON）
 *
 * 字段说明：
 *   - shopId / merchantId / name / phone / address：用于历史订单展示，避免店铺改名后无法溯源
 *   - lng / lat：派单 / 距离展示
 *   - cityCode / districtCode：分账 / 分组
 */
export interface ShopSnapshot {
  shopId: string
  merchantId: string
  name: string
  phone?: string | null
  address: string
  lng: number
  lat: number
  cityCode: string
  districtCode: string
  [extra: string]: unknown
}

/* ============================================================================
 * 6) Service 通用结果（统一行模型，避免 service 内多处 raw row）
 * ============================================================================ */

/**
 * 订单通用查询结果（外卖 + 跑腿都要回传给 status-machine 用）
 * 字段：来自分表的关键列，由 OrderShardingHelper + raw query 拼装
 */
export interface OrderCoreRecord {
  /** 订单类型，service 根据查询表前缀回填 */
  orderType: OrderType
  /** 物理表 yyyymm（如 '202604'），便于上层下钻 */
  shardYyyymm: string
  /** 主键 */
  id: string
  /** 业务订单号 18 位 */
  orderNo: string
  /** 用户 ID */
  userId: string
  /** 店铺 ID（外卖才有；跑腿 null） */
  shopId: string | null
  /** 商户 ID（外卖才有；跑腿 null） */
  merchantId: string | null
  /** 骑手 ID */
  riderId: string | null
  /** 当前状态（外卖 / 跑腿各自枚举档位） */
  status: number
  /** 当前支付状态 */
  payStatus: number
  /** 应付金额（元，字符串） */
  payAmount: string
  /** 创建时间 */
  createdAt: Date
}
