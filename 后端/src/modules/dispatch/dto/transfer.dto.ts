/**
 * @file transfer.dto.ts
 * @stage P4/T4.42（Sprint 6）
 * @desc 转单 DTO（CreateTransfer / AuditTransfer / TransferVo）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 注：CreateTransferDto 主要给 Subagent 2 的 rider-action.service 复用，本模块也对外暴露
 *     便于 e2e 自验证；管理后台审核走 AuditTransferDto。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator'
import { PageQueryDto } from '@/common'

/* ============================================================================
 * 1) 转单视图
 * ============================================================================ */

/**
 * 转单视图
 */
export class TransferVo {
  @ApiProperty({ description: '转单记录主键' })
  id!: string

  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '原骑手 ID' })
  fromRiderId!: string

  @ApiProperty({ description: '转入骑手 ID（接单后填）', nullable: true })
  toRiderId!: string | null

  @ApiProperty({ description: '原因编码', example: 'PERSONAL_REASON' })
  reasonCode!: string

  @ApiProperty({ description: '原因详情', nullable: true })
  reasonDetail!: string | null

  @ApiProperty({ description: '状态：0 申请中 / 1 已转出 / 2 已驳回 / 3 已取消' })
  status!: number

  @ApiProperty({ description: '审核管理员 ID', nullable: true })
  auditAdminId!: string | null

  @ApiProperty({ description: '审核时间', nullable: true })
  auditAt!: Date | null

  @ApiProperty({ description: '审核备注', nullable: true })
  auditRemark!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}

/* ============================================================================
 * 2) 转单申请入参
 * ============================================================================ */

/**
 * 转单申请入参（骑手端 / 给 Subagent 2 复用）
 */
export class CreateTransferDto {
  @ApiProperty({ description: '订单号', example: 'T2026041910000001' })
  @IsString()
  @IsNotEmpty()
  @Length(18, 18, { message: 'orderNo 长度必须为 18 位' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿', example: 1, enum: [1, 2] })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  orderType!: number

  @ApiProperty({
    description: '原因编码（→ sys_dict transfer_reason）',
    example: 'PERSONAL_REASON'
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  reasonCode!: string

  @ApiPropertyOptional({ description: '原因详情' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reasonDetail?: string
}

/* ============================================================================
 * 3) 转单审核入参（管理端）
 * ============================================================================ */

/**
 * 审核转单入参
 */
export class AuditTransferDto {
  @ApiProperty({
    description: '审核动作：pass 通过 / reject 驳回',
    example: 'pass',
    enum: ['pass', 'reject']
  })
  @IsString()
  @IsIn(['pass', 'reject'], { message: 'action 必须为 pass 或 reject' })
  action!: 'pass' | 'reject'

  @ApiPropertyOptional({
    description: '审核备注（驳回时建议必填）',
    example: '原因不充分'
  })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  remark?: string

  @ApiPropertyOptional({
    description: 'pass 时可指定接管骑手 ID；不传则进入抢单池由系统派单 worker 重新派给候选 Top1',
    example: '202604190000456'
  })
  @IsOptional()
  @IsString()
  toRiderId?: string
}

/* ============================================================================
 * 4) 转单列表查询
 * ============================================================================ */

/**
 * 转单列表查询（管理端工作台）
 */
export class TransferListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: '状态：0 申请中 / 1 已转出 / 2 已驳回 / 3 已取消'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  status?: number

  @ApiPropertyOptional({ description: '订单类型：1 外卖 / 2 跑腿' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  orderType?: number

  @ApiPropertyOptional({ description: '原骑手 ID' })
  @IsOptional()
  @IsString()
  fromRiderId?: string

  @ApiPropertyOptional({ description: '订单号模糊查询' })
  @IsOptional()
  @IsString()
  orderNo?: string
}
