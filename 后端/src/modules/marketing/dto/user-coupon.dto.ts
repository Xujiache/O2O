/**
 * @file user-coupon.dto.ts
 * @stage P4/T4.10（Sprint 2）
 * @desc 用户券 DTO：领取 / 列表查询 / 视图 / 管理后台批量发放 / 最优券推荐
 * @author 单 Agent V2.0
 *
 * 字段语义对齐 07_marketing.sql 第 2 张表：
 *   - status         0 已过期 / 1 未使用 / 2 已使用 / 3 冻结
 *   - receivedSource 1 主动领 / 2 活动赠 / 3 邀请奖 / 4 客服补偿
 *   - usedOrderType  1 外卖 / 2 跑腿
 *
 * 金额字段（discountAmount）一律 string，service 层用 BigNumber 计算，禁止 number。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Max,
  Min
} from 'class-validator'
import { PageQueryDto } from '@/common'

/** 用户券状态枚举（与 user_coupon.status 列对齐） */
export const USER_COUPON_STATUSES = [0, 1, 2, 3] as const
/** 领取来源枚举（与 user_coupon.received_source 列对齐） */
export const RECEIVED_SOURCES = [1, 2, 3, 4] as const
/** 触发式发放事件类型字面量（issueByEvent 入参） */
export const ISSUE_EVENT_TYPES = [
  'registered',
  'invitation_succeeded',
  'birthday',
  'order_returned'
] as const
export type IssueEventType = (typeof ISSUE_EVENT_TYPES)[number]
/** 订单类型枚举（与 user_coupon.used_order_type 列对齐） */
export const USED_ORDER_TYPES = [1, 2] as const

/**
 * 用户端"我的券"列表查询入参
 * 用途：GET /me/coupons
 *
 * status 可选筛选；不传时 service 默认 ORDER BY status ASC, valid_to ASC（未使用优先）。
 */
export class QueryUserCouponDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: '用户券状态：0 已过期 / 1 未使用 / 2 已使用 / 3 冻结',
    enum: USER_COUPON_STATUSES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(USER_COUPON_STATUSES as unknown as number[])
  status?: number
}

/**
 * "下单时推荐最优可用券"查询入参
 * 用途：GET /me/coupons/best-match
 *
 * 业务流程：传入订单类型 / 店铺 / 总金额 → service 在用户名下未使用券中按抵扣最大原则挑一张。
 */
export class BestMatchQueryDto {
  @ApiProperty({
    description: '订单类型：1 外卖 / 2 跑腿',
    enum: USED_ORDER_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(USED_ORDER_TYPES as unknown as number[])
  orderType!: number

  @ApiPropertyOptional({
    description: '订单所属店铺 ID（外卖必传；跑腿可不传）',
    example: '180000000000000001'
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  shopId?: string

  @ApiProperty({
    description: '订单总金额（小数 2 位字符串，含商品+打包费等，未减优惠）',
    example: '32.50'
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'totalAmount 必须为最多 2 位小数的字符串' })
  totalAmount!: string
}

/**
 * 管理后台批量发放优惠券入参
 * 用途：POST /admin/coupons/:id/issue
 *
 * 服务端在事务内 SELECT FOR UPDATE coupon → 校验余量 → 批量 INSERT user_coupon
 *  → UPDATE coupon.received_qty += 实发数量。
 */
export class IssueCouponDto {
  @ApiProperty({
    description: '目标用户 ID 列表（雪花字符串数组，单次 ≤ 500）',
    type: [String],
    example: ['180000000000000001', '180000000000000002']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'userIds 至少 1 个' })
  @ArrayMaxSize(500, { message: 'userIds 单次最多 500 个' })
  @IsNumberString({ no_symbols: true }, { each: true })
  userIds!: string[]

  @ApiProperty({
    description: '领取来源：2 活动赠 / 3 邀请奖 / 4 客服补偿（不允许 1=主动领）',
    enum: [2, 3, 4],
    example: 2
  })
  @Type(() => Number)
  @IsInt()
  @IsIn([2, 3, 4])
  source!: number
}

/**
 * 用户券视图对象
 * 用途：领券 / 列表 / 最优推荐 共用
 *
 * 含模板冗余字段（couponName / couponType / discountValue / minOrderAmount / maxDiscount）
 * 便于前端不再二次查询模板。
 */
export class UserCouponVo {
  @ApiProperty({ description: '用户券主键（雪花字符串）' }) id!: string
  @ApiProperty({ description: '用户 ID' }) userId!: string
  @ApiProperty({ description: '券模板 ID' }) couponId!: string
  @ApiProperty({ description: '券模板编码冗余' }) couponCode!: string
  @ApiProperty({ description: '券名称（模板冗余）' }) couponName!: string
  @ApiProperty({ description: '券类型：1 满减 / 2 折扣 / 3 立减 / 4 免运费' }) couponType!: number
  @ApiProperty({ description: '面额（字符串，模板冗余）' }) discountValue!: string
  @ApiProperty({ description: '订单最低金额（字符串，模板冗余）' }) minOrderAmount!: string
  @ApiProperty({ description: '最大优惠（字符串，模板冗余）', nullable: true })
  maxDiscount!: string | null
  @ApiProperty({ description: '使用场景：1 外卖 / 2 跑腿 / 3 通用' }) scene!: number
  @ApiProperty({ description: '适用店铺 ID 数组（null=全部）', nullable: true, type: [String] })
  applicableShops!: string[] | null

  @ApiProperty({ description: '生效起始' }) validFrom!: Date
  @ApiProperty({ description: '失效时间' }) validTo!: Date
  @ApiProperty({ description: '状态：0 已过期 / 1 未使用 / 2 已使用 / 3 冻结' }) status!: number
  @ApiProperty({ description: '使用时间', nullable: true }) usedAt!: Date | null
  @ApiProperty({ description: '使用订单号', nullable: true }) usedOrderNo!: string | null
  @ApiProperty({
    description: '使用订单类型：1 外卖 / 2 跑腿',
    nullable: true
  })
  usedOrderType!: number | null
  @ApiProperty({ description: '实际抵扣金额（字符串）', nullable: true })
  discountAmount!: string | null
  @ApiProperty({
    description: '领取来源：1 主动领 / 2 活动赠 / 3 邀请奖 / 4 客服补偿',
    nullable: true
  })
  receivedSource!: number | null

  @ApiProperty({ description: '领取时间' }) createdAt!: Date
  @ApiProperty({ description: '更新时间' }) updatedAt!: Date
}

/**
 * 最优券推荐返回对象
 * 用途：GET /me/coupons/best-match 出参（命中时返回；无可用券返回 null）
 *
 * 在 UserCouponVo 基础上附带 estimatedDiscount，供前端直接展示"立减 ¥X.XX"。
 */
export class BestMatchUserCouponVo extends UserCouponVo {
  @ApiProperty({
    description: '本单按当前 totalAmount 计算的预估抵扣金额（字符串，BigNumber 计算）',
    example: '5.00'
  })
  estimatedDiscount!: string
}

/**
 * 管理端批量发放结果
 * 用途：POST /admin/coupons/:id/issue 返回
 */
export class IssueResultVo {
  @ApiProperty({ description: '本次实际成功发放份数' }) issued!: number
  @ApiProperty({ description: '请求批次中的总用户数' }) requested!: number
  @ApiProperty({
    description: '剩余可发放份数（totalQty=0 表示不限，返回 -1）',
    example: 998
  })
  remaining!: number
  @ApiProperty({
    description: '失败用户 ID 列表（per_user_limit 已达 / 总量不足时跳过）',
    type: [String]
  })
  skippedUserIds!: string[]
}
