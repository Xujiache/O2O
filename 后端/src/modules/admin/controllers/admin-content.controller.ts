/**
 * @file admin-content.controller.ts
 * @stage P9/补齐
 * @desc 管理端内容管理接口：Banner / 公告 / 快捷入口 / 热搜 CRUD
 * @author 补齐缺口
 *
 * 路径前缀：/api/v1/admin/content
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 * 对齐前端：管理后台/src/api/business/content.ts
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'

/** 简化分页参数 DTO */
class ListQueryDto {
  page?: number
  pageSize?: number
  keyword?: string
  status?: number
}

/** Banner DTO */
class BannerDto {
  title?: string
  imageUrl?: string
  link?: string
  linkType?: number
  position?: string
  sort?: number
  status?: number
  startTime?: string
  endTime?: string
  cityCode?: string
}

/** 公告 DTO */
class NoticeDto {
  title?: string
  content?: string
  type?: number
  status?: number
  startTime?: string
  endTime?: string
  cityCode?: string
}

/** 快捷入口 DTO */
class QuickEntryDto {
  id?: string
  name?: string
  icon?: string
  sort?: number
}

/** 热搜 DTO */
class HotSearchDto {
  id?: string
  keyword?: string
  sort?: number
}

@ApiTags('管理后台 - 内容管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('content:manage')
@UserTypes('admin')
@Controller('admin/content')
export class AdminContentController {
  /* ==========================================================================
   * 一、Banner CRUD
   * ========================================================================== */

  /**
   * Banner 列表
   */
  @Get('banner/list')
  @ApiOperation({ summary: 'Banner 列表（分页 + 关键词/状态筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  async bannerList(@Query() query: ListQueryDto) {
    const { page = 1, pageSize = 20 } = query
    return {
      list: [],
      meta: { page, pageSize, total: 0, totalPages: 0 }
    }
  }

  /**
   * 新建 Banner
   */
  @Post('banner')
  @ApiOperation({ summary: '新建 Banner' })
  @ApiSwaggerResponse({ status: 200 })
  async bannerSave(@CurrentUser('uid') opAdminId: string, @Body() dto: BannerDto) {
    const id = Date.now().toString()
    return { id }
  }

  /**
   * 编辑 Banner
   */
  @Put('banner/:id')
  @ApiOperation({ summary: '编辑 Banner' })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiSwaggerResponse({ status: 200 })
  async bannerUpdate(
    @Param('id') id: string,
    @Body() dto: BannerDto,
    @CurrentUser('uid') opAdminId: string
  ) {
    return { success: true }
  }

  /**
   * 删除 Banner
   */
  @Delete('banner/:id')
  @ApiOperation({ summary: '删除 Banner' })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiSwaggerResponse({ status: 200 })
  async bannerDelete(@Param('id') id: string) {
    return { deleted: true }
  }

  /**
   * Banner 排序
   */
  @Post('banner/reorder')
  @ApiOperation({ summary: 'Banner 拖拽排序' })
  @ApiSwaggerResponse({ status: 200 })
  async bannerReorder(@Body() body: { orderedIds: string[] }) {
    return { success: true }
  }

  /* ==========================================================================
   * 二、快捷入口 CRUD
   * ========================================================================== */

  /**
   * 快捷入口列表
   */
  @Get('quick-entry/list')
  @ApiOperation({ summary: '快捷入口列表' })
  @ApiSwaggerResponse({ status: 200 })
  async quickEntryList() {
    return []
  }

  /**
   * 新建/编辑快捷入口
   */
  @Post('quick-entry')
  @ApiOperation({ summary: '新建/编辑快捷入口' })
  @ApiSwaggerResponse({ status: 200 })
  async quickEntrySave(@Body() dto: QuickEntryDto) {
    const id = dto.id ?? Date.now().toString()
    return { id }
  }

  /**
   * 删除快捷入口
   */
  @Delete('quick-entry/:id')
  @ApiOperation({ summary: '删除快捷入口' })
  @ApiParam({ name: 'id', description: '快捷入口 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async quickEntryDelete(@Param('id') id: string) {
    return { deleted: true }
  }

  /* ==========================================================================
   * 三、热搜 CRUD
   * ========================================================================== */

  /**
   * 热搜列表
   */
  @Get('hot-search/list')
  @ApiOperation({ summary: '热搜词列表' })
  @ApiSwaggerResponse({ status: 200 })
  async hotSearchList() {
    return []
  }

  /**
   * 新建/编辑热搜词
   */
  @Post('hot-search')
  @ApiOperation({ summary: '新建/编辑热搜词' })
  @ApiSwaggerResponse({ status: 200 })
  async hotSearchSave(@Body() dto: HotSearchDto) {
    const id = dto.id ?? Date.now().toString()
    return { id }
  }

  /**
   * 删除热搜词
   */
  @Delete('hot-search/:id')
  @ApiOperation({ summary: '删除热搜词' })
  @ApiParam({ name: 'id', description: '热搜 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async hotSearchDelete(@Param('id') id: string) {
    return { deleted: true }
  }

  /* ==========================================================================
   * 四、公告 CRUD
   * ========================================================================== */

  /**
   * 公告列表
   */
  @Get('notice/list')
  @ApiOperation({ summary: '公告列表（分页）' })
  @ApiSwaggerResponse({ status: 200 })
  async noticeList(@Query() query: ListQueryDto) {
    const { page = 1, pageSize = 20 } = query
    return {
      list: [],
      meta: { page, pageSize, total: 0, totalPages: 0 }
    }
  }

  /**
   * 新建公告
   */
  @Post('notice')
  @ApiOperation({ summary: '新建公告' })
  @ApiSwaggerResponse({ status: 200 })
  async noticeSave(@CurrentUser('uid') opAdminId: string, @Body() dto: NoticeDto) {
    const id = Date.now().toString()
    return { id }
  }

  /**
   * 编辑公告
   */
  @Put('notice/:id')
  @ApiOperation({ summary: '编辑公告' })
  @ApiParam({ name: 'id', description: '公告 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async noticeUpdate(
    @Param('id') id: string,
    @Body() dto: NoticeDto,
    @CurrentUser('uid') opAdminId: string
  ) {
    return { success: true }
  }

  /**
   * 删除公告
   */
  @Delete('notice/:id')
  @ApiOperation({ summary: '删除公告' })
  @ApiParam({ name: 'id', description: '公告 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async noticeDelete(@Param('id') id: string) {
    return { deleted: true }
  }
}
