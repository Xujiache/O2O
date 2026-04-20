/**
 * @file admin-dispatch.controller.ts
 * @stage P4/T4.36~T4.43（Sprint 6）
 * @desc 管理端：派单记录全量 / 强制指派 / 转单审核 / 运力看板
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 路径前缀：/api/v1/admin
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 *
 * 接口清单：
 *   GET  /admin/dispatch/dashboard               运力看板
 *   GET  /admin/dispatches                       派单记录全量
 *   POST /admin/dispatch/:orderNo/manual         强制指派骑手
 *   POST /admin/transfer/:id/audit               审核转单
 *   GET  /admin/transfers                        转单工作台
 *
 * 操作日志：manual / audit 必写 OperationLog
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'
import { type PageResult } from '@/common'
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator'
import { Permissions } from '@/modules/auth/decorators/permissions.decorator'
import { UserTypes } from '@/modules/auth/decorators/user-types.decorator'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { DashboardQueryDto, DashboardVo } from '../dto/dashboard.dto'
import { DispatchListQueryDto, DispatchRecordVo, ManualDispatchDto } from '../dto/dispatch.dto'
import { AuditTransferDto, TransferListQueryDto, TransferVo } from '../dto/transfer.dto'
import { DashboardService } from '../services/dashboard.service'
import { DispatchService } from '../services/dispatch.service'
import { TransferService } from '../services/transfer.service'
import {
  OrderTypeForDispatch,
  type OrderTypeForDispatch as OrderTypeForDispatchValue
} from '../types/dispatch.types'

/* ============================================================================
 * 内部 DTO：强制指派必须传 orderType（路径只有 orderNo）
 * ============================================================================ */

/**
 * 强制指派 + orderType 复合 Body
 */
export class ManualDispatchBodyDto extends ManualDispatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  orderType!: number
}

/* ============================================================================
 * Controller
 * ============================================================================ */

@ApiTags('管理后台 - 派单 & 转单')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('dispatch:manage')
@UserTypes('admin')
@Controller('admin')
export class AdminDispatchController {
  constructor(
    private readonly dispatchService: DispatchService,
    private readonly transferService: TransferService,
    private readonly dashboardService: DashboardService,
    private readonly operationLog: OperationLogService
  ) {}

  /* ============================================================================
   * GET /admin/dispatch/dashboard
   * ============================================================================ */

  /**
   * 运力看板
   */
  @Get('dispatch/dashboard')
  @ApiOperation({ summary: '运力看板（按 cityCode 聚合；不传 cityCode 则全平台）' })
  @ApiSwaggerResponse({ status: 200, type: DashboardVo })
  async dashboard(@Query() query: DashboardQueryDto): Promise<DashboardVo> {
    return this.dashboardService.getDashboard(query.cityCode)
  }

  /* ============================================================================
   * GET /admin/dispatches 派单记录列表
   * ============================================================================ */

  /**
   * 派单记录全量列表
   */
  @Get('dispatches')
  @ApiOperation({ summary: '派单记录全量列表（多条件筛选 + 分页）' })
  @ApiSwaggerResponse({ status: 200, type: DispatchRecordVo, isArray: true })
  async listDispatches(
    @Query() query: DispatchListQueryDto
  ): Promise<PageResult<DispatchRecordVo>> {
    return this.dispatchService.listDispatches(query)
  }

  /* ============================================================================
   * POST /admin/dispatch/:orderNo/manual 强制指派
   * ============================================================================ */

  /**
   * 强制指派
   */
  @Post('dispatch/:orderNo/manual')
  @ApiOperation({
    summary: '强制指派骑手',
    description:
      '订单状态必须为 10 待接单；写 OperationLog；触发主表 status→20 + dispatch_record(mode=3)'
  })
  @ApiParam({ name: 'orderNo', description: '订单号 18 位' })
  @ApiBody({ type: ManualDispatchBodyDto })
  @ApiSwaggerResponse({ status: 200, type: DispatchRecordVo })
  async manualDispatch(
    @Param('orderNo') orderNo: string,
    @Body() body: ManualDispatchBodyDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<DispatchRecordVo> {
    const orderType = this.assertOrderType(body.orderType)
    const vo = await this.dispatchService.manualDispatch(
      orderNo,
      orderType,
      body.riderId,
      opAdminId
    )
    await this.operationLog.write({
      opAdminId,
      module: 'dispatch',
      action: 'manual',
      resourceType: 'order',
      resourceId: orderNo,
      description: `强制指派骑手 ${body.riderId}（reason=${body.reason ?? ''}）`,
      extra: { riderId: body.riderId, reason: body.reason ?? null, orderType }
    })
    return vo
  }

  /* ============================================================================
   * POST /admin/transfer/:id/audit 审核转单
   * ============================================================================ */

  /**
   * 审核转单
   */
  @Post('transfer/:id/audit')
  @ApiOperation({
    summary: '审核转单',
    description:
      'pass → 释放原骑手（订单 status 回 10）+ 触发新派单（指定 toRiderId 走 manualDispatch）；reject → 仅写 audit 字段'
  })
  @ApiParam({ name: 'id', description: '转单记录主键' })
  @ApiBody({ type: AuditTransferDto })
  @ApiSwaggerResponse({ status: 200, type: TransferVo })
  async auditTransfer(
    @Param('id') id: string,
    @Body() dto: AuditTransferDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<TransferVo> {
    const vo = await this.transferService.auditTransfer(id, dto, opAdminId)
    await this.operationLog.write({
      opAdminId,
      module: 'dispatch',
      action: dto.action === 'pass' ? 'transfer.pass' : 'transfer.reject',
      resourceType: 'transfer_record',
      resourceId: id,
      description: `审核转单 ${dto.action}（remark=${dto.remark ?? ''}, toRider=${dto.toRiderId ?? ''}）`,
      extra: {
        action: dto.action,
        remark: dto.remark ?? null,
        toRiderId: dto.toRiderId ?? null
      }
    })
    return vo
  }

  /* ============================================================================
   * GET /admin/transfers 转单工作台
   * ============================================================================ */

  /**
   * 转单工作台
   */
  @Get('transfers')
  @ApiOperation({ summary: '转单工作台（多条件筛选 + 分页）' })
  @ApiSwaggerResponse({ status: 200, type: TransferVo, isArray: true })
  async listTransfers(@Query() query: TransferListQueryDto): Promise<PageResult<TransferVo>> {
    return this.transferService.listTransfers(query)
  }

  /* ============================================================================
   * Helper
   * ============================================================================ */

  private assertOrderType(value: number): OrderTypeForDispatchValue {
    if (value === OrderTypeForDispatch.TAKEOUT) return OrderTypeForDispatch.TAKEOUT
    if (value === OrderTypeForDispatch.ERRAND) return OrderTypeForDispatch.ERRAND
    return OrderTypeForDispatch.TAKEOUT
  }
}
