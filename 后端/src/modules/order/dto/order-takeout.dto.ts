/**
 * @file order-takeout.dto.ts
 * @stage P4/T4.17（Sprint 3）
 * @desc 外卖下单 / 确认收货 / 再来一单 DTO + 创建结果 VO
 * @author 单 Agent V2.0
 *
 * 复用 PreCheck 的 PreCheckItemDto / PreCheckAddressDto 字段定义；
 * 下单时 service 层会内部调 preCheck() 复用校验链，最终金额以 service 端为准（不信任前端入参金额）。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested
} from 'class-validator'
import { PreCheckAddressDto, PreCheckItemDto } from './order-pre-check.dto'

/* ============================================================================
 * 创建外卖订单
 * ============================================================================ */

/**
 * 创建外卖订单入参（与 PreCheck 入参重合大部分；保留 idemKey 以便测试场景明确传值）
 *
 * 注：实际幂等优先从 HTTP Header `X-Idem-Key` 读取；body.idemKey 仅为兼容字段，二者择一。
 */
export class CreateTakeoutOrderDto {
  @ApiProperty({ description: '店铺 ID（雪花字符串）', example: '180000000000000001' })
  @IsString()
  @Length(1, 32)
  shopId!: string

  @ApiProperty({ description: '商品项列表（1~50）', type: [PreCheckItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PreCheckItemDto)
  items!: PreCheckItemDto[]

  @ApiProperty({ description: '收货地址', type: PreCheckAddressDto })
  @ValidateNested()
  @Type(() => PreCheckAddressDto)
  address!: PreCheckAddressDto

  @ApiPropertyOptional({
    description: '用户主动选中的 user_coupon ID',
    type: [String],
    example: ['1100000000000000001']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  userCouponIds?: string[]

  @ApiPropertyOptional({ description: '活动 ID', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  promotionIds?: string[]

  @ApiPropertyOptional({ description: '用户备注', example: '不要香菜' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string

  @ApiPropertyOptional({
    description: '幂等 Key（兼容字段；推荐用 Header X-Idem-Key 传），10min TTL',
    example: 'idem-9c1a-6a44'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idemKey?: string
}

/**
 * 创建结果 VO
 */
export class CreateTakeoutOrderResultVo {
  @ApiProperty({ description: '订单号（18 位）', example: 'T20260419010000018' })
  orderNo!: string

  @ApiProperty({ description: '应付金额（元，字符串）', example: '49.00' })
  payAmount!: string

  @ApiProperty({ description: '过期时间（毫秒时间戳；待支付窗口 15min）' })
  expireAt!: number

  @ApiProperty({
    description: '是否命中幂等（true=已存在；false=本次新建）',
    example: false
  })
  idempotentHit!: boolean
}

/* ============================================================================
 * 用户取消（路径参数 orderNo + body 原因）
 * ============================================================================ */

/**
 * 已迁移到 order-cancel.dto.ts；本文件保留 createTakeoutOrder + reorder + confirmReceive
 */

/**
 * 确认收货入参（可附带评分上下文，本期暂不强制）
 */
export class ConfirmReceiveDto {
  @ApiPropertyOptional({ description: '附加备注', example: '已收到，配送不错' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/* ============================================================================
 * 再来一单
 * ============================================================================ */

/**
 * 再来一单入参（拷贝原订单 items + 新地址）
 */
export class ReorderTakeoutDto {
  @ApiPropertyOptional({
    description: '替换收货地址（不传则沿用原订单 address_snapshot；当前期次必传，避免地址过期）',
    type: PreCheckAddressDto
  })
  @ValidateNested()
  @Type(() => PreCheckAddressDto)
  address!: PreCheckAddressDto

  @ApiPropertyOptional({ description: '备注', example: '辣度变中辣' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string

  @ApiPropertyOptional({
    description: '幂等 Key（兼容字段；推荐用 Header X-Idem-Key）',
    example: 'idem-aaaa'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idemKey?: string
}

/* ============================================================================
 * 商户端：接单 / 拒单 / 出餐 / 打印
 * ============================================================================ */

/**
 * 接单（无入参）
 */
export class AcceptOrderDto {
  @ApiPropertyOptional({ description: '附加备注', example: '已配齐厨房' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/**
 * 拒单
 */
export class RejectOrderDto {
  @ApiProperty({ description: '拒单原因（必填）', example: '食材不足' })
  @IsString()
  @MaxLength(255)
  reason!: string
}

/**
 * 出餐完成
 */
export class ReadyOrderDto {
  @ApiPropertyOptional({ description: '附加备注', example: '已打包' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/**
 * 打印小票
 */
export class PrintOrderDto {
  @ApiPropertyOptional({ description: '打印机编号', example: 'PRINTER-A1' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  printerNo?: string
}

/**
 * 打印结果 VO
 */
export class PrintOrderResultVo {
  @ApiProperty({ description: '是否成功（本期固定 true）', example: true })
  success!: boolean

  @ApiProperty({ description: '操作时间戳（毫秒）' })
  printedAt!: number
}
