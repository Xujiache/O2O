/**
 * @file sys-config.keys.ts
 * @stage P9/Sprint 3 W3.A.1
 * @desc sys_config 配置 key 常量集中管理 + 默认值约定
 *
 * 约定：
 *   - 命名空间：模块.领域.字段（如 marketing.invite.reward_point）
 *   - 类型语义见各常量文档；DEFAULT_* 为缺配置时 fallback
 *   - 接入方统一调 SysConfigService.get(KEY, DEFAULT) 取值，不再写 process.env / 硬编码
 *
 * 维护：
 *   - 本期落地 5 大类（marketing / dispatch / payment / dispatch.scoring）；后续业务追加同一文件
 *   - 真值由运营人员 INSERT INTO sys_config(config_key, config_value) 写入；config_value 必须是 JSON 字符串
 */

/* =========================================================================
 * marketing.invite.* — 邀请奖励
 * ========================================================================= */
export const SYS_KEY_INVITE_REWARD_POINT = 'marketing.invite.reward_point'
export const DEFAULT_INVITE_REWARD_POINT = 100

/* =========================================================================
 * marketing.event_coupon.* — 触发式发券（按事件类型一对多券模板）
 *   key：marketing.event_coupon.<eventType>，value：[{couponId, qty}, ...]
 * ========================================================================= */
export const SYS_KEY_EVENT_COUPON_PREFIX = 'marketing.event_coupon.'
export const DEFAULT_EVENT_COUPON_CONFIG: Array<{ couponId: string; qty: number }> = []

/* =========================================================================
 * dispatch.* — 派单业务参数
 * ========================================================================= */
export const SYS_KEY_DISPATCH_RESPONSE_TIMEOUT_MS = 'dispatch.response_timeout_ms'
export const DEFAULT_DISPATCH_RESPONSE_TIMEOUT_MS = 15 * 1000

export const SYS_KEY_DISPATCH_MAX_ATTEMPTS = 'dispatch.max_attempts'
export const DEFAULT_DISPATCH_MAX_ATTEMPTS = 3

/* =========================================================================
 * dispatch.scoring — 评分权重（已由 ScoringService 直读，本处仅做 key 映射；
 * 历史保留 30s 独立缓存路径不强制迁移到 SysConfigService）
 * ========================================================================= */
export const SYS_KEY_SCORING = 'dispatch.scoring'

/* =========================================================================
 * payment.refund.* — 退款窗口 / 阈值（预留：本期 refund.service.ts 无自动退款窗口；
 * Sprint 4+ 落地 T+1 auto-refund 时直接 SysConfigService.get(KEY, DEFAULT)）
 * ========================================================================= */
export const SYS_KEY_REFUND_T1_WINDOW_HOURS = 'payment.refund.t1_window_hours'
export const DEFAULT_REFUND_T1_WINDOW_HOURS = 24

export const SYS_KEY_REFUND_AUTO_THRESHOLD = 'payment.refund.auto_threshold'
export const DEFAULT_REFUND_AUTO_THRESHOLD = '50.00'

/* =========================================================================
 * type 别名：同时是类型 + 默认值的 fallback 形态约束
 * ========================================================================= */
export type EventCouponConfig = Array<{ couponId: string; qty: number }>
