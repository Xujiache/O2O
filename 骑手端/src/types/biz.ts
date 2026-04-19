/**
 * @file biz.ts
 * @stage P7/T7.4 (Sprint 1)
 * @desc 骑手端业务实体的 TS 类型定义；与 P3/P4 entity 字段对齐
 *
 * 设计原则：
 *   - 后端启动后可用 openapi-typescript 替换/合并
 *   - 当前手写以解耦后端运行依赖
 *   - 金额字段一律 string（与 P5/P6 一致；浮点精度由 currency.js 处理）
 *
 * @author 单 Agent V2.0 (P7 骑手端)
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

/* ========== 骑手账号 ========== */
/** 骑手账号状态 */
export type RiderStatus = 'pending' | 'approved' | 'rejected' | 'frozen' | 'expired'

/** 骑手车辆类型 */
export type VehicleType = 'electric' | 'bike' | 'walk'

/** 骑手账号信息 */
export interface RiderUser {
  id: string
  /** 骑手编号（R 开头） */
  riderNo: string
  /** 真实姓名 */
  realName: string
  /** 联系手机 */
  mobile: string
  /** 头像 */
  avatar: string | null
  /** 状态 */
  status: RiderStatus
  /** 是否上岗中 */
  onDuty: boolean
  /** 当前等级 1-5 */
  level: 1 | 2 | 3 | 4 | 5
  /** 信用积分 */
  creditPoints: number
  /** 服务城市编码 */
  serviceCityCode: string
  /** 车辆类型 */
  vehicleType: VehicleType
  /** 入驻时间 */
  createdAt: string
}

/** 登录返回 */
export interface RiderLoginResult {
  accessToken: string
  refreshToken: string
  user: RiderUser
  /** 是否已交保证金 */
  depositPaid: boolean
  /** 健康证有效期 */
  healthCertExpireAt: string | null
  /** 累计完成单数（用于工作台显示） */
  totalDeliverCount?: number
}

/** 资质上传材料 */
export interface RiderQualification {
  /** 真实姓名 */
  realName: string
  /** 身份证号 */
  idCardNo: string
  /** 身份证正面 URL */
  idCardFrontUrl: string
  /** 身份证反面 URL */
  idCardBackUrl: string
  /** 健康证 URL */
  healthCertUrl: string
  /** 健康证有效期（YYYY-MM-DD） */
  healthCertExpireAt: string
  /** 车辆照片 URL */
  vehicleUrl: string
  /** 车牌号（电动车） */
  vehicleNo?: string
  /** 车辆类型 */
  vehicleType: VehicleType
  /** 从业资格证 URL（电动车必传） */
  certificateUrl?: string
  /** 服务城市编码 */
  serviceCityCode: string
  /** 紧急联系人 */
  emergencyContact?: string
  emergencyMobile?: string
}

/** 审核状态 */
export interface RiderAuditStatus {
  /** pending / approved / rejected / supplement */
  status: 'pending' | 'approved' | 'rejected' | 'supplement'
  /** 驳回原因 */
  rejectReason?: string
  /** 提交时间 */
  submittedAt: string
  /** 完成时间 */
  reviewedAt?: string
}

/** 保证金 */
export interface DepositInfo {
  /** 应缴金额 */
  amount: string
  /** 已缴金额 */
  paidAmount: string
  /** 是否已结清 */
  paid: boolean
  /** 缴纳时间 */
  paidAt?: string
}

/* ========== 派单 ========== */
/** 业务类型：1 外卖 / 2 跑腿 */
export type BusinessType = 1 | 2

/** 派单消息（WS rider:dispatch:new 推送 / 接单大厅卡片） */
export interface DispatchOrder {
  orderNo: string
  businessType: BusinessType
  /** 1 系统派单 / 2 抢单 */
  dispatchMode: 1 | 2
  /** 商户 / 寄件方 */
  pickupName: string
  pickupAddress: string
  pickupLng: number
  pickupLat: number
  /** 收件方 */
  deliverName: string
  deliverAddress: string
  deliverLng: number
  deliverLat: number
  /** 取件距离（米，从骑手到取件点） */
  pickupDistance: number
  /** 配送距离（米，取件→送达） */
  deliverDistance: number
  /** 预计送达时间（分钟） */
  estDeliverMin: number
  /** 配送费 */
  deliveryFee: string
  /** 商品总额（外卖） */
  goodsAmount?: string
  /** 备注 */
  remark?: string
  /** 派单倒计时（秒，仅 dispatchMode=1 有效，V7.7 明确 15s 默认） */
  countdownSec?: number
  /** 顺路评分（多单并行时） */
  routeScore?: number
  /** 创建时间 */
  createdAt: string
}

/* ========== 订单状态机（骑手视角） ========== */
/**
 * 骑手端订单状态：
 *   20 已接单（待取件）
 *   30 取件中
 *   40 配送中（已取件）
 *   50 已送达
 *   60 已取消
 *   70 异常处理中
 */
export type RiderOrderStatus = 20 | 30 | 40 | 50 | 60 | 70

/** 订单状态文案映射 */
export const RIDER_ORDER_STATUS_TEXT: Record<RiderOrderStatus, string> = {
  20: '已接单',
  30: '取件中',
  40: '配送中',
  50: '已送达',
  60: '已取消',
  70: '异常处理中'
}

/**
 * 骑手端订单 Tab 类型
 * P5 经验：每个 Tab 必须 status + 子条件唯一区分（避免 statusIn:[55] 重复 bug）
 */
export type RiderOrderTab =
  | 'pending' // status=20 已接单待取件
  | 'picking' // status=30 取件中
  | 'delivering' // status=40 配送中
  | 'finished' // status=50 已送达
  | 'canceled' // status=60 已取消
  | 'abnormal' // isException=1 异常单（任意 status）

/** 骑手端订单 */
export interface RiderOrder {
  orderNo: string
  businessType: BusinessType
  status: RiderOrderStatus
  /** 商户/寄件方 */
  pickupName: string
  pickupAddress: string
  pickupContact?: string
  /** 中转虚号（点击拨打走 /rider/call-relay） */
  pickupMobileMask?: string
  pickupLng: number
  pickupLat: number
  /** 收件方 */
  deliverName: string
  deliverAddress: string
  deliverContact?: string
  deliverMobileMask?: string
  deliverLng: number
  deliverLat: number
  /** 距离（米） */
  pickupDistance: number
  deliverDistance: number
  /** 取件码（外卖 4 位 / 跑腿 6 位） */
  pickupCode?: string
  /** 取件凭证 URL */
  pickupProofUrl?: string
  /** 送达凭证 URL */
  deliverProofUrl?: string
  /** 收入信息 */
  deliveryFee: string
  bonusFee?: string
  totalIncome: string
  /** 备注 */
  remark?: string
  /** 期望送达 / 立即 */
  deliveryType: 1 | 2
  expectDeliverAt?: string
  /** 异常 */
  isException: 0 | 1
  /** 时间戳 */
  acceptedAt?: string
  pickedAt?: string
  deliveredAt?: string
  canceledAt?: string
  createdAt: string
}

/** 订单查询参数 */
export interface RiderOrderListParams {
  /** Tab 类型 */
  tab?: RiderOrderTab
  /** 状态筛选 */
  status?: RiderOrderStatus | RiderOrderStatus[]
  /** 是否异常 */
  isException?: 0 | 1
  /** 关键字（订单号/手机尾号） */
  keyword?: string
  /** 业务类型 */
  businessType?: BusinessType
  /** 时间区间 */
  startTime?: string
  endTime?: string
  /** 分页 */
  cursor?: string | null
  limit?: number
}

/** 异常上报 */
export interface RiderAbnormalReport {
  orderNo: string
  /** 异常类型：1 联系不上用户 / 2 取件失败 / 3 商家未出餐 / 4 物品损坏 / 5 地址错误 / 6 其他 */
  abnormalType: 1 | 2 | 3 | 4 | 5 | 6
  remark: string
  evidenceUrls: string[]
}

/** 转单申请 */
export interface RiderTransferApply {
  orderNo: string
  /** 转单理由 */
  reason: string
  /** 期望接单骑手 ID（可选） */
  expectRiderId?: string
}

/* ========== 接单偏好 ========== */
/** 接单偏好 */
export interface AcceptPreference {
  /** 模式：1 抢单 / 2 系统派单 */
  mode: 1 | 2
  /** 业务类型：1 外卖 / 2 跑腿 / 3 全部 */
  bizType: 1 | 2 | 3
  /** 接单半径（米；上限 5000） */
  radius: number
  /** 同时配送上限 */
  maxConcurrent: number
  /** 是否开启顺路单 */
  acceptRouteShare: boolean
}

/* ========== 钱包 ========== */
/** 钱包概览 */
export interface WalletOverview {
  /** 可提现余额 */
  available: string
  /** 冻结金额 */
  frozen: string
  /** 今日收入 */
  todayIncome: string
  /** 今日单数 */
  todayOrderCount: number
  /** 月度累计 */
  monthIncome: string
  /** 累计提现 */
  totalWithdraw: string
}

/** 账单条目 */
export interface BillItem {
  id: string
  /** 1 配送收入 / 2 奖励 / 3 罚款 / 4 提现 / 5 退款扣减 */
  bizType: 1 | 2 | 3 | 4 | 5
  amount: string
  flowDirection: 1 | 2
  remark: string
  bizNo?: string
  balanceAfter: string
  createdAt: string
}

/** 银行卡 */
export interface BankCard {
  id: string
  holderName: string
  cardNoMask: string
  bankName: string
  cardType: 1 | 2
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

/** 薪资规则 */
export interface SalaryRule {
  /** 规则文案（后端 sys_config） */
  text: string
  /** 基础配送费 */
  baseFee: string
  /** 距离阶梯 */
  distanceTiers: { distanceMax: number; addFee: string }[]
  /** 高峰期加成系数 */
  rushHourMultiplier: number
  /** 雨雪天补贴 */
  badWeatherBonus: string
}

/* ========== 考勤 ========== */
/** 打卡记录 */
export interface AttendanceRecord {
  id: string
  /** check-in / check-out */
  type: 'in' | 'out'
  /** 实际打卡时间 */
  checkAt: string
  /** GPS */
  lng: number
  lat: number
  /** 打卡地址（逆地理） */
  address: string
  /** 是否在合规范围 */
  inFence: boolean
  /** 备注 */
  remark?: string
}

/** 考勤汇总（单天） */
export interface AttendanceDay {
  date: string
  onlineSeconds: number
  /** 上班 / 下班时间 */
  checkInAt?: string
  checkOutAt?: string
  /** 是否旷工 */
  isAbsent: boolean
  /** 是否请假 */
  onLeave: boolean
}

/** 排班 */
export interface ScheduleSlot {
  date: string
  /** 时段 */
  startAt: string
  endAt: string
  /** 是否本人排班 */
  isMine: boolean
}

/** 请假申请 */
export interface LeaveApply {
  id: string
  /** 1 事假 / 2 病假 / 3 调休 */
  leaveType: 1 | 2 | 3
  startDate: string
  endDate: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  remark?: string
  createdAt: string
}

/* ========== 统计与等级 ========== */
/** 数据统计概览 */
export interface RiderStatOverview {
  startDate: string
  endDate: string
  totalOrderCount: number
  totalIncome: string
  onTimeRate: string
  goodRate: string
  badRate: string
  complaintCount: number
}

/** 时序点 */
export interface StatPoint {
  date: string
  value: number
}

/** 等级信息 */
export interface RiderLevelInfo {
  level: 1 | 2 | 3 | 4 | 5
  /** 当前积分 */
  currentPoints: number
  /** 升下一级所需 */
  nextLevelPoints: number
  /** 距离升级差值 */
  remaining: number
  /** 等级说明文案 */
  description: string
}

/** 奖惩记录 */
export interface RewardItem {
  id: string
  /** 1 奖励 / 2 罚款 */
  type: 1 | 2
  /** 金额 */
  amount: string
  reason: string
  /** 关联订单 */
  orderNo?: string
  /** 申诉状态 */
  appealStatus?: 'none' | 'pending' | 'approved' | 'rejected'
  appealDeadline?: string
  createdAt: string
}

/** 申诉提交 */
export interface AppealParams {
  rewardId: string
  reason: string
  evidenceUrls: string[]
}

/* ========== 消息中心 ========== */
export type MessageCategory = 'order' | 'system' | 'reward' | 'promotion'

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
  /** 新派单语音播报 */
  dispatchTts: 0 | 1
  /** 新派单铃声 */
  dispatchRingtone: 0 | 1
  /** 铃声音量 0-100 */
  ringtoneVolume: number
  /** 铃声循环 */
  ringtoneLoop: 0 | 1
  /** 振动 */
  vibrate: 0 | 1
}

/* ========== 通用文件 ========== */
export interface FileUploadResult {
  fileId: string
  url: string
  /** 业务模块 */
  bizModule: string
  isPublic: 0 | 1
  size: number
  mime: string
}

/* ========== 定位 ========== */
/** 单个定位点（上报后端） */
export interface LocationPoint {
  lng: number
  lat: number
  /** 精度（米） */
  accuracy: number
  /** 速度（m/s） */
  speed: number
  /** 方向（0-360） */
  bearing: number
  /** 当前订单（可选） */
  orderNo?: string
  /** 时间戳（毫秒） */
  ts: number
  /** 是否经过卡尔曼滤波 */
  filtered?: boolean
}

/** 批量定位上报 */
export interface LocationBatch {
  /** 骑手 ID */
  riderId: string
  /** 数据点（P6-R1 / I-02 经验：服务端必须真循环 N 个点，不能只取首个） */
  points: LocationPoint[]
  /** 设备电量百分比 */
  battery?: number
  /** 当前网络类型 */
  networkType?: string
}

/* ========== 紧急求助 ========== */
export interface EmergencyReport {
  /** 1 一键报警 / 2 联系客服 / 3 联系紧急联系人 */
  channel: 1 | 2 | 3
  /** 求助原因 */
  reason?: string
  /** 当前位置 */
  lng: number
  lat: number
  /** 当前订单 */
  orderNo?: string
  /** 紧急联系人手机号 */
  emergencyMobile?: string
}
