/**
 * @file order-cancel.dto.ts
 * @stage P4/T4.20 + 管理端 force-cancel
 * @desc 用户端取消 / 管理端强制取消 / 仲裁 入参 DTO
 * @author 单 Agent V2.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * 用户端取消订单
 */
export class UserCancelOrderDto {
  @ApiPropertyOptional({
    description: '取消原因（可选；不传时记 "用户主动取消"）',
    example: '不想要了'
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string
}

/**
 * 管理员强制取消
 */
export class AdminForceCancelDto {
  @ApiProperty({ description: '强制取消原因（必填，写 OperationLog）', example: '商户跑路' })
  @IsString()
  @MaxLength(255)
  reason!: string

  @ApiPropertyOptional({
    description: '是否触发退款（true 时由 Sprint 4 Payment 订阅事件做退款）',
    example: true
  })
  @IsOptional()
  triggerRefund?: boolean
}

/**
 * 管理员仲裁入参（标记 status=70 售后中）
 */
export class AdminArbitrateDto {
  @ApiProperty({ description: '仲裁说明（写 OperationLog + status_log.remark）' })
  @IsString()
  @MaxLength(500)
  remark!: string
}
