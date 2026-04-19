/**
 * @file api/_mock.ts
 * @stage P7/T7.2 (Sprint 1)
 * @desc 后端不可用时的最小化 mock 数据集合（仅用于 dev 联调跑通 UI）
 *
 * 启用方式：
 *   - import { mockResolve } from '@/api/_mock'
 *   - 在某 api 函数 catch 时 fallback：fetchOverview().catch(() => mockResolve.walletOverview)
 *   - P9 前必须移除所有 mock 调用
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type {
  RiderUser,
  RiderLoginResult,
  WalletOverview,
  BillItem,
  BankCard,
  DispatchOrder,
  RiderOrder,
  Message,
  RiderStatOverview,
  RiderLevelInfo,
  AcceptPreference,
  AttendanceDay,
  SalaryRule
} from '@/types/biz'

const NOW = '2026-04-19T08:00:00.000Z'

const mockUser: RiderUser = {
  id: 'R20260419000001',
  riderNo: 'R20260419000001',
  realName: '张师傅',
  mobile: '13812345678',
  avatar: null,
  status: 'approved',
  onDuty: false,
  level: 3,
  creditPoints: 95,
  serviceCityCode: '110100',
  vehicleType: 'electric',
  createdAt: '2025-12-01T09:00:00.000Z'
}

export const mockResolve = {
  loginResult: {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    user: mockUser,
    depositPaid: true,
    healthCertExpireAt: '2026-12-31T23:59:59.000Z',
    totalDeliverCount: 1280
  } satisfies RiderLoginResult,

  walletOverview: {
    available: '328.50',
    frozen: '50.00',
    todayIncome: '124.30',
    todayOrderCount: 12,
    monthIncome: '4280.60',
    totalWithdraw: '15600.00'
  } satisfies WalletOverview,

  bills: [
    {
      id: 'B1',
      bizType: 1,
      amount: '12.50',
      flowDirection: 1,
      remark: '配送收入 #DD20260419120001',
      bizNo: 'DD20260419120001',
      balanceAfter: '328.50',
      createdAt: NOW
    },
    {
      id: 'B2',
      bizType: 2,
      amount: '5.00',
      flowDirection: 1,
      remark: '高峰奖励',
      balanceAfter: '316.00',
      createdAt: NOW
    },
    {
      id: 'B3',
      bizType: 4,
      amount: '200.00',
      flowDirection: 2,
      remark: '提现至工商银行 ****1234',
      balanceAfter: '311.00',
      createdAt: NOW
    }
  ] satisfies BillItem[],

  bankCards: [
    {
      id: 'CARD1',
      holderName: '张师傅',
      cardNoMask: '**** **** **** 1234',
      bankName: '工商银行',
      cardType: 1,
      isDefault: 1
    }
  ] satisfies BankCard[],

  hallList: [
    {
      orderNo: 'DD20260419130001',
      businessType: 1,
      dispatchMode: 1,
      pickupName: '麦当劳（万达广场店）',
      pickupAddress: '北京市朝阳区建国路 89 号',
      pickupLng: 116.481,
      pickupLat: 39.916,
      deliverName: '王女士',
      deliverAddress: '北京市朝阳区建外大街 19 号',
      deliverLng: 116.487,
      deliverLat: 39.911,
      pickupDistance: 850,
      deliverDistance: 1300,
      estDeliverMin: 25,
      deliveryFee: '12.50',
      goodsAmount: '48.00',
      countdownSec: 15,
      createdAt: NOW
    }
  ] satisfies DispatchOrder[],

  inProgressOrders: [
    {
      orderNo: 'DD20260419110001',
      businessType: 1,
      status: 30,
      pickupName: '海底捞',
      pickupAddress: '北京市朝阳区',
      pickupContact: '商家',
      pickupMobileMask: '138****1234',
      pickupLng: 116.481,
      pickupLat: 39.916,
      deliverName: '李先生',
      deliverAddress: '北京市朝阳区',
      deliverContact: '李先生',
      deliverMobileMask: '139****5678',
      deliverLng: 116.487,
      deliverLat: 39.911,
      pickupDistance: 100,
      deliverDistance: 1500,
      pickupCode: '8392',
      deliveryFee: '15.00',
      bonusFee: '0.00',
      totalIncome: '15.00',
      deliveryType: 1,
      isException: 0,
      createdAt: NOW
    }
  ] satisfies RiderOrder[],

  messages: [
    {
      id: 'M1',
      category: 'order',
      title: '订单已完成',
      body: '订单 #DD20260419100001 已完成，收入 12.50 元',
      isRead: 0,
      createdAt: NOW
    }
  ] satisfies Message[],

  statOverview: {
    startDate: '2026-04-12',
    endDate: '2026-04-19',
    totalOrderCount: 84,
    totalIncome: '1024.50',
    onTimeRate: '96.4%',
    goodRate: '99.1%',
    badRate: '0.9%',
    complaintCount: 0
  } satisfies RiderStatOverview,

  levelInfo: {
    level: 3,
    currentPoints: 95,
    nextLevelPoints: 200,
    remaining: 105,
    description: '完成 200 单解锁 4 级（配送费 +5%）'
  } satisfies RiderLevelInfo,

  preference: {
    mode: 1,
    bizType: 3,
    radius: 3000,
    maxConcurrent: 3,
    acceptRouteShare: true
  } satisfies AcceptPreference,

  attendanceDays: [
    {
      date: '2026-04-19',
      onlineSeconds: 21600,
      checkInAt: '2026-04-19T01:00:00.000Z',
      checkOutAt: undefined,
      isAbsent: false,
      onLeave: false
    }
  ] satisfies AttendanceDay[],

  salaryRule: {
    text: '基础配送费 6 元/单，2km 内不加价；超出按 1km 加 1 元；高峰期 1.5 倍；恶劣天气补贴 2 元。',
    baseFee: '6.00',
    distanceTiers: [
      { distanceMax: 2000, addFee: '0' },
      { distanceMax: 3000, addFee: '1.00' },
      { distanceMax: 5000, addFee: '2.00' }
    ],
    rushHourMultiplier: 1.5,
    badWeatherBonus: '2.00'
  } satisfies SalaryRule
}
