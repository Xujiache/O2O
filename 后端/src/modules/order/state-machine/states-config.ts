/**
 * @file states-config.ts
 * @stage P4/T4.15（Sprint 3）
 * @desc 外卖 / 跑腿订单状态机变迁表（不可变常量）
 * @author 单 Agent V2.0
 *
 * 状态机模型：
 *   Map<fromStatus, Map<eventName, { to: nextStatus; opType: OrderOpType }>>
 *
 * 设计依据：
 *   - P2 04_order.sql 文件头 10 档枚举
 *   - DESIGN_P4 §二 / CONSENSUS_P4 §2.1
 *   - 用户给定状态变迁矩阵（任务书 §7.1）
 *
 * 不变量：
 *   - 终态（5 / 55 / 60）不出现在 from key 中（不可再迁移；如售后中 70 由 Sprint 7 Review 接入）
 *   - opType 由变迁默认；如调用方需要更精确（如系统/管理员强制取消同走 60），可在 transit 入参覆盖
 *   - SystemReassign / Resolved 等 Sprint 6+ 才需要的事件先在跑腿表预留注释
 */

import { OrderOpTypeEnum, type OrderEventName, type OrderOpType } from '../types/order.types'

/**
 * 单条变迁配置
 *   - to     目标状态
 *   - opType 默认操作来源（写 order_status_log.op_type；transit ctx.opType 优先）
 */
export interface TransitionConfig {
  to: number
  opType: OrderOpType
}

/* ============================================================================
 * 外卖订单状态变迁表
 * ============================================================================ */

/**
 * 外卖状态变迁表（10 档）
 *
 * 状态档位（与 P2 04_order.sql 文件头一致）：
 *   0 待支付 / 5 已关闭(支付超时) / 10 待接单 / 20 已接单待出餐 / 30 出餐完成待取
 *   40 配送中 / 50 已送达待确认 / 55 已完成 / 60 已取消 / 70 售后中
 *
 * 变迁矩阵（用户任务书 §7.1）：
 *   0  → { OrderPaid:10, OrderCanceled:60(用户取消), 系统超时关单 -> 60 + reason='PayTimeout' }
 *   10 → { OrderAccepted:20, OrderRejected:60, OrderCanceled:60 }
 *   20 → { OrderReady:30 }
 *   30 → { OrderPicked:40 }
 *   40 → { OrderDelivered:50 }
 *   50 → { OrderFinished:55 }
 *   55 / 60 / 5 / 70 终态
 */
export const TAKEOUT_TRANSITIONS: ReadonlyMap<
  number,
  ReadonlyMap<OrderEventName, TransitionConfig>
> = new Map<number, ReadonlyMap<OrderEventName, TransitionConfig>>([
  [
    0,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderPaid', { to: 10, opType: OrderOpTypeEnum.SYSTEM }],
      ['OrderCanceled', { to: 60, opType: OrderOpTypeEnum.USER }]
    ])
  ],
  [
    10,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderAccepted', { to: 20, opType: OrderOpTypeEnum.MERCHANT }],
      ['OrderRejected', { to: 60, opType: OrderOpTypeEnum.MERCHANT }],
      ['OrderCanceled', { to: 60, opType: OrderOpTypeEnum.USER }]
    ])
  ],
  [
    20,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderReady', { to: 30, opType: OrderOpTypeEnum.MERCHANT }]
    ])
  ],
  [
    30,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderPicked', { to: 40, opType: OrderOpTypeEnum.RIDER }]
    ])
  ],
  [
    40,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderDelivered', { to: 50, opType: OrderOpTypeEnum.RIDER }]
    ])
  ],
  [
    50,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderFinished', { to: 55, opType: OrderOpTypeEnum.USER }]
    ])
  ]
])

/* ============================================================================
 * 跑腿订单状态变迁表（仅供 OrderStateMachine 通用化用，本 Subagent 不直接驱动）
 * ============================================================================ */

/**
 * 跑腿状态变迁表
 *
 * 状态档位：
 *   0 待支付 / 10 待接单 / 20 骑手已接单 / 30 已取件 / 40 配送中
 *   50 已送达待确认 / 55 已完成 / 60 已取消 / 5 已关闭
 *
 * 注：跑腿主流程（OrderAccepted by 骑手 / OrderPicked / OrderDelivered / 转单 等）
 *      由 Subagent 2 实现，本 Subagent 提供完整的"通用 transit"，不重复绑定接口；
 *      Subagent 2 在自己的 controller / service 中调 transit('OrderAccepted', ...) 即可。
 */
export const ERRAND_TRANSITIONS: ReadonlyMap<
  number,
  ReadonlyMap<OrderEventName, TransitionConfig>
> = new Map<number, ReadonlyMap<OrderEventName, TransitionConfig>>([
  [
    0,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderPaid', { to: 10, opType: OrderOpTypeEnum.SYSTEM }],
      ['OrderCanceled', { to: 60, opType: OrderOpTypeEnum.USER }]
    ])
  ],
  [
    10,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderAccepted', { to: 20, opType: OrderOpTypeEnum.RIDER }],
      ['OrderCanceled', { to: 60, opType: OrderOpTypeEnum.USER }]
    ])
  ],
  [
    20,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderPicked', { to: 30, opType: OrderOpTypeEnum.RIDER }]
    ])
  ],
  [
    30,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderDelivered', { to: 40, opType: OrderOpTypeEnum.RIDER }]
    ])
  ],
  [
    40,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderDelivered', { to: 50, opType: OrderOpTypeEnum.RIDER }]
    ])
  ],
  [
    50,
    new Map<OrderEventName, TransitionConfig>([
      ['OrderFinished', { to: 55, opType: OrderOpTypeEnum.USER }]
    ])
  ]
])

/**
 * 取指定订单类型的变迁表
 * 参数：orderType 1 外卖 / 2 跑腿
 * 返回值：ReadonlyMap<from, ReadonlyMap<event, config>>
 */
export function getTransitionsTable(
  orderType: number
): ReadonlyMap<number, ReadonlyMap<OrderEventName, TransitionConfig>> {
  if (orderType === 1) return TAKEOUT_TRANSITIONS
  if (orderType === 2) return ERRAND_TRANSITIONS
  return new Map()
}
