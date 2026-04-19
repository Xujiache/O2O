/**
 * @file rider-dispatch.controller.ts
 * @stage P4/T4.36~T4.43（Sprint 6）
 * @desc 骑手端：抢单池 / 抢单 / 接受派单 / 拒绝派单 / 偏好管理
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 路径前缀：/api/v1/rider
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('rider')
 *
 * 接口清单：
 *   GET  /rider/dispatch/list                  抢单池（按 cityCode + serviceType）
 *   POST /rider/dispatch/:orderNo/grab         抢单（Lua 原子）
 *   POST /rider/dispatch/:orderNo/accept       接受系统派单
 *   POST /rider/dispatch/:orderNo/reject       拒绝系统派单
 *   GET  /rider/preference                     我的偏好
 *   PUT  /rider/preference                     更新偏好
 */

import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator'
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator'
import { UserTypes } from '@/modules/auth/decorators/user-types.decorator'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import { DispatchRecordVo, GrabResultDto, RejectDispatchDto } from '../dto/dispatch.dto'
import { GetPreferenceVo, UpdatePreferenceDto } from '../dto/preference.dto'
import {
  OrderTypeForDispatch,
  type OrderTypeForDispatch as OrderTypeForDispatchValue
} from '../types/dispatch.types'
import { DispatchService } from '../services/dispatch.service'
import { GrabService } from '../services/grab.service'
import { PreferenceService } from '../services/preference.service'

/* ============================================================================
 * 内部 DTO：抢单 / 抢单池查询
 * ============================================================================ */

/**
 * 抢单池查询入参
 */
export class GrabPoolQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'cityCode 必填' })
  cityCode!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  orderType?: number
}

/**
 * 抢单 / 接受派单 / 拒绝派单 共用 Body：必须传 orderType（用于跨分表定位）
 */
export class GrabBodyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  orderType!: number
}

/**
 * 拒绝派单 + orderType 复合 Body
 */
export class RejectBodyDto extends RejectDispatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  orderType!: number
}

/**
 * 抢单池条目（精简返回）
 */
export class GrabPoolItemVo {
  orderNo!: string
}

/* ============================================================================
 * Controller
 * ============================================================================ */

@ApiTags('骑手端 - 派单 & 抢单')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('rider')
@Controller('rider')
export class RiderDispatchController {
  constructor(
    private readonly grabService: GrabService,
    private readonly dispatchService: DispatchService,
    private readonly preferenceService: PreferenceService
  ) {}

  /* ============================================================================
   * GET /rider/dispatch/list 抢单池
   * ============================================================================ */

  /**
   * 抢单池：按 cityCode 列出当前可抢的订单号
   */
  @Get('dispatch/list')
  @ApiOperation({
    summary: '抢单池列表',
    description: '按 cityCode 拉取当前可抢订单号集合（来自 Redis Set dispatch:grabpool:{cityCode}）'
  })
  @ApiQuery({ name: 'cityCode', description: '城市编码', required: true, example: '110100' })
  @ApiQuery({
    name: 'orderType',
    description: '订单类型 1 外卖 / 2 跑腿（可选过滤）',
    required: false
  })
  @ApiSwaggerResponse({ status: 200, type: GrabPoolItemVo, isArray: true })
  async listGrabPool(@Query() query: GrabPoolQueryDto): Promise<GrabPoolItemVo[]> {
    const orderNos = await this.grabService.listGrabPool(query.cityCode)
    return orderNos.map((orderNo) => ({ orderNo }))
  }

  /* ============================================================================
   * POST /rider/dispatch/:orderNo/grab 抢单
   * ============================================================================ */

  /**
   * 抢单（Lua 原子）
   */
  @Post('dispatch/:orderNo/grab')
  @ApiOperation({
    summary: '抢单（Redis Lua 原子，不会一单两抢）',
    description: 'orderType 在 body 中传入，用于跨分表定位订单'
  })
  @ApiParam({ name: 'orderNo', description: '订单号 18 位' })
  @ApiBody({ type: GrabBodyDto })
  @ApiSwaggerResponse({ status: 200, type: GrabResultDto })
  async grab(
    @Param('orderNo') orderNo: string,
    @Body() body: GrabBodyDto,
    @CurrentUser('uid') riderId: string
  ): Promise<GrabResultDto> {
    const orderType = this.assertOrderType(body.orderType)
    const result = await this.grabService.grab(orderNo, orderType, riderId)
    return {
      success: result.success,
      orderNo,
      riderId,
      dispatchRecordId: result.dispatchRecordId,
      grabbedAt: result.grabbedAt,
      reason: result.reason
    }
  }

  /* ============================================================================
   * POST /rider/dispatch/:orderNo/accept 接受系统派单
   * ============================================================================ */

  /**
   * 接受系统派单
   */
  @Post('dispatch/:orderNo/accept')
  @ApiOperation({
    summary: '接受系统派单',
    description: '必须存在 status=0 且 rider_id=current 的派单记录；超时 / 已应答抛业务异常'
  })
  @ApiParam({ name: 'orderNo', description: '订单号 18 位' })
  @ApiBody({ type: GrabBodyDto })
  @ApiSwaggerResponse({ status: 200, type: DispatchRecordVo })
  async accept(
    @Param('orderNo') orderNo: string,
    @Body() body: GrabBodyDto,
    @CurrentUser('uid') riderId: string
  ): Promise<DispatchRecordVo> {
    const orderType = this.assertOrderType(body.orderType)
    return this.dispatchService.acceptDispatch(orderNo, orderType, riderId)
  }

  /* ============================================================================
   * POST /rider/dispatch/:orderNo/reject 拒绝系统派单
   * ============================================================================ */

  /**
   * 拒绝系统派单
   */
  @Post('dispatch/:orderNo/reject')
  @ApiOperation({
    summary: '拒绝系统派单（reason 必填，立即触发 re-dispatch）'
  })
  @ApiParam({ name: 'orderNo', description: '订单号 18 位' })
  @ApiBody({ type: RejectBodyDto })
  @ApiSwaggerResponse({ status: 200, type: DispatchRecordVo })
  async reject(
    @Param('orderNo') orderNo: string,
    @Body() body: RejectBodyDto,
    @CurrentUser('uid') riderId: string
  ): Promise<DispatchRecordVo> {
    const orderType = this.assertOrderType(body.orderType)
    return this.dispatchService.rejectDispatch(orderNo, orderType, riderId, body.reason)
  }

  /* ============================================================================
   * GET /rider/preference
   * ============================================================================ */

  /**
   * 我的偏好
   */
  @Get('preference')
  @ApiOperation({ summary: '我的接单偏好（首次访问返回默认 + 自动落库）' })
  @ApiSwaggerResponse({ status: 200, type: GetPreferenceVo })
  async getPreference(@CurrentUser('uid') riderId: string): Promise<GetPreferenceVo> {
    return this.preferenceService.getOrCreate(riderId)
  }

  /* ============================================================================
   * PUT /rider/preference
   * ============================================================================ */

  /**
   * 更新偏好
   */
  @Put('preference')
  @ApiOperation({ summary: '更新接单偏好（部分字段）' })
  @ApiBody({ type: UpdatePreferenceDto })
  @ApiSwaggerResponse({ status: 200, type: GetPreferenceVo })
  async updatePreference(
    @CurrentUser('uid') riderId: string,
    @Body() dto: UpdatePreferenceDto
  ): Promise<GetPreferenceVo> {
    return this.preferenceService.update(riderId, dto)
  }

  /* ============================================================================
   * Helper
   * ============================================================================ */

  /**
   * 校验并强类型化 orderType
   */
  private assertOrderType(value: number): OrderTypeForDispatchValue {
    if (value === OrderTypeForDispatch.TAKEOUT) return OrderTypeForDispatch.TAKEOUT
    if (value === OrderTypeForDispatch.ERRAND) return OrderTypeForDispatch.ERRAND
    return OrderTypeForDispatch.TAKEOUT
  }
}
