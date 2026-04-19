/**
 * @file seed-data.ts
 * @stage P4/T4.50~T4.51（Sprint 8）
 * @desc 闭环 e2e 测试用静态种子数据：用户 / 商户 / 骑手 / 店铺 / 商品 / SKU / 优惠券 / 账户
 * @author 单 Agent V2.0（Subagent 7）
 *
 * 设计：
 *   - 全部数据为内存常量；不入库
 *   - service 层 mock 时 findOne / find 直接返回这些常量
 *   - 单测 / 框架级 e2e 共用，确保上下游字段对齐
 */

/* ============================================================================
 * 用户 / 商户 / 骑手
 * ============================================================================ */

export const SEED_USER = {
  id: 'U_TEST_001',
  mobile: '13800138001',
  nickname: 'TestUser'
}

export const SEED_MERCHANT = {
  id: 'M_TEST_001',
  name: 'Test Merchant'
}

export const SEED_RIDER = {
  id: 'R_TEST_001',
  realName: 'Rider01',
  mobile: '13900139001'
}

export const SEED_ADMIN = {
  id: 'A_TEST_001',
  username: 'admin'
}

/* ============================================================================
 * 店铺 / 商品 / SKU
 * ============================================================================ */

export const SEED_SHOP = {
  id: 'S_TEST_001',
  merchantId: SEED_MERCHANT.id,
  name: 'Test Shop',
  cityCode: '110000',
  lng: 116.4,
  lat: 39.9,
  status: 1,
  isDeleted: 0
}

export const SEED_PRODUCT = {
  id: 'P_TEST_001',
  shopId: SEED_SHOP.id,
  name: 'Test Burger',
  price: '20.00',
  status: 1,
  isDeleted: 0
}

export const SEED_SKU = {
  id: 'SKU_TEST_001',
  productId: SEED_PRODUCT.id,
  name: 'Default',
  price: '20.00',
  stockQty: 100,
  status: 1,
  isDeleted: 0
}

/* ============================================================================
 * 收货地址（外卖 / 跑腿共用）
 * ============================================================================ */

export const SEED_ADDRESS = {
  id: 'ADDR_TEST_001',
  userId: SEED_USER.id,
  receiverName: 'TestUser',
  receiverMobile: '13800138001',
  province: '北京市',
  city: '北京市',
  district: '朝阳区',
  detail: '建国门外大街 1 号',
  lng: 116.45,
  lat: 39.92
}

/* ============================================================================
 * 优惠券模板 + 用户券
 * ============================================================================ */

export const SEED_COUPON = {
  id: 'C_TEST_001',
  couponCode: 'TEST5OFF',
  name: '满 30 减 5',
  couponType: 1,
  discountValue: '5.00',
  minOrderAmount: '30.00',
  maxDiscount: null,
  scene: 1,
  applicableShops: null,
  validType: 1,
  validFrom: new Date(Date.now() - 86400 * 1000),
  validTo: new Date(Date.now() + 86400 * 1000),
  status: 1,
  perUserLimit: 1,
  totalQty: 100,
  receivedQty: 1,
  usedQty: 0,
  isDeleted: 0
}

export const SEED_USER_COUPON = {
  id: 'UC_TEST_001',
  userId: SEED_USER.id,
  couponId: SEED_COUPON.id,
  couponCode: SEED_COUPON.couponCode,
  validFrom: new Date(Date.now() - 86400 * 1000),
  validTo: new Date(Date.now() + 86400 * 1000),
  status: 1,
  usedAt: null,
  usedOrderNo: null,
  usedOrderType: null,
  discountAmount: null,
  receivedSource: 1,
  isDeleted: 0
}

/* ============================================================================
 * 账户 + 流水
 * ============================================================================ */

export const SEED_MERCHANT_ACCOUNT = {
  id: 'ACC_M_001',
  ownerType: 2,
  ownerId: SEED_MERCHANT.id,
  balance: '0.00',
  frozen: '0.00',
  totalIncome: '0.00',
  totalExpense: '0.00',
  version: 0,
  status: 1,
  isDeleted: 0
}

export const SEED_RIDER_ACCOUNT = {
  id: 'ACC_R_001',
  ownerType: 3,
  ownerId: SEED_RIDER.id,
  balance: '0.00',
  frozen: '0.00',
  totalIncome: '0.00',
  totalExpense: '0.00',
  version: 0,
  status: 1,
  isDeleted: 0
}

export const SEED_PLATFORM_ACCOUNT = {
  id: 'ACC_P_001',
  ownerType: 3,
  ownerId: '0',
  balance: '0.00',
  frozen: '0.00',
  totalIncome: '0.00',
  totalExpense: '0.00',
  version: 0,
  status: 1,
  isDeleted: 0
}

/* ============================================================================
 * 分账规则
 * ============================================================================ */

export const SEED_SETTLEMENT_RULES = {
  takeoutMerchant: {
    id: 'RULE_M_001',
    ruleCode: 'TAKEOUT_MERCHANT',
    scene: 1,
    targetType: 1,
    scopeType: 1,
    scopeValue: null,
    rate: '0.85',
    fixedFee: '0.00',
    minFee: '0.00',
    maxFee: '999999.00',
    priority: 100,
    status: 1,
    isDeleted: 0
  },
  takeoutRider: {
    id: 'RULE_R_001',
    ruleCode: 'TAKEOUT_RIDER',
    scene: 1,
    targetType: 2,
    scopeType: 1,
    scopeValue: null,
    rate: '0.10',
    fixedFee: '0.00',
    minFee: '0.00',
    maxFee: '999999.00',
    priority: 100,
    status: 1,
    isDeleted: 0
  },
  takeoutPlatform: {
    id: 'RULE_P_001',
    ruleCode: 'TAKEOUT_PLATFORM',
    scene: 1,
    targetType: 3,
    scopeType: 1,
    scopeValue: null,
    rate: '0.05',
    fixedFee: '0.00',
    minFee: '0.00',
    maxFee: '999999.00',
    priority: 100,
    status: 1,
    isDeleted: 0
  },
  errandRider: {
    id: 'RULE_R_002',
    ruleCode: 'ERRAND_RIDER',
    scene: 2,
    targetType: 2,
    scopeType: 1,
    scopeValue: null,
    rate: '0.80',
    fixedFee: '0.00',
    minFee: '0.00',
    maxFee: '999999.00',
    priority: 100,
    status: 1,
    isDeleted: 0
  },
  errandPlatform: {
    id: 'RULE_P_002',
    ruleCode: 'ERRAND_PLATFORM',
    scene: 2,
    targetType: 3,
    scopeType: 1,
    scopeValue: null,
    rate: '0.20',
    fixedFee: '0.00',
    minFee: '0.00',
    maxFee: '999999.00',
    priority: 100,
    status: 1,
    isDeleted: 0
  }
}

/* ============================================================================
 * 订单号常量
 * ============================================================================ */

export const SEED_TAKEOUT_ORDER_NO = 'T20260419000001234'
export const SEED_ERRAND_ORDER_NO = 'E20260419000001234'

/* ============================================================================
 * 支付单号常量
 * ============================================================================ */

export const SEED_TAKEOUT_PAY_NO = 'PAY20260419000001234'
export const SEED_ERRAND_PAY_NO = 'PAY20260419000005678'
