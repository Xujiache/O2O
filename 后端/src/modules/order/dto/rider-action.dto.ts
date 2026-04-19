/**
 * @file rider-action.dto.ts
 * @stage P4/T4.21（Sprint 3）
 * @desc 骑手端 4 项动作 DTO：取件/送达/异常上报/转单 + 各 VO
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 凭证图片 url：前端先调 file 模块上传后传 url，本期入库 url 即可（service 层只校验数量上限）
 * 经纬度（lng/lat）可选；用于现场审计 + 距离校验
 *
 * 路径设计（rider-order.controller）：
 *   POST /rider/order/:orderNo/pickup
 *   POST /rider/order/:orderNo/deliver
 *   POST /rider/order/:orderNo/abnormal
 *   POST /rider/order/:orderNo/transfer
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength
} from 'class-validator'

/* ============================================================================
 * 通用：凭证图片数组上限（与 04_order.sql order_proof.image_urls 注释 ≤ 6 张对齐）
 * ============================================================================ */

const PROOF_MAX_IMAGES = 6
const EVIDENCE_MAX_URLS = 9 /* 异常 / 转单可附最多 9 张图片+视频帧（运营侧定） */

/* ============================================================================
 * 1) PickupOrderDto —— 取件 / 取餐
 * ============================================================================ */

/**
 * 取件入参
 *
 * 业务约束：
 *   - pickupCode 6 位数字字符串（用户/商家给出）
 *   - 跑腿订单核验 Redis `pickup:code:{orderNo}`；外卖订单同 key（subagent 1 下单时写入）
 *   - 取件凭证 evidenceUrls：可选 0~6 张（跑腿建议必传 1 张商家小票）
 */
export class PickupOrderDto {
  @ApiProperty({ description: '取件码（6 位纯数字）', example: '482915' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'pickupCode 必须为 6 位数字' })
  pickupCode!: string

  @ApiPropertyOptional({
    description: '取件凭证图片 URL 数组（最多 6 张；前端先上传后传 url）',
    isArray: true,
    example: ['https://cdn.example.com/proof/abc.jpg']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROOF_MAX_IMAGES, { message: `取件凭证最多 ${PROOF_MAX_IMAGES} 张图片` })
  @IsString({ each: true })
  evidenceUrls?: string[]

  @ApiPropertyOptional({ description: '上传时经度（用于审计）', example: 116.405285 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number

  @ApiPropertyOptional({ description: '上传时纬度', example: 39.904989 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number

  @ApiPropertyOptional({ description: '说明（如商家联系不上等情况）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/**
 * 取件出参
 */
export class PickupOrderVo {
  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '迁移前状态' })
  fromStatus!: number

  @ApiProperty({ description: '迁移后状态' })
  toStatus!: number

  @ApiProperty({ description: '取件时间（picked_at）' })
  pickedAt!: Date

  @ApiPropertyOptional({ description: '凭证记录 ID（order_proof.id）' })
  proofId!: string | null
}

/* ============================================================================
 * 2) DeliverOrderDto —— 送达
 * ============================================================================ */

/**
 * 送达入参
 *
 * 业务约束：
 *   - 送达凭证 evidenceUrls 必填 ≥ 1 张（PRD §3.3.3.2 送达凭证上传）
 *   - 电子签名 signatureUrl 可选（专业件 / 大额订单要求）
 */
export class DeliverOrderDto {
  @ApiProperty({
    description: '送达凭证图片 URL 数组（必填 1 ~ 6 张）',
    isArray: true,
    example: ['https://cdn.example.com/proof/done.jpg']
  })
  @IsArray()
  @ArrayMinSize(1, { message: '送达凭证至少 1 张图片' })
  @ArrayMaxSize(PROOF_MAX_IMAGES, { message: `送达凭证最多 ${PROOF_MAX_IMAGES} 张图片` })
  @IsString({ each: true })
  evidenceUrls!: string[]

  @ApiPropertyOptional({ description: '电子签名图片 URL（可选）' })
  @IsOptional()
  @IsString()
  signatureUrl?: string

  @ApiPropertyOptional({ description: '上传时经度', example: 116.405285 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number

  @ApiPropertyOptional({ description: '上传时纬度', example: 39.904989 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number

  @ApiPropertyOptional({ description: '说明' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/**
 * 送达出参
 */
export class DeliverOrderVo {
  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '迁移前状态' })
  fromStatus!: number

  @ApiProperty({ description: '迁移后状态（外卖 50 已送达待确认 / 跑腿 40 配送中 或 50 已送达）' })
  toStatus!: number

  @ApiProperty({ description: '送达时间（delivered_at）' })
  deliveredAt!: Date

  @ApiProperty({ description: '凭证记录 ID（order_proof.id）' })
  proofId!: string
}

/* ============================================================================
 * 3) AbnormalReportDto —— 异常上报
 * ============================================================================ */

/**
 * 异常上报入参
 *
 * 业务约束：
 *   - 上报后订单状态保持不变；写 abnormal_report 表（status=0 待处理）
 *   - 运营介入处理后再决定订单走向（退款 / 转单 / 关单）
 *   - 发 OrderAbnormal 事件供 Sprint 8 编排消费（本期不订阅）
 */
export class AbnormalReportDto {
  @ApiProperty({
    description:
      '异常类型编码（→ sys_dict abnormal_type；如 ITEM_DAMAGE / ADDRESS_WRONG / USER_LOST）',
    example: 'ADDRESS_WRONG'
  })
  @IsString()
  @Length(1, 64)
  abnormalType!: string

  @ApiProperty({ description: '异常描述（详尽，便于客服处理）', maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  description!: string

  @ApiPropertyOptional({
    description: '证据 URL 数组（图片 / 视频帧；最多 9 张）',
    isArray: true,
    example: ['https://cdn.example.com/abnormal/1.jpg']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EVIDENCE_MAX_URLS, { message: `证据最多 ${EVIDENCE_MAX_URLS} 个 URL` })
  @IsString({ each: true })
  evidenceUrls?: string[]

  @ApiPropertyOptional({ description: '上报时经度', example: 116.405285 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number

  @ApiPropertyOptional({ description: '上报时纬度', example: 39.904989 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number
}

/**
 * 异常上报出参
 */
export class AbnormalReportVo {
  @ApiProperty({ description: '上报记录主键（abnormal_report.id）' })
  id!: string

  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型' })
  orderType!: number

  @ApiProperty({ description: '异常类型' })
  abnormalType!: string

  @ApiProperty({ description: '当前状态：0 待处理（创建即此值）' })
  status!: number

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}

/* ============================================================================
 * 4) TransferOrderDto —— 转单申请
 * ============================================================================ */

/**
 * 转单申请入参
 *
 * 业务约束：
 *   - 写 transfer_record（status=0 申请中），订单状态保持
 *   - 发 OrderTransferRequested 事件（本期事件不在白名单中，service 内仅写日志；管理审核由 Sprint 6 接入）
 *   - 同一订单同一骑手不允许重复申请（service 层校验：已存在 status=0 的转单记录则拒绝）
 */
export class TransferOrderDto {
  @ApiProperty({
    description:
      '转单原因编码（→ sys_dict transfer_reason；如 RIDER_BREAKDOWN / ROUTE_BLOCK / SHIFT_CHANGE）',
    example: 'RIDER_BREAKDOWN'
  })
  @IsString()
  @Length(1, 64)
  reasonCode!: string

  @ApiPropertyOptional({ description: '原因详情', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonDetail?: string
}

/**
 * 转单申请出参
 */
export class TransferOrderVo {
  @ApiProperty({ description: '转单记录主键（transfer_record.id）' })
  id!: string

  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型' })
  orderType!: number

  @ApiProperty({ description: '原骑手 ID' })
  fromRiderId!: string

  @ApiProperty({ description: '原因编码' })
  reasonCode!: string

  @ApiProperty({ description: '当前状态：0 申请中（创建即此值；待管理审核）' })
  status!: number

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}
