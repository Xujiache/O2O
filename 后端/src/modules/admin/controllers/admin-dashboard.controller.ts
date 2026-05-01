/**
 * @file admin-dashboard.controller.ts
 * @stage P9 Sprint 4 / W4.C.3
 * @desc 管理端数据大盘：4 大指标卡（today_order / gmv / active_users / active_riders）+ 7 日趋势
 * @author Sprint4-Agent C
 *
 * 路径前缀：/api/v1/admin/dashboard
 * 鉴权：JwtAuthGuard + UserTypeGuard + PermissionGuard + @UserTypes('admin')
 * 对齐前端：管理后台/src/api/business/dashboard.ts
 */

import { Controller, Get, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  AdminDashboardService,
  type DashboardOverview,
  type DashboardTrendPoint
} from '../services/admin-dashboard.service'

@ApiTags('管理后台 - 数据大盘')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('dashboard:view')
@UserTypes('admin')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  /**
   * 概览（4 大指标卡）
   * 返回：{ todayOrderCount, todayGmv, activeUsers, activeRiders, generatedAt }
   */
  @Get('overview')
  @ApiOperation({ summary: '数据大盘概览（4 大指标卡）' })
  @ApiSwaggerResponse({ status: 200 })
  async overview(): Promise<DashboardOverview> {
    return this.service.overview()
  }

  /**
   * 7 日趋势（含今日，按日期升序，缺口补 0）
   * 返回：DashboardTrendPoint[]
   */
  @Get('trend')
  @ApiOperation({ summary: '7 日订单 + GMV 趋势' })
  @ApiSwaggerResponse({ status: 200 })
  async trend(): Promise<DashboardTrendPoint[]> {
    return this.service.trend()
  }
}
