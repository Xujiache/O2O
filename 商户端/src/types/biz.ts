/**
 * @file biz.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc 商户端业务实体的 TS 类型定义；与 P3/P4 entity 字段对齐
 *
 * 设计原则：
 *   - 后端启动后可用 openapi-typescript 替换/合并
 *   - 当前手写以解耦后端运行依赖
 *   - 金额字段一律 string（与 P5 一致；浮点精度由 currency.js 处理）
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */

/* ========== 通用 ========== */
/** 分页元信息 */
export interface PageMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** 普通分页响应 */
export interface PageResult<T> {
  list: T[]
  meta: PageMeta
}

/** keyset 分页响应（订单等高频时序场景） */
export interface KeysetPageResult<T> {
  list: T[]
  nextCursor: string | null
  hasMore: boolean
  meta?: PageMeta
}

/** 通用坐标 */
export interface LngLat {
  lng: number
  lat: number
}

/** 用户类型 */
export type UserType = 'user' | 'merchant' | 'rider' | 'admin'

/* ========== 商户登录 ========== */
/** 商户账号信息 */
export interface MerchantUser {
  id: string
  /** 商户主账号编号（M开头） */
  mchntNo: string
  /** 商户全称 */
  fullName: string
  /** 联系人姓名 */
  contactName: string
  /** 联系人手机号 */
  mobile: string
  /** 头像 */
  avatar: string | null
  /** 1 主账号 / 2 子账号 */
  accountType: 1 | 2
  /** 子账号角色（accountType=2 时）：店长 manager / 店员 cashier / 收银 staff */
  staffRole?: 'manager' | 'cashier' | 'staff'
  /** 当前店铺数 */
  shopCount: number
  /** 0 待审核 / 1 通过 / 2 驳回 / 3 暂停 */
  status: 0 | 1 | 2 | 3
  /** 入驻时间 */
  createdAt: string
}

/** 登录返回 */
export interface MerchantLoginResult {
  accessToken: string
  refreshToken: string
  user: MerchantUser
  /** 权限码列表 */
  permissions: string[]
  /** 菜单树 */
  menus: MerchantMenu[]
}

/** 菜单节点 */
export interface MerchantMenu {
  code: string
  name: string
  icon?: string
  url?: string
  children?: MerchantMenu[]
}

/** 入驻申请请求 */
export interface MerchantApplyParams {
  /** 商户全称 */
  fullName: string
  /** 联系人 */
  contactName: string
  /** 联系手机 */
  mobile: string
  /** 短信验证码 */
  smsCode: string
  /** 营业执照图片 URL */
  licenseUrl: string
  /** 营业执照编号 */
  licenseNo: string
  /** 法人身份证正面 URL */
  idCardFrontUrl: string
  /** 法人身份证反面 URL */
  idCardBackUrl: string
  /** 法人姓名 */
  legalPersonName: string
  /** 法人身份证号 */
  legalPersonIdCard: string
  /** 经营类目 */
  category: string
  /** 经营地址 */
  businessAddress: string
  /** 食品经营许可证（餐饮类必填） */
  foodLicenseUrl?: string
  /** 备注 */
  remark?: string
}

/** 入驻审核状态 */
export interface MerchantAuditStatus {
  /** 0 待审核 / 1 通过 / 2 驳回 / 3 补充资料中 */
  status: 0 | 1 | 2 | 3
  /** 驳回原因 */
  rejectReason?: string
  /** 提交时间 */
  submittedAt: string
  /** 审核完成时间 */
  reviewedAt?: string
}

/* ========== 店铺 ========== */
/** 店铺信息 */
export interface Shop {
  id: string
  merchantId: string
  /** 店铺名 */
  name: string
  /** 店铺简介 */
  intro?: string
  /** logo URL */
  logo: string
  /** 封面图 URL */
  cover: string | null
  /** 店铺图片集 */
  images?: string[]
  /** 公告 */
  announcement?: string
  /** 经营类目 */
  category: string
  /** 0 歇业 / 1 营业 / 2 临时歇业 / 3 暂停审核 */
  isOpen: 0 | 1 | 2 | 3
  /** 临时歇业理由 */
  tempCloseReason?: string
  /** 临时歇业到期时间 */
  tempCloseUntil?: string
  /** 自动接单开关：0 关 / 1 开 */
  autoAccept: 0 | 1
  /** 评分均值 */
  scoreAvg: string
  /** 月销量 */
  monthSales: number
  /** 起送价 */
  minAmount: string
  /** 配送费（默认；阶梯按 deliveryFeeRules） */
  deliveryFee: string
  /** 阶梯费规则 */
  deliveryFeeRules?: DeliveryFeeRule[]
  /** 预计制作时长（分钟） */
  prepareMin: number
  /** 联系电话 */
  contactPhone: string
  /** 城市编码 */
  cityCode: string
  /** 经度 */
  lng: number
  /** 纬度 */
  lat: number
  /** 详细地址 */
  address: string
  /** 营业时间（7 天） */
  businessHours?: BusinessHourDay[]
  /** 配送范围 polygon */
  deliveryArea?: LngLat[]
  /** 是否支持预约下单 */
  supportPreOrder: 0 | 1
  /** 是否支持发票 */
  supportInvoice: 0 | 1
  createdAt: string
}

/** 阶梯配送费规则 */
export interface DeliveryFeeRule {
  /** 距离上限（米） */
  distanceMax: number
  /** 该距离区间费用 */
  fee: string
}

/** 营业时间（单天） */
export interface BusinessHourDay {
  /** 0 周日 .. 6 周六 */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  /** 是否营业 */
  isOpen: 0 | 1
  /** 时间段（可多个） */
  periods: { start: string; end: string }[]
}

/* ========== 订单 ========== */
/** 1 外卖 / 2 跑腿 */
export type OrderType = 1 | 2

/**
 * 商户端订单状态（与 P4 状态机对齐）
 * P5 经验教训：订单 Tab 须配合子条件区分（如同状态需要更细分时加 isReviewed/isPrinted/isException 等）
 *  10 待接单 / 20 已接单(待出餐) / 30 已出餐(配送中) / 40 配送中 / 50 已送达 / 55 已完成 / 60 已取消 / 70 售后中
 */
export type OrderStatus = 10 | 20 | 30 | 40 | 50 | 55 | 60 | 70

/** 订单状态文案映射 */
export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  10: '待接单',
  20: '待出餐',
  30: '配送中',
  40: '配送中',
  50: '已送达',
  55: '已完成',
  60: '已取消',
  70: '售后中'
}

/** 商户端订单 Tab 类型 */
export type MerchantOrderTab =
  | 'pending' // 待接单 status=10
  | 'cooking' // 待出餐 status=20
  | 'delivering' // 配送中 status in [30,40]
  | 'finished' // 已完成 status in [50,55]
  | 'canceled' // 已取消 status=60
  | 'aftersale' // 售后中 status=70
  | 'abnormal' // 异常 status in [10,20] AND isException=1

/** 订单条目 */
export interface OrderItem {
  productId: string
  skuId: string
  qty: number
  unitPrice: string
  productName: string
  skuName: string
  spec?: Record<string, string>
  image?: string
  subtotal: string
}

/** 商户端订单（外卖） */
export interface MerchantOrder {
  orderNo: string
  orderType: OrderType
  status: OrderStatus
  shopId: string
  shopName: string
  /** 用户脱敏昵称 */
  userNickname: string
  /** 收件人姓名（脱敏） */
  receiverName: string
  /** 收件人手机号（虚号） */
  receiverMobile: string
  /** 收件地址（脱敏） */
  receiverAddress: string
  receiverLng: number
  receiverLat: number
  /** 距离（米） */
  distance: number
  itemsAmount: string
  deliveryFee: string
  discountAmount: string
  /** 平台抽佣 */
  platformFee: string
  /** 商户实收 */
  merchantIncome: string
  payAmount: string
  remark?: string
  /** 期望送达时间 / 立即 */
  deliveryTime?: string
  /** 1 立即 / 2 预订单 */
  deliveryType: 1 | 2
  /** 商品清单 */
  items: OrderItem[]
  /** 是否有异常上报 */
  isException: 0 | 1
  /** 是否已打印 */
  isPrinted: 0 | 1
  /** 取餐码 */
  pickupCode?: string
  /** 骑手信息 */
  riderId?: string | null
  riderName?: string | null
  riderMobile?: string | null
  /** 创建时间 */
  createdAt: string
  /** 接单时间 */
  acceptedAt?: string
  /** 出餐时间 */
  cookedAt?: string
  /** 完成时间 */
  finishedAt?: string
  /** 取消时间 / 取消原因 */
  canceledAt?: string
  cancelReason?: string
}

/** 订单查询参数 */
export interface MerchantOrderListParams {
  shopId: string
  /** 状态筛选 */
  status?: OrderStatus | OrderStatus[]
  /** Tab 类型 */
  tab?: MerchantOrderTab
  /** 是否异常 */
  isException?: 0 | 1
  /** 关键字（订单号/手机尾号） */
  keyword?: string
  /** 开始时间 */
  startTime?: string
  endTime?: string
  /** 分页 */
  cursor?: string | null
  limit?: number
}

/** 退款审核 */
export interface RefundAudit {
  id: string
  orderNo: string
  /** 申请金额 */
  refundAmount: string
  /** 申请理由 */
  reason: string
  /** 凭证图 */
  evidenceUrls: string[]
  /** 1 待审核 / 2 已同意 / 3 已拒绝 */
  status: 1 | 2 | 3
  /** 商户处理意见 */
  merchantReply?: string
  createdAt: string
  handledAt?: string
}

/** 异常上报 */
export interface OrderAbnormal {
  id: string
  orderNo: string
  /** 异常类型：1 缺货 / 2 客户退订 / 3 设备故障 / 4 其他 */
  abnormalType: 1 | 2 | 3 | 4
  remark: string
  evidenceUrls: string[]
  createdAt: string
}

/* ========== 商品 ========== */
/** 商品分类 */
export interface ProductCategory {
  id: string
  shopId: string
  name: string
  sortOrder: number
  /** 商品数 */
  productCount?: number
  createdAt: string
}

/** 商品 */
export interface Product {
  id: string
  shopId: string
  categoryId: string
  categoryName?: string
  name: string
  description?: string
  /** 商品图（最多 9 张） */
  images: string[]
  /** 价格（无 SKU 商品） */
  price: string
  /** 0 草稿 / 1 上架 / 2 下架 */
  status: 0 | 1 | 2
  /** 是否有 SKU */
  hasSku: 0 | 1
  /** 是否套餐 */
  isCombo: 0 | 1
  /** 库存（无 SKU 时使用） */
  stockQty?: number
  /** SKU 列表 */
  skus?: ProductSku[]
  /** 套餐子项 */
  comboItems?: ComboItem[]
  /** 标签：新品/招牌/推荐 */
  tags: string[]
  /** 限时折扣 */
  discount?: ProductDiscount
  /** 月销量 */
  monthSales: number
  scoreAvg: string
  sortOrder: number
  createdAt: string
}

/** 商品 SKU */
export interface ProductSku {
  id: string
  productId: string
  name: string
  price: string
  stockQty: number
  /** 规格属性 */
  attrs?: Record<string, string>
}

/** 套餐子项 */
export interface ComboItem {
  productId: string
  productName: string
  qty: number
}

/** 限时折扣 */
export interface ProductDiscount {
  /** 1 立减 / 2 折扣 */
  discountType: 1 | 2
  /** 立减金额 / 折扣率 */
  value: string
  /** 起止时间 */
  validFrom: string
  validTo: string
}

/* ========== 评价 ========== */
export interface MerchantReview {
  id: string
  orderNo: string
  shopId: string
  userId: string
  userNickname: string
  userAvatar: string | null
  shopRating: 1 | 2 | 3 | 4 | 5
  productRating: 1 | 2 | 3 | 4 | 5
  deliveryRating: 1 | 2 | 3 | 4 | 5
  content: string
  images: string[]
  tags: string[]
  /** 商户回复 */
  reply?: string
  replyAt?: string
  /** 是否申诉中 */
  appealing?: 0 | 1
  createdAt: string
}

/* ========== 财务 ========== */
/** 财务概览 */
export interface FinanceOverview {
  /** 可提现余额 */
  available: string
  /** 冻结金额（提现中） */
  frozen: string
  /** 今日营收 */
  todayIncome: string
  /** 今日订单数 */
  todayOrderCount: number
  /** 本月累计 */
  monthIncome: string
  /** 平台累计抽佣 */
  totalPlatformFee: string
}

/** 账单明细 */
export interface BillItem {
  id: string
  /** 业务类型：1 订单收入 / 2 订单退款 / 3 平台抽佣 / 4 提现 / 5 服务费 */
  bizType: 1 | 2 | 3 | 4 | 5
  amount: string
  /** 1 收入 / 2 支出 */
  flowDirection: 1 | 2
  remark: string
  bizNo: string
  /** 流水后余额 */
  balanceAfter: string
  createdAt: string
}

/** 银行卡 */
export interface BankCard {
  id: string
  /** 持卡人姓名 */
  holderName: string
  /** 卡号（脱敏） */
  cardNoMask: string
  /** 银行名称 */
  bankName: string
  /** 卡类型：1 借记卡 / 2 信用卡 */
  cardType: 1 | 2
  /** 是否默认 */
  isDefault: 0 | 1
}

/** 提现申请 */
export interface WithdrawApply {
  id: string
  amount: string
  cardId: string
  cardName: string
  /** 1 待审核 / 2 已通过 / 3 已打款 / 4 已拒绝 / 5 失败 */
  status: 1 | 2 | 3 | 4 | 5
  rejectReason?: string
  createdAt: string
  finishedAt?: string
}

/** 发票申请 */
export interface InvoiceApply {
  id: string
  /** 关联订单（可多个） */
  orderNos: string[]
  amount: string
  /** 抬头类型：1 个人 / 2 企业 */
  titleType: 1 | 2
  title: string
  taxNo?: string
  email: string
  /** 1 待开 / 2 已开 / 3 失败 */
  status: 1 | 2 | 3
  invoiceNo?: string
  pdfUrl?: string
  createdAt: string
  finishedAt?: string
}

/* ========== 数据统计 ========== */
/** 数据统计概览 */
export interface StatOverview {
  /** 时间范围 */
  startDate: string
  endDate: string
  /** 总销售额 */
  totalSales: string
  /** 总订单数 */
  totalOrderCount: number
  /** 客单价 */
  avgOrderValue: string
  /** UV */
  uv: number
  /** 转化率 */
  conversionRate: string
}

/** 时序数据点 */
export interface StatPoint {
  /** 时间 */
  date: string
  /** 值 */
  value: number
}

/** 多维度时序 */
export interface StatSeries {
  name: string
  data: StatPoint[]
}

/** 商品销量榜 */
export interface ProductRankItem {
  productId: string
  productName: string
  saleCount: number
  saleAmount: string
}

/* ========== 营销 ========== */
/** 店铺优惠券 */
export interface ShopCoupon {
  id: string
  shopId: string
  /** 1 满减 / 2 折扣 / 3 立减 */
  couponType: 1 | 2 | 3
  name: string
  /** 立减金额 / 折扣率 */
  discountValue: string
  /** 满 X 元用 */
  minOrderAmount: string
  /** 1 永久 / 2 期限 */
  validType: 1 | 2
  validFrom?: string
  validTo?: string
  /** 总数量 */
  totalQty: number
  /** 已领取 */
  receivedQty: number
  /** 已使用 */
  usedQty: number
  /** 0 未启用 / 1 已启用 / 2 已暂停 */
  status: 0 | 1 | 2
  createdAt: string
}

/** 营销活动 */
export interface ShopPromotion {
  id: string
  shopId: string
  /** 类型：1 满减 / 2 折扣 / 3 拼单 / 4 新品推荐 */
  promotionType: 1 | 2 | 3 | 4
  name: string
  /** 配置（按 promotionType 决定结构） */
  config: Record<string, unknown>
  validFrom: string
  validTo: string
  /** 0 未启用 / 1 已启用 / 2 已暂停 */
  status: 0 | 1 | 2
  createdAt: string
}

/* ========== 子账号 ========== */
/** 子账号 */
export interface SubAccount {
  id: string
  /** 用户名（登录名） */
  username: string
  realName: string
  mobile: string
  avatar?: string | null
  /** 角色：店长 / 店员 / 收银 */
  role: 'manager' | 'cashier' | 'staff'
  /** 关联店铺 ID 列表 */
  shopIds: string[]
  shopNames?: string[]
  /** 0 禁用 / 1 启用 */
  status: 0 | 1
  /** 最后登录时间 */
  lastLoginAt?: string
  createdAt: string
}

/* ========== 消息中心 ========== */
export type MessageCategory = 'order' | 'system' | 'promotion' | 'finance'

export interface Message {
  id: string
  category: MessageCategory
  title: string
  body: string
  bizNo?: string
  link?: string
  isRead: 0 | 1
  createdAt: string
}

/* ========== 通知/铃声配置 ========== */
export interface NotifySettings {
  /** 新订单语音播报 */
  newOrderTts: 0 | 1
  /** 新订单铃声 */
  newOrderRingtone: 0 | 1
  /** 铃声音量 0-100 */
  ringtoneVolume: number
  /** 铃声循环 */
  ringtoneLoop: 0 | 1
  /** 自动接单 */
  autoAccept: 0 | 1
  /** 自动接单倒计时（秒） */
  autoAcceptCountdown: number
}

/* ========== 通用文件 ========== */
export interface FileUploadResult {
  fileId: string
  url: string
  /** 业务模块 */
  bizModule: string
  /** 是否公开 */
  isPublic: 0 | 1
  size: number
  mime: string
}
