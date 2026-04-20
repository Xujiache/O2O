/**
 * @file order-query.dto.ts
 * @stage P4/T4.22（Sprint 3）
 * @desc 订单查询多端 DTO + 列表项 / 详情 VO
 * @author 单 Agent V2.0
 *
 * 设计：
 *   - 用户端 / 商户端 / 骑手端 / 管理端 4 套 query DTO
 *   - 共用 OrderListItemVo / OrderDetailVo（带订单类型枚举）
 *   - keyset 分页：cursor = `${createdAtIso}_${id}`；service 层按 (createdAt, id) DESC 翻页
 *   - 默认查询近 90 天；fromDate/toDate 自定义范围（最长 180 天）
 *
 * 不包含 RiderOrderQueryDto 的 controller 接口（Subagent 2 在自己的 controller 用）；
 *      但 DTO 留在本文件以便 Order 模块统一查询管理。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min
} from 'class-validator'
import { PageMeta } from '@/common'

/* ============================================================================
 * 通用枚举
 * ============================================================================ */

/** 订单类型可选值 */
export const ORDER_TYPE_VALUES = [1, 2] as const

/** 端类型 → 默认筛选可见状态集合（不传 status 时也不会展示已删 / 售后中等异常状态） */
export const VISIBLE_STATUSES_FOR_USER: ReadonlyArray<number> = [
  0, 5, 10, 20, 30, 40, 50, 55, 60, 70
]

/* ============================================================================
 * Keyset 分页基类
 * ============================================================================ */

/**
 * Keyset 分页通用入参基类
 *   - cursor      `${createdAtIso}_${id}`，首页不传
 *   - pageSize    每页条数（1~100，默认 20）
 *   - fromDate / toDate ISO 8601；不传按近 90 天计算
 *   - orderType   1 外卖 / 2 跑腿；不传查全部
 *   - status      具体状态过滤；不传按 visibleStatuses 兜底
 */
export class OrderKeysetQueryBaseDto {
  @ApiPropertyOptional({
    description: 'Keyset 游标 `${createdAtIso}_${id}`（首页不传）',
    example: '2026-04-19T08:00:00.000Z_180000000000000123'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string

  @ApiPropertyOptional({ description: '每页条数（1~100，默认 20）', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20

  @ApiPropertyOptional({
    description: '起始日期 ISO 8601（不传按近 90 天）',
    example: '2026-01-19T00:00:00.000Z'
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  fromDate?: string

  @ApiPropertyOptional({
    description: '截止日期 ISO 8601（不传按现在）',
    example: '2026-04-19T23:59:59.999Z'
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  toDate?: string

  @ApiPropertyOptional({ description: '订单类型 1 外卖 / 2 跑腿', enum: ORDER_TYPE_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ORDER_TYPE_VALUES as unknown as number[])
  orderType?: number

  @ApiPropertyOptional({
    description: '订单状态过滤（10 档外卖 + 9 档跑腿；不传按可见状态集合兜底）',
    example: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number
}

/* ============================================================================
 * 各端入参
 * ============================================================================ */

/**
 * 用户端订单列表（service 强制 user_id = currentUser.uid）
 */
export class UserOrderQueryDto extends OrderKeysetQueryBaseDto {
  @ApiPropertyOptional({ description: '关键字（订单号 / 商品名片段）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ description: '是否已评价（0=未评价 1=已评价）', enum: [0, 1] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  isReviewed?: 0 | 1
}

/**
 * 商户端订单列表（service 强制 shop_id IN 当前商户名下店铺）
 */
export class MerchantOrderQueryDto extends OrderKeysetQueryBaseDto {
  @ApiPropertyOptional({ description: '指定店铺 ID（不传 = 商户名下全部店铺）' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  shopId?: string

  @ApiPropertyOptional({ description: '关键字（订单号 / 收货人姓名）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string
}

/**
 * 骑手端订单列表（service 强制 rider_id = currentUser.uid）
 *
 * 注：Subagent 1 不实现骑手端 controller，但保留 DTO 给 Subagent 2 使用。
 */
export class RiderOrderQueryDto extends OrderKeysetQueryBaseDto {
  @ApiPropertyOptional({ description: '是否含已完成订单（默认 true）', example: true })
  @IsOptional()
  includeFinished?: boolean
}

/**
 * 管理端订单列表（无 owner 限制）
 */
export class AdminOrderQueryDto extends OrderKeysetQueryBaseDto {
  @ApiPropertyOptional({ description: '指定用户 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  userId?: string

  @ApiPropertyOptional({ description: '指定店铺 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  shopId?: string

  @ApiPropertyOptional({ description: '指定骑手 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  riderId?: string

  @ApiPropertyOptional({ description: '指定城市编码（按订单地址快照过滤）' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  cityCode?: string

  @ApiPropertyOptional({ description: '关键字（订单号精确）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  keyword?: string

  @ApiPropertyOptional({
    description: '状态多选（与 status 二选一，优先 statuses）',
    type: [Number]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  statuses?: number[]
}

/* ============================================================================
 * 列表项 / 详情 VO
 * ============================================================================ */

/**
 * 订单列表项 VO（统一外卖 + 跑腿；rare 字段用 nullable 占位）
 */
export class OrderListItemVo {
  @ApiProperty({ description: '订单号（18 位）', example: 'T20260419010000018' })
  orderNo!: string

  @ApiProperty({ description: '订单类型 1 外卖 / 2 跑腿', example: 1 })
  orderType!: number

  @ApiProperty({ description: '订单状态枚举', example: 10 })
  status!: number

  @ApiProperty({ description: '支付状态', example: 0 })
  payStatus!: number

  @ApiProperty({ description: '应支付金额（元）', example: '49.00' })
  payAmount!: string

  @ApiProperty({ description: '退款金额累计（元）', example: '0.00' })
  refundAmount!: string

  @ApiProperty({ description: '用户 ID' })
  userId!: string

  @ApiProperty({ description: '店铺 ID（外卖；跑腿为 null）', nullable: true })
  shopId!: string | null

  @ApiProperty({ description: '商户 ID（外卖；跑腿为 null）', nullable: true })
  merchantId!: string | null

  @ApiProperty({ description: '骑手 ID（接单后填）', nullable: true })
  riderId!: string | null

  @ApiProperty({ description: '商品/服务摘要（仅展示前 3 条）', type: [String] })
  itemsBrief!: string[]

  @ApiProperty({ description: '商品总数', example: 3 })
  itemsCount!: number

  @ApiProperty({ description: '创建时间', example: '2026-04-19T10:00:00.000Z' })
  createdAt!: string

  @ApiProperty({ description: '订单 ID（用于 keyset 翻页 + cursor 计算）' })
  id!: string

  @ApiProperty({ description: '分表 yyyymm（如 "202604"）', example: '202604' })
  shardYyyymm!: string
}

/**
 * 列表分页结果（keyset 模式：cursor + hasMore，total 可选）
 */
export class OrderKeysetPageVo {
  @ApiProperty({ description: '本页数据', type: [OrderListItemVo] })
  list!: OrderListItemVo[]

  @ApiProperty({ description: '下一页游标（无更多时为 null）', nullable: true })
  nextCursor!: string | null

  @ApiProperty({ description: '是否还有更多数据' })
  hasMore!: boolean

  @ApiProperty({ description: '页元信息（keyset 模式 total 通常为 -1 表示未知）', type: PageMeta })
  meta!: PageMeta
}

/**
 * 订单详情 VO（外卖完整字段；跑腿字段为可选）
 */
export class OrderDetailVo {
  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型 1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '订单 ID（雪花字符串）' })
  id!: string

  @ApiProperty({ description: '当前状态' })
  status!: number

  @ApiProperty({ description: '支付状态' })
  payStatus!: number

  @ApiProperty({ description: '支付方式 1 微信 / 2 支付宝 / 3 余额 / 4 混合', nullable: true })
  payMethod!: number | null

  @ApiProperty({ description: '支付单号', nullable: true })
  payNo!: string | null

  @ApiProperty({ description: '商品/服务金额（元）' })
  goodsAmount!: string

  @ApiProperty({ description: '配送费（元）' })
  deliveryFee!: string

  @ApiProperty({ description: '打包费（元）' })
  packageFee!: string

  @ApiProperty({ description: '满减/折扣等优惠（元）' })
  discountAmount!: string

  @ApiProperty({ description: '优惠券抵扣（元）' })
  couponAmount!: string

  @ApiProperty({ description: '应付金额（元）' })
  payAmount!: string

  @ApiProperty({ description: '退款金额累计（元）' })
  refundAmount!: string

  @ApiProperty({ description: '收货地址快照（外卖完整；跑腿用 pickupSnapshot/deliverySnapshot）' })
  addressSnapshot!: Record<string, unknown> | null

  @ApiProperty({ description: '店铺快照（外卖）' })
  shopSnapshot!: Record<string, unknown> | null

  @ApiProperty({ description: '用户备注', nullable: true })
  remark!: string | null

  @ApiProperty({ description: '用户 ID' })
  userId!: string

  @ApiProperty({ description: '店铺 ID（外卖）', nullable: true })
  shopId!: string | null

  @ApiProperty({ description: '商户 ID（外卖）', nullable: true })
  merchantId!: string | null

  @ApiProperty({ description: '骑手 ID', nullable: true })
  riderId!: string | null

  @ApiProperty({ description: '商品明细（外卖）' })
  items!: Array<{
    id: string
    productId: string
    skuId: string
    productName: string
    skuSpec: string | null
    imageUrl: string | null
    unitPrice: string
    qty: number
    packageFee: string
    totalPrice: string
  }>

  @ApiProperty({ description: '关键时间线' })
  timeline!: {
    payAt: string | null
    acceptAt: string | null
    readyAt: string | null
    dispatchAt: string | null
    pickedAt: string | null
    deliveredAt: string | null
    finishedAt: string | null
    cancelAt: string | null
  }

  @ApiProperty({ description: '取消原因', nullable: true })
  cancelReason!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: string

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string

  @ApiProperty({ description: '分表 yyyymm' })
  shardYyyymm!: string
}
