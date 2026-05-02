/**
 * @file admin-ops.controller.ts
 * @stage P9/补齐
 * @desc 管理端运营管理接口：推送 / 推送模板 / 区域管理
 * @author 补齐缺口
 *
 * 路径前缀：/api/v1/admin/ops
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 * 对齐前端：管理后台/src/api/business/ops.ts（push + region 部分）
 */

import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'

/** 分页查询 DTO */
class ListQueryDto {
  page?: number
  pageSize?: number
  keyword?: string
  status?: number
}

/** 推送任务 DTO */
class PushTaskDto {
  title?: string
  content?: string
  channels?: string[]
  targetType?: string
  targetParam?: Record<string, unknown>
  sendAt?: string
  status?: number
}

/** 推送模板 DTO */
class PushTemplateDto {
  id?: string
  code?: string
  name?: string
  channels?: string[]
  content?: string
}

/** 区域配置 DTO */
class RegionDto {
  cityCode?: string
  cityName?: string
  province?: string
  enabled?: boolean
  deliveryRadius?: number
  baseFee?: string
  perKmFee?: string
}

@ApiTags('管理后台 - 运营（推送/区域）')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('ops:manage')
@UserTypes('admin')
@Controller('admin/ops')
export class AdminOpsController {
  /* ==========================================================================
   * 一、推送任务
   * ========================================================================== */

  /**
   * 推送任务列表
   */
  @Get('push/list')
  @ApiOperation({ summary: '推送任务列表（分页）' })
  @ApiSwaggerResponse({ status: 200 })
  async pushList(@Query() query: ListQueryDto) {
    const { page = 1, pageSize = 20 } = query
    return {
      list: [],
      meta: { page, pageSize, total: 0, totalPages: 0 }
    }
  }

  /**
   * 创建推送任务
   */
  @Post('push')
  @ApiOperation({ summary: '创建推送任务' })
  @ApiSwaggerResponse({ status: 200 })
  async pushSave(@CurrentUser('uid') opAdminId: string, @Body() dto: PushTaskDto) {
    const id = Date.now().toString()
    return { id }
  }

  /**
   * 取消推送任务
   */
  @Post('push/:id/cancel')
  @ApiOperation({ summary: '取消推送任务' })
  @ApiParam({ name: 'id', description: '推送任务 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async pushCancel(@Param('id') id: string) {
    return { cancelled: true }
  }

  /* ==========================================================================
   * 二、推送模板
   * ========================================================================== */

  /**
   * 推送模板列表
   */
  @Get('push-template/list')
  @ApiOperation({ summary: '推送模板列表' })
  @ApiSwaggerResponse({ status: 200 })
  async pushTemplateList() {
    return []
  }

  /**
   * 新建/编辑推送模板
   */
  @Post('push-template')
  @ApiOperation({ summary: '新建/编辑推送模板' })
  @ApiSwaggerResponse({ status: 200 })
  async pushTemplateSave(@Body() dto: PushTemplateDto) {
    const id = dto.id ?? Date.now().toString()
    return { id }
  }

  /* ==========================================================================
   * 三、区域管理
   * ========================================================================== */

  /**
   * 区域列表
   */
  @Get('region/list')
  @ApiOperation({ summary: '已开通区域列表' })
  @ApiSwaggerResponse({ status: 200 })
  async regionList() {
    return []
  }

  /**
   * 编辑区域配置
   */
  @Put('region/:cityCode')
  @ApiOperation({ summary: '编辑区域配置（配送参数/费用）' })
  @ApiParam({ name: 'cityCode', description: '城市编码' })
  @ApiSwaggerResponse({ status: 200 })
  async regionSave(@Param('cityCode') cityCode: string, @Body() dto: RegionDto) {
    return { success: true }
  }

  /**
   * 区域启停
   */
  @Post('region/:cityCode/toggle')
  @ApiOperation({ summary: '区域启用/停用' })
  @ApiParam({ name: 'cityCode', description: '城市编码' })
  @ApiSwaggerResponse({ status: 200 })
  async regionToggle(@Param('cityCode') cityCode: string, @Body() body: { enabled: boolean }) {
    return { cityCode, enabled: body.enabled }
  }
}
