/**
 * 业务状态映射：所有 status code → 中文标签 + Element Plus tag type
 *
 * 【P5 教训】Tab 必须 status + 子条件唯一区分，避免 statusIn:[55] 在两个 Tab 重复
 * 【P6 教训】订单 7 Tab / 商户审核 4 Tab / 提现 5 Tab 必须严格各带唯一筛选键
 *
 * @module utils/business/status-map
 */

export type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

export interface StatusItem {
  /** 状态 code（数字或字符串） */
  code: number | string
  /** 中文标签 */
  label: string
  /** Element Plus tag type 颜色 */
  type: TagType
  /** 可选英文标签 */
  labelEn?: string
}

/** 订单状态（与后端 P4 OrderStateMachine 对齐） */
export const ORDER_STATUS: StatusItem[] = [
  { code: 10, label: '待支付', type: 'warning', labelEn: 'Pending Payment' },
  { code: 20, label: '已支付', type: 'primary', labelEn: 'Paid' },
  { code: 30, label: '已接单', type: 'primary', labelEn: 'Accepted' },
  { code: 40, label: '已出餐', type: 'primary', labelEn: 'Prepared' },
  { code: 50, label: '配送中', type: 'primary', labelEn: 'Delivering' },
  { code: 55, label: '已送达', type: 'success', labelEn: 'Delivered' },
  { code: 60, label: '已完成', type: 'success', labelEn: 'Completed' },
  { code: 70, label: '已取消', type: 'info', labelEn: 'Cancelled' },
  { code: 80, label: '退款中', type: 'warning', labelEn: 'Refunding' },
  { code: 85, label: '已退款', type: 'info', labelEn: 'Refunded' },
  { code: 90, label: '售后中', type: 'warning', labelEn: 'After-sale' },
  { code: 99, label: '异常', type: 'danger', labelEn: 'Exception' }
]

/** 商户入驻审核状态 */
export const MERCHANT_AUDIT_STATUS: StatusItem[] = [
  { code: 0, label: '待审核', type: 'warning', labelEn: 'Pending' },
  { code: 1, label: '已通过', type: 'success', labelEn: 'Approved' },
  { code: 2, label: '已驳回', type: 'danger', labelEn: 'Rejected' },
  { code: 3, label: '资料补充中', type: 'info', labelEn: 'Supplementing' }
]

/** 商户营业状态 */
export const MERCHANT_BIZ_STATUS: StatusItem[] = [
  { code: 0, label: '休息中', type: 'info' },
  { code: 1, label: '营业中', type: 'success' },
  { code: 2, label: '已封禁', type: 'danger' }
]

/** 骑手入驻审核状态 */
export const RIDER_AUDIT_STATUS: StatusItem[] = [
  { code: 0, label: '待审核', type: 'warning' },
  { code: 1, label: '已通过', type: 'success' },
  { code: 2, label: '已驳回', type: 'danger' }
]

/** 骑手在线状态 */
export const RIDER_ONLINE_STATUS: StatusItem[] = [
  { code: 0, label: '离线', type: 'info' },
  { code: 1, label: '在线-空闲', type: 'success' },
  { code: 2, label: '在线-接单中', type: 'primary' },
  { code: 3, label: '在线-配送中', type: 'warning' }
]

/** 提现申请状态（5 Tab 严格区分：待审核 / 审核通过 / 已驳回 / 打款中 / 已打款） */
export const WITHDRAW_STATUS: StatusItem[] = [
  { code: 0, label: '待审核', type: 'warning' },
  { code: 1, label: '审核通过', type: 'primary' },
  { code: 2, label: '已驳回', type: 'danger' },
  { code: 3, label: '打款中', type: 'primary' },
  { code: 4, label: '已打款', type: 'success' },
  { code: 5, label: '打款失败', type: 'danger' }
]

/** 仲裁状态 */
export const ARBITRATION_STATUS: StatusItem[] = [
  { code: 0, label: '待受理', type: 'warning' },
  { code: 1, label: '调查中', type: 'primary' },
  { code: 2, label: '已判定', type: 'success' },
  { code: 3, label: '已撤销', type: 'info' }
]

/** 工单状态 */
export const TICKET_STATUS: StatusItem[] = [
  { code: 0, label: '待分派', type: 'warning' },
  { code: 1, label: '处理中', type: 'primary' },
  { code: 2, label: '已关闭', type: 'success' },
  { code: 3, label: '已挂起', type: 'info' }
]

/** 优惠券状态 */
export const COUPON_STATUS: StatusItem[] = [
  { code: 0, label: '草稿', type: 'info' },
  { code: 1, label: '已发布', type: 'primary' },
  { code: 2, label: '已暂停', type: 'warning' },
  { code: 3, label: '已结束', type: 'info' }
]

/** 评价审核状态 */
export const REVIEW_STATUS: StatusItem[] = [
  { code: 0, label: '正常', type: 'success' },
  { code: 1, label: '已隐藏', type: 'info' },
  { code: 2, label: '已删除', type: 'danger' },
  { code: 3, label: '申诉中', type: 'warning' }
]

/** 商品违规状态 */
export const PRODUCT_VIOLATION_STATUS: StatusItem[] = [
  { code: 0, label: '正常', type: 'success' },
  { code: 1, label: '违规警告', type: 'warning' },
  { code: 2, label: '强制下架', type: 'danger' }
]

/** 发票审核状态 */
export const INVOICE_STATUS: StatusItem[] = [
  { code: 0, label: '待审核', type: 'warning' },
  { code: 1, label: '已通过待开票', type: 'primary' },
  { code: 2, label: '已开票', type: 'success' },
  { code: 3, label: '已驳回', type: 'danger' }
]

/** 公告审核状态 */
export const NOTICE_AUDIT_STATUS: StatusItem[] = [
  { code: 0, label: '待审核', type: 'warning' },
  { code: 1, label: '已通过', type: 'success' },
  { code: 2, label: '已驳回', type: 'danger' }
]

/** 转单审核状态 */
export const TRANSFER_AUDIT_STATUS: StatusItem[] = [
  { code: 0, label: '待审核', type: 'warning' },
  { code: 1, label: '已通过', type: 'success' },
  { code: 2, label: '已驳回', type: 'danger' }
]

/** 取消退款审核状态 */
export const CANCEL_REFUND_STATUS: StatusItem[] = [
  { code: 0, label: '待审核', type: 'warning' },
  { code: 1, label: '已通过', type: 'success' },
  { code: 2, label: '已驳回', type: 'danger' }
]

/** 投诉状态 */
export const COMPLAINT_STATUS: StatusItem[] = [
  { code: 0, label: '待处理', type: 'warning' },
  { code: 1, label: '处理中', type: 'primary' },
  { code: 2, label: '已处理', type: 'success' },
  { code: 3, label: '已关闭', type: 'info' }
]

/** 推送任务状态 */
export const PUSH_STATUS: StatusItem[] = [
  { code: 0, label: '草稿', type: 'info' },
  { code: 1, label: '排队中', type: 'warning' },
  { code: 2, label: '推送中', type: 'primary' },
  { code: 3, label: '已完成', type: 'success' },
  { code: 4, label: '已取消', type: 'danger' }
]

/** 风险等级 */
export const RISK_LEVEL: StatusItem[] = [
  { code: 0, label: '低风险', type: 'success' },
  { code: 1, label: '中风险', type: 'warning' },
  { code: 2, label: '高风险', type: 'danger' }
]

/** 用户状态 */
export const USER_STATUS: StatusItem[] = [
  { code: 1, label: '正常', type: 'success' },
  { code: 2, label: '已封禁', type: 'danger' }
]

/** 商品上下架状态 */
export const PRODUCT_STATUS: StatusItem[] = [
  { code: 0, label: '已下架', type: 'info' },
  { code: 1, label: '在售中', type: 'success' }
]

/** 异步导出任务状态 */
export const EXPORT_JOB_STATUS: StatusItem[] = [
  { code: 0, label: '排队中', type: 'info' },
  { code: 1, label: '处理中', type: 'primary' },
  { code: 2, label: '已完成', type: 'success' },
  { code: 3, label: '失败', type: 'danger' },
  { code: 4, label: '已取消', type: 'info' }
]

/** 状态映射注册表（供 BizStatus 组件按 type 名查询） */
export const STATUS_MAP: Record<string, StatusItem[]> = {
  ORDER_STATUS,
  MERCHANT_AUDIT_STATUS,
  MERCHANT_BIZ_STATUS,
  RIDER_AUDIT_STATUS,
  RIDER_ONLINE_STATUS,
  WITHDRAW_STATUS,
  ARBITRATION_STATUS,
  TICKET_STATUS,
  COUPON_STATUS,
  REVIEW_STATUS,
  PRODUCT_VIOLATION_STATUS,
  INVOICE_STATUS,
  NOTICE_AUDIT_STATUS,
  TRANSFER_AUDIT_STATUS,
  CANCEL_REFUND_STATUS,
  COMPLAINT_STATUS,
  PUSH_STATUS,
  RISK_LEVEL,
  USER_STATUS,
  PRODUCT_STATUS,
  EXPORT_JOB_STATUS
}

/**
 * 按状态类型与 code 查找 StatusItem
 */
export function findStatus(type: string, code: number | string): StatusItem | undefined {
  const arr = STATUS_MAP[type]
  if (!arr) return undefined
  return arr.find((s) => String(s.code) === String(code))
}
