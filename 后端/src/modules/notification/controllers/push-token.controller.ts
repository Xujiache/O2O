/**
 * @file push-token.controller.ts
 * @stage P9 Sprint 5 / W5.E.3
 * @desc 三端推送 token 注册接口：register / unregister / heartbeat
 * @author Agent E (P9 Sprint 5)
 *
 * 路径前缀：/api/v1/push
 * 鉴权：JwtAuthGuard（全局已注册）+ @CurrentUser 取登录态 uid / userType
 *
 * 注意：本 controller 仅新建文件；notification.module.ts 由 Agent B 主导，
 *      由 A 合并时把本 controller 加入 controllers 数组。
 */

import { Body, Controller, Delete, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { CurrentUser } from '@/modules/auth/decorators'
import { JwtAuthGuard } from '@/modules/auth/guards'
import type { AuthUser } from '@/modules/auth/decorators'
import { PushTokenService, type PushTokenOpResult } from '../services/push-token.service'

/* ============================================================================
 * DTO
 * ============================================================================ */

/**
 * userType 字面量 → 数值转换
 */
function userTypeToNumber(t: AuthUser['userType']): number {
  switch (t) {
    case 'user':
      return 1
    case 'merchant':
      return 2
    case 'rider':
      return 3
    default:
      return 0
  }
}

/**
 * 注册 push token 入参
 */
export class PushRegisterDto {
  @IsString()
  @IsIn(['ios', 'android', 'mp'])
  platform!: 'ios' | 'android' | 'mp'

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  registrationId!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string
}

/* ============================================================================
 * Controller
 * ============================================================================ */

@ApiTags('推送 - token 注册')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushTokenController {
  constructor(private readonly service: PushTokenService) {}

  /* ============================================================================
   * 注册
   * ============================================================================ */

  /**
   * 三端登录后调用：上报 registrationId
   */
  @Post('register')
  @ApiOperation({ summary: '注册推送 token（登录后）' })
  @ApiSwaggerResponse({ status: 200 })
  async register(
    @Body() body: PushRegisterDto,
    @CurrentUser() user: AuthUser
  ): Promise<PushTokenOpResult> {
    if (!user) return { ok: false, message: 'no_auth' }
    return this.service.register({
      userId: user.uid,
      userType: userTypeToNumber(user.userType),
      platform: body.platform,
      registrationId: body.registrationId,
      deviceId: body.deviceId,
      appVersion: body.appVersion
    })
  }

  /* ============================================================================
   * 注销
   * ============================================================================ */

  /**
   * 注销当前用户该设备的 push token（退出登录调用）
   * 不传 deviceId 时：注销该用户所有设备
   */
  @Delete('unregister')
  @ApiOperation({ summary: '注销推送 token（退出登录）' })
  @ApiSwaggerResponse({ status: 200 })
  async unregister(
    @Query('deviceId') deviceId: string | undefined,
    @CurrentUser() user: AuthUser
  ): Promise<PushTokenOpResult> {
    if (!user) return { ok: false, message: 'no_auth' }
    return this.service.unregister(user.uid, userTypeToNumber(user.userType), deviceId)
  }

  /* ============================================================================
   * 心跳
   * ============================================================================ */

  /**
   * 心跳：刷新 last_active_at（避免被 30 天清理）
   */
  @Post('heartbeat')
  @ApiOperation({ summary: '心跳：刷新 last_active_at' })
  @ApiSwaggerResponse({ status: 200 })
  async heartbeat(
    @Body() body: { deviceId?: string } | undefined,
    @CurrentUser() user: AuthUser
  ): Promise<PushTokenOpResult> {
    if (!user) return { ok: false, message: 'no_auth' }
    return this.service.heartbeat(user.uid, userTypeToNumber(user.userType), body?.deviceId)
  }
}
