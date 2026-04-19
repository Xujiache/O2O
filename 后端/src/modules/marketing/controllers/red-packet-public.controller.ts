/**
 * @file red-packet-public.controller.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 红包池公开 + 用户端接口
 * @author 单 Agent V2.0（Agent C）
 *
 * 路由：
 *   - GET  /red-packets/active            （Public）进行中红包列表（status=1 + valid 时段，过滤白名单）
 *   - POST /me/red-packets/:id/grab       （user）领取红包（V4.11 不超发，Lua 原子）
 *   - GET  /me/red-packets                （user）我领过的红包列表（从 Redis 反查）
 *   - GET  /me/red-packets/:id            （user）我在某红包的领取详情
 *
 * 鉴权：active 接口 @Public()；其余 /me 路由依赖全局 JwtAuthGuard + 类级 UserTypeGuard
 */

import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser, Public, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import { GrabRedPacketResultDto, MyRedPacketItemVo, RedPacketVo } from '../dto/red-packet.dto'
import { RedPacketService } from '../services/red-packet.service'

@ApiTags('用户端 - 红包')
@Controller()
export class RedPacketPublicController {
  constructor(private readonly redPacketService: RedPacketService) {}

  /**
   * 公开：进行中红包列表（无需登录可查；登录态时按 currentUserId 过滤白名单）
   */
  @Public()
  @Get('red-packets/active')
  @ApiOperation({
    summary: '公开 - 进行中红包列表（status=1 + 时段内 + 白名单过滤；最多 50 条）'
  })
  @ApiSwaggerResponse({ status: 200, type: RedPacketVo, isArray: true })
  listActive(): Promise<RedPacketVo[]> {
    /* @Public() 路径无登录上下文；service 接受 undefined 时只返回"未指定用户"红包 */
    return this.redPacketService.listActive(undefined)
  }
}

@ApiTags('用户端 - 红包')
@ApiBearerAuth()
@Controller('me/red-packets')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
export class RedPacketUserController {
  constructor(private readonly redPacketService: RedPacketService) {}

  /**
   * 用户端：我领过的红包列表
   */
  @Get()
  @ApiOperation({
    summary: '用户端 - 我领过的红包列表（从 redpacket:user:{userId} Set + grab 详情聚合）'
  })
  @ApiSwaggerResponse({ status: 200, type: MyRedPacketItemVo, isArray: true })
  listMyPackets(@CurrentUser('uid') userId: string): Promise<MyRedPacketItemVo[]> {
    return this.redPacketService.listMyPackets(userId)
  }

  /**
   * 用户端：单笔领取详情
   */
  @Get(':id')
  @ApiOperation({
    summary: '用户端 - 我在某红包的领取详情（金额 / 时间 / 祝福语）'
  })
  @ApiSwaggerResponse({ status: 200, type: MyRedPacketItemVo })
  getMyGrab(
    @CurrentUser('uid') userId: string,
    @Param('id') id: string
  ): Promise<MyRedPacketItemVo> {
    return this.redPacketService.getMyGrab(userId, id)
  }

  /**
   * 用户端：领取红包（V4.11 核心：Lua 原子 + DB CAS 兜底，绝不超发）
   */
  @Post(':id/grab')
  @ApiOperation({
    summary: '用户端 - 领取红包（Lua 原子判重计数预占 + 二倍均值法分配 + DB CAS 兜底；不超发）'
  })
  @ApiSwaggerResponse({ status: 200, type: GrabRedPacketResultDto })
  grab(
    @CurrentUser('uid') userId: string,
    @Param('id') id: string
  ): Promise<GrabRedPacketResultDto> {
    return this.redPacketService.grab(userId, id)
  }
}
