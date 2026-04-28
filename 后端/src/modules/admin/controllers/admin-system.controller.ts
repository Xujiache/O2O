import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { makePageResult, type PageResult, type PageQueryDto } from '@/common'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { SysConfigService } from '@/modules/system/sys-config.service'
import { AdminService } from '@/modules/user/services/admin.service'
import {
  Admin,
  AdminRole,
  OperationLog,
  Permission as PermissionEntity,
  Role,
  RolePermission
} from '@/entities'
import { SnowflakeId } from '@/utils'

class ListQueryDto {
  page?: number
  pageSize?: number
  keyword?: string
  type?: string
}

@ApiTags('管理后台 - 系统管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('system:manage')
@UserTypes('admin')
@Controller('admin/system')
export class AdminSystemController {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(AdminRole)
    private readonly adminRoleRepo: Repository<AdminRole>,
    @InjectRepository(OperationLog)
    private readonly operationLogRepo: Repository<OperationLog>,
    private readonly adminService: AdminService,
    private readonly sysConfigService: SysConfigService
  ) {}

  @Get('admin/list')
  @ApiOperation({ summary: '管理员列表' })
  async adminList(@Query() query: ListQueryDto) {
    const resp = await this.adminService.list(query as unknown as PageQueryDto)
    return this.toBizPage(resp, (item) => ({
      id: item.id,
      username: item.username,
      realName: item.nickname ?? item.username,
      email: item.email,
      mobile: item.mobileTail4 ? `****${item.mobileTail4}` : '',
      enabled: item.status === 1,
      roles: item.roleIds,
      createdAt: item.createdAt,
      lastLoginAt: item.lastLoginAt
    }))
  }

  @Post('admin')
  @ApiOperation({ summary: '创建管理员' })
  async adminSave(
    @CurrentUser('uid') opAdminId: string,
    @Body()
    dto: {
      username?: string
      realName?: string
      email?: string
      mobile?: string
      password?: string
      roleIds?: string[]
    }
  ) {
    const created = await this.adminService.create(
      {
        username: dto.username ?? '',
        nickname: dto.realName ?? dto.username ?? '',
        email: dto.email,
        mobile: dto.mobile,
        password: dto.password ?? '123456',
        roleIds: dto.roleIds ?? []
      },
      opAdminId
    )
    return { id: created.id }
  }

  @Put('admin/:id')
  @ApiOperation({ summary: '更新管理员' })
  async adminUpdate(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body()
    dto: {
      realName?: string
      email?: string
      mobile?: string
      enabled?: boolean
      roleIds?: string[]
    }
  ) {
    await this.adminService.update(
      id,
      {
        nickname: dto.realName,
        email: dto.email,
        mobile: dto.mobile,
        status: dto.enabled === undefined ? undefined : dto.enabled ? 1 : 0,
        roleIds: dto.roleIds
      },
      opAdminId
    )
    return { ok: true }
  }

  @Get('role/list')
  @ApiOperation({ summary: '角色列表' })
  async roleList(@Query() query: ListQueryDto) {
    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 20
    const qb = this.roleRepo.createQueryBuilder('r').where('r.is_deleted = 0')
    if (query.keyword) {
      qb.andWhere('(r.role_code LIKE :k OR r.role_name LIKE :k)', { k: `%${query.keyword}%` })
    }
    qb.orderBy('r.sort', 'ASC')
      .addOrderBy('r.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    const [rows, total] = await qb.getManyAndCount()
    return this.toBizPage(makePageResult(rows, total, page, pageSize), (item) => ({
      code: item.roleCode,
      name: item.roleName,
      description: item.description,
      enabled: item.status === 1
    }))
  }

  @Post('role')
  @ApiOperation({ summary: '创建角色' })
  async roleSave(@Body() dto: { code?: string; name?: string; description?: string }) {
    const entity = this.roleRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      roleCode: dto.code ?? '',
      roleName: dto.name ?? '',
      description: dto.description ?? null,
      dataScope: 1,
      sort: 0,
      status: 1,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.roleRepo.save(entity)
    return { code: entity.roleCode }
  }

  @Put('role/:code')
  @ApiOperation({ summary: '更新角色' })
  async roleUpdate(
    @Param('code') code: string,
    @Body() dto: { name?: string; description?: string; enabled?: boolean }
  ) {
    const role = await this.roleRepo.findOne({ where: { roleCode: code, isDeleted: 0 } })
    if (!role) return { ok: false }
    if (dto.name !== undefined) role.roleName = dto.name
    if (dto.description !== undefined) role.description = dto.description
    if (dto.enabled !== undefined) role.status = dto.enabled ? 1 : 0
    await this.roleRepo.save(role)
    return { ok: true }
  }

  @Get('permission/list')
  @ApiOperation({ summary: '权限列表' })
  async permissionList(@Query() query: ListQueryDto) {
    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 20
    const qb = this.permissionRepo.createQueryBuilder('p').where('p.is_deleted = 0')
    if (query.keyword) {
      qb.andWhere('(p.resource_code LIKE :k OR p.resource_name LIKE :k)', {
        k: `%${query.keyword}%`
      })
    }
    if (query.type) {
      const typeMap: Record<string, number> = { menu: 1, button: 2, api: 3 }
      if (typeMap[query.type]) qb.andWhere('p.resource_type = :t', { t: typeMap[query.type] })
    }
    qb.orderBy('p.sort', 'ASC')
      .addOrderBy('p.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    const [rows, total] = await qb.getManyAndCount()
    return this.toBizPage(makePageResult(rows, total, page, pageSize), (item) => ({
      code: item.resourceCode,
      name: item.resourceName,
      type: item.resourceType === 1 ? 'menu' : item.resourceType === 2 ? 'button' : 'api',
      parentCode: item.parentId && item.parentId !== '0' ? item.parentId : undefined
    }))
  }

  @Post('permission')
  @ApiOperation({ summary: '创建权限' })
  async permissionSave(
    @Body() dto: { code?: string; name?: string; type?: string; parentCode?: string }
  ) {
    const typeMap: Record<string, number> = { menu: 1, button: 2, api: 3 }
    const entity = this.permissionRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      parentId: dto.parentCode ?? '0',
      resourceType: typeMap[dto.type ?? 'menu'] ?? 1,
      resourceCode: dto.code ?? '',
      resourceName: dto.name ?? '',
      action: null,
      icon: null,
      sort: 0,
      status: 1,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.permissionRepo.save(entity)
    return { code: entity.resourceCode }
  }

  @Put('permission/:code')
  @ApiOperation({ summary: '更新权限' })
  async permissionUpdate(
    @Param('code') code: string,
    @Body() dto: { name?: string; parentCode?: string; type?: string }
  ) {
    const entity = await this.permissionRepo.findOne({
      where: { resourceCode: code, isDeleted: 0 }
    })
    if (!entity) return { ok: false }
    const typeMap: Record<string, number> = { menu: 1, button: 2, api: 3 }
    if (dto.name !== undefined) entity.resourceName = dto.name
    if (dto.parentCode !== undefined) entity.parentId = dto.parentCode || '0'
    if (dto.type !== undefined) entity.resourceType = typeMap[dto.type] ?? entity.resourceType
    await this.permissionRepo.save(entity)
    return { ok: true }
  }

  @Get('dict/all')
  @ApiOperation({ summary: '字典全量' })
  async dictAll() {
    return this.dictList()
  }

  @Get('dict/list')
  @ApiOperation({ summary: '字典列表' })
  async dictList() {
    return []
  }

  @Post('dict')
  @ApiOperation({ summary: '保存字典' })
  async dictSave(@Body() dto: unknown) {
    return { id: SnowflakeId.next(), dto }
  }

  @Put('dict/:type')
  @ApiOperation({ summary: '更新字典' })
  async dictUpdate(@Param('type') type: string, @Body() dto: unknown) {
    return { ok: true, type, dto }
  }

  @Delete('dict/:type')
  @ApiOperation({ summary: '删除字典' })
  async dictDelete(@Param('type') type: string) {
    return { ok: true, type }
  }

  @Get('permissions')
  @ApiOperation({ summary: '权限菜单快照' })
  async permissions() {
    const roles = await this.roleRepo.find({ where: { isDeleted: 0 }, order: { sort: 'ASC' } })
    const permissions = await this.permissionRepo.find({
      where: { isDeleted: 0, status: 1 },
      order: { sort: 'ASC' }
    })
    return {
      menus: permissions
        .filter((item) => item.resourceType === 1)
        .map((item) => ({
          code: item.resourceCode,
          path: item.resourceCode,
          name: item.resourceName,
          title: item.resourceName,
          parentCode: item.parentId && item.parentId !== '0' ? item.parentId : undefined
        })),
      permissions: permissions.map((item) => item.resourceCode),
      roles: roles.map((item) => item.roleCode)
    }
  }

  @Get('operation-log/list')
  @ApiOperation({ summary: '操作日志列表' })
  async operationLogList(@Query() query: ListQueryDto) {
    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 20
    const qb = this.operationLogRepo.createQueryBuilder('l').where('l.is_deleted = 0')
    if (query.keyword) {
      qb.andWhere('(l.op_admin_name LIKE :k OR l.description LIKE :k OR l.resource_id LIKE :k)', {
        k: `%${query.keyword}%`
      })
    }
    qb.orderBy('l.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    const [rows, total] = await qb.getManyAndCount()
    return this.toBizPage(makePageResult(rows, total, page, pageSize), (item) => ({
      id: item.id,
      traceId: null,
      adminUsername: item.opAdminName ?? '',
      module: item.module,
      action: item.action,
      target:
        item.resourceType && item.resourceId
          ? `${item.resourceType}#${item.resourceId}`
          : item.resourceId,
      ip: '',
      status: item.isSuccess === 1 ? 200 : 500,
      errorMsg: item.errorMsg,
      createdAt: item.createdAt
    }))
  }

  @Get('api-log/list')
  @ApiOperation({ summary: 'API日志列表（占位）' })
  async apiLogList(@Query() query: ListQueryDto) {
    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 20
    return {
      records: [],
      total: 0,
      page,
      pageSize
    }
  }

  @Get('system-config')
  @ApiOperation({ summary: '系统配置' })
  async systemConfig() {
    return this.sysConfigService.get<Record<string, unknown>>('system.config', {})
  }

  @Put('system-config')
  @ApiOperation({ summary: '更新系统配置' })
  async systemConfigUpdate(@Body() dto: Record<string, unknown>) {
    return { ok: true, dto }
  }

  @Get('app-config')
  @ApiOperation({ summary: 'APP配置' })
  async appConfig() {
    return this.sysConfigService.get<Record<string, unknown>>('app.config', {})
  }

  @Put('app-config')
  @ApiOperation({ summary: '更新APP配置' })
  async appConfigUpdate(@Body() dto: Record<string, unknown>) {
    return { ok: true, dto }
  }

  private toBizPage<T, R>(page: PageResult<T>, mapper: (item: T) => R) {
    return {
      records: page.list.map(mapper),
      total: page.meta.total,
      page: page.meta.page,
      pageSize: page.meta.pageSize
    }
  }
}
