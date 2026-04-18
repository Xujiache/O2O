/**
 * @file send-message.dto.ts
 * @stage P3 / T3.13
 * @desc 业务侧调用 MessageService.send 的入参 + 站内信查询/标已读 DTO
 * @author 员工 B
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength
} from 'class-validator'
import { PageQueryDto } from '../../../common'

/**
 * 业务侧 send 入参
 * 用途：MessageService.send(dto)
 */
export class SendMessageDto {
  @ApiProperty({ description: '模板编码（如 ORDER_CREATED）' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 64)
  code!: string

  @ApiProperty({ description: '目标用户类型 1 用户/2 商户/3 骑手/4 管理员' })
  @IsInt()
  @IsIn([1, 2, 3, 4])
  targetType!: number

  @ApiProperty({ description: '目标用户 ID' })
  @IsString()
  @IsNotEmpty()
  targetId!: string

  @ApiPropertyOptional({
    description:
      '目标地址覆盖（不传则按 targetType 查 user.openIdMp / merchant.mobile / rider.mobile 等）',
    example: 'oxxxxxxxxxxxx'
  })
  @IsOptional()
  @IsString()
  targetAddress?: string

  @ApiPropertyOptional({
    description: '模板变量字典（占位符替换）',
    example: { orderNo: 'T2026041900001', amount: 35.5 }
  })
  @IsOptional()
  @IsObject()
  vars?: Record<string, unknown>

  @ApiPropertyOptional({
    description: '指定通道列表（不传则按模板默认通道发；用于运营手动指定）',
    isArray: true,
    type: Number,
    example: [1, 2]
  })
  @IsOptional()
  @IsArray()
  channels?: number[]

  @ApiPropertyOptional({ description: '业务关联类型（1 外卖 / 2 跑腿 / 3 退款 等）' })
  @IsOptional()
  @IsInt()
  relatedType?: number

  @ApiPropertyOptional({ description: '业务单号（站内信查询/反查用）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  relatedNo?: string

  @ApiPropertyOptional({ description: '点击跳转链接（小程序 path / H5 url）' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  linkUrl?: string

  @ApiPropertyOptional({ description: '幂等 ID（不传则自动生成）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string
}

/**
 * 收件箱列表查询入参
 */
export class ListInboxQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '消息分类：1 订单/2 活动/3 账户/4 系统/5 客服' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5])
  category?: number

  @ApiPropertyOptional({ description: '是否已读：0 未读 / 1 已读' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isRead?: number
}

/**
 * 收件箱视图
 */
export class InboxItemVo {
  @ApiProperty() id!: string
  @ApiProperty() category!: number
  @ApiProperty() title!: string
  @ApiProperty() content!: string
  @ApiProperty({ nullable: true }) linkUrl!: string | null
  @ApiProperty({ nullable: true }) relatedType!: number | null
  @ApiProperty({ nullable: true }) relatedNo!: string | null
  @ApiProperty() isRead!: number
  @ApiProperty({ nullable: true }) readAt!: Date | null
  @ApiProperty() createdAt!: Date
}

/**
 * 发送结果（Producer 同步返回；最终送达由 Consumer 异步完成）
 */
export class SendMessageResultVo {
  @ApiProperty() requestId!: string
  @ApiProperty({ description: '该次发送涉及的通道数' }) dispatchedChannels!: number
  @ApiProperty({ description: '是否所有通道都已成功投递到 MQ' }) ok!: boolean
}
