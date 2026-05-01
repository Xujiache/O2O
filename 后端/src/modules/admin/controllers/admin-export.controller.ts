/**
 * @file admin-export.controller.ts
 * @stage P9 Sprint 4 / W4.B.1（重写：进程内 Map → BullMQ + Redis + MinIO）
 * @desc 管理端异步导出接口：创建导出任务 / 查询状态 / 取消
 * @author 单 Agent V2.0（Sprint 4 Agent B）
 *
 * 路径前缀：/api/v1/admin/exports/jobs
 * 鉴权：JwtAuthGuard + UserTypeGuard + PermissionGuard
 *      创建/查询 @Permissions('biz:system:export:create')
 *      取消     @Permissions('biz:system:export:cancel')
 *
 * 路由（保留前端 R1 期已对齐的 path 兼容性）：
 *   POST /admin/exports/jobs            创建导出任务（returns { jobId }）
 *   GET  /admin/exports/jobs/:id        查询状态（returns { status, downloadUrl?, errorMsg? }）
 *   POST /admin/exports/jobs/:id/cancel 取消（returns { canceled: boolean }）
 *
 * 状态机：PENDING → RUNNING → SUCCESS / FAILED；可被 cancelJob 改为 CANCELED
 *
 * 注：admin.module.ts 由 Agent A 统一合并 controllers/providers/imports
 */

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AdminExportService } from '../services/admin-export.service'

/**
 * 创建导出任务 DTO
 *
 * 字段：
 *   - module 业务模块（order / merchant / rider / finance）
 *   - query  导出筛选条件（透传给 processor 的 service.listForExport）
 */
export class CreateExportJobDto {
  @IsString()
  @MaxLength(64)
  module!: string

  @IsOptional()
  @IsObject()
  query?: Record<string, unknown>
}

@ApiTags('管理后台 - 异步导出')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@UserTypes('admin')
@Controller('admin/exports')
export class AdminExportController {
  constructor(private readonly exportService: AdminExportService) {}

  /**
   * 创建导出任务
   * 入参：dto / opAdminId（CurrentUser）
   * 返回：{ jobId }
   */
  @Post('jobs')
  @Permissions('biz:system:export:create')
  @ApiOperation({ summary: '创建异步导出任务' })
  @ApiSwaggerResponse({ status: 200 })
  async createJob(
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: CreateExportJobDto
  ): Promise<{ jobId: string }> {
    return this.exportService.createJob({
      module: dto.module,
      query: dto.query ?? {},
      adminId: opAdminId
    })
  }

  /**
   * 查询导出任务状态
   * 入参：id（jobId）
   * 返回：{ status, downloadUrl?, errorMsg? }
   */
  @Get('jobs/:id')
  @Permissions('biz:system:export:create')
  @ApiOperation({ summary: '查询导出任务状态' })
  @ApiParam({ name: 'id', description: '导出任务 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async getJob(@Param('id') id: string) {
    return this.exportService.getJob(id)
  }

  /**
   * 取消导出任务
   * 入参：id
   * 返回：{ canceled: boolean }
   */
  @Post('jobs/:id/cancel')
  @Permissions('biz:system:export:cancel')
  @ApiOperation({ summary: '取消异步导出任务' })
  @ApiParam({ name: 'id', description: '导出任务 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async cancelJob(@Param('id') id: string): Promise<{ canceled: boolean }> {
    return this.exportService.cancelJob(id)
  }
}
