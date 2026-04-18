/**
 * @file admin.controller.ts
 * @stage P3 / T3.12
 * @desc 管理后台总入口：admin CRUD + 用户/商户/骑手 审核与状态 + 黑名单
 *       全部接口要求 admin 端登录 + PermissionGuard 校验 RBAC
 * @author 员工 B
 *
 * 权限码取自 03_rbac.sql：
 *   - user_mgmt.list / user_mgmt.detail / user_mgmt.risk.ban / user_mgmt.risk.unban
 *   - merchant_mgmt.audit.pass / merchant_mgmt.audit.reject / merchant_mgmt.list / merchant_mgmt.list.ban
 *   - rider_mgmt.audit.pass / rider_mgmt.audit.reject / rider_mgmt.list
 *   - cs.risk.blacklist.add / cs.risk.blacklist.remove
 *   - system.role.create / system.role.update（管理员 CRUD 复用）
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
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { PageResult } from '../../../common'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { Permissions } from '../../auth/decorators/permissions.decorator'
import { UserTypes } from '../../auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { PermissionGuard } from '../../auth/guards/permission.guard'
import { UserTypeGuard } from '../../auth/guards/user-type.guard'
import {
  AdminDetailVo,
  AdminListAdminQueryDto,
  CreateAdminDto,
  UpdateAdminDto
} from '../dto/admin.dto'
import { AddBlacklistDto, BlacklistVo, ListBlacklistQueryDto } from '../dto/blacklist.dto'
import {
  AdminListMerchantQueryDto,
  AuditMerchantDto,
  MerchantDetailVo,
  QualificationVo
} from '../dto/merchant.dto'
import { AdminListRiderQueryDto, AuditRiderDto, RiderDetailVo } from '../dto/rider.dto'
import { AdminListUserQueryDto, UserDetailVo } from '../dto/user.dto'
import { AdminService } from '../services/admin.service'
import { BlacklistService } from '../services/blacklist.service'
import { MerchantService } from '../services/merchant.service'
import { QualificationService } from '../services/qualification.service'
import { RiderService } from '../services/rider.service'
import { UserService } from '../services/user.service'

@ApiTags('管理后台 - 用户/商户/骑手/管理员/黑名单')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@UserTypes('admin')
export class AdminController {
  constructor(
    private readonly userService: UserService,
    private readonly merchantService: MerchantService,
    private readonly riderService: RiderService,
    private readonly adminService: AdminService,
    private readonly blacklistService: BlacklistService,
    private readonly qualificationService: QualificationService
  ) {}

  /* ========== 用户管理 ========== */

  @Get('users')
  @Permissions('user_mgmt.list')
  @ApiOperation({ summary: '管理后台 - 用户列表（分页）' })
  @ApiSwaggerResponse({ status: 200 })
  listUsers(@Query() query: AdminListUserQueryDto): Promise<PageResult<UserDetailVo>> {
    return this.userService.adminList(query)
  }

  @Get('users/:id')
  @Permissions('user_mgmt.detail')
  @ApiOperation({ summary: '管理后台 - 用户详情（脱敏）' })
  @ApiSwaggerResponse({ status: 200, type: UserDetailVo })
  detailUser(@Param('id') id: string): Promise<UserDetailVo> {
    return this.userService.adminDetail(id)
  }

  @Put('users/:id/status/:status')
  @Permissions('user_mgmt.risk.ban')
  @ApiOperation({ summary: '管理后台 - 修改用户状态（封禁/解封/注销）' })
  @ApiSwaggerResponse({ status: 200, type: UserDetailVo })
  updateUserStatus(
    @Param('id') id: string,
    @Param('status', ParseIntPipe) status: number
  ): Promise<UserDetailVo> {
    return this.userService.adminUpdateStatus(id, status)
  }

  /* ========== 商户管理 ========== */

  @Get('merchants')
  @Permissions('merchant_mgmt.list')
  @ApiOperation({ summary: '管理后台 - 商户列表' })
  listMerchants(@Query() query: AdminListMerchantQueryDto): Promise<PageResult<MerchantDetailVo>> {
    return this.merchantService.adminList(query)
  }

  @Post('merchants/:id/audit')
  @Permissions('merchant_mgmt.audit.pass')
  @ApiOperation({ summary: '管理后台 - 商户入驻审核（通过/驳回/待补件）' })
  @ApiSwaggerResponse({ status: 200, type: MerchantDetailVo })
  auditMerchant(
    @Param('id') id: string,
    @Body() dto: AuditMerchantDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<MerchantDetailVo> {
    return this.merchantService.audit(id, dto, opAdminId)
  }

  @Put('merchants/:id/status/:status')
  @Permissions('merchant_mgmt.list.ban')
  @ApiOperation({ summary: '管理后台 - 修改商户状态（封禁/解封/暂停）' })
  @ApiSwaggerResponse({ status: 200, type: MerchantDetailVo })
  updateMerchantStatus(
    @Param('id') id: string,
    @Param('status', ParseIntPipe) status: number,
    @CurrentUser('uid') opAdminId: string
  ): Promise<MerchantDetailVo> {
    return this.merchantService.adminUpdateStatus(id, status, opAdminId)
  }

  @Post('merchants/qualifications/:qualId/audit')
  @Permissions('merchant_mgmt.audit.pass')
  @ApiOperation({ summary: '管理后台 - 商户单条资质审核' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo })
  auditMerchantQual(
    @Param('qualId') qualId: string,
    @Body() dto: AuditMerchantDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<QualificationVo> {
    return this.qualificationService.merchantAudit(qualId, dto, opAdminId)
  }

  /* ========== 骑手管理 ========== */

  @Get('riders')
  @Permissions('rider_mgmt.list')
  @ApiOperation({ summary: '管理后台 - 骑手列表' })
  listRiders(@Query() query: AdminListRiderQueryDto): Promise<PageResult<RiderDetailVo>> {
    return this.riderService.adminList(query)
  }

  @Post('riders/:id/audit')
  @Permissions('rider_mgmt.audit.pass')
  @ApiOperation({ summary: '管理后台 - 骑手入驻审核' })
  @ApiSwaggerResponse({ status: 200, type: RiderDetailVo })
  auditRider(
    @Param('id') id: string,
    @Body() dto: AuditRiderDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<RiderDetailVo> {
    return this.riderService.audit(id, dto, opAdminId)
  }

  @Put('riders/:id/status/:status')
  @Permissions('rider_mgmt.list')
  @ApiOperation({ summary: '管理后台 - 修改骑手状态（封禁/解封/离职）' })
  @ApiSwaggerResponse({ status: 200, type: RiderDetailVo })
  updateRiderStatus(
    @Param('id') id: string,
    @Param('status', ParseIntPipe) status: number,
    @CurrentUser('uid') opAdminId: string
  ): Promise<RiderDetailVo> {
    return this.riderService.adminUpdateStatus(id, status, opAdminId)
  }

  @Post('riders/qualifications/:qualId/audit')
  @Permissions('rider_mgmt.audit.pass')
  @ApiOperation({ summary: '管理后台 - 骑手单条资质审核' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo })
  auditRiderQual(
    @Param('qualId') qualId: string,
    @Body() dto: AuditMerchantDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<QualificationVo> {
    return this.qualificationService.riderAudit(qualId, dto, opAdminId)
  }

  /* ========== 管理员 CRUD ========== */

  @Get('admins')
  @Permissions('system.role.update')
  @ApiOperation({ summary: '管理后台 - 管理员列表' })
  listAdmins(@Query() query: AdminListAdminQueryDto): Promise<PageResult<AdminDetailVo>> {
    return this.adminService.list(query)
  }

  @Get('admins/:id')
  @Permissions('system.role.update')
  @ApiOperation({ summary: '管理后台 - 管理员详情' })
  @ApiSwaggerResponse({ status: 200, type: AdminDetailVo })
  detailAdmin(@Param('id') id: string): Promise<AdminDetailVo> {
    return this.adminService.detail(id)
  }

  @Post('admins')
  @Permissions('system.role.create')
  @ApiOperation({ summary: '管理后台 - 创建管理员（含初始密码 + 角色绑定）' })
  @ApiSwaggerResponse({ status: 200, type: AdminDetailVo })
  createAdmin(
    @Body() dto: CreateAdminDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<AdminDetailVo> {
    return this.adminService.create(dto, opAdminId)
  }

  @Put('admins/:id')
  @Permissions('system.role.update')
  @ApiOperation({ summary: '管理后台 - 更新管理员（含重置密码 / 改角色 / 改状态）' })
  @ApiSwaggerResponse({ status: 200, type: AdminDetailVo })
  updateAdmin(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<AdminDetailVo> {
    return this.adminService.update(id, dto, opAdminId)
  }

  @Delete('admins/:id')
  @Permissions('system.role.update')
  @ApiOperation({ summary: '管理后台 - 软删管理员（不可删超管）' })
  @ApiSwaggerResponse({ status: 200 })
  removeAdmin(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string
  ): Promise<{ ok: true }> {
    return this.adminService.remove(id, opAdminId)
  }

  @Post('admins/:id/refresh-permissions')
  @Permissions('system.role.update')
  @ApiOperation({ summary: '管理后台 - 主动刷新某管理员的权限缓存（DEL Redis）' })
  refreshPermCache(@Param('id') id: string): Promise<{ ok: true }> {
    return this.adminService.refreshAdminPermissionCache(id).then(() => ({ ok: true as const }))
  }

  @Post('admins/refresh-all-permissions')
  @Permissions('system.role.update')
  @ApiOperation({ summary: '管理后台 - 全量清空 auth:permissions:* 权限缓存' })
  refreshAllPermCache(): Promise<{ ok: true }> {
    return this.adminService.flushAllPermissionCache().then(() => ({ ok: true as const }))
  }

  /* ========== 黑名单 ========== */

  @Post('blacklist')
  @Permissions('cs.risk.blacklist.add')
  @ApiOperation({ summary: '管理后台 - 加入黑名单（联动主账号 status=0）' })
  @ApiSwaggerResponse({ status: 200, type: BlacklistVo })
  addBlacklist(
    @Body() dto: AddBlacklistDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<BlacklistVo> {
    return this.blacklistService.add(dto, opAdminId)
  }

  @Delete('blacklist/:id')
  @Permissions('cs.risk.blacklist.remove')
  @ApiOperation({ summary: '管理后台 - 解除黑名单（联动恢复 status=1）' })
  @ApiSwaggerResponse({ status: 200, type: BlacklistVo })
  removeBlacklist(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string
  ): Promise<BlacklistVo> {
    return this.blacklistService.remove(id, opAdminId)
  }

  @Get('blacklist')
  @Permissions('cs.risk.blacklist.add')
  @ApiOperation({ summary: '管理后台 - 黑名单列表' })
  @ApiSwaggerResponse({ status: 200 })
  listBlacklist(@Query() query: ListBlacklistQueryDto): Promise<PageResult<BlacklistVo>> {
    return this.blacklistService.list(query)
  }
}
