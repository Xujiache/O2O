/**
 * @file finance.types.ts
 * @stage P4/T4.30~T4.35（Sprint 5）
 * @desc Finance 模块共享枚举常量与类型字面量
 * @author 单 Agent V2.0
 *
 * 设计依据（不要再创造新枚举档位）：
 *   - P2 05_finance.sql 文件头：account / account_flow / settlement_rule /
 *     settlement_record / withdraw_record / invoice / reconciliation 字段定义
 *   - DESIGN_P4 §七 Finance §7.2 分账规则示例 + §7.3 提现审核流程
 *   - CONSENSUS_P4 §2.6 分账（5 步流程）
 *
 * 本文件提供：
 *   1) AccountOwnerType / AccountStatus 账户主体与启用状态
 *   2) FlowDirection / FlowBizType 账户流水方向 + 8 类业务
 *   3) SettlementRuleScene / SettlementTargetType / SettlementScopeType
 *   4) SettlementRecordStatus 分账记录状态
 *   5) WithdrawStatus 提现 6 档状态机
 *   6) InvoiceApplicantType / InvoiceType / InvoiceTitleType / InvoiceStatus 发票枚举
 *   7) ReconciliationStatus 对账状态（仅供报表服务读取）
 *   8) PLATFORM_OWNER_ID（平台账户固定 owner_id=0；当 owner_type=3 时使用）
 *      ※ 注：P2 05_finance.sql 中 account.owner_type = {1 用户 / 2 商户 / 3 骑手}，
 *           DESIGN_P4 §七要求"平台账户"另需建立；本期为不破坏 owner_type uk_owner
 *           约束，约定 owner_type=3 + owner_id=0 不会与真实骑手 ID 冲突
 *           （骑手 ID 为雪花字符串≥18 位）。后续 SysConfig 可下发覆盖。
 */

/* ============================================================================
 * 1) Account 账户主体与状态
 * ============================================================================ */

/**
 * 账户主体类型枚举（与 P2 05_finance.sql account.owner_type 对齐）
 *   1 用户 / 2 商户 / 3 骑手
 *
 * 注意：分账规则定义中"平台"是 settlement_rule.target_type=3，平台资金归集
 * 复用 owner_type=3 + owner_id="0" 的"平台账户"，由 AccountService.findOrCreate
 * 自动维护。
 */
export const AccountOwnerTypeEnum = {
  USER: 1,
  MERCHANT: 2,
  RIDER: 3
} as const

/** AccountOwnerType 取值（1 / 2 / 3） */
export type AccountOwnerType = (typeof AccountOwnerTypeEnum)[keyof typeof AccountOwnerTypeEnum]

/**
 * 账户启用状态（account.status）
 *   0 冻结 / 1 正常
 */
export const AccountStatusEnum = {
  FROZEN: 0,
  NORMAL: 1
} as const

/** AccountStatus 取值 */
export type AccountStatus = (typeof AccountStatusEnum)[keyof typeof AccountStatusEnum]

/**
 * 平台账户固定 owner_id（owner_type=3 时配合使用）
 * 用途：分账目标 target_type=3 时，AccountService.getOrCreatePlatformAccount() 复用此 ID
 * 注：骑手 ID 由雪花生成（≥18 位），固定 "0" 不会与真实骑手冲突
 */
export const PLATFORM_OWNER_ID = '0'

/* ============================================================================
 * 2) AccountFlow 流水方向 + 业务类型
 * ============================================================================ */

/**
 * 账户流水方向（account_flow.direction）
 *   1 入账 / 2 出账
 */
export const FlowDirectionEnum = {
  IN: 1,
  OUT: 2
} as const

/** FlowDirection 取值（1 / 2） */
export type FlowDirection = (typeof FlowDirectionEnum)[keyof typeof FlowDirectionEnum]

/**
 * 账户流水业务类型（account_flow.biz_type）
 *   1 订单收入 / 2 订单退款 / 3 分账 / 4 提现 / 5 充值 / 6 奖励 / 7 罚款 / 8 调整
 */
export const FlowBizTypeEnum = {
  ORDER_INCOME: 1,
  ORDER_REFUND: 2,
  SETTLEMENT: 3,
  WITHDRAW: 4,
  RECHARGE: 5,
  REWARD: 6,
  PENALTY: 7,
  ADJUST: 8
} as const

/** FlowBizType 取值 */
export type FlowBizType = (typeof FlowBizTypeEnum)[keyof typeof FlowBizTypeEnum]

/* ============================================================================
 * 3) Settlement 规则枚举
 * ============================================================================ */

/**
 * 分账规则场景（settlement_rule.scene）
 *   1 外卖 / 2 跑腿
 */
export const SettlementSceneEnum = {
  TAKEOUT: 1,
  ERRAND: 2
} as const

/** SettlementRuleScene 取值（与 OrderType 同源） */
export type SettlementRuleScene = (typeof SettlementSceneEnum)[keyof typeof SettlementSceneEnum]

/**
 * 分账目标类型（settlement_rule.target_type / settlement_record.target_type）
 *   1 商户 / 2 骑手 / 3 平台
 */
export const SettlementTargetTypeEnum = {
  MERCHANT: 1,
  RIDER: 2,
  PLATFORM: 3
} as const

/** SettlementTargetType 取值 */
export type SettlementTargetType =
  (typeof SettlementTargetTypeEnum)[keyof typeof SettlementTargetTypeEnum]

/**
 * 分账规则生效范围（settlement_rule.scope_type）
 *   1 全局 / 2 城市 / 3 单店
 */
export const SettlementScopeTypeEnum = {
  GLOBAL: 1,
  CITY: 2,
  SHOP: 3
} as const

/** SettlementScopeType 取值 */
export type SettlementScopeType =
  (typeof SettlementScopeTypeEnum)[keyof typeof SettlementScopeTypeEnum]

/* ============================================================================
 * 4) SettlementRecord 状态
 * ============================================================================ */

/**
 * 分账记录状态（settlement_record.status）
 *   0 待执行 / 1 已执行 / 2 失败 / 3 已撤销
 */
export const SettlementRecordStatusEnum = {
  PENDING: 0,
  EXECUTED: 1,
  FAILED: 2,
  REVERSED: 3
} as const

/** SettleStatus 取值 */
export type SettleStatus =
  (typeof SettlementRecordStatusEnum)[keyof typeof SettlementRecordStatusEnum]

/* ============================================================================
 * 5) Withdraw 6 档状态机
 * ============================================================================ */

/**
 * 提现状态（withdraw_record.status）
 *   0 申请 / 1 审核中 / 2 审核驳回 / 3 打款中 / 4 已打款 / 5 打款失败
 *
 * Sprint 5 状态流转：
 *   - apply       → 0 申请 + 余额 → 冻结
 *   - audit pass  → 3 打款中（合并 1 审核中→3 打款中）
 *   - audit reject→ 2 驳回 + 解冻
 *   - payout      → 4 已打款（mock 模式直接置 4）+ 冻结消减
 *   - payout fail → 5 失败 + 解冻
 */
export const WithdrawStatusEnum = {
  APPLIED: 0,
  AUDITING: 1,
  REJECTED: 2,
  PAYING: 3,
  PAID: 4,
  FAILED: 5
} as const

/** WithdrawStatus 取值 */
export type WithdrawStatus = (typeof WithdrawStatusEnum)[keyof typeof WithdrawStatusEnum]

/**
 * 提现主体（withdraw_record.owner_type）
 *   2 商户 / 3 骑手（用户不允许提现）
 */
export const WithdrawOwnerTypeEnum = {
  MERCHANT: 2,
  RIDER: 3
} as const

/** WithdrawOwnerType 取值 */
export type WithdrawOwnerType = (typeof WithdrawOwnerTypeEnum)[keyof typeof WithdrawOwnerTypeEnum]

/* ============================================================================
 * 6) Invoice 枚举
 * ============================================================================ */

/**
 * 发票申请方（invoice.applicant_type）
 *   1 用户 / 2 商户
 */
export const InvoiceApplicantTypeEnum = {
  USER: 1,
  MERCHANT: 2
} as const

/** InvoiceApplicantType 取值 */
export type InvoiceApplicantType =
  (typeof InvoiceApplicantTypeEnum)[keyof typeof InvoiceApplicantTypeEnum]

/**
 * 发票类型（invoice.invoice_type）
 *   1 电子普票 / 2 电子专票 / 3 纸质普票 / 4 纸质专票
 */
export const InvoiceTypeEnum = {
  E_NORMAL: 1,
  E_SPECIAL: 2,
  PAPER_NORMAL: 3,
  PAPER_SPECIAL: 4
} as const

/** InvoiceType 取值 */
export type InvoiceType = (typeof InvoiceTypeEnum)[keyof typeof InvoiceTypeEnum]

/**
 * 发票抬头类型（invoice.title_type）
 *   1 个人 / 2 企业
 */
export const InvoiceTitleTypeEnum = {
  PERSONAL: 1,
  ENTERPRISE: 2
} as const

/** InvoiceTitleType 取值 */
export type InvoiceTitleType = (typeof InvoiceTitleTypeEnum)[keyof typeof InvoiceTitleTypeEnum]

/**
 * 发票状态（invoice.status）
 *   0 申请 / 1 开票中 / 2 已开 / 3 失败 / 4 已作废
 */
export const InvoiceStatusEnum = {
  APPLIED: 0,
  ISSUING: 1,
  ISSUED: 2,
  FAILED: 3,
  VOIDED: 4
} as const

/** InvoiceStatus 取值 */
export type InvoiceStatus = (typeof InvoiceStatusEnum)[keyof typeof InvoiceStatusEnum]

/* ============================================================================
 * 7) Reconciliation 状态（对账报表只读）
 * ============================================================================ */

/**
 * 对账状态（reconciliation.status）
 *   0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理
 */
export const ReconciliationStatusEnum = {
  PENDING: 0,
  BALANCED: 1,
  DIFF: 2,
  PROCESSING: 3,
  RESOLVED: 4
} as const

/** ReconciliationStatus 取值 */
export type ReconciliationStatus =
  (typeof ReconciliationStatusEnum)[keyof typeof ReconciliationStatusEnum]

/* ============================================================================
 * 8) 业务编号前缀
 * ============================================================================ */

/** 流水号前缀（account_flow.flow_no = "AF" + 14 位时间 + 8 位序列） */
export const FLOW_NO_PREFIX = 'AF'
/** 分账单号前缀（settlement_record.settlement_no） */
export const SETTLE_NO_PREFIX = 'ST'
/** 提现单号前缀（withdraw_record.withdraw_no） */
export const WITHDRAW_NO_PREFIX = 'WD'
/** 发票单号前缀（invoice.invoice_no） */
export const INVOICE_NO_PREFIX = 'IV'
/** 对账单号前缀（reconciliation.recon_no） */
export const RECON_NO_PREFIX = 'RC'
