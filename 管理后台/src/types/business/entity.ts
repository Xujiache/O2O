/**
 * 业务实体类型（订单 / 用户 / 商户 / 骑手 / 商品 / 财务 / 系统）
 *
 * 严格对齐 P3/P4 后端 DTO 字段名，**金额一律 string（fen），前端用 currency.js 处理**
 *
 * @module types/business/entity
 */
import type { BizId } from './common'

/* ========== 用户 ========== */
export interface BizUser {
  id: BizId
  nickname: string
  mobile: string
  avatar?: string
  gender?: 0 | 1 | 2
  channel?: string
  registeredAt: string
  status: 0 | 1 | 2
  orderCount?: number
  totalSpend?: string
  balance?: string
  riskLevel?: 0 | 1 | 2
}

export interface UserDetailExtra {
  addresses?: Array<{ id: BizId; address: string; tag?: string; isDefault?: boolean }>
  coupons?: Array<{ id: BizId; templateName: string; status: number; expiredAt: string }>
  balanceFlows?: Array<{ id: BizId; amount: string; type: string; createdAt: string }>
  complaints?: Array<{ id: BizId; reason: string; status: number; createdAt: string }>
}

/* ========== 商户 / 店铺 ========== */
export interface BizMerchant {
  id: BizId
  name: string
  contact: string
  mobile: string
  cityCode: string
  cityName: string
  shopCount: number
  auditStatus: 0 | 1 | 2 | 3
  bizStatus: 0 | 1 | 2
  createdAt: string
  riskLevel?: 0 | 1 | 2
}

export interface BizShop {
  id: BizId
  merchantId: BizId
  name: string
  cityCode: string
  cityName: string
  address: string
  status: 0 | 1 | 2
  /** 配送范围 polygon GeoJSON */
  deliveryRange?: Array<{ lng: number; lat: number }>
  /** 公告 */
  notice?: string
  /** 公告审核状态 */
  noticeAuditStatus?: 0 | 1 | 2
}

/* ========== 骑手 ========== */
export interface BizRider {
  id: BizId
  realName: string
  mobile: string
  cityCode: string
  cityName: string
  level: 1 | 2 | 3 | 4 | 5
  onlineStatus: 0 | 1 | 2 | 3
  auditStatus: 0 | 1 | 2
  todayOrders?: number
  todayIncome?: string
  rating?: number
  onTimeRate?: number
  riskLevel?: 0 | 1 | 2
  createdAt: string
}

export interface RiderTrackPoint {
  ts: number
  lng: number
  lat: number
  speed?: number
  /** 当时业务状态：闲置 / 接单 / 取餐 / 配送 / 送达 */
  bizStatus?: number
}

/* ========== 订单 ========== */
export interface BizOrder {
  orderNo: string
  bizType: 'takeout' | 'errand-buy' | 'errand-send' | 'errand-queue'
  status: number
  userMobile: string
  userNickname: string
  shopName?: string
  shopId?: BizId
  riderName?: string
  riderId?: BizId
  amountTotal: string
  amountReceivable: string
  payAt?: string
  createdAt: string
  finishedAt?: string
  cityCode: string
  cityName: string
  /** 是否申请退款中 */
  hasRefunding?: boolean
  /** 是否申请仲裁中 */
  hasArbitration?: boolean
}

export interface OrderFlowNode {
  /** 节点 status code */
  code: number
  /** 节点名 */
  label: string
  /** 是否已经过该节点 */
  reached: boolean
  /** 是否当前节点 */
  current?: boolean
  /** 经过该节点时间 */
  ts?: string
  /** 操作人 */
  operator?: string
  /** 异常分支显示 */
  variant?: 'normal' | 'cancel' | 'refund' | 'arbitration'
}

/* ========== 商品与内容 ========== */
export interface BizProduct {
  id: BizId
  shopId: BizId
  shopName?: string
  name: string
  categoryId?: BizId
  categoryName?: string
  price: string
  stockQty: number
  monthlySales?: number
  status: 0 | 1
  violationStatus?: 0 | 1 | 2
  cover?: string
  createdAt: string
}

export interface BizBanner {
  id: BizId
  title: string
  imgUrl: string
  linkType: 'shop' | 'product' | 'h5' | 'category'
  linkValue: string
  cityCode?: string
  startAt: string
  endAt: string
  enabled: boolean
  sort: number
}

export interface BizNotice {
  id: BizId
  title: string
  content: string
  audience: 'all' | 'user' | 'merchant' | 'rider'
  cityCode?: string
  publishAt?: string
  expireAt?: string
  enabled: boolean
}

export interface BizReview {
  id: BizId
  orderNo: string
  userNickname: string
  shopName?: string
  riderName?: string
  rating: number
  content: string
  status: 0 | 1 | 2 | 3
  createdAt: string
  appealStatus?: 0 | 1 | 2
}

/* ========== 运营 ========== */
export interface BizCoupon {
  id: BizId
  templateName: string
  type: 'platform' | 'shop' | 'rider'
  amount: string
  thresholdAmount?: string
  totalQuota: number
  issuedCount?: number
  usedCount?: number
  startAt: string
  endAt: string
  status: 0 | 1 | 2 | 3
  createdAt: string
}

export interface BizPromotion {
  id: BizId
  name: string
  type: 'fullCut' | 'discount' | 'group' | 'invite' | 'newUser'
  rules: Record<string, unknown>
  startAt: string
  endAt: string
  enabled: boolean
}

export interface BizPushTask {
  id: BizId
  title: string
  channels: Array<'mp' | 'app' | 'sms' | 'inbox'>
  audience: 'all' | 'city' | 'tag' | 'user'
  audienceParam?: Record<string, unknown>
  templateCode: string
  status: 0 | 1 | 2 | 3 | 4
  scheduleAt?: string
  createdAt: string
}

export interface BizRegion {
  cityCode: string
  cityName: string
  enabled: boolean
  baseDeliveryFee: string
  deliveryFeeRules?: Array<{ minDistance: number; maxDistance: number; fee: string }>
  errandPriceFormula?: string
  /** 区域 polygon GeoJSON */
  polygon?: Array<{ lng: number; lat: number }>
}

/* ========== 财务 ========== */
export interface BizSettlementRule {
  id: BizId
  /** 范围：global / city / shop */
  scope: 'global' | 'city' | 'shop'
  scopeKey?: string
  /** 平台分润 % */
  platformRate: string
  /** 商户分润 % */
  merchantRate: string
  /** 骑手分润 % */
  riderRate: string
  enabled: boolean
}

export interface BizSettlementRecord {
  id: BizId
  orderNo: string
  total: string
  platformAmount: string
  merchantAmount: string
  riderAmount: string
  status: number
  errorMsg?: string
  createdAt: string
}

export interface BizWithdraw {
  id: BizId
  applicantType: 'merchant' | 'rider'
  applicantId: BizId
  applicantName: string
  amount: string
  bankCard: string
  bankName?: string
  status: 0 | 1 | 2 | 3 | 4 | 5
  remark?: string
  createdAt: string
  payAt?: string
}

export interface BizBill {
  id: BizId
  ownerType: 'merchant' | 'rider'
  ownerId: BizId
  ownerName: string
  date: string
  totalIncome: string
  totalSpend: string
  net: string
}

export interface BizInvoice {
  id: BizId
  applicantType: 'user' | 'merchant'
  applicantName: string
  amount: string
  title: string
  taxNo: string
  email: string
  status: 0 | 1 | 2 | 3
  pdfUrl?: string
  createdAt: string
}

/* ========== 系统 ========== */
export interface BizAdmin {
  id: BizId
  username: string
  realName: string
  email?: string
  mobile?: string
  enabled: boolean
  roles: string[]
  createdAt: string
  lastLoginAt?: string
}

export interface BizOperationLog {
  id: BizId
  adminUsername: string
  module: string
  action: string
  target?: string
  ip?: string
  status: number
  errorMsg?: string
  traceId?: string
  detail?: Record<string, unknown>
  createdAt: string
}

export interface BizApiLog {
  id: BizId
  traceId: string
  path: string
  method: string
  status: number
  costMs: number
  errorMsg?: string
  ip?: string
  userAgent?: string
  createdAt: string
}

/* ========== 客服 / 风控 ========== */
export interface BizTicket {
  id: BizId
  orderNo?: string
  reporter: string
  reporterRole: 'user' | 'merchant' | 'rider' | 'admin'
  category: string
  content: string
  status: 0 | 1 | 2 | 3
  assignee?: string
  createdAt: string
  closedAt?: string
}

export interface BizArbitration {
  id: BizId
  orderNo: string
  applicantRole: 'user' | 'merchant' | 'rider'
  applicantName: string
  reason: string
  evidence?: string[]
  status: 0 | 1 | 2 | 3
  judgeResult?: 'user' | 'merchant' | 'rider' | 'split'
  refundAmount?: string
  createdAt: string
}

export interface BizRiskRule {
  id: BizId
  name: string
  category: string
  enabled: boolean
  threshold: Record<string, unknown>
  action: string
  createdAt: string
}

export interface BizRiskOrder {
  orderNo: string
  reason: string
  level: 0 | 1 | 2
  hitRules: string[]
  reviewedBy?: string
  reviewedAt?: string
  status: 'pending' | 'pass' | 'block'
}

export interface BizCheatRecord {
  id: BizId
  targetType: 'user' | 'merchant' | 'rider'
  targetId: BizId
  targetName: string
  category: 'brushing' | 'cashing'
  score: number
  evidence?: Record<string, unknown>
  status: 'detected' | 'reviewed' | 'punished'
  createdAt: string
}
