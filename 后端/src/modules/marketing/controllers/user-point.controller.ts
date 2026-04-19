/**
 * @file user-point.controller.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 用户积分 - 用户端 + 管理端接口
 * @author 单 Agent V2.0（Agent C）
 *
 * 路由：
 *   - GET  /me/points                                  （user）余额
 *   - GET  /me/points/flows                            （user）流水分页（按 biz_type / direction 筛）
 *   - POST /admin/users/:userId/points/adjust          （admin）人工调整积分（写流水 + OperationLog）
 *
 * 鉴权：
 *   - /me/* 类级 @UseGuards + @UserTypes('user')
 *   - /admin/* 类级 @UseGuards + @UserTypes('admin')
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { PageResult } from '@/common'
import { CurrentUser, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  AdjustPointDto,
  PointBalanceVo,
  PointFlowQueryDto,
  PointFlowVo
} from '../dto/user-point.dto'
import { UserPointService } from '../services/user-point.service'

@ApiTags('用户端 - 积分')
@ApiBearerAuth()
@Controller('me/points')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
export class UserPointSelfController {
  constructor(private readonly userPointService: UserPointService) {}

  /**
   * 用户端：余额
   */
  @Get()
  @ApiOperation({
    summary: '用户端 - 我的积分余额（带 Redis 缓存，TTL 60s）'
  })
  @ApiSwaggerResponse({ status: 200, type: PointBalanceVo })
  getBalance(@CurrentUser('uid') userId: string): Promise<PointBalanceVo> {
    return this.userPointService.getBalance(userId)
  }

  /**
   * 用户端：流水分页（按 biz_type / direction 筛）
   */
  @Get('flows')
  @ApiOperation({
    summary: '用户端 - 积分流水分页（按 biz_type / direction 筛；按 created_at desc）'
  })
  @ApiSwaggerResponse({ status: 200 })
  listFlows(
    @CurrentUser('uid') userId: string,
    @Query() query: PointFlowQueryDto
  ): Promise<PageResult<PointFlowVo>> {
    return this.userPointService.listFlows(userId, query)
  }
}

@ApiTags('管理后台 - 积分')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('admin')
export class UserPointAdminController {
  constructor(private readonly userPointService: UserPointService) {}

  /**
   * 管理端：人工调整积分（biz_type=7；正负 delta；写 user_point_flow + OperationLog）
   */
  @Post(':userId/points/adjust')
  @ApiOperation({
    summary:
      '管理后台 - 人工调整用户积分（delta 可正可负；写 user_point_flow biz_type=7 + OperationLog）'
  })
  @ApiSwaggerResponse({
    status: 200,
    schema: { type: 'object', properties: { balanceAfter: { type: 'number' } } }
  })
  async adjust(
    @Param('userId') targetUserId: string,
    @Body() dto: AdjustPointDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<{ balanceAfter: number }> {
    const balanceAfter = await this.userPointService.adjustByAdmin(targetUserId, dto, opAdminId)
    return { balanceAfter }
  }
}
