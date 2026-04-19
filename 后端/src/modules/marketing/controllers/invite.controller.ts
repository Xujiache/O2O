/**
 * @file invite.controller.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 邀请关系 - 公开 + 用户端接口
 * @author 单 Agent V2.0（Agent C）
 *
 * 路由：
 *   - GET  /invite/:inviteCode             （Public）邀请页 inviter 占位信息（昵称/头像 mask；本期）
 *   - POST /me/invitations/bind            （user）  绑定邀请人（uk_invitee；不可自邀）
 *   - GET  /me/invitations                 （user）  我的邀请战绩列表（按 reward_status 筛）
 *   - GET  /me/invitations/stat            （user）  我的邀请统计（缓存 60s）
 *
 * 鉴权：bind 接口入参 inviteeId 必须等于 currentUser.uid（直接用 @CurrentUser，DTO 不接收 inviteeId）
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { PageResult } from '@/common'
import { CurrentUser, Public, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  BindInviterDto,
  InvitePageVo,
  InviteRecordQueryDto,
  InviteRecordVo,
  InviteStatVo
} from '../dto/invite.dto'
import { InviteRelationService } from '../services/invite-relation.service'

@ApiTags('公开 - 邀请')
@Controller('invite')
export class InvitePublicController {
  constructor(private readonly inviteService: InviteRelationService) {}

  /**
   * 公开：邀请页 inviter 占位信息（无登录场景，引导注册）
   */
  @Public()
  @Get(':inviteCode')
  @ApiOperation({
    summary: '公开 - 邀请页（解析 inviteCode 取 inviter_id；昵称/头像本期返回 mask 占位）'
  })
  @ApiSwaggerResponse({ status: 200, type: InvitePageVo })
  getInvitePage(@Param('inviteCode') inviteCode: string): InvitePageVo {
    return this.inviteService.getInvitePage(inviteCode)
  }
}

@ApiTags('用户端 - 邀请')
@ApiBearerAuth()
@Controller('me/invitations')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
export class InviteUserController {
  constructor(private readonly inviteService: InviteRelationService) {}

  /**
   * 用户端：绑定邀请人（被邀请人首次注册后调用；invitee_id 取 currentUser.uid）
   */
  @Post('bind')
  @ApiOperation({
    summary: '用户端 - 绑定邀请人（一人仅可被邀请一次；不可自邀）'
  })
  @ApiSwaggerResponse({ status: 200, type: InviteRecordVo })
  bind(
    @CurrentUser('uid') currentUserId: string,
    @Body() dto: BindInviterDto
  ): Promise<InviteRecordVo> {
    return this.inviteService.bind(currentUserId, dto)
  }

  /**
   * 用户端：我的邀请战绩列表（按 reward_status 筛）
   */
  @Get()
  @ApiOperation({
    summary: '用户端 - 我的邀请战绩列表（按 reward_status 筛；按 created_at desc）'
  })
  @ApiSwaggerResponse({ status: 200 })
  listMyInvites(
    @CurrentUser('uid') currentInviterId: string,
    @Query() query: InviteRecordQueryDto
  ): Promise<PageResult<InviteRecordVo>> {
    return this.inviteService.listMyInvites(currentInviterId, query)
  }

  /**
   * 用户端：我的邀请统计（带缓存 60s）
   */
  @Get('stat')
  @ApiOperation({
    summary: '用户端 - 我的邀请统计（总邀请数 / 已完成数 / 已发放数 / 累计奖励积分）'
  })
  @ApiSwaggerResponse({ status: 200, type: InviteStatVo })
  getMyStat(@CurrentUser('uid') currentInviterId: string): Promise<InviteStatVo> {
    return this.inviteService.getMyStat(currentInviterId)
  }
}
