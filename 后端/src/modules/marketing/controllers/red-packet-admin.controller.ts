/**
 * @file red-packet-admin.controller.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 管理端红包池接口
 * @author 单 Agent V2.0（Agent C）
 *
 * 路由：
 *   - POST /admin/red-packets             新建红包池（自动初始化 Redis Hash + Set）
 *   - GET  /admin/red-packets             全量分页（按 packet_type/status/issuer/keyword）
 *   - GET  /admin/red-packets/:id         详情
 *   - PUT  /admin/red-packets/:id/cancel  撤销/退款（status=4 + 写 OperationLog）
 *
 * 鉴权：类级 @UseGuards(JwtAuthGuard, UserTypeGuard) + @UserTypes('admin')
 */

import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { PageResult } from '@/common'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { CreateRedPacketDto, QueryRedPacketDto, RedPacketVo } from '../dto/red-packet.dto'
import { RedPacketService } from '../services/red-packet.service'

/**
 * 撤销红包入参（管理端）
 * 用途：PUT /admin/red-packets/:id/cancel
 */
class CancelRedPacketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string
}

@ApiTags('管理后台 - 红包池')
@ApiBearerAuth()
@Controller('admin/red-packets')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('marketing:redpacket')
@UserTypes('admin')
export class RedPacketAdminController {
  constructor(private readonly redPacketService: RedPacketService) {}

  /**
   * 新建红包池
   */
  @Post()
  @ApiOperation({
    summary: '管理后台 - 新建红包池（自动初始化 Redis Hash 数据结构）'
  })
  @ApiSwaggerResponse({ status: 200, type: RedPacketVo })
  create(
    @Body() dto: CreateRedPacketDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<RedPacketVo> {
    return this.redPacketService.create(dto, opAdminId)
  }

  /**
   * 全量分页查询
   */
  @Get()
  @ApiOperation({
    summary: '管理后台 - 红包池全量分页（按 packet_type/status/issuer/keyword 筛）'
  })
  @ApiSwaggerResponse({ status: 200 })
  list(@Query() query: QueryRedPacketDto): Promise<PageResult<RedPacketVo>> {
    return this.redPacketService.adminList(query)
  }

  /**
   * 详情
   */
  @Get(':id')
  @ApiOperation({ summary: '管理后台 - 红包池详情（含已领取份数/金额）' })
  @ApiSwaggerResponse({ status: 200, type: RedPacketVo })
  detail(@Param('id') id: string): Promise<RedPacketVo> {
    return this.redPacketService.adminDetail(id)
  }

  /**
   * 撤销（status=4 + 写 OperationLog）
   */
  @Put(':id/cancel')
  @ApiOperation({
    summary: '管理后台 - 撤销红包池（status=4，剩余金额标记退款；写 OperationLog）'
  })
  @ApiBody({ type: CancelRedPacketDto })
  @ApiSwaggerResponse({ status: 200, type: RedPacketVo })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelRedPacketDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<RedPacketVo> {
    return this.redPacketService.adminCancel(id, opAdminId, dto.reason)
  }
}
