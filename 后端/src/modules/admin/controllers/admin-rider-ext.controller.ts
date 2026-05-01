/**
 * @file admin-rider-ext.controller.ts
 * @stage P9 Sprint 4 / W4.C.1 + W4.C.2
 * @desc 管理端骑手扩展：轨迹回放（TimescaleDB）+ 奖惩规则 / 等级配置（sys_config 持久化）
 * @author Sprint4-Agent C
 *
 * 路径前缀：/api/v1/admin/rider
 * 鉴权：JwtAuthGuard + UserTypeGuard + PermissionGuard + @UserTypes('admin')
 * 对齐前端：管理后台/src/api/business/rider.ts（track / reward / level 部分）
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  AdminRiderExtService,
  type LevelConfigItem,
  type RewardRule,
  type RiderTrackResult
} from '../services/admin-rider-ext.service'

@ApiTags('管理后台 - 骑手扩展')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('rider:manage')
@UserTypes('admin')
@Controller('admin/rider')
export class AdminRiderExtController {
  constructor(private readonly service: AdminRiderExtService) {}

  /* ==========================================================================
   * 一、轨迹回放（V8.13）
   * ========================================================================== */

  /**
   * 骑手轨迹回放
   * 参数：id 骑手 ID（path）；orderNo 必填（query）；startTs / endTs 毫秒时间戳（query）
   * 返回：GeoJSON LineString
   */
  @Get(':id/track')
  @ApiOperation({ summary: '骑手轨迹回放（按订单 + 时间范围 → GeoJSON LineString）' })
  @ApiParam({ name: 'id', description: '骑手 ID' })
  @ApiQuery({ name: 'orderNo', required: true, type: String })
  @ApiQuery({ name: 'startTs', required: false, type: Number })
  @ApiQuery({ name: 'endTs', required: false, type: Number })
  @ApiSwaggerResponse({ status: 200 })
  async track(
    @Param('id') id: string,
    @Query('orderNo') orderNo: string,
    @Query('startTs') startTs?: string,
    @Query('endTs') endTs?: string
  ): Promise<RiderTrackResult> {
    const startMs = startTs != null && startTs !== '' ? Number(startTs) : undefined
    const endMs = endTs != null && endTs !== '' ? Number(endTs) : undefined
    return this.service.queryTrack(id, orderNo, startMs, endMs)
  }

  /* ==========================================================================
   * 二、奖惩规则（V8.14 / V8.15）
   * ========================================================================== */

  /**
   * 奖惩规则列表
   */
  @Get('reward/rules')
  @ApiOperation({ summary: '奖惩规则列表（dispatch.reward_rules）' })
  @ApiSwaggerResponse({ status: 200 })
  async listReward(): Promise<RewardRule[]> {
    return this.service.listReward()
  }

  /**
   * 新增 / 更新奖惩规则
   */
  @Post('reward/rules')
  @ApiOperation({ summary: '新增 / 更新奖惩规则（按 id；缺 id 视为新增）' })
  @ApiSwaggerResponse({ status: 200 })
  async saveReward(@Body() rule: Partial<RewardRule>): Promise<RewardRule[]> {
    return this.service.saveReward(rule)
  }

  /**
   * 删除奖惩规则
   */
  @Delete('reward/rules/:id')
  @ApiOperation({ summary: '删除奖惩规则' })
  @ApiParam({ name: 'id', description: 'reward 规则 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async deleteReward(@Param('id') id: string): Promise<RewardRule[]> {
    return this.service.deleteReward(id)
  }

  /* ==========================================================================
   * 三、等级配置（V8.15）
   * ========================================================================== */

  /**
   * 等级配置列表
   */
  @Get('level/config')
  @ApiOperation({ summary: '骑手等级配置列表（dispatch.level_config）' })
  @ApiSwaggerResponse({ status: 200 })
  async listLevel(): Promise<LevelConfigItem[]> {
    return this.service.listLevel()
  }

  /**
   * 新增 / 更新等级配置（按 level）
   */
  @Put('level/config')
  @ApiOperation({ summary: '新增 / 更新骑手等级配置（按 level 匹配）' })
  @ApiSwaggerResponse({ status: 200 })
  async saveLevel(@Body() item: Partial<LevelConfigItem>): Promise<LevelConfigItem[]> {
    return this.service.saveLevel(item)
  }

  /**
   * 删除等级配置
   */
  @Delete('level/config/:level')
  @ApiOperation({ summary: '删除骑手等级配置' })
  @ApiParam({ name: 'level', description: '等级编号' })
  @ApiSwaggerResponse({ status: 200 })
  async deleteLevel(@Param('level', ParseIntPipe) level: number): Promise<LevelConfigItem[]> {
    return this.service.deleteLevel(level)
  }
}
