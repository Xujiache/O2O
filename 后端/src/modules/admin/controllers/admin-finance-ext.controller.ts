/**
 * @file admin-finance-ext.controller.ts
 * @stage P9 Sprint 4 / W4.B.2（重写：硬编码 0.00 → 真聚合查询）
 * @desc 管理端财务扩展：财务概览 / 账单列表 / 分账记录重试
 * @author 单 Agent V2.0（Sprint 4 Agent B）
 *
 * 路径前缀：/api/v1/admin/finance + /api/v1/admin/settlement-records（保留前端 R1 兼容）
 * 鉴权：JwtAuthGuard + UserTypeGuard + PermissionGuard
 *
 * 路由：
 *   GET  /admin/finance/overview              财务概览（收入/佣金/退款/余额 + 7 日趋势）
 *   GET  /admin/finance/bill/list             账单列表（分页 + 过滤）
 *   POST /admin/settlement-records/:id/retry  分账记录重试（execute 单条 record）
 *
 * 注：实际数据访问全部由 AdminFinanceExtService 处理；本 controller 仅做参数透传
 */

import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AdminFinanceExtService } from '../services/admin-finance-ext.service'

/** 概览查询 DTO */
export class OverviewQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string

  @IsOptional()
  @IsString()
  endDate?: string
}

/** 账单分页查询 DTO */
export class BillListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  ownerType?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  bizType?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  direction?: number

  @IsOptional()
  @IsString()
  startDate?: string

  @IsOptional()
  @IsString()
  endDate?: string
}

@ApiTags('管理后台 - 财务扩展')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@UserTypes('admin')
@Controller('admin')
export class AdminFinanceExtController {
  constructor(private readonly financeExtService: AdminFinanceExtService) {}

  /**
   * 财务概览（收入 / 佣金 / 退款 / 余额 + 7 日趋势）
   */
  @Get('finance/overview')
  @Permissions('biz:system:finance:view')
  @ApiOperation({ summary: '财务概览（收入/佣金/退款/余额 + 趋势）' })
  @ApiSwaggerResponse({ status: 200 })
  async overview(@Query() query: OverviewQueryDto) {
    return this.financeExtService.getOverview(query)
  }

  /**
   * 账单明细列表
   */
  @Get('finance/bill/list')
  @Permissions('biz:system:finance:view')
  @ApiOperation({ summary: '账单明细列表（分页 + 日期 / ownerType / bizType / direction 筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  async billList(@Query() query: BillListQueryDto) {
    return this.financeExtService.getBillList(query)
  }

  /**
   * 分账记录重试（失败订单重跑分账）
   */
  @Post('settlement-records/:id/retry')
  @Permissions('biz:system:finance:retry')
  @ApiOperation({ summary: '分账记录重试（execute 单条 record，重新调 AccountService.earn）' })
  @ApiParam({ name: 'id', description: '分账记录 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async settlementRecordRetry(@Param('id') id: string, @CurrentUser('uid') opAdminId: string) {
    /* opAdminId 留待 OperationLog 写入（admin.module 已装载 OperationLogService） */
    void opAdminId
    return this.financeExtService.retrySettlement(id)
  }
}
