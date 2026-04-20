/**
 * @file promotion-admin.controller.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc 管理端营销活动接口：全量 CRUD + 强制停用（写 OperationLog）
 * @author 单 Agent V2.0
 *
 * 路径前缀：/admin/promotions
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 *
 * OperationLog：force-stop / delete 必写
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator'
import { Permissions } from '@/modules/auth/decorators/permissions.decorator'
import { UserTypes } from '@/modules/auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { PermissionGuard } from '@/modules/auth/guards/permission.guard'
import { UserTypeGuard } from '@/modules/auth/guards/user-type.guard'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import {
  CreatePromotionDto,
  ForceStopPromotionDto,
  PromotionVo,
  QueryPromotionDto,
  UpdatePromotionDto,
  UpdatePromotionStatusDto
} from '../dto/promotion.dto'
import { PromotionService } from '../services/promotion.service'

@ApiTags('营销 - 管理端活动')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('marketing:promotion')
@UserTypes('admin')
@Controller('admin/promotions')
export class PromotionAdminController {
  constructor(
    private readonly promotionService: PromotionService,
    private readonly operationLog: OperationLogService
  ) {}

  /**
   * 管理端 - 创建平台活动（issuerType=1，issuerId=null）
   */
  @Post()
  @ApiOperation({
    summary: '管理端 - 创建平台活动',
    description: 'issuerType=1（平台）；rule_json 走 PromotionRuleValidator 强校验'
  })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  async create(
    @Body() dto: CreatePromotionDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<PromotionVo> {
    const vo = await this.promotionService.create(dto, 1, null)
    await this.operationLog.write({
      opAdminId,
      module: 'marketing',
      action: 'promotion.create',
      resourceType: 'promotion',
      resourceId: vo.id,
      description: `管理端创建活动 ${vo.name}（type=${vo.promoType}）`,
      extra: { promoType: vo.promoType, scene: vo.scene }
    })
    return vo
  }

  /**
   * 管理端 - 全量活动列表（按 issuerType / promoType / status / scene 筛选 + 分页）
   */
  @Get()
  @ApiOperation({ summary: '管理端 - 全量活动列表（多条件 + 分页）' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo, isArray: true })
  list(@Query() query: QueryPromotionDto): Promise<PageResult<PromotionVo>> {
    return this.promotionService.listForAdmin(query)
  }

  /**
   * 管理端 - 活动详情（管理视角不做 issuerId 校验）
   */
  @Get(':id')
  @ApiOperation({ summary: '活动详情' })
  @ApiParam({ name: 'id', description: '活动主键' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  detail(@Param('id') id: string): Promise<PromotionVo> {
    return this.promotionService.detail(id, { issuerType: 1, issuerId: null })
  }

  /**
   * 管理端 - 编辑活动（管理视角可改任意活动；used_qty>0 仍受限）
   */
  @Put(':id')
  @ApiOperation({ summary: '管理端 - 编辑活动（used_qty>0 仍受限）' })
  @ApiParam({ name: 'id', description: '活动主键' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<PromotionVo> {
    const vo = await this.promotionService.update(id, dto, {
      issuerType: 1,
      issuerId: null
    })
    await this.operationLog.write({
      opAdminId,
      module: 'marketing',
      action: 'promotion.update',
      resourceType: 'promotion',
      resourceId: id,
      description: `管理端编辑活动 ${id}`
    })
    return vo
  }

  /**
   * 管理端 - 状态流转
   */
  @Put(':id/status')
  @ApiOperation({ summary: '管理端 - 状态流转（按状态机矩阵）' })
  @ApiParam({ name: 'id', description: '活动主键' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionStatusDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<PromotionVo> {
    const vo = await this.promotionService.updateStatus(id, dto, {
      issuerType: 1,
      issuerId: null
    })
    await this.operationLog.write({
      opAdminId,
      module: 'marketing',
      action: 'promotion.status',
      resourceType: 'promotion',
      resourceId: id,
      description: `管理端活动状态流转 → ${dto.status}`,
      extra: { targetStatus: dto.status }
    })
    return vo
  }

  /**
   * 管理端 - 强制停用（不论当前 status，直接置 2 暂停）
   *   - 写 OperationLog（reason 必填）
   */
  @Put(':id/force-stop')
  @ApiOperation({
    summary: '管理端 - 强制停用',
    description: '直接置 status=2 暂停；写 OperationLog 含 reason'
  })
  @ApiParam({ name: 'id', description: '活动主键' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  async forceStop(
    @Param('id') id: string,
    @Body() dto: ForceStopPromotionDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<PromotionVo> {
    const vo = await this.promotionService.forceStop(id)
    await this.operationLog.write({
      opAdminId,
      module: 'marketing',
      action: 'promotion.force_stop',
      resourceType: 'promotion',
      resourceId: id,
      description: `管理端强制停用活动：${dto.reason}`,
      extra: { reason: dto.reason }
    })
    return vo
  }

  /**
   * 管理端 - 软删（used_qty>0 拒绝；写 OperationLog）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端 - 软删活动（used_qty>0 拒绝）' })
  @ApiParam({ name: 'id', description: '活动主键' })
  async softDelete(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string
  ): Promise<{ ok: true }> {
    await this.promotionService.softDelete(id, { issuerType: 1, issuerId: null })
    await this.operationLog.write({
      opAdminId,
      module: 'marketing',
      action: 'promotion.delete',
      resourceType: 'promotion',
      resourceId: id,
      description: `管理端软删活动 ${id}`
    })
    return { ok: true }
  }
}
