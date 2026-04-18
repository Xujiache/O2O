/**
 * @file template-codes.ts
 * @stage P3 / T3.13
 * @desc 18+ 模板 code 注册清单（DESIGN_P3 §4.2）+ 默认通道/目标用户矩阵
 * @author 员工 B
 *
 * 通道字面量（与 message_template.channel 数值一致）：
 *   1 站内信 INBOX / 2 微信订阅 WX_SUBSCRIBE / 3 短信 ALI_SMS / 4 APP 推送 JPUSH
 * 目标用户：1 用户 / 2 商户 / 3 骑手 / 4 管理员
 */

/** 通道枚举（数值 ↔ 字面量） */
export enum MessageChannelType {
  INBOX = 1,
  WX_SUBSCRIBE = 2,
  ALI_SMS = 3,
  JPUSH = 4
}

/** 通道枚举辅助：数值 → 大写字面量（用于日志/路由） */
export const ChannelTypeName: Record<MessageChannelType, string> = {
  [MessageChannelType.INBOX]: 'INBOX',
  [MessageChannelType.WX_SUBSCRIBE]: 'WX_SUBSCRIBE',
  [MessageChannelType.ALI_SMS]: 'ALI_SMS',
  [MessageChannelType.JPUSH]: 'JPUSH'
}

/** 目标端枚举 */
export enum TargetUserType {
  USER = 1,
  MERCHANT = 2,
  RIDER = 3,
  ADMIN = 4
}

/**
 * 模板登记记录
 * 用途：TemplateService.bootstrapDefaults 在启动时把缺失模板插入 message_template 表
 */
export interface TemplateRegistration {
  /** 业务模板编码（全局唯一） */
  code: string
  /** 模板名称（运营展示） */
  name: string
  /** 业务场景标识（与 message_template.biz_scene 对齐） */
  bizScene: string
  /** 默认目标用户类型 */
  targetType: TargetUserType
  /** 默认开启的通道列表（一个 code 可发多通道） */
  channels: MessageChannelType[]
  /** 默认标题模板（占位符 {var}） */
  titleTemplate?: string
  /** 默认内容模板（占位符 {var}） */
  contentTemplate: string
  /** 优先级 1 普通 / 2 重要 / 3 紧急 */
  priority?: number
}

/**
 * 18+ 模板 code 全量清单（按业务域聚合）
 *  - ORDER_*：订单生命周期（用户端）
 *  - RIDER_*：骑手运营（骑手端）
 *  - MERCHANT_*：商户提醒（商户端）
 *  - USER_*：营销 / 用户激励（用户端）
 *  - ACTIVITY/SYSTEM_*：通用系统 / 活动通知
 */
export const TEMPLATE_REGISTRATIONS: TemplateRegistration[] = [
  /* ===== 订单（用户端，10 项） ===== */
  {
    code: 'ORDER_CREATED',
    name: '订单创建成功',
    bizScene: 'order_created',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '订单已创建',
    contentTemplate: '亲，您的订单 {orderNo} 已创建成功，等待商家接单',
    priority: 1
  },
  {
    code: 'ORDER_PAID',
    name: '订单支付成功',
    bizScene: 'order_paid',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '支付成功',
    contentTemplate: '订单 {orderNo} 已成功支付 ¥{amount}',
    priority: 2
  },
  {
    code: 'ORDER_ACCEPTED',
    name: '商家已接单',
    bizScene: 'order_accepted',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '商家已接单',
    contentTemplate: '您的订单 {orderNo} 商家已接单，预计 {eta} 分钟送达',
    priority: 2
  },
  {
    code: 'ORDER_READY',
    name: '订单已出餐',
    bizScene: 'order_ready',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '商家已出餐',
    contentTemplate: '您的订单 {orderNo} 已出餐，骑手即将送达',
    priority: 2
  },
  {
    code: 'ORDER_PICKED',
    name: '骑手已取单',
    bizScene: 'order_picked',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '骑手已取单',
    contentTemplate: '您的订单 {orderNo} 骑手 {riderName} 已取单，正在配送',
    priority: 2
  },
  {
    code: 'ORDER_DELIVERED',
    name: '订单已送达',
    bizScene: 'order_delivered',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE, MessageChannelType.JPUSH],
    titleTemplate: '订单已送达',
    contentTemplate: '您的订单 {orderNo} 已送达，请尽快取餐并评价',
    priority: 3
  },
  {
    code: 'ORDER_CANCELED',
    name: '订单已取消',
    bizScene: 'order_canceled',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '订单已取消',
    contentTemplate: '订单 {orderNo} 已取消，原因：{reason}',
    priority: 2
  },
  {
    code: 'ORDER_REFUND',
    name: '订单退款',
    bizScene: 'order_refund',
    targetType: TargetUserType.USER,
    channels: [
      MessageChannelType.INBOX,
      MessageChannelType.WX_SUBSCRIBE,
      MessageChannelType.ALI_SMS
    ],
    titleTemplate: '退款已到账',
    contentTemplate: '订单 {orderNo} 退款 ¥{amount} 已原路退回',
    priority: 3
  },
  {
    code: 'ORDER_AFTER_SALE',
    name: '售后处理结果',
    bizScene: 'order_after_sale',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '售后已处理',
    contentTemplate: '您的售后单 {ticketNo} 处理结果：{result}',
    priority: 2
  },

  /* ===== 骑手（4 项） ===== */
  {
    code: 'RIDER_DISPATCH',
    name: '新订单派单',
    bizScene: 'rider_dispatch',
    targetType: TargetUserType.RIDER,
    channels: [MessageChannelType.JPUSH, MessageChannelType.INBOX],
    titleTemplate: '新订单',
    contentTemplate: '您有新订单 {orderNo}（{distanceKm}km），请尽快接单',
    priority: 3
  },
  {
    code: 'RIDER_REWARD',
    name: '骑手奖励',
    bizScene: 'rider_reward',
    targetType: TargetUserType.RIDER,
    channels: [MessageChannelType.INBOX, MessageChannelType.JPUSH],
    titleTemplate: '获得奖励',
    contentTemplate: '恭喜您获得奖励 ¥{amount}，原因：{reason}',
    priority: 2
  },
  {
    code: 'RIDER_PENALTY',
    name: '骑手罚款',
    bizScene: 'rider_penalty',
    targetType: TargetUserType.RIDER,
    channels: [MessageChannelType.INBOX, MessageChannelType.JPUSH, MessageChannelType.ALI_SMS],
    titleTemplate: '违规处罚',
    contentTemplate: '您因 {reason} 被处罚 ¥{amount}，可在 7 天内申诉',
    priority: 3
  },

  /* ===== 商户（2 项） ===== */
  {
    code: 'MERCHANT_NEW_ORDER',
    name: '商户新订单',
    bizScene: 'merchant_new_order',
    targetType: TargetUserType.MERCHANT,
    channels: [MessageChannelType.JPUSH, MessageChannelType.INBOX],
    titleTemplate: '新订单',
    contentTemplate: '您有新订单 {orderNo}，金额 ¥{amount}，请尽快确认',
    priority: 3
  },
  {
    code: 'MERCHANT_CANCEL_APPLY',
    name: '用户申请取消',
    bizScene: 'merchant_cancel_apply',
    targetType: TargetUserType.MERCHANT,
    channels: [MessageChannelType.JPUSH, MessageChannelType.INBOX],
    titleTemplate: '取消申请',
    contentTemplate: '订单 {orderNo} 用户申请取消，请处理',
    priority: 2
  },

  /* ===== 用户营销（2 项） ===== */
  {
    code: 'USER_COUPON',
    name: '用户优惠券到账',
    bizScene: 'user_coupon',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '优惠券到账',
    contentTemplate: '您获得 {couponName} 一张，{validTo} 前可用',
    priority: 1
  },
  {
    code: 'USER_INVITE_REWARD',
    name: '邀请有礼奖励',
    bizScene: 'user_invite_reward',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.WX_SUBSCRIBE],
    titleTemplate: '邀请奖励',
    contentTemplate: '您邀请的好友 {nickname} 已下首单，获得奖励 {reward}',
    priority: 1
  },

  /* ===== 通用（2 项） ===== */
  {
    code: 'ACTIVITY_NOTICE',
    name: '活动通知',
    bizScene: 'activity_notice',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX],
    titleTemplate: '{title}',
    contentTemplate: '{content}',
    priority: 1
  },
  {
    code: 'SYSTEM_NOTICE',
    name: '系统通知',
    bizScene: 'system_notice',
    targetType: TargetUserType.USER,
    channels: [MessageChannelType.INBOX, MessageChannelType.JPUSH],
    titleTemplate: '系统通知：{title}',
    contentTemplate: '{content}',
    priority: 2
  }
]

/**
 * code → 注册项 索引
 * 用途：MessageService.send(code) 用 code 查模板
 */
export const TEMPLATE_REGISTRATIONS_MAP: ReadonlyMap<string, TemplateRegistration> = new Map(
  TEMPLATE_REGISTRATIONS.map((t) => [t.code, t])
)
