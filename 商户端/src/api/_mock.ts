/**
 * @file api/_mock.ts
 * @stage P6/T6.2 (Sprint 1)
 * @desc Mock 数据集中管理（启动时通过 env VITE_USE_MOCK=1 启用）
 *
 * 使用方式：
 *   - 后端 docker 启动不了时：在 env/.env.development 设 VITE_USE_MOCK=1
 *   - API 模块：在调用 request 之前 if (mockEnabled()) return mockXxx()
 *   - 真机联调归 P9，本期 mock 数据用于跑通 UI
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import type {
  MerchantUser,
  MerchantLoginResult,
  Shop,
  MerchantOrder,
  Product,
  ProductCategory,
  FinanceOverview,
  StatOverview,
  StatPoint,
  ShopCoupon,
  Message
} from '@/types/biz'

/** 是否启用 mock */
export function mockEnabled(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.VITE_USE_MOCK === '1' || env?.VITE_USE_MOCK === 'true'
}

/** 模拟网络延迟 */
export function delay<T>(data: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}

/* ========== Mock 数据 ========== */

/** 当前模拟商户 */
export const mockUser: MerchantUser = {
  id: 'mu-1001',
  mchntNo: 'M20260419001',
  fullName: '上海示例餐饮有限公司',
  contactName: '张三',
  mobile: '13800138000',
  avatar: null,
  accountType: 1,
  shopCount: 2,
  status: 1,
  createdAt: '2026-04-01T10:00:00.000Z'
}

export const mockLoginResult: MerchantLoginResult = {
  accessToken: 'mock-access-token-' + Date.now(),
  refreshToken: 'mock-refresh-token-' + Date.now(),
  user: mockUser,
  permissions: [],
  menus: []
}

export const mockShops: Shop[] = [
  {
    id: 'sp-1001',
    merchantId: 'mu-1001',
    name: '示例外卖店（南京路店）',
    intro: '上海地区精选好店，主营粤菜',
    logo: 'https://placehold.co/100x100',
    cover: 'https://placehold.co/600x300',
    images: [],
    announcement: '欢迎光临，本店今日满 50 减 5！',
    category: '中餐',
    isOpen: 1,
    autoAccept: 0,
    scoreAvg: '4.8',
    monthSales: 1280,
    minAmount: '30.00',
    deliveryFee: '5.00',
    prepareMin: 25,
    contactPhone: '021-12345678',
    cityCode: '310100',
    lng: 121.4737,
    lat: 31.2304,
    address: '上海市黄浦区南京东路 100 号',
    supportPreOrder: 1,
    supportInvoice: 1,
    createdAt: '2026-04-01T10:00:00.000Z'
  },
  {
    id: 'sp-1002',
    merchantId: 'mu-1001',
    name: '示例外卖店（陆家嘴店）',
    intro: '陆家嘴上班族的首选',
    logo: 'https://placehold.co/100x100',
    cover: null,
    category: '快餐',
    isOpen: 0,
    autoAccept: 1,
    scoreAvg: '4.6',
    monthSales: 875,
    minAmount: '20.00',
    deliveryFee: '3.00',
    prepareMin: 15,
    contactPhone: '021-87654321',
    cityCode: '310100',
    lng: 121.5057,
    lat: 31.2403,
    address: '上海市浦东新区陆家嘴环路 1000 号',
    supportPreOrder: 0,
    supportInvoice: 1,
    createdAt: '2026-04-10T10:00:00.000Z'
  }
]

export const mockOrders: MerchantOrder[] = [
  {
    orderNo: 'TO20260419001',
    orderType: 1,
    status: 10,
    shopId: 'sp-1001',
    shopName: '示例外卖店（南京路店）',
    userNickname: '张***',
    receiverName: '张先生',
    receiverMobile: '138****8888',
    receiverAddress: '南京东路 200 号 ***单元',
    receiverLng: 121.475,
    receiverLat: 31.232,
    distance: 800,
    itemsAmount: '78.00',
    deliveryFee: '5.00',
    discountAmount: '5.00',
    platformFee: '6.20',
    merchantIncome: '71.80',
    payAmount: '78.00',
    deliveryType: 1,
    items: [
      {
        productId: 'pd-1001',
        skuId: 'sk-1001',
        qty: 2,
        unitPrice: '28.00',
        productName: '黑椒牛柳饭',
        skuName: '默认',
        subtotal: '56.00'
      },
      {
        productId: 'pd-1002',
        skuId: 'sk-1002',
        qty: 1,
        unitPrice: '22.00',
        productName: '糖醋里脊套餐',
        skuName: '默认',
        subtotal: '22.00'
      }
    ],
    isException: 0,
    isPrinted: 0,
    pickupCode: '8731',
    createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
  }
]

export const mockCategories: ProductCategory[] = [
  {
    id: 'cat-1',
    shopId: 'sp-1001',
    name: '招牌',
    sortOrder: 1,
    productCount: 5,
    createdAt: '2026-04-01T10:00:00.000Z'
  },
  {
    id: 'cat-2',
    shopId: 'sp-1001',
    name: '套餐',
    sortOrder: 2,
    productCount: 3,
    createdAt: '2026-04-01T10:00:00.000Z'
  }
]

export const mockProducts: Product[] = [
  {
    id: 'pd-1001',
    shopId: 'sp-1001',
    categoryId: 'cat-1',
    categoryName: '招牌',
    name: '黑椒牛柳饭',
    description: '精选澳洲牛肉，黑椒酱独家配方',
    images: ['https://placehold.co/300x200'],
    price: '28.00',
    status: 1,
    hasSku: 0,
    isCombo: 0,
    stockQty: 100,
    tags: ['招牌', '热销'],
    monthSales: 256,
    scoreAvg: '4.8',
    sortOrder: 1,
    createdAt: '2026-04-01T10:00:00.000Z'
  }
]

export const mockFinance: FinanceOverview = {
  available: '12580.50',
  frozen: '0.00',
  todayIncome: '786.30',
  todayOrderCount: 12,
  monthIncome: '23456.80',
  totalPlatformFee: '1872.46'
}

export const mockStatOverview: StatOverview = {
  startDate: '2026-04-12',
  endDate: '2026-04-19',
  totalSales: '8765.40',
  totalOrderCount: 142,
  avgOrderValue: '61.73',
  uv: 1280,
  conversionRate: '11.09'
}

export function mockSalesTrend(days = 7): StatPoint[] {
  const r: StatPoint[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000)
    const dateStr = d.toISOString().slice(0, 10)
    r.push({ date: dateStr, value: Math.floor(Math.random() * 2000) + 500 })
  }
  return r
}

export const mockCoupons: ShopCoupon[] = [
  {
    id: 'cp-1001',
    shopId: 'sp-1001',
    couponType: 1,
    name: '满 50 减 5',
    discountValue: '5.00',
    minOrderAmount: '50.00',
    validType: 2,
    validFrom: '2026-04-01T00:00:00.000Z',
    validTo: '2026-12-31T23:59:59.000Z',
    totalQty: 1000,
    receivedQty: 245,
    usedQty: 89,
    status: 1,
    createdAt: '2026-04-01T10:00:00.000Z'
  }
]

export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    category: 'order',
    title: '新订单提醒',
    body: '订单 TO20260419001 待接单',
    bizNo: 'TO20260419001',
    isRead: 0,
    createdAt: new Date(Date.now() - 60 * 1000).toISOString()
  },
  {
    id: 'msg-2',
    category: 'system',
    title: '系统升级公告',
    body: '4 月 25 日 0:00-2:00 平台升级，请提前关闭店铺',
    isRead: 0,
    createdAt: new Date(Date.now() - 3600 * 1000).toISOString()
  }
]
