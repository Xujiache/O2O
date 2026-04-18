/**
 * @file rabbitmq.constants.ts
 * @stage P3 / T3.13
 * @desc RabbitMQ 队列 / 交换机 / 路由键 常量；与员工 C 的 rider.location 队列不冲突
 * @author 员工 B
 *
 * 拓扑（DESIGN_P3 §4.1）：
 *   - exchange      : `o2o.message`        （direct）
 *   - main queue    : `message.push`        routing-key = `message.push`
 *   - retry exchange: `o2o.message.retry`   （direct，TTL 退避）
 *   - retry queue   : `message.push.retry`  routing-key = `message.push.retry`
 *                     消息 TTL = 60s（指数退避基线）；过期后路由回主交换机重新消费
 *   - dead exchange : `o2o.message.dead`    （direct）
 *   - dead queue    : `message.push.dead`   routing-key = `message.push.dead`
 *
 * 失败重试（任务硬性约束 9）：
 *   - Consumer 内 catch → ① attempt < 3 → publish 到 retry queue
 *                         ② attempt >= 3 → publish 到 dead queue
 */
export const MESSAGE_EXCHANGE = 'o2o.message'
export const MESSAGE_RETRY_EXCHANGE = 'o2o.message.retry'
export const MESSAGE_DEAD_EXCHANGE = 'o2o.message.dead'

export const MESSAGE_QUEUE = 'message.push'
export const MESSAGE_RETRY_QUEUE = 'message.push.retry'
export const MESSAGE_DEAD_QUEUE = 'message.push.dead'

export const MESSAGE_ROUTING_KEY = 'message.push'
export const MESSAGE_RETRY_ROUTING_KEY = 'message.push.retry'
export const MESSAGE_DEAD_ROUTING_KEY = 'message.push.dead'

/** 失败重试 TTL（毫秒）；过期后回到主队列 */
export const MESSAGE_RETRY_TTL_MS = 60_000

/** 最大尝试次数（包含首次） */
export const MESSAGE_MAX_ATTEMPTS = 3

/** Consumer prefetch（同时处理 8 条） */
export const MESSAGE_PREFETCH = 8
