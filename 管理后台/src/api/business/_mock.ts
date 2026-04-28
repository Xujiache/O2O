/**
 * 业务 mock 数据驱动
 *
 * 后端 P3/P4 真实部署需要 docker（本机暂无），按 P9 集成测试归并真机联调
 * 此处提供 mock 数据保证 UI 联调可跑通
 *
 * 启用方式：.env.development 设置 `VITE_USE_MOCK=true`
 *
 * @module api/business/_mock
 */
import type {
  BizListResp,
  BizUser,
  BizMerchant,
  BizShop,
  BizRider,
  BizOrder,
  BizProduct,
  BizBanner,
  BizNotice,
  BizReview,
  BizCoupon,
  BizPromotion,
  BizPushTask,
  BizRegion,
  BizSettlementRule,
  BizSettlementRecord,
  BizWithdraw,
  BizBill,
  BizInvoice,
  BizAdmin,
  BizOperationLog,
  BizApiLog,
  BizTicket,
  BizArbitration,
  BizRiskRule,
  BizRiskOrder,
  BizCheatRecord,
  RiderTrackPoint,
  DictGroup,
  Permission,
  Role,
  BizMenu,
  OrderFlowNode
} from '@/types/business'
import type { ExportJob } from '@/utils/business/export-async'

const useMock = () => (import.meta.env.VITE_USE_MOCK as string) === 'true'

/**
 * 是否启用 mock
 */
export const isMockEnabled = useMock

const fakeDelay = <T>(data: T, ms = 300): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms))

const seqId = (() => {
  let n = 1000
  return () => ++n
})()

const list = <T>(rows: T[], page = 1, pageSize = 20): BizListResp<T> => {
  const start = (page - 1) * pageSize
  const slice = rows.slice(start, start + pageSize)
  return { records: slice, total: rows.length, page, pageSize }
}

/* ========== 字典 ========== */
const dictGroups: DictGroup[] = [
  {
    type: 'ORDER_STATUS',
    typeName: '订单状态',
    items: [
      { code: 'PENDING_PAY', value: 10, label: '待支付' },
      { code: 'PAID', value: 20, label: '已支付' },
      { code: 'ACCEPTED', value: 30, label: '已接单' },
      { code: 'PREPARED', value: 40, label: '已出餐' },
      { code: 'DELIVERING', value: 50, label: '配送中' },
      { code: 'DELIVERED', value: 55, label: '已送达' },
      { code: 'COMPLETED', value: 60, label: '已完成' },
      { code: 'CANCELLED', value: 70, label: '已取消' }
    ]
  },
  {
    type: 'BIZ_TYPE',
    typeName: '业务类型',
    items: [
      { code: 'TAKEOUT', value: 'takeout', label: '外卖' },
      { code: 'ERRAND_BUY', value: 'errand-buy', label: '帮我买' },
      { code: 'ERRAND_SEND', value: 'errand-send', label: '帮我送' },
      { code: 'ERRAND_QUEUE', value: 'errand-queue', label: '帮我排队' }
    ]
  },
  {
    type: 'CITY',
    typeName: '城市',
    items: [
      { code: 'BJ', value: '110100', label: '北京' },
      { code: 'SH', value: '310100', label: '上海' },
      { code: 'GZ', value: '440100', label: '广州' },
      { code: 'SZ', value: '440300', label: '深圳' },
      { code: 'HZ', value: '330100', label: '杭州' }
    ]
  }
]

/* ========== 权限/菜单 ========== */
const mockPerms: Permission[] = [
  { code: 'dashboard:view', name: '数据大盘', type: 'menu' },
  { code: 'user:list', name: '用户列表', type: 'menu' },
  { code: 'user:detail', name: '用户详情', type: 'button' },
  { code: 'user:risk', name: '用户风控', type: 'menu' },
  { code: 'merchant:audit', name: '商户审核', type: 'menu' },
  { code: 'merchant:list', name: '商户列表', type: 'menu' },
  { code: 'shop:list', name: '店铺列表', type: 'menu' },
  { code: 'rider:audit', name: '骑手审核', type: 'menu' },
  { code: 'rider:list', name: '骑手列表', type: 'menu' },
  { code: 'order:list', name: '订单列表', type: 'menu' },
  { code: 'order:audit', name: '订单审核', type: 'button' },
  { code: 'order:export', name: '订单导出', type: 'button' },
  { code: 'product:list', name: '商品列表', type: 'menu' },
  { code: 'content:banner', name: 'Banner', type: 'menu' },
  { code: 'review:list', name: '评价列表', type: 'menu' },
  { code: 'ops:coupon', name: '优惠券', type: 'menu' },
  { code: 'ops:promotion', name: '满减折扣', type: 'menu' },
  { code: 'ops:push', name: '推送', type: 'menu' },
  { code: 'ops:region', name: '区域', type: 'menu' },
  { code: 'finance:overview', name: '财务概览', type: 'menu' },
  { code: 'finance:withdraw-audit', name: '提现审核', type: 'menu' },
  { code: 'system:admin', name: '管理员', type: 'menu' },
  { code: 'system:role', name: '角色', type: 'menu' },
  { code: 'system:perm', name: '权限', type: 'menu' },
  { code: 'system:dict', name: '字典', type: 'menu' },
  { code: 'system:operation-log', name: '操作日志', type: 'menu' },
  { code: 'cs:ticket', name: '工单', type: 'menu' },
  { code: 'cs:arbitration', name: '仲裁', type: 'menu' },
  { code: 'risk:rule', name: '风控规则', type: 'menu' }
]

const mockRoles: Role[] = [
  { code: 'R_SUPER', name: '超级管理员', enabled: true },
  { code: 'R_ADMIN', name: '运营管理员', enabled: true },
  { code: 'R_FINANCE', name: '财务专员', enabled: true },
  { code: 'R_CS', name: '客服', enabled: true },
  { code: 'R_AUDIT', name: '审核专员', enabled: true }
]

/* ========== 菜单 ========== */
const mockMenus: BizMenu[] = [
  {
    code: 'dashboard',
    path: '/dashboard',
    name: 'BizDashboard',
    title: 'biz.menu.dashboard.root',
    icon: 'ri:pie-chart-line',
    children: [
      {
        code: 'dashboard:overview',
        path: 'overview',
        name: 'BizDashboardOverview',
        title: 'biz.menu.dashboard.overview'
      },
      {
        code: 'dashboard:trend',
        path: 'trend',
        name: 'BizDashboardTrend',
        title: 'biz.menu.dashboard.trend'
      },
      {
        code: 'dashboard:ops',
        path: 'ops',
        name: 'BizDashboardOps',
        title: 'biz.menu.dashboard.ops'
      },
      {
        code: 'dashboard:monitor',
        path: 'monitor',
        name: 'BizDashboardMonitor',
        title: 'biz.menu.dashboard.monitor'
      }
    ]
  },
  {
    code: 'user',
    path: '/biz-user',
    name: 'BizUser',
    title: 'biz.menu.user.root',
    icon: 'ri:user-line',
    children: [
      { code: 'user:list', path: 'list', name: 'BizUserList', title: 'biz.menu.user.list' },
      { code: 'user:risk', path: 'risk', name: 'BizUserRisk', title: 'biz.menu.user.risk' }
    ]
  },
  {
    code: 'merchant',
    path: '/merchant',
    name: 'BizMerchant',
    title: 'biz.menu.merchant.root',
    icon: 'ri:store-line',
    children: [
      {
        code: 'merchant:audit',
        path: 'audit',
        name: 'BizMerchantAudit',
        title: 'biz.menu.merchant.audit'
      },
      {
        code: 'merchant:list',
        path: 'list',
        name: 'BizMerchantList',
        title: 'biz.menu.merchant.list'
      },
      { code: 'shop:list', path: 'shop-list', name: 'BizShopList', title: 'biz.menu.shop.list' },
      {
        code: 'merchant:risk',
        path: 'risk',
        name: 'BizMerchantRisk',
        title: 'biz.menu.merchant.risk'
      }
    ]
  },
  {
    code: 'rider',
    path: '/rider',
    name: 'BizRider',
    title: 'biz.menu.rider.root',
    icon: 'ri:bike-line',
    children: [
      { code: 'rider:audit', path: 'audit', name: 'BizRiderAudit', title: 'biz.menu.rider.audit' },
      { code: 'rider:list', path: 'list', name: 'BizRiderList', title: 'biz.menu.rider.list' },
      {
        code: 'rider:transfer-audit',
        path: 'transfer-audit',
        name: 'BizRiderTransferAudit',
        title: 'biz.menu.rider.transferAudit'
      },
      {
        code: 'rider:reward',
        path: 'reward',
        name: 'BizRiderReward',
        title: 'biz.menu.rider.reward'
      },
      {
        code: 'rider:level-config',
        path: 'level-config',
        name: 'BizRiderLevelConfig',
        title: 'biz.menu.rider.levelConfig'
      },
      { code: 'rider:risk', path: 'risk', name: 'BizRiderRisk', title: 'biz.menu.rider.risk' }
    ]
  },
  {
    code: 'order',
    path: '/order',
    name: 'BizOrder',
    title: 'biz.menu.order.root',
    icon: 'ri:list-check',
    children: [
      { code: 'order:list', path: 'list', name: 'BizOrderList', title: 'biz.menu.order.list' },
      {
        code: 'order:cancel-refund-audit',
        path: 'cancel-refund-audit',
        name: 'BizOrderCancelRefundAudit',
        title: 'biz.menu.order.cancelRefund'
      },
      {
        code: 'order:complaint',
        path: 'complaint',
        name: 'BizOrderComplaint',
        title: 'biz.menu.order.complaint'
      },
      {
        code: 'order:arbitration',
        path: 'arbitration',
        name: 'BizOrderArbitration',
        title: 'biz.menu.order.arbitration'
      }
    ]
  },
  {
    code: 'product',
    path: '/product-content',
    name: 'BizProductContent',
    title: 'biz.menu.productContent.root',
    icon: 'ri:shopping-bag-line',
    children: [
      {
        code: 'product:list',
        path: 'product/list',
        name: 'BizProductList',
        title: 'biz.menu.productContent.productList'
      },
      {
        code: 'product:violation',
        path: 'product/violation',
        name: 'BizProductViolation',
        title: 'biz.menu.productContent.productViolation'
      },
      {
        code: 'content:banner',
        path: 'content/banner',
        name: 'BizContentBanner',
        title: 'biz.menu.productContent.banner'
      },
      {
        code: 'content:notice',
        path: 'content/notice',
        name: 'BizContentNotice',
        title: 'biz.menu.productContent.notice'
      },
      {
        code: 'review:list',
        path: 'review/list',
        name: 'BizReviewList',
        title: 'biz.menu.productContent.reviewList'
      }
    ]
  },
  {
    code: 'ops',
    path: '/ops',
    name: 'BizOps',
    title: 'biz.menu.ops.root',
    icon: 'ri:rocket-2-line',
    children: [
      { code: 'ops:coupon', path: 'coupon', name: 'BizOpsCoupon', title: 'biz.menu.ops.coupon' },
      {
        code: 'ops:promotion',
        path: 'promotion',
        name: 'BizOpsPromotion',
        title: 'biz.menu.ops.promotion'
      },
      { code: 'ops:push', path: 'push', name: 'BizOpsPush', title: 'biz.menu.ops.push' },
      { code: 'ops:region', path: 'region', name: 'BizOpsRegion', title: 'biz.menu.ops.region' }
    ]
  },
  {
    code: 'finance',
    path: '/finance',
    name: 'BizFinance',
    title: 'biz.menu.finance.root',
    icon: 'ri:money-cny-circle-line',
    children: [
      {
        code: 'finance:overview',
        path: 'overview',
        name: 'BizFinanceOverview',
        title: 'biz.menu.finance.overview'
      },
      {
        code: 'finance:settlement-rule',
        path: 'settlement-rule',
        name: 'BizFinanceSettlementRule',
        title: 'biz.menu.finance.settlementRule'
      },
      {
        code: 'finance:settlement-record',
        path: 'settlement-record',
        name: 'BizFinanceSettlementRecord',
        title: 'biz.menu.finance.settlementRecord'
      },
      {
        code: 'finance:withdraw-audit',
        path: 'withdraw-audit',
        name: 'BizFinanceWithdrawAudit',
        title: 'biz.menu.finance.withdrawAudit'
      },
      {
        code: 'finance:bill',
        path: 'bill',
        name: 'BizFinanceBill',
        title: 'biz.menu.finance.bill'
      },
      {
        code: 'finance:invoice-audit',
        path: 'invoice-audit',
        name: 'BizFinanceInvoiceAudit',
        title: 'biz.menu.finance.invoiceAudit'
      },
      {
        code: 'finance:reconciliation',
        path: 'reconciliation',
        name: 'BizFinanceReconciliation',
        title: 'biz.menu.finance.reconciliation'
      }
    ]
  },
  {
    code: 'system-biz',
    path: '/system-biz',
    name: 'BizSystem',
    title: 'biz.menu.systemBiz.root',
    icon: 'ri:settings-3-line',
    children: [
      {
        code: 'system:dict',
        path: 'dict',
        name: 'BizSystemDict',
        title: 'biz.menu.systemBiz.dict'
      },
      {
        code: 'system:operation-log',
        path: 'operation-log',
        name: 'BizSystemOperationLog',
        title: 'biz.menu.systemBiz.operationLog'
      }
    ]
  },
  {
    code: 'cs-risk',
    path: '/cs-risk',
    name: 'BizCsRisk',
    title: 'biz.menu.csRisk.root',
    icon: 'ri:shield-check-line',
    children: [
      { code: 'cs:ticket', path: 'ticket', name: 'BizCsTicket', title: 'biz.menu.csRisk.ticket' }
    ]
  }
]

/* ========== 用户 ========== */
const mockUsers: BizUser[] = Array.from({ length: 56 }).map((_, i) => ({
  id: 100 + i,
  nickname: `用户${100 + i}`,
  mobile: `138${String(10000000 + i).padStart(8, '0')}`,
  gender: ((i % 3) as 0 | 1 | 2) || 1,
  channel: ['mp', 'app', 'h5'][i % 3],
  registeredAt: new Date(Date.now() - i * 86400_000).toISOString(),
  status: i % 17 === 0 ? 2 : 1,
  orderCount: 5 + (i % 30),
  totalSpend: ((i + 1) * 88.88).toFixed(2),
  balance: ((i % 7) * 12.34).toFixed(2),
  riskLevel: (i % 23 === 0 ? 2 : i % 11 === 0 ? 1 : 0) as 0 | 1 | 2
}))

/* ========== 商户 ========== */
const mockMerchants: BizMerchant[] = Array.from({ length: 38 }).map((_, i) => ({
  id: 200 + i,
  name: `商户${200 + i}饭店`,
  contact: `张${200 + i}`,
  mobile: `139${String(10000000 + i).padStart(8, '0')}`,
  cityCode: ['110100', '310100', '440100'][i % 3],
  cityName: ['北京', '上海', '广州'][i % 3],
  shopCount: 1 + (i % 5),
  auditStatus: (i % 7 === 0 ? 0 : i % 11 === 0 ? 2 : 1) as 0 | 1 | 2 | 3,
  bizStatus: (i % 13 === 0 ? 0 : i % 19 === 0 ? 2 : 1) as 0 | 1 | 2,
  createdAt: new Date(Date.now() - i * 86400_000).toISOString(),
  riskLevel: (i % 17 === 0 ? 1 : 0) as 0 | 1 | 2
}))

/* ========== 店铺 ========== */
const mockShops: BizShop[] = Array.from({ length: 60 }).map((_, i) => ({
  id: 300 + i,
  merchantId: 200 + (i % 38),
  name: `${['川香小厨', '湘味轩', '东北菜馆', '兰州拉面', '沙县小吃'][i % 5]}（分店${i + 1}）`,
  cityCode: ['110100', '310100', '440100'][i % 3],
  cityName: ['北京', '上海', '广州'][i % 3],
  address: `示例路 ${i + 100} 号`,
  status: (i % 13 === 0 ? 0 : 1) as 0 | 1 | 2,
  noticeAuditStatus: (i % 5 === 0 ? 0 : 1) as 0 | 1 | 2
}))

/* ========== 骑手 ========== */
const mockRiders: BizRider[] = Array.from({ length: 75 }).map((_, i) => ({
  id: 400 + i,
  realName: `骑手${400 + i}`,
  mobile: `137${String(10000000 + i).padStart(8, '0')}`,
  cityCode: ['110100', '310100', '440100', '440300'][i % 4],
  cityName: ['北京', '上海', '广州', '深圳'][i % 4],
  level: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
  onlineStatus: (i % 4) as 0 | 1 | 2 | 3,
  auditStatus: (i % 11 === 0 ? 0 : i % 17 === 0 ? 2 : 1) as 0 | 1 | 2,
  todayOrders: i % 30,
  todayIncome: ((i % 30) * 8.88).toFixed(2),
  rating: 4 + (i % 10) / 10,
  onTimeRate: 0.9 + (i % 10) / 100,
  riskLevel: (i % 19 === 0 ? 1 : 0) as 0 | 1 | 2,
  createdAt: new Date(Date.now() - i * 86400_000).toISOString()
}))

/* ========== 订单 ========== */
const ORDER_STATUS_POOL = [10, 20, 30, 40, 50, 55, 60, 70, 80, 85, 90, 99]
const mockOrders: BizOrder[] = Array.from({ length: 240 }).map((_, i) => {
  const total = ((i % 100) + 1) * 8.88
  const refund = (i % 23 === 0 || i % 31 === 0) as boolean
  return {
    orderNo: `O${Date.now().toString(36)}${String(i).padStart(4, '0')}`,
    bizType: ['takeout', 'errand-buy', 'errand-send', 'errand-queue'][i % 4] as BizOrder['bizType'],
    status: ORDER_STATUS_POOL[i % ORDER_STATUS_POOL.length],
    userMobile: `138${String(10000000 + i).padStart(8, '0')}`,
    userNickname: `用户${100 + (i % 56)}`,
    shopName: `${['川香小厨', '湘味轩', '东北菜馆', '兰州拉面', '沙县小吃'][i % 5]}（分店${(i % 60) + 1}）`,
    shopId: 300 + (i % 60),
    riderName: `骑手${400 + (i % 75)}`,
    riderId: 400 + (i % 75),
    amountTotal: total.toFixed(2),
    amountReceivable: (total * 0.95).toFixed(2),
    payAt: new Date(Date.now() - i * 3_600_000).toISOString(),
    createdAt: new Date(Date.now() - i * 3_600_000 - 60_000).toISOString(),
    finishedAt:
      i % ORDER_STATUS_POOL.length >= 6
        ? new Date(Date.now() - i * 3_600_000 + 1_800_000).toISOString()
        : undefined,
    cityCode: ['110100', '310100', '440100'][i % 3],
    cityName: ['北京', '上海', '广州'][i % 3],
    hasRefunding: refund,
    hasArbitration: i % 47 === 0
  }
})

/* ========== 商品 ========== */
const mockProducts: BizProduct[] = Array.from({ length: 180 }).map((_, i) => ({
  id: 500 + i,
  shopId: 300 + (i % 60),
  shopName: `${['川香小厨', '湘味轩', '东北菜馆', '兰州拉面', '沙县小吃'][i % 5]}（分店${(i % 60) + 1}）`,
  name: `${['宫保鸡丁', '麻婆豆腐', '红烧肉', '鱼香肉丝', '回锅肉'][i % 5]}-${i + 1}`,
  categoryId: (i % 8) + 1,
  categoryName: ['川菜', '湘菜', '鲁菜', '粤菜', '面食', '烧烤', '甜品', '饮品'][i % 8],
  price: ((i % 50) + 5).toFixed(2),
  stockQty: 50 + (i % 200),
  monthlySales: 100 + (i % 500),
  status: (i % 23 === 0 ? 0 : 1) as 0 | 1,
  violationStatus: (i % 41 === 0 ? 1 : i % 47 === 0 ? 2 : 0) as 0 | 1 | 2,
  cover: `https://picsum.photos/seed/${i}/120/120`,
  createdAt: new Date(Date.now() - i * 86400_000).toISOString()
}))

/* ========== Banner / 公告 / 评价 ========== */
const mockBanners: BizBanner[] = Array.from({ length: 12 }).map((_, i) => ({
  id: 600 + i,
  title: `首页 Banner ${i + 1}`,
  imgUrl: `https://picsum.photos/seed/banner-${i}/1080/360`,
  linkType: ['shop', 'product', 'h5', 'category'][i % 4] as BizBanner['linkType'],
  linkValue: `300${i}`,
  cityCode: i % 2 === 0 ? '110100' : undefined,
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
  enabled: i % 5 !== 0,
  sort: i + 1
}))

const mockNotices: BizNotice[] = Array.from({ length: 8 }).map((_, i) => ({
  id: 700 + i,
  title: `平台公告 ${i + 1}`,
  content: `<p>这是公告内容 ${i + 1}，富文本展示</p>`,
  audience: ['all', 'user', 'merchant', 'rider'][i % 4] as BizNotice['audience'],
  cityCode: i % 2 === 0 ? '110100' : undefined,
  publishAt: new Date(Date.now() - i * 86400_000).toISOString(),
  expireAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
  enabled: true
}))

const mockReviews: BizReview[] = Array.from({ length: 95 }).map((_, i) => ({
  id: 800 + i,
  orderNo: mockOrders[i % mockOrders.length].orderNo,
  userNickname: `用户${100 + (i % 56)}`,
  shopName: `${['川香小厨', '湘味轩'][i % 2]}（分店${(i % 60) + 1}）`,
  riderName: i % 3 === 0 ? `骑手${400 + (i % 75)}` : undefined,
  rating: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
  content: `这是一条评价示例，编号 ${i + 1}`,
  status: (i % 13 === 0 ? 1 : i % 17 === 0 ? 3 : 0) as 0 | 1 | 2 | 3,
  createdAt: new Date(Date.now() - i * 86400_000).toISOString(),
  appealStatus: i % 17 === 0 ? 1 : 0
}))

/* ========== 优惠券 / 推送 / 区域 ========== */
const mockCoupons: BizCoupon[] = Array.from({ length: 24 }).map((_, i) => ({
  id: 900 + i,
  templateName: `优惠券模板-${i + 1}`,
  type: ['platform', 'shop', 'rider'][i % 3] as BizCoupon['type'],
  amount: ((i % 50) + 5).toFixed(2),
  thresholdAmount: ((i % 50) + 30).toFixed(2),
  totalQuota: 1000 * (i + 1),
  issuedCount: 100 * (i + 1),
  usedCount: 50 * (i + 1),
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
  status: (i % 7 === 0 ? 0 : 1) as 0 | 1 | 2 | 3,
  createdAt: new Date(Date.now() - i * 86400_000).toISOString()
}))

const mockPromotions: BizPromotion[] = Array.from({ length: 12 }).map((_, i) => ({
  id: 1000 + i,
  name: `营销活动-${i + 1}`,
  type: ['fullCut', 'discount', 'group', 'invite', 'newUser'][i % 5] as BizPromotion['type'],
  rules: { minSpend: 30 + i, discount: 5 + (i % 10) },
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
  enabled: i % 5 !== 0
}))

const mockPushTasks: BizPushTask[] = Array.from({ length: 18 }).map((_, i) => ({
  id: 1100 + i,
  title: `推送任务-${i + 1}`,
  channels: ['mp', 'app', 'sms', 'inbox'].slice(0, 1 + (i % 3)) as BizPushTask['channels'],
  audience: ['all', 'city', 'tag', 'user'][i % 4] as BizPushTask['audience'],
  audienceParam: { city: '110100' },
  templateCode: `TPL_${i + 1}`,
  status: (i % 5) as 0 | 1 | 2 | 3 | 4,
  scheduleAt: new Date(Date.now() + i * 3_600_000).toISOString(),
  createdAt: new Date(Date.now() - i * 86400_000).toISOString()
}))

const mockRegions: BizRegion[] = [
  {
    cityCode: '110100',
    cityName: '北京',
    enabled: true,
    baseDeliveryFee: '5.00',
    deliveryFeeRules: [
      { minDistance: 0, maxDistance: 3, fee: '5.00' },
      { minDistance: 3, maxDistance: 5, fee: '7.00' }
    ],
    errandPriceFormula: '5+1*distance'
  },
  {
    cityCode: '310100',
    cityName: '上海',
    enabled: true,
    baseDeliveryFee: '6.00',
    deliveryFeeRules: [
      { minDistance: 0, maxDistance: 3, fee: '6.00' },
      { minDistance: 3, maxDistance: 5, fee: '8.00' }
    ],
    errandPriceFormula: '6+1*distance'
  },
  {
    cityCode: '440100',
    cityName: '广州',
    enabled: true,
    baseDeliveryFee: '5.00',
    deliveryFeeRules: [{ minDistance: 0, maxDistance: 3, fee: '5.00' }],
    errandPriceFormula: '5+0.8*distance'
  }
]

/* ========== 财务 ========== */
const mockSettlementRules: BizSettlementRule[] = Array.from({ length: 6 }).map((_, i) => ({
  id: 1200 + i,
  scope: ['global', 'city', 'shop'][i % 3] as BizSettlementRule['scope'],
  scopeKey: ['global', '110100', `300${i}`][i % 3],
  platformRate: '15.00',
  merchantRate: '70.00',
  riderRate: '15.00',
  enabled: true
}))

const mockSettlementRecords: BizSettlementRecord[] = Array.from({ length: 80 }).map((_, i) => ({
  id: 1300 + i,
  orderNo: mockOrders[i % mockOrders.length].orderNo,
  total: ((i + 1) * 8.88).toFixed(2),
  platformAmount: ((i + 1) * 1.33).toFixed(2),
  merchantAmount: ((i + 1) * 6.21).toFixed(2),
  riderAmount: ((i + 1) * 1.33).toFixed(2),
  status: (i % 17 === 0 ? 3 : 2) as 0 | 1 | 2 | 3,
  errorMsg: i % 17 === 0 ? '账户冻结' : undefined,
  createdAt: new Date(Date.now() - i * 3_600_000).toISOString()
}))

const mockWithdraws: BizWithdraw[] = Array.from({ length: 45 }).map((_, i) => ({
  id: 1400 + i,
  applicantType: (i % 2 === 0 ? 'merchant' : 'rider') as 'merchant' | 'rider',
  applicantId: i % 2 === 0 ? 200 + (i % 38) : 400 + (i % 75),
  applicantName: i % 2 === 0 ? `商户${200 + (i % 38)}` : `骑手${400 + (i % 75)}`,
  amount: ((i + 1) * 100).toFixed(2),
  bankCard: `622588****${String(i + 1000).padStart(4, '0')}`,
  bankName: ['工商银行', '招商银行', '建设银行'][i % 3],
  status: (i % 6) as 0 | 1 | 2 | 3 | 4 | 5,
  remark: '',
  createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
  payAt: i % 6 >= 4 ? new Date(Date.now() - i * 1_800_000).toISOString() : undefined
}))

const mockBills: BizBill[] = Array.from({ length: 30 }).map((_, i) => ({
  id: 1500 + i,
  ownerType: (i % 2 === 0 ? 'merchant' : 'rider') as 'merchant' | 'rider',
  ownerId: i % 2 === 0 ? 200 + (i % 38) : 400 + (i % 75),
  ownerName: i % 2 === 0 ? `商户${200 + (i % 38)}` : `骑手${400 + (i % 75)}`,
  date: new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10),
  totalIncome: ((i + 1) * 200).toFixed(2),
  totalSpend: ((i + 1) * 50).toFixed(2),
  net: ((i + 1) * 150).toFixed(2)
}))

const mockInvoices: BizInvoice[] = Array.from({ length: 18 }).map((_, i) => ({
  id: 1600 + i,
  applicantType: (i % 2 === 0 ? 'user' : 'merchant') as 'user' | 'merchant',
  applicantName: i % 2 === 0 ? `用户${100 + i}` : `商户${200 + i}`,
  amount: ((i + 1) * 88.88).toFixed(2),
  title: `示例公司 ${i + 1}`,
  taxNo: `9111000077XXXX${String(i).padStart(2, '0')}`,
  email: `invoice${i}@example.com`,
  status: (i % 4) as 0 | 1 | 2 | 3,
  pdfUrl: i % 4 === 2 ? 'https://example.com/invoice.pdf' : undefined,
  createdAt: new Date(Date.now() - i * 86400_000).toISOString()
}))

/* ========== 系统 ========== */
const mockAdmins: BizAdmin[] = Array.from({ length: 12 }).map((_, i) => ({
  id: 1700 + i,
  username: `admin${i + 1}`,
  realName: `管理员${i + 1}`,
  email: `admin${i + 1}@example.com`,
  mobile: `136${String(10000000 + i).padStart(8, '0')}`,
  enabled: i % 7 !== 0,
  roles: [['R_SUPER'], ['R_ADMIN'], ['R_FINANCE'], ['R_CS'], ['R_AUDIT']][i % 5],
  createdAt: new Date(Date.now() - i * 86400_000).toISOString(),
  lastLoginAt: new Date(Date.now() - i * 3_600_000).toISOString()
}))

const mockOpLogs: BizOperationLog[] = Array.from({ length: 200 }).map((_, i) => ({
  id: 1800 + i,
  adminUsername: `admin${(i % 12) + 1}`,
  module: ['order', 'merchant', 'finance', 'system', 'rider'][i % 5],
  action: ['create', 'update', 'delete', 'audit', 'export'][i % 5],
  target: `target_${i}`,
  ip: `192.168.${i % 256}.${(i * 7) % 256}`,
  status: i % 13 === 0 ? 500 : 200,
  errorMsg: i % 13 === 0 ? '权限校验失败' : undefined,
  traceId: `admin-${Date.now().toString(36)}-${i}`,
  detail: { id: i, params: { foo: 'bar' } },
  createdAt: new Date(Date.now() - i * 60_000).toISOString()
}))

const mockApiLogs: BizApiLog[] = Array.from({ length: 200 }).map((_, i) => ({
  id: 1900 + i,
  traceId: `admin-${Date.now().toString(36)}-${i}`,
  path: [
    '/admin/order/list',
    '/admin/merchant/audit',
    '/admin/finance/withdraw',
    '/admin/system/dict',
    '/admin/rider/list'
  ][i % 5],
  method: ['GET', 'POST', 'PUT', 'DELETE'][i % 4],
  status: i % 17 === 0 ? 500 : 200,
  costMs: 30 + (i % 800),
  errorMsg: i % 17 === 0 ? 'Internal Server Error' : undefined,
  ip: `192.168.${i % 256}.${(i * 7) % 256}`,
  userAgent: 'Mozilla/5.0',
  createdAt: new Date(Date.now() - i * 60_000).toISOString()
}))

const mockSystemConfig = {
  platformName: 'O2O 跑腿+外卖',
  customerServiceTel: '400-800-1234',
  defaultCity: '110100',
  defaultDeliveryFee: '5.00'
}

const mockAppConfig = {
  payment: {
    weChat: { appId: 'wx_demo', mchId: 'mch_demo' },
    aliPay: { appId: 'ali_demo' }
  },
  map: { provider: 'amap', key: 'AMAP_KEY_PLACEHOLDER' },
  push: { jpushAppKey: 'JPUSH_KEY_PLACEHOLDER' },
  security: { maxLoginFails: 5, lockMinutes: 30 }
}

/* ========== 客服/风控 ========== */
const mockTickets: BizTicket[] = Array.from({ length: 36 }).map((_, i) => ({
  id: 2000 + i,
  orderNo: i % 3 === 0 ? mockOrders[i % mockOrders.length].orderNo : undefined,
  reporter: `用户${100 + (i % 56)}`,
  reporterRole: ['user', 'merchant', 'rider'][i % 3] as BizTicket['reporterRole'],
  category: ['配送投诉', '商品质量', '客服建议', '账户问题'][i % 4],
  content: `工单内容 ${i + 1}`,
  status: (i % 4) as 0 | 1 | 2 | 3,
  assignee: i % 4 >= 1 ? `admin${(i % 12) + 1}` : undefined,
  createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
  closedAt: i % 4 === 2 ? new Date(Date.now() - i * 1_800_000).toISOString() : undefined
}))

const mockArbitrations: BizArbitration[] = Array.from({ length: 18 }).map((_, i) => ({
  id: 2100 + i,
  orderNo: mockOrders[i % mockOrders.length].orderNo,
  applicantRole: ['user', 'merchant', 'rider'][i % 3] as BizArbitration['applicantRole'],
  applicantName: ['用户' + i, '商户' + i, '骑手' + i][i % 3],
  reason: '订单争议',
  evidence: [`https://picsum.photos/seed/evi-${i}/600/400`],
  status: (i % 4) as 0 | 1 | 2 | 3,
  judgeResult:
    i % 4 === 2
      ? (['user', 'merchant', 'rider', 'split'][i % 4] as 'user' | 'merchant' | 'rider' | 'split')
      : undefined,
  refundAmount: i % 4 === 2 ? '50.00' : undefined,
  createdAt: new Date(Date.now() - i * 3_600_000).toISOString()
}))

const mockRiskRules: BizRiskRule[] = Array.from({ length: 8 }).map((_, i) => ({
  id: 2200 + i,
  name: [
    '频率限制',
    '异常消费',
    '刷单特征',
    '套现识别',
    '同设备多账号',
    '异常地理位置',
    '夜间高频',
    '黑名单 IP'
  ][i],
  category: ['fraud', 'cheat'][i % 2],
  enabled: i % 5 !== 0,
  threshold: { count: 10 + i, window: 60 + i },
  action: ['block', 'mark', 'notify'][i % 3],
  createdAt: new Date(Date.now() - i * 86400_000).toISOString()
}))

const mockRiskOrders: BizRiskOrder[] = Array.from({ length: 24 }).map((_, i) => ({
  orderNo: mockOrders[i % mockOrders.length].orderNo,
  reason: '高额非常用地址',
  level: (i % 3) as 0 | 1 | 2,
  hitRules: ['频率限制', '异常消费'].slice(0, 1 + (i % 2)),
  reviewedBy: i % 3 === 1 ? `admin${(i % 12) + 1}` : undefined,
  reviewedAt: i % 3 === 1 ? new Date(Date.now() - i * 1_800_000).toISOString() : undefined,
  status: ['pending', 'pass', 'block'][i % 3] as 'pending' | 'pass' | 'block'
}))

const mockCheats: BizCheatRecord[] = Array.from({ length: 16 }).map((_, i) => ({
  id: 2300 + i,
  targetType: ['user', 'merchant', 'rider'][i % 3] as 'user' | 'merchant' | 'rider',
  targetId: 100 + i,
  targetName: ['用户' + i, '商户' + i, '骑手' + i][i % 3],
  category: (i % 2 === 0 ? 'brushing' : 'cashing') as 'brushing' | 'cashing',
  score: 70 + (i % 30),
  evidence: { sample: '订单 IP 集中', count: 12 + i },
  status: ['detected', 'reviewed', 'punished'][i % 3] as 'detected' | 'reviewed' | 'punished',
  createdAt: new Date(Date.now() - i * 86400_000).toISOString()
}))

/* ========== 异步导出 ========== */
const exportJobs = new Map<string, ExportJob>()

/* ========== 路由分发 ========== */

interface MockHandler {
  test: (path: string, method: string) => boolean
  handle: (
    path: string,
    method: string,
    params?: Record<string, unknown>,
    data?: unknown
  ) => Promise<unknown>
}

const handlers: MockHandler[] = [
  /* 字典 */
  {
    test: (p, m) => p === '/system/dict/all' && m === 'GET',
    handle: async () => fakeDelay(dictGroups)
  },
  /* 权限/菜单 */
  {
    test: (p, m) => p === '/system/permissions' && m === 'GET',
    handle: async () =>
      fakeDelay({
        menus: mockMenus,
        permissions: mockPerms.map((x) => x.code),
        roles: mockRoles.map((r) => r.code)
      })
  },
  {
    test: (p, m) => p === '/system/role/list' && m === 'GET',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockRoles, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p, m) => p === '/system/permission/list' && m === 'GET',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockPerms, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  /* 大盘 */
  {
    test: (p) => p.startsWith('/dashboard/overview'),
    handle: async () =>
      fakeDelay({
        kpi: {
          todayOrders: 1234 + Math.floor(Math.random() * 50),
          todayAmount: '23456.78',
          totalUsers: 982345,
          totalMerchants: 5621,
          onlineRiders: 432,
          deliveryRate: 0.96,
          pendingArbitration: 12,
          pendingMerchantAudit: 8
        },
        trend: Array.from({ length: 24 }).map((_, i) => ({
          hour: `${i}:00`,
          orders: 50 + Math.floor(Math.random() * 200),
          amount: 1000 + Math.floor(Math.random() * 3000)
        })),
        topShops: mockShops.slice(0, 10).map((s, i) => ({ name: s.name, orders: 1000 - i * 80 })),
        topProducts: mockProducts
          .slice(0, 10)
          .map((p, i) => ({ name: p.name, sales: 800 - i * 60 })),
        anomalyOrders: mockOrders.slice(0, 20)
      })
  },
  {
    test: (p) => p.startsWith('/dashboard/trend'),
    handle: async (_p, _m, params) => {
      const period = (params?.period as string) || 'day'
      const len = period === 'month' ? 30 : period === 'week' ? 12 : 24
      return fakeDelay(
        Array.from({ length: len }).map((_, i) => ({
          ts: i,
          orders: 100 + Math.floor(Math.random() * 200),
          amount: 5000 + Math.floor(Math.random() * 5000),
          users: 200 + Math.floor(Math.random() * 100),
          merchants: 5 + Math.floor(Math.random() * 10)
        }))
      )
    }
  },
  {
    test: (p) => p.startsWith('/dashboard/ops'),
    handle: async () =>
      fakeDelay({
        topShops: mockShops.slice(0, 10).map((s, i) => ({ name: s.name, orders: 1000 - i * 80 })),
        topProducts: mockProducts
          .slice(0, 10)
          .map((p, i) => ({ name: p.name, sales: 800 - i * 60 })),
        topRiders: mockRiders
          .slice(0, 10)
          .map((r, i) => ({ name: r.realName, orders: 200 - i * 15, rating: r.rating })),
        cityDistribution: [
          { city: '北京', count: 320 },
          { city: '上海', count: 280 },
          { city: '广州', count: 220 },
          { city: '深圳', count: 180 }
        ],
        anomalyStat: { complaintCount: 23, refundCount: 18, arbitrationCount: 4 }
      })
  },
  {
    test: (p) => p.startsWith('/dashboard/monitor'),
    handle: async () =>
      fakeDelay({
        pendingArbitration: mockArbitrations.filter((a) => a.status === 0).slice(0, 10),
        pendingAudit: mockMerchants.filter((m) => m.auditStatus === 0).slice(0, 10),
        anomalyOrders: mockOrders.filter((o) => o.status === 99 || o.hasArbitration).slice(0, 20),
        complaintNew: mockTickets.filter((t) => t.status === 0).slice(0, 10),
        riskHits: mockRiskOrders.filter((r) => r.status === 'pending').slice(0, 10)
      })
  },
  /* 用户 */
  {
    test: (p) => p === '/users',
    handle: async (_p, _m, params) => {
      const page = Number(params?.page || 1)
      const pageSize = Number(params?.pageSize || 20)
      const keyword = (params?.keyword as string) || ''
      const filtered = keyword
        ? mockUsers.filter((u) => u.nickname.includes(keyword) || u.mobile.includes(keyword))
        : mockUsers
      return fakeDelay(list(filtered, page, pageSize))
    }
  },
  {
    test: (p) => /^\/users\/\d+$/.test(p),
    handle: async (p) => {
      const id = Number(p.split('/').pop())
      const u = mockUsers.find((x) => x.id === id) || mockUsers[0]
      const orders = mockOrders
        .filter((o) => Number(o.userMobile.slice(-3)) % 56 === id - 100)
        .slice(0, 10)
      return fakeDelay({
        ...u,
        orders,
        addresses: [
          { id: 1, address: '北京市朝阳区示例路 1 号', tag: '家', isDefault: true },
          { id: 2, address: '北京市海淀区示例路 2 号', tag: '公司', isDefault: false }
        ],
        coupons: mockCoupons
          .slice(0, 5)
          .map((c) => ({ id: c.id, templateName: c.templateName, status: 1, expiredAt: c.endAt })),
        balanceFlows: Array.from({ length: 8 }).map((_, i) => ({
          id: i,
          amount: ((i % 5) * 5).toFixed(2),
          type: i % 2 === 0 ? 'income' : 'spend',
          createdAt: new Date(Date.now() - i * 86400_000).toISOString()
        })),
        complaints: mockTickets.filter((t) => t.reporter.includes(String(id))).slice(0, 3)
      })
    }
  },
  {
    test: (p) => p === '/blacklist',
    handle: async (_p, _m, params) => {
      const page = Number(params?.page || 1)
      const pageSize = Number(params?.pageSize || 20)
      const filtered = mockUsers.filter((u) => (u.riskLevel || 0) > 0)
      return fakeDelay(list(filtered, page, pageSize))
    }
  },
  /* 商户 */
  {
    test: (p) => p === '/merchants' || p === '/merchant/audit/list',
    handle: async (_p, _m, params) => {
      const filtered = mockMerchants.filter(
        (m) => m.auditStatus === 0 || m.auditStatus === Number(params?.status)
      )
      return fakeDelay(list(filtered, Number(params?.page || 1), Number(params?.pageSize || 20)))
    }
  },
  {
    test: (p) => p === '/merchants/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockMerchants, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => /^\/merchants\/\d+$/.test(p),
    handle: async (p) => {
      const id = Number(p.split('/').pop())
      const m = mockMerchants.find((x) => x.id === id) || mockMerchants[0]
      const shops = mockShops.filter((s) => s.merchantId === id)
      return fakeDelay({ ...m, shops })
    }
  },
  {
    test: (p) => p === '/shops',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockShops, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/shop/notice-audit/list',
    handle: async (_p, _m, params) =>
      fakeDelay(
        list(
          mockShops.filter((s) => s.noticeAuditStatus === 0),
          Number(params?.page || 1),
          Number(params?.pageSize || 20)
        )
      )
  },
  /* 骑手 */
  {
    test: (p) => p === '/riders' || p === '/rider/audit/list',
    handle: async (_p, _m, params) =>
      fakeDelay(
        list(
          mockRiders.filter((r) => r.auditStatus === 0),
          Number(params?.page || 1),
          Number(params?.pageSize || 20)
        )
      )
  },
  {
    test: (p) => p === '/riders/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockRiders, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => /^\/rider\/\d+\/track$/.test(p),
    handle: async () => {
      const points: RiderTrackPoint[] = Array.from({ length: 60 }).map((_, i) => ({
        ts: Date.now() - (60 - i) * 60_000,
        lng: 116.397 + i * 0.001,
        lat: 39.916 + i * 0.001,
        speed: 5 + (i % 8),
        bizStatus: (i % 5) + 1
      }))
      return fakeDelay(points)
    }
  },
  {
    test: (p) => /^\/riders\/\d+$/.test(p),
    handle: async (p) => {
      const id = Number(p.split('/').pop())
      const r = mockRiders.find((x) => x.id === id) || mockRiders[0]
      return fakeDelay({
        ...r,
        recentOrders: mockOrders.slice(0, 10),
        rewards: Array.from({ length: 8 }).map((_, i) => ({
          id: i,
          type: i % 2 === 0 ? '奖励' : '惩罚',
          amount: ((i + 1) * 5).toFixed(2),
          reason: '示例原因 ' + i,
          createdAt: new Date(Date.now() - i * 86400_000).toISOString()
        }))
      })
    }
  },
  {
    test: (p) => p === '/transfers',
    handle: async (_p, _m, params) => {
      const list2 = Array.from({ length: 12 }).map((_, i) => ({
        id: 5000 + i,
        orderNo: mockOrders[i].orderNo,
        fromRiderName: mockRiders[i].realName,
        toRiderName: mockRiders[i + 1].realName,
        reason: '示例转单原因',
        status: (i % 3) as 0 | 1 | 2,
        createdAt: new Date(Date.now() - i * 3_600_000).toISOString()
      }))
      return fakeDelay(list(list2, Number(params?.page || 1), Number(params?.pageSize || 20)))
    }
  },
  {
    test: (p) => p === '/rider/reward/rules',
    handle: async () =>
      fakeDelay([
        { id: 1, type: 'punish', name: '配送超时', threshold: 30, amount: '5.00', enabled: true },
        {
          id: 2,
          type: 'reward',
          name: '连续 7 天满 30 单',
          threshold: 7,
          amount: '50.00',
          enabled: true
        },
        {
          id: 3,
          type: 'reward',
          name: '当日满 30 单',
          threshold: 30,
          amount: '20.00',
          enabled: true
        }
      ])
  },
  {
    test: (p) => p === '/rider/level/config',
    handle: async () =>
      fakeDelay([
        { level: 1, name: '青铜', condition: { ordersMonth: 50, rating: 4.0 }, weight: 1.0 },
        { level: 2, name: '白银', condition: { ordersMonth: 150, rating: 4.3 }, weight: 1.1 },
        { level: 3, name: '黄金', condition: { ordersMonth: 300, rating: 4.5 }, weight: 1.2 },
        { level: 4, name: '钻石', condition: { ordersMonth: 500, rating: 4.7 }, weight: 1.3 },
        { level: 5, name: '王者', condition: { ordersMonth: 800, rating: 4.8 }, weight: 1.5 }
      ])
  },
  /* 订单 */
  {
    test: (p) => p === '/orders',
    handle: async (_p, _m, params) => {
      const status = params?.status !== undefined ? Number(params.status) : null
      const keyword = (params?.keyword as string) || ''
      let filtered = mockOrders
      if (status !== null && !Number.isNaN(status))
        filtered = filtered.filter((o) => o.status === status)
      if (keyword)
        filtered = filtered.filter(
          (o) => o.orderNo.includes(keyword) || o.userMobile.includes(keyword)
        )
      return fakeDelay(list(filtered, Number(params?.page || 1), Number(params?.pageSize || 20)))
    }
  },
  {
    test: (p) => /^\/orders\/[A-Za-z0-9]+$/.test(p),
    handle: async (p) => {
      const orderNo = p.split('/').pop()!
      const o = mockOrders.find((x) => x.orderNo === orderNo) || mockOrders[0]
      const flow: OrderFlowNode[] = [
        { code: 10, label: '待支付', reached: o.status >= 10 },
        { code: 20, label: '已支付', reached: o.status >= 20 },
        { code: 30, label: '已接单', reached: o.status >= 30 },
        { code: 40, label: '已出餐', reached: o.status >= 40 },
        { code: 50, label: '配送中', reached: o.status >= 50 },
        { code: 55, label: '已送达', reached: o.status >= 55 },
        { code: 60, label: '已完成', reached: o.status >= 60 }
      ].map((n) => ({
        ...n,
        current: n.code === o.status,
        ts: new Date(Date.now() - (60 - n.code) * 60_000).toISOString()
      }))
      return fakeDelay({
        ...o,
        flow,
        items: [
          { name: '宫保鸡丁', qty: 2, price: '28.00' },
          { name: '白米饭', qty: 1, price: '3.00' }
        ]
      })
    }
  },
  {
    test: (p) => p === '/after-sales',
    handle: async (_p, _m, params) =>
      fakeDelay(
        list(
          mockOrders.filter((o) => o.hasRefunding),
          Number(params?.page || 1),
          Number(params?.pageSize || 20)
        )
      )
  },
  {
    test: (p) => p === '/complaints',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockTickets, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/arbitrations',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockArbitrations, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  /* 商品/内容/评价 */
  {
    test: (p) => p === '/products',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockProducts, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/products/violation',
    handle: async (_p, _m, params) =>
      fakeDelay(
        list(
          mockProducts.filter((p) => (p.violationStatus || 0) > 0),
          Number(params?.page || 1),
          Number(params?.pageSize || 20)
        )
      )
  },
  {
    test: (p) => p === '/product/category/list',
    handle: async () =>
      fakeDelay([
        { id: 1, name: '川菜' },
        { id: 2, name: '湘菜' },
        { id: 3, name: '鲁菜' },
        { id: 4, name: '粤菜' },
        { id: 5, name: '面食' },
        { id: 6, name: '烧烤' },
        { id: 7, name: '甜品' },
        { id: 8, name: '饮品' }
      ])
  },
  {
    test: (p) => p === '/content/banner/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockBanners, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/content/quick-entry/list',
    handle: async () =>
      fakeDelay([
        { id: 1, name: '夜宵', icon: 'ri:moon-line', sort: 1 },
        { id: 2, name: '甜品', icon: 'ri:cake-2-line', sort: 2 },
        { id: 3, name: '帮我送', icon: 'ri:bike-line', sort: 3 },
        { id: 4, name: '帮我买', icon: 'ri:shopping-bag-line', sort: 4 }
      ])
  },
  {
    test: (p) => p === '/content/hot-search/list',
    handle: async () =>
      fakeDelay([
        { id: 1, keyword: '炸鸡', sort: 1 },
        { id: 2, keyword: '奶茶', sort: 2 },
        { id: 3, keyword: '烧烤', sort: 3 },
        { id: 4, keyword: '披萨', sort: 4 }
      ])
  },
  {
    test: (p) => p === '/content/notice/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockNotices, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/reviews',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockReviews, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/review-appeals',
    handle: async (_p, _m, params) =>
      fakeDelay(
        list(
          mockReviews.filter((r) => (r.appealStatus || 0) > 0),
          Number(params?.page || 1),
          Number(params?.pageSize || 20)
        )
      )
  },
  /* 运营 */
  {
    test: (p) => p === '/coupons',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockCoupons, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/promotions',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockPromotions, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/ops/push/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockPushTasks, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/ops/push-template/list',
    handle: async () =>
      fakeDelay([
        {
          id: 1,
          code: 'TPL_ORDER_NEW',
          name: '新订单提醒',
          channels: ['mp', 'app'],
          content: '您有新订单'
        },
        {
          id: 2,
          code: 'TPL_ORDER_DELIVERED',
          name: '订单送达',
          channels: ['mp'],
          content: '您的订单已送达'
        },
        {
          id: 3,
          code: 'TPL_COUPON_NEW',
          name: '新券到账',
          channels: ['app'],
          content: '您获得了一张新券'
        }
      ])
  },
  {
    test: (p) => p === '/ops/region/list',
    handle: async () => fakeDelay(mockRegions)
  },
  /* 财务 */
  {
    test: (p) => p === '/finance/overview',
    handle: async () =>
      fakeDelay({
        income: '1234567.89',
        commission: '234567.89',
        refund: '34567.89',
        balance: '900000.00',
        trend: Array.from({ length: 30 }).map((_, i) => ({
          date: new Date(Date.now() - (30 - i) * 86400_000).toISOString().slice(0, 10),
          income: 30000 + Math.floor(Math.random() * 20000),
          commission: 5000 + Math.floor(Math.random() * 3000),
          refund: 1000 + Math.floor(Math.random() * 1000)
        }))
      })
  },
  {
    test: (p) => p === '/settlement-rules',
    handle: async () => fakeDelay(mockSettlementRules)
  },
  {
    test: (p) => p === '/settlement-records',
    handle: async (_p, _m, params) =>
      fakeDelay(
        list(mockSettlementRecords, Number(params?.page || 1), Number(params?.pageSize || 20))
      )
  },
  {
    test: (p) => p === '/withdrawals',
    handle: async (_p, _m, params) => {
      const status = params?.status !== undefined ? Number(params.status) : null
      let filtered = mockWithdraws
      if (status !== null && !Number.isNaN(status))
        filtered = filtered.filter((w) => w.status === status)
      return fakeDelay(list(filtered, Number(params?.page || 1), Number(params?.pageSize || 20)))
    }
  },
  {
    test: (p) => p === '/finance/bill/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockBills, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/invoices',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockInvoices, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/reconciliation-report',
    handle: async (_p, _m, params) =>
      fakeDelay(
        list(mockSettlementRecords, Number(params?.page || 1), Number(params?.pageSize || 20))
      )
  },
  /* 系统 */
  {
    test: (p) => p === '/system/admin/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockAdmins, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/system/dict/list',
    handle: async () => fakeDelay(dictGroups)
  },
  {
    test: (p) => p === '/system/operation-log/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockOpLogs, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/system/api-log/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockApiLogs, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/system/system-config',
    handle: async () => fakeDelay(mockSystemConfig)
  },
  {
    test: (p) => p === '/system/app-config',
    handle: async () => fakeDelay(mockAppConfig)
  },
  /* 客服/风控 */
  {
    test: (p) => p === '/tickets',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockTickets, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/arbitrations/cs',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockArbitrations, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/risk/rule/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockRiskRules, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/risk/risk-order/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockRiskOrders, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/risk/cheat/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockCheats, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  {
    test: (p) => p === '/risk/record/list',
    handle: async (_p, _m, params) =>
      fakeDelay(list(mockCheats, Number(params?.page || 1), Number(params?.pageSize || 20)))
  },
  /* 异步导出 */
  {
    test: (p) => p === '/export/job',
    handle: async (_p, m, _params, data) => {
      if (m === 'POST') {
        const id = `job_${seqId()}`
        const payload = (data || {}) as { name?: string; total?: number }
        const job: ExportJob = {
          id,
          name: payload.name || '导出任务',
          status: 1,
          progress: 0,
          total: payload.total || 5000,
          createdAt: Date.now()
        }
        exportJobs.set(id, job)
        return fakeDelay({ id, total: job.total })
      }
      return fakeDelay({})
    }
  },
  {
    test: (p) => /^\/export\/job\/[\w-]+$/.test(p),
    handle: async (p, m) => {
      const id = p.split('/').pop()!
      const job = exportJobs.get(id)
      if (!job)
        return fakeDelay({
          id,
          status: 3,
          progress: 0,
          total: 0,
          error: 'job not found',
          createdAt: Date.now()
        })
      if (m === 'GET') {
        const elapsed = Date.now() - job.createdAt
        if (elapsed > 8000) {
          job.status = 2
          job.progress = 100
          job.url = `data:text/plain;base64,${btoa('mock export ok')}`
          job.finishedAt = Date.now()
        } else {
          job.progress = Math.min(99, Math.floor((elapsed / 8000) * 100))
        }
        return fakeDelay(job)
      }
      if (m === 'DELETE') {
        job.status = 4
        job.finishedAt = Date.now()
        return fakeDelay({})
      }
      return fakeDelay(job)
    }
  }
]

/**
 * 路由分发：返回匹配的 mock 数据，无匹配返回 undefined
 */
export async function mockDispatch<T = unknown>(
  url: string,
  method: string,
  params?: Record<string, unknown>,
  data?: unknown
): Promise<{ matched: boolean; data?: T }> {
  if (!useMock()) return { matched: false }
  const path = url.replace(/^\/+/, '/')
  const hit = handlers.find((h) => h.test(path, method.toUpperCase()))
  if (!hit) return { matched: false }
  const out = (await hit.handle(path, method.toUpperCase(), params, data)) as T
  return { matched: true, data: out }
}
