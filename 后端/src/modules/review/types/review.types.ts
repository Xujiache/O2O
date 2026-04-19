/**
 * @file review.types.ts
 * @stage P4/T4.44~T4.48（Sprint 7）
 * @desc 评价 / 申诉 / 投诉 / 工单 / 仲裁 / 售后域共享枚举与跨模块依赖契约
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 一、状态枚举（与 08_review.sql / 04_order.sql 文件头一致；禁止增删档位）
 *
 *   Review.targetType        1 店铺 / 2 商品 / 3 骑手 / 4 综合
 *   ReviewReply.replierType  1 商户 / 2 平台官方
 *
 *   ReviewAppeal.appellantType 1 商户 / 2 骑手
 *   ReviewAppeal.status        0 申诉中 / 1 通过(评价已隐藏) / 2 驳回
 *
 *   Complaint.complainantType 1 用户 / 2 商户 / 3 骑手
 *   Complaint.targetType      1 用户 / 2 商户 / 3 骑手 / 4 平台
 *   Complaint.severity        1 一般 / 2 中等 / 3 严重
 *   Complaint.status          0 待处理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 转仲裁
 *
 *   Arbitration.sourceType    1 售后转仲裁 / 2 投诉转仲裁 / 3 主动申请
 *   Arbitration.applicantType 1 用户 / 2 商户 / 3 骑手
 *   Arbitration.respondentType 同上
 *   Arbitration.status        0 待审 / 1 审理中 / 2 已裁决 / 3 已关闭
 *   Arbitration.decision      1 申请方胜 / 2 被申请方胜 / 3 部分支持 / 4 驳回
 *
 *   Ticket.submitterType      1 用户 / 2 商户 / 3 骑手
 *   Ticket.priority           1 低 / 2 中 / 3 高 / 4 紧急
 *   Ticket.status             0 待受理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 已转单
 *   Ticket.lastReplyByType    1 提交方 / 2 客服
 *
 *   OrderAfterSale.type       1 仅退款 / 2 退货退款 / 3 换货 / 4 投诉
 *   OrderAfterSale.status     0 申请中 / 10 商户处理中 / 20 平台仲裁中 /
 *                             30 已同意 / 40 已拒绝 / 50 已退款 / 60 已关闭
 *
 * 二、跨模块依赖契约
 *   本 Subagent 不直接 import OrderService / RefundService 类（避免与并行 Subagent 1/3
 *   交付节奏耦合 + Order 表按月分表查询逻辑应内聚于 OrderService）。
 *   通过 Symbol token 注入两个能力契约：
 *     - REVIEW_DEP_ORDER_SERVICE  : 查订单核心字段
 *     - REVIEW_DEP_REFUND_SERVICE : 创建退款单
 *   parent agent 在最终装配时以 useExisting: <真实 Service> 注册到本 token，
 *   或在 Sprint 8 orchestration 桥接层桥接。
 */

/* ============================================================================
 * 1) 评价（Review）
 * ============================================================================ */

/** 评价对象类型枚举 */
export const ReviewTargetTypeEnum = {
  /** 店铺 */
  SHOP: 1,
  /** 商品 */
  PRODUCT: 2,
  /** 骑手 */
  RIDER: 3,
  /** 综合 */
  COMPOSITE: 4
} as const

/** 评价对象类型联合 */
export type ReviewTargetType = (typeof ReviewTargetTypeEnum)[keyof typeof ReviewTargetTypeEnum]

/** 评价对象类型可选值数组（DTO 层 IsIn 校验） */
export const REVIEW_TARGET_TYPES = [1, 2, 3, 4] as const

/** 评价分数取值范围（1~5） */
export const REVIEW_SCORE_VALUES = [1, 2, 3, 4, 5] as const

/** 差评阈值（≤ 3 视为差评，可申诉） */
export const REVIEW_BAD_SCORE_MAX = 3

/** 提交评价的有效期（天，自 finished_at 起算） */
export const REVIEW_VALID_DAYS = 15

/** 修改评价的窗口（小时，自 created_at 起算） */
export const REVIEW_EDIT_WINDOW_HOURS = 24

/** 申诉差评的有效期（天，自 review.created_at 起算） */
export const REVIEW_APPEAL_VALID_DAYS = 7

/** 一笔订单允许评价的状态（OrderTakeoutStatusEnum.FINISHED 与 OrderErrandStatusEnum.FINISHED 同值） */
export const REVIEW_ALLOWED_ORDER_STATUS = 55

/* ============================================================================
 * 2) 评价回复（ReviewReply）
 * ============================================================================ */

/** 回复方枚举 */
export const ReplierTypeEnum = {
  /** 商户 */
  MERCHANT: 1,
  /** 平台官方 */
  PLATFORM: 2
} as const

/** 回复方类型联合 */
export type ReplierType = (typeof ReplierTypeEnum)[keyof typeof ReplierTypeEnum]

/* ============================================================================
 * 3) 评价申诉（ReviewAppeal）
 * ============================================================================ */

/** 申诉方枚举 */
export const AppellantTypeEnum = {
  /** 商户 */
  MERCHANT: 1,
  /** 骑手 */
  RIDER: 2
} as const

/** 申诉方类型联合 */
export type AppellantType = (typeof AppellantTypeEnum)[keyof typeof AppellantTypeEnum]

/** 申诉状态枚举 */
export const AppealStatusEnum = {
  /** 申诉中（待审） */
  PENDING: 0,
  /** 通过（评价已隐藏） */
  PASSED: 1,
  /** 驳回 */
  REJECTED: 2
} as const

/** 申诉状态联合 */
export type AppealStatus = (typeof AppealStatusEnum)[keyof typeof AppealStatusEnum]

/** 申诉审核动作 */
export type AppealAuditAction = 'pass' | 'reject'

/* ============================================================================
 * 4) 投诉（Complaint）
 * ============================================================================ */

/** 投诉方枚举 */
export const ComplainantTypeEnum = {
  /** 用户 */
  USER: 1,
  /** 商户 */
  MERCHANT: 2,
  /** 骑手 */
  RIDER: 3
} as const

/** 投诉方类型联合 */
export type ComplainantType = (typeof ComplainantTypeEnum)[keyof typeof ComplainantTypeEnum]

/** 被投诉对象枚举（注意 4 平台时 target_id 为 NULL） */
export const ComplaintTargetTypeEnum = {
  /** 用户 */
  USER: 1,
  /** 商户 */
  MERCHANT: 2,
  /** 骑手 */
  RIDER: 3,
  /** 平台 */
  PLATFORM: 4
} as const

/** 被投诉对象类型联合 */
export type ComplaintTargetType =
  (typeof ComplaintTargetTypeEnum)[keyof typeof ComplaintTargetTypeEnum]

/** 投诉严重等级枚举 */
export const ComplaintSeverityEnum = {
  /** 一般 */
  GENERAL: 1,
  /** 中等 */
  MEDIUM: 2,
  /** 严重 */
  SEVERE: 3
} as const

/** 投诉严重等级联合 */
export type ComplaintSeverity = (typeof ComplaintSeverityEnum)[keyof typeof ComplaintSeverityEnum]

/** 投诉状态枚举 */
export const ComplaintStatusEnum = {
  /** 待处理 */
  PENDING: 0,
  /** 处理中 */
  PROCESSING: 1,
  /** 已解决 */
  RESOLVED: 2,
  /** 已关闭 */
  CLOSED: 3,
  /** 转仲裁 */
  ESCALATED: 4
} as const

/** 投诉状态联合 */
export type ComplaintStatus = (typeof ComplaintStatusEnum)[keyof typeof ComplaintStatusEnum]

/** 投诉处理动作（admin handle） */
export type ComplaintHandleAction = 'resolve' | 'close'

/* ============================================================================
 * 5) 仲裁（Arbitration）
 * ============================================================================ */

/** 仲裁来源枚举 */
export const ArbitrationSourceTypeEnum = {
  /** 售后转仲裁 */
  AFTER_SALE: 1,
  /** 投诉转仲裁 */
  COMPLAINT: 2,
  /** 主动申请 */
  DIRECT: 3
} as const

/** 仲裁来源联合 */
export type ArbitrationSourceType =
  (typeof ArbitrationSourceTypeEnum)[keyof typeof ArbitrationSourceTypeEnum]

/** 仲裁参与方枚举（applicant / respondent 共用） */
export const ArbitrationPartyTypeEnum = {
  /** 用户 */
  USER: 1,
  /** 商户 */
  MERCHANT: 2,
  /** 骑手 */
  RIDER: 3
} as const

/** 仲裁参与方类型联合 */
export type ArbitrationPartyType =
  (typeof ArbitrationPartyTypeEnum)[keyof typeof ArbitrationPartyTypeEnum]

/** 仲裁状态枚举 */
export const ArbitrationStatusEnum = {
  /** 待审 */
  PENDING: 0,
  /** 审理中 */
  REVIEWING: 1,
  /** 已裁决 */
  JUDGED: 2,
  /** 已关闭 */
  CLOSED: 3
} as const

/** 仲裁状态联合 */
export type ArbitrationStatus = (typeof ArbitrationStatusEnum)[keyof typeof ArbitrationStatusEnum]

/** 裁决结果枚举 */
export const ArbitrationDecisionEnum = {
  /** 申请方胜 */
  APPLICANT_WIN: 1,
  /** 被申请方胜 */
  RESPONDENT_WIN: 2,
  /** 部分支持 */
  PARTIAL: 3,
  /** 驳回 */
  REJECTED: 4
} as const

/** 裁决结果联合 */
export type ArbitrationDecision =
  (typeof ArbitrationDecisionEnum)[keyof typeof ArbitrationDecisionEnum]

/* ============================================================================
 * 6) 工单（Ticket）
 * ============================================================================ */

/** 工单提交方枚举 */
export const TicketSubmitterTypeEnum = {
  /** 用户 */
  USER: 1,
  /** 商户 */
  MERCHANT: 2,
  /** 骑手 */
  RIDER: 3
} as const

/** 工单提交方联合 */
export type TicketSubmitterType =
  (typeof TicketSubmitterTypeEnum)[keyof typeof TicketSubmitterTypeEnum]

/** 工单优先级枚举 */
export const TicketPriorityEnum = {
  /** 低 */
  LOW: 1,
  /** 中 */
  NORMAL: 2,
  /** 高 */
  HIGH: 3,
  /** 紧急 */
  URGENT: 4
} as const

/** 工单优先级联合 */
export type TicketPriority = (typeof TicketPriorityEnum)[keyof typeof TicketPriorityEnum]

/** 工单状态枚举 */
export const TicketStatusEnum = {
  /** 待受理 */
  PENDING: 0,
  /** 处理中 */
  PROCESSING: 1,
  /** 已解决 */
  RESOLVED: 2,
  /** 已关闭 */
  CLOSED: 3,
  /** 已转单 */
  TRANSFERRED: 4
} as const

/** 工单状态联合 */
export type TicketStatus = (typeof TicketStatusEnum)[keyof typeof TicketStatusEnum]

/** 工单回复方枚举（last_reply_by_type） */
export const TicketReplyByTypeEnum = {
  /** 提交方 */
  SUBMITTER: 1,
  /** 客服 */
  CS: 2
} as const

/** 工单回复方联合 */
export type TicketReplyByType = (typeof TicketReplyByTypeEnum)[keyof typeof TicketReplyByTypeEnum]

/* ============================================================================
 * 7) 售后工单（OrderAfterSale）
 * ============================================================================ */

/** 售后类型枚举 */
export const AfterSaleTypeEnum = {
  /** 仅退款 */
  REFUND_ONLY: 1,
  /** 退货退款 */
  RETURN_AND_REFUND: 2,
  /** 换货 */
  EXCHANGE: 3,
  /** 投诉 */
  COMPLAINT: 4
} as const

/** 售后类型联合 */
export type AfterSaleType = (typeof AfterSaleTypeEnum)[keyof typeof AfterSaleTypeEnum]

/** 售后工单状态枚举（数值跨度 0/10/20/30/40/50/60；与 04_order.sql 严格对齐） */
export const AfterSaleStatusEnum = {
  /** 申请中 */
  APPLYING: 0,
  /** 商户处理中 */
  MERCHANT_HANDLING: 10,
  /** 平台仲裁中 */
  ARBITRATING: 20,
  /** 已同意 */
  AGREED: 30,
  /** 已拒绝 */
  REJECTED: 40,
  /** 已退款 */
  REFUNDED: 50,
  /** 已关闭 */
  CLOSED: 60
} as const

/** 售后状态联合 */
export type AfterSaleStatus = (typeof AfterSaleStatusEnum)[keyof typeof AfterSaleStatusEnum]

/**
 * 售后状态机：from → 允许的 to 集合
 *
 * P4-REVIEW-01 / I-01 修复：APPLYING 行补 AGREED / REJECTED 两个直跳路径，与
 * AfterSaleService.merchantHandle 实际语义一致（商户在用户申请阶段可直接同意或拒绝）。
 */
export const AFTER_SALE_TRANSITION_MAP: Readonly<
  Record<AfterSaleStatus, ReadonlyArray<AfterSaleStatus>>
> = {
  [AfterSaleStatusEnum.APPLYING]: [
    AfterSaleStatusEnum.MERCHANT_HANDLING,
    AfterSaleStatusEnum.AGREED /* I-01 R1 增 */,
    AfterSaleStatusEnum.REJECTED /* I-01 R1 增 */,
    AfterSaleStatusEnum.CLOSED
  ],
  [AfterSaleStatusEnum.MERCHANT_HANDLING]: [
    AfterSaleStatusEnum.AGREED,
    AfterSaleStatusEnum.REJECTED,
    AfterSaleStatusEnum.CLOSED
  ],
  [AfterSaleStatusEnum.REJECTED]: [AfterSaleStatusEnum.ARBITRATING, AfterSaleStatusEnum.CLOSED],
  [AfterSaleStatusEnum.ARBITRATING]: [
    AfterSaleStatusEnum.AGREED,
    AfterSaleStatusEnum.REJECTED,
    AfterSaleStatusEnum.CLOSED
  ],
  [AfterSaleStatusEnum.AGREED]: [AfterSaleStatusEnum.REFUNDED, AfterSaleStatusEnum.CLOSED],
  [AfterSaleStatusEnum.REFUNDED]: [],
  [AfterSaleStatusEnum.CLOSED]: []
}

/** 售后终态：到达后不再迁移（service 层判断） */
export const AFTER_SALE_TERMINAL_STATUSES: ReadonlyArray<AfterSaleStatus> = [
  AfterSaleStatusEnum.REFUNDED,
  AfterSaleStatusEnum.CLOSED
]

/** 商户处理售后的动作 */
export type AfterSaleMerchantAction = 'agree' | 'reject'

/* ============================================================================
 * 8) 跨模块依赖契约 —— OrderService / RefundService 抽象（按 token 注入）
 * ============================================================================ */

/**
 * OrderService 依赖契约 token（Symbol）
 * 用途：本模块通过 `@Inject(REVIEW_DEP_ORDER_SERVICE)` 注入；
 *      OrderModule 在最终装配时通过 `{ provide: REVIEW_DEP_ORDER_SERVICE, useExisting: OrderService }`
 *      暴露具体实现；当前阶段允许 `@Optional()` 缺省，运行期访问时抛 BIZ_OPERATION_FORBIDDEN。
 */
export const REVIEW_DEP_ORDER_SERVICE = Symbol('REVIEW_DEP_ORDER_SERVICE')

/**
 * RefundService 依赖契约 token（Symbol）
 * 用途：仲裁裁决 / 售后同意退款时调用；同上注入策略。
 */
export const REVIEW_DEP_REFUND_SERVICE = Symbol('REVIEW_DEP_REFUND_SERVICE')

/**
 * 订单核心视图（review/aftersale 调用方需要的最小字段集）
 *
 * 字段说明：
 *   - orderNo / orderType / userId / shopId / riderId / status / payStatus
 *   - payAmount   元，字符串
 *   - payNo       支付单号（退款依据；未支付订单为 null）
 *   - finishedAt  完成时间（评价 15 天有效期判断依据）
 *   - createdAt   下单时间
 */
export interface OrderCoreView {
  orderNo: string
  orderType: number
  userId: string
  shopId: string | null
  riderId: string | null
  status: number
  payStatus: number
  payAmount: string
  payNo: string | null
  finishedAt: Date | null
  createdAt: Date
}

/**
 * OrderService for Review 抽象契约
 * 仅声明本模块需要的能力；具体 OrderService 必须实现这两个方法（或在装配层适配）。
 */
export interface IReviewOrderService {
  /**
   * 按订单号查找订单核心视图
   * 参数：orderNo 18 位订单号
   * 返回值：OrderCoreView 或 null（不存在）
   */
  findOrderCoreByNo(orderNo: string): Promise<OrderCoreView | null>
}

/**
 * createRefund 入参（与 RefundService.createRefund 入参对齐）
 *
 * 字段说明：
 *   - payNo        支付单号（必填；退款依据）
 *   - amount       退款金额（元，字符串）
 *   - reason       业务原因码（如 'arbitration' / 'aftersale_agree' / 'aftersale_arbitrate'）
 *   - bizSourceType 业务来源类型：1 售后 / 2 仲裁
 *   - bizSourceId  业务来源 ID（after_sale.id / arbitration.id；用于幂等 / 反查）
 *   - opAdminId    操作管理员 ID（admin 仲裁时填；商户同意退款时为 null）
 *   - remark       备注
 */
export interface CreateRefundInput {
  payNo: string
  amount: string
  reason: string
  bizSourceType: 1 | 2
  bizSourceId: string
  opAdminId?: string | null
  remark?: string | null
}

/**
 * createRefund 返回（仅暴露 review 模块需要的字段）
 *
 * 字段说明：
 *   - refundNo  退款单号
 *   - status    退款状态（与 RefundStatus 对齐：0 申请 / 1 处理中 / 2 成功 / 3 失败）
 */
export interface CreateRefundResult {
  refundNo: string
  status: number
}

/**
 * RefundService for Review 抽象契约
 */
export interface IReviewRefundService {
  /**
   * 创建退款单
   * 参数：input CreateRefundInput
   * 返回值：CreateRefundResult
   */
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>
}
