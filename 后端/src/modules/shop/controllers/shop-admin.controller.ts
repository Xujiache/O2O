/**
 * @file shop-admin.controller.ts
 * @stage P4/T4.1（Sprint 1）
 * @desc 管理端店铺接口：全量分页 + 审核（pass/reject）+ 封禁/解封（写 OperationLog）
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/admin/shops
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 *
 * 操作日志：audit / ban / unban 必须调 OperationLogService.write({...})
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
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
import { AdminListShopQueryDto, AuditShopDto, BanShopDto, ShopVo } from '../dto/shop.dto'
import { ShopService } from '../services/shop.service'

@ApiTags('管理后台 - 店铺')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('shop:manage')
@UserTypes('admin')
@Controller('admin/shops')
export class ShopAdminController {
  constructor(
    private readonly shopService: ShopService,
    private readonly operationLog: OperationLogService
  ) {}

  /**
   * 管理后台 - 店铺全量列表（按审核/营业/账号状态/城市筛选）
   */
  @Get()
  @ApiOperation({ summary: '管理后台 - 店铺列表（分页 + 多条件筛选）' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo, isArray: true })
  list(@Query() query: AdminListShopQueryDto): Promise<PageResult<ShopVo>> {
    return this.shopService.adminList(query)
  }

  /**
   * 管理后台 - 店铺审核（pass / reject + remark）
   */
  @Post(':id/audit')
  @ApiOperation({
    summary: '管理后台 - 店铺审核',
    description: 'pass → audit_status=1；reject → audit_status=2 + remark；写 OperationLog'
  })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  async audit(
    @Param('id') id: string,
    @Body() dto: AuditShopDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<ShopVo> {
    const vo = await this.shopService.audit(id, dto, opAdminId)
    await this.operationLog.write({
      opAdminId,
      module: 'shop',
      action: dto.action === 'pass' ? 'audit.pass' : 'audit.reject',
      resourceType: 'shop',
      resourceId: id,
      description: `店铺审核 ${dto.action}（remark=${dto.remark ?? ''}）`,
      extra: { action: dto.action, remark: dto.remark ?? null }
    })
    return vo
  }

  /**
   * 管理后台 - 店铺封禁（status=0 + reason；business_status 联动 0）
   */
  @Post(':id/ban')
  @ApiOperation({
    summary: '管理后台 - 店铺封禁',
    description: 'status=0 + business_status=0；audit_remark 写入封禁原因；写 OperationLog'
  })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  async ban(
    @Param('id') id: string,
    @Body() dto: BanShopDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<ShopVo> {
    const vo = await this.shopService.ban(id, dto, opAdminId)
    await this.operationLog.write({
      opAdminId,
      module: 'shop',
      action: 'ban',
      resourceType: 'shop',
      resourceId: id,
      description: `店铺封禁：${dto.reason}`,
      extra: { reason: dto.reason }
    })
    return vo
  }

  /**
   * 管理后台 - 店铺解封（status=1；business_status 由商户手动恢复）
   */
  @Post(':id/unban')
  @ApiOperation({
    summary: '管理后台 - 店铺解封',
    description: 'status=1；business_status 由商户手动恢复；写 OperationLog'
  })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  async unban(@Param('id') id: string, @CurrentUser('uid') opAdminId: string): Promise<ShopVo> {
    const vo = await this.shopService.unban(id, opAdminId)
    await this.operationLog.write({
      opAdminId,
      module: 'shop',
      action: 'unban',
      resourceType: 'shop',
      resourceId: id,
      description: '店铺解封'
    })
    return vo
  }
}
