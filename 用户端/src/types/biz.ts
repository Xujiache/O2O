/**
 * @file biz.d.ts
 * @stage P5/T5.6 (Sprint 1)
 * @desc 后端业务实体的 TS 类型定义；与 P3/P4 entity 字段对齐
 *   后续后端启动后可用 openapi-typescript 替换/合并；当前手写以解耦后端运行依赖
 * @author 单 Agent V2.0
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

/** 用户类型 */
export type UserType = 'user' | 'merchant' | 'rider' | 'admin'

/** 通用坐标 */
export interface LngLat {
  lng: number
  lat: number
}

/* ========== 用户/账号 ========== */
export interface UserInfo {
  id: string
  nickname: string
  avatar: string | null
  mobile: string | null
  gender: 0 | 1 | 2
  birthday: string | null
  isRealname: 0 | 1
  inviteCode: string
  status: 0 | 1 | 2
  createdAt: string
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: UserInfo
}

export interface MobileBindParams {
  mobile: string
  smsCode: string
}

/* ========== 地址 ========== */
export interface UserAddress {
  id: string
  name: string
  mobile: string
  province: string
  city: string
  district: string
  detail: string
  lng: number
  lat: number
  tag: string | null
  isDefault: 0 | 1
  createdAt: string
}

/** 地址智能识别结果 */
export interface AddressParsed {
  name?: string
  mobile?: string
  province?: string
  city?: string
  district?: string
  detail?: string
}

/* ========== 城市/区域 ========== */
export interface City {
  cityCode: string
  cityName: string
  pinyin: string
  letter: string
}

/* ========== 店铺/商品 ========== */
export interface Shop {
  id: string
  name: string
  logo: string
  cover: string | null
  scoreAvg: string
  monthSales: number
  distance: number
  minAmount: string
  deliveryFee: string
  prepareMin: number
  isOpen: 0 | 1
  tags: string[]
  announcement?: string
  cityCode: string
  lng: number
  lat: number
  address: string
}

export interface ProductCategory {
  id: string
  shopId: string
  name: string
  sortOrder: number
}

export interface Product {
  id: string
  shopId: string
  categoryId: string
  name: string
  description: string | null
  images: string[]
  price: string
  monthSales: number
  scoreAvg: string
  isOnline: 0 | 1
  hasSku: 0 | 1
  /** 无 SKU 商品的库存（hasSku=0 时使用；hasSku=1 取 SKU.stockQty） */
  stockQty?: number
  skus?: ProductSku[]
}

export interface ProductSku {
  id: string
  productId: string
  name: string
  price: string
  stockQty: number
  attrs?: Record<string, string>
}

/* ========== 购物车 ========== */
export interface CartItem {
  productId: string
  skuId: string
  productName: string
  skuName: string
  spec?: Record<string, string>
  unitPrice: string
  count: number
  image: string
  /** 加购时间戳 */
  addedAt: number
}

export interface ShopCart {
  shopId: string
  shopName: string
  shopLogo: string
  minAmount: string
  deliveryFee: string
  items: CartItem[]
  updatedAt: number
}

/* ========== 优惠券 ========== */
export interface Coupon {
  id: string
  couponCode: string
  name: string
  /** 1 满减 / 2 折扣 / 3 立减 */
  couponType: 1 | 2 | 3
  discountValue: string
  minOrderAmount: string
  scene: number
  /** 1 永久 / 2 期限 */
  validType: 1 | 2
  validFrom?: string
  validTo?: string
  remark?: string
}

export interface UserCoupon {
  id: string
  couponId: string
  status: 1 | 2 | 3 | 4 // 1可用 2已用 3已过期 4已退回
  receivedAt: string
  usedAt?: string
  validFrom?: string
  validTo?: string
  coupon: Coupon
}

/* ========== 订单 ========== */
/** 1 外卖 / 2 跑腿 */
export type OrderType = 1 | 2
/** 跑腿子类型：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队 */
export type ErrandServiceType = 1 | 2 | 3 | 4

/** 订单状态（与 P4 状态机对齐） */
export type OrderStatus = 0 | 5 | 10 | 20 | 30 | 40 | 50 | 55 | 60 | 70

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  0: '待支付',
  5: '已关闭',
  10: '待接单',
  20: '已接单',
  30: '已出餐',
  40: '配送中',
  50: '已送达',
  55: '已完成',
  60: '已取消',
  70: '售后中'
}

export interface OrderTakeoutItem {
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

export interface OrderTakeout {
  orderNo: string
  orderType: 1
  status: OrderStatus
  shopId: string
  shopName: string
  shopLogo: string
  itemsAmount: string
  deliveryFee: string
  discountAmount: string
  payAmount: string
  remark: string | null
  estimatedArrivalAt: string | null
  finishedAt: string | null
  cancelReason: string | null
  paymentMethod: number | null
  /** 期望送达时间（立即 / 预约） */
  deliveryTime: string | null
  address: {
    name: string
    mobile: string
    province: string
    city: string
    district: string
    detail: string
    lng: number
    lat: number
  }
  items: OrderTakeoutItem[]
  riderId?: string | null
  riderName?: string | null
  riderMobile?: string | null
  pickupCode?: string | null
  /** 是否已评价：0 否 / 1 是；用于"待评价 vs 已完成" Tab 区分（status=55 时生效） */
  isReviewed?: 0 | 1
  /** 订单凭证图（取件 / 送达 / 异常上报）；后端在 order detail 中可附带 */
  proofs?: OrderProof[]
  createdAt: string
}

export interface OrderErrand {
  orderNo: string
  orderType: 2
  serviceType: ErrandServiceType
  status: OrderStatus
  pickupAddress: {
    name: string
    mobile: string
    detail: string
    lng: number
    lat: number
  }
  deliveryAddress: {
    name: string
    mobile: string
    detail: string
    lng: number
    lat: number
  }
  itemDescription: string
  weight: string
  insuranceFee?: string
  /** 帮买预算 */
  budget?: string
  /** 帮买商品清单 */
  buyList?: string
  /** 帮排队场所 */
  queuePlace?: string
  /** 帮排队预计时长（分钟） */
  queueDuration?: number
  baseFee: string
  distanceFee: string
  weightFee: string
  serviceFee: string
  payAmount: string
  remark: string | null
  riderId?: string | null
  riderName?: string | null
  riderMobile?: string | null
  pickupCode?: string | null
  estimatedArrivalAt?: string | null
  finishedAt?: string | null
  /** 是否已评价：0 否 / 1 是；用于"待评价 vs 已完成" Tab 区分（status=55 时生效） */
  isReviewed?: 0 | 1
  /** 订单凭证图（取件 / 送达 / 异常上报）；track 页 PickupCode 组件使用 */
  proofs?: OrderProof[]
  createdAt: string
}

/** 订单凭证（取件/送达/异常） */
export interface OrderProof {
  id: string
  orderNo: string
  /** 1 取件 / 2 送达 / 3 异常上报 */
  proofType: 1 | 2 | 3
  imageUrl: string
  remark?: string
  createdAt: string
}

/** 跑腿价格预估请求 */
export interface ErrandPriceParams {
  serviceType: ErrandServiceType
  pickupLng?: number
  pickupLat?: number
  deliveryLng?: number
  deliveryLat?: number
  weight?: number
  insurance?: number
  budget?: string
  queueDuration?: number
}

/** 跑腿价格预估返回 */
export interface ErrandPriceResult {
  baseFee: string
  distanceFee: string
  weightFee: string
  serviceFee: string
  insuranceFee: string
  total: string
  distance: number
  estimatedDurationMin: number
}

/* ========== 支付 ========== */
export interface PayParams {
  orderNo: string
  orderType: OrderType
  payMethod: 1 | 2 | 3 // 1 微信 / 2 支付宝 / 3 余额
  clientType?: 'jsapi' | 'h5' | 'native' | 'app'
}

export interface PayResult {
  payNo: string
  /** 微信 JSAPI 唤起参数；payMethod=3 余额时为空 */
  jsapi?: {
    timeStamp: string
    nonceStr: string
    package: string
    signType: 'MD5' | 'HMAC-SHA256' | 'RSA'
    paySign: string
  }
  alipayParams?: string
  status: 'CREATED' | 'PAYING' | 'SUCCESS' | 'FAILED' | 'CLOSED' | 'REFUNDED'
}

export interface PayStatus {
  payNo: string
  orderNo: string
  status: 'CREATED' | 'PAYING' | 'SUCCESS' | 'FAILED' | 'CLOSED' | 'REFUNDED'
  amount: string
  paidAt?: string
}

/* ========== 钱包 ========== */
export interface Wallet {
  balance: string
  frozenAmount: string
  totalIncome: string
  totalExpense: string
}

export interface AccountFlow {
  id: string
  bizType: number
  amount: string
  /** 1 收入 / 2 支出 */
  flowDirection: 1 | 2
  remark: string
  bizNo: string
  createdAt: string
  balanceAfter: string
}

/* ========== 评价 ========== */
export interface Review {
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
  reply?: string | null
  replyAt?: string | null
  createdAt: string
}

/* ========== 售后/投诉/工单 ========== */
export interface AfterSale {
  id: string
  orderNo: string
  reason: string
  refundAmount: string
  status: number
  evidenceUrls: string[]
  createdAt: string
  finishedAt?: string | null
  merchantHandleAt?: string | null
  merchantReply?: string | null
}

export interface Complaint {
  id: string
  orderNo: string
  /** 1 用户 / 2 商家 / 3 骑手 */
  targetType: 1 | 2 | 3
  reason: string
  status: number
  evidenceUrls: string[]
  createdAt: string
}

/* ========== Banner / 公告 / 快捷入口 ========== */
export interface Banner {
  id: string
  imageUrl: string
  title: string
  link?: string
  /** linkType: 1 H5 / 2 page / 3 mp / 4 none */
  linkType?: 1 | 2 | 3 | 4
  position: string
  cityCode?: string
}

export interface Notice {
  id: string
  title: string
  summary: string
  content: string
  publishedAt: string
}

export interface QuickEntry {
  code: string
  name: string
  icon: string
  url: string
  badge?: string
}

/* ========== 消息中心 ========== */
export type MessageCategory = 'order' | 'promotion' | 'system'

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

/* ========== 收藏 ========== */
export interface FavoriteShop {
  id: string
  shop: Shop
  createdAt: string
}

export interface FavoriteProduct {
  id: string
  product: Product
  shop: Pick<Shop, 'id' | 'name'>
  createdAt: string
}

/* ========== 发票 ========== */
export interface InvoiceHeader {
  id: string
  /** 1 个人 / 2 单位 */
  titleType: 1 | 2
  title: string
  taxNo?: string
  bankName?: string
  bankAccount?: string
  registerAddress?: string
  registerPhone?: string
  email?: string
  isDefault: 0 | 1
}

export interface Invoice {
  id: string
  invoiceNo?: string
  orderNo: string
  amount: string
  title: string
  taxNo?: string
  email: string
  status: number
  pdfUrl?: string
  createdAt: string
}
