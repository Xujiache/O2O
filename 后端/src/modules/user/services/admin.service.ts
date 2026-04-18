/**
 * @file admin.service.ts
 * @stage P3 / T3.12
 * @desc 平台管理员 CRUD + 角色绑定 + 权限缓存失效；写操作日志
 * @author 员工 B
 *
 * 数据来源：MySQL `admin` / `admin_role` / `operation_log`
 * 协同：与 PermissionGuard 共享 Redis Key `auth:permissions:{adminId}`
 *      管理员角色变更后必须 DEL 缓存，触发下次 PermissionGuard 回源重建
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '../../../common'
import { Admin, AdminRole } from '../../../entities'
import { CryptoUtil, PasswordUtil, SnowflakeId } from '../../../utils'
import {
  AdminDetailVo,
  AdminListAdminQueryDto,
  CreateAdminDto,
  UpdateAdminDto
} from '../dto/admin.dto'
import { OperationLogService } from './operation-log.service'
import { PERM_CACHE_KEY } from '../../auth/guards/permission.guard'
import { Inject } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../../health/redis.provider'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectRepository(AdminRole) private readonly adminRoleRepo: Repository<AdminRole>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService
  ) {}

  /**
   * 创建管理员
   * 参数：dto / opAdminId 操作管理员 ID
   * 返回值：AdminDetailVo
   * 用途：POST /api/v1/admin/admins
   */
  async create(dto: CreateAdminDto, opAdminId: string): Promise<AdminDetailVo> {
    const dup = await this.adminRepo.findOne({
      where: { username: dto.username, isDeleted: 0 }
    })
    if (dup) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '账号已存在')
    }
    const id = SnowflakeId.next()
    return this.dataSource.transaction(async (manager) => {
      const e = manager.create(Admin, {
        id,
        tenantId: 1,
        username: dto.username,
        passwordHash: PasswordUtil.hash(dto.password),
        nickname: dto.nickname ?? null,
        avatarUrl: null,
        mobileEnc: dto.mobile ? CryptoUtil.encrypt(dto.mobile) : null,
        mobileHash: dto.mobile ? CryptoUtil.hmac(dto.mobile) : null,
        mobileTail4: dto.mobile ? CryptoUtil.tail4(dto.mobile) : null,
        email: dto.email ?? null,
        isSuper: 0,
        status: 1,
        lastLoginAt: null,
        lastLoginIp: null,
        encKeyVer: 1,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      await manager.save(e)
      // 角色绑定（覆盖式）
      if (dto.roleIds && dto.roleIds.length > 0) {
        await this.applyRoleBinding(manager.getRepository(AdminRole), id, dto.roleIds)
      }
      await this.operationLogService.write({
        opAdminId,
        module: 'admin',
        action: 'create',
        resourceType: 'admin',
        resourceId: id,
        description: `创建管理员 ${dto.username}`
      })
      const roleIds = await this.listRoleIds(manager.getRepository(AdminRole), id)
      return this.toVo(e, roleIds)
    })
  }

  /**
   * 取管理员详情
   */
  async detail(adminId: string): Promise<AdminDetailVo> {
    const a = await this.findActiveById(adminId)
    const roleIds = await this.listRoleIds(this.adminRoleRepo, adminId)
    return this.toVo(a, roleIds)
  }

  /**
   * 更新管理员（含重置密码 + 改角色）
   */
  async update(adminId: string, dto: UpdateAdminDto, opAdminId: string): Promise<AdminDetailVo> {
    const a = await this.findActiveById(adminId)
    return this.dataSource.transaction(async (manager) => {
      if (dto.nickname !== undefined) a.nickname = dto.nickname
      if (dto.avatarUrl !== undefined) a.avatarUrl = dto.avatarUrl
      if (dto.mobile !== undefined) {
        a.mobileEnc = CryptoUtil.encrypt(dto.mobile)
        a.mobileHash = CryptoUtil.hmac(dto.mobile)
        a.mobileTail4 = CryptoUtil.tail4(dto.mobile)
      }
      if (dto.email !== undefined) a.email = dto.email
      if (dto.password !== undefined) a.passwordHash = PasswordUtil.hash(dto.password)
      if (dto.status !== undefined) a.status = dto.status
      await manager.save(a)
      let cacheInvalidated = false
      if (dto.roleIds !== undefined) {
        await this.applyRoleBinding(manager.getRepository(AdminRole), adminId, dto.roleIds)
        await this.invalidatePermissionCache(adminId)
        cacheInvalidated = true
      }
      await this.operationLogService.write({
        opAdminId,
        module: 'admin',
        action: 'update',
        resourceType: 'admin',
        resourceId: adminId,
        description: `更新管理员 ${a.username}${cacheInvalidated ? '（角色变更，已清权限缓存）' : ''}`
      })
      const roleIds = await this.listRoleIds(manager.getRepository(AdminRole), adminId)
      return this.toVo(a, roleIds)
    })
  }

  /**
   * 软删管理员（不允许删除超管）
   */
  async remove(adminId: string, opAdminId: string): Promise<{ ok: true }> {
    const a = await this.findActiveById(adminId)
    if (a.isSuper === 1) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '不允许删除超级管理员')
    }
    a.isDeleted = 1
    a.deletedAt = new Date()
    await this.adminRepo.save(a)
    await this.invalidatePermissionCache(adminId)
    await this.operationLogService.write({
      opAdminId,
      module: 'admin',
      action: 'delete',
      resourceType: 'admin',
      resourceId: adminId,
      description: `删除管理员 ${a.username}`
    })
    return { ok: true }
  }

  /**
   * 管理员列表
   */
  async list(query: AdminListAdminQueryDto): Promise<PageResult<AdminDetailVo>> {
    const qb = this.adminRepo.createQueryBuilder('a').where('a.is_deleted = 0')
    if (query.username) qb.andWhere('a.username LIKE :u', { u: `%${query.username}%` })
    if (query.nickname) qb.andWhere('a.nickname LIKE :n', { n: `%${query.nickname}%` })
    if (query.status !== undefined) qb.andWhere('a.status = :s', { s: query.status })
    qb.orderBy('a.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    const ids = rows.map((r) => r.id)
    const roleMap = await this.batchListRoleIds(ids)
    return makePageResult(
      rows.map((r) => this.toVo(r, roleMap.get(r.id) ?? [])),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 主动刷新单个 admin 权限缓存（业务场景：角色权限调整后调用）
   * 参数：adminId
   * 返回值：Promise<void>
   * 用途：与 PermissionGuard 协同；DEL 即可，下次 Guard 命中时回源重建
   */
  async refreshAdminPermissionCache(adminId: string): Promise<void> {
    await this.invalidatePermissionCache(adminId)
  }

  /**
   * 全局权限缓存失效（业务场景：批量调整角色权限后调用）
   * 返回值：Promise<void>
   * 用途：使用 SCAN 迭代 `auth:permissions:*`，批量 DEL（避免 KEYS *）
   */
  async flushAllPermissionCache(): Promise<void> {
    let cursor = '0'
    const pattern = 'auth:permissions:*'
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = next
      if (keys.length > 0) {
        await this.redis.unlink(...keys)
      }
    } while (cursor !== '0')
    this.logger.log('已批量清空 auth:permissions:* 权限缓存')
  }

  /* ========== 内部辅助 ========== */

  /**
   * 覆盖式重设 admin 的角色绑定
   */
  private async applyRoleBinding(
    repo: Repository<AdminRole>,
    adminId: string,
    roleIds: string[]
  ): Promise<void> {
    // 1) 软删现有绑定
    await repo
      .createQueryBuilder()
      .update()
      .set({ isDeleted: 1, deletedAt: new Date() })
      .where('admin_id = :aid AND is_deleted = 0', { aid: adminId })
      .execute()
    // 2) 写新绑定
    if (roleIds.length === 0) return
    const now = new Date()
    const rows = roleIds.map((roleId) =>
      repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        adminId,
        roleId,
        isDeleted: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
    )
    await repo.save(rows)
  }

  private async listRoleIds(repo: Repository<AdminRole>, adminId: string): Promise<string[]> {
    const rows = await repo.find({ where: { adminId, isDeleted: 0 } })
    return rows.map((r) => r.roleId)
  }

  private async batchListRoleIds(adminIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>()
    if (adminIds.length === 0) return map
    const rows = await this.adminRoleRepo.find({
      where: { adminId: In(adminIds), isDeleted: 0 }
    })
    for (const r of rows) {
      const list = map.get(r.adminId) ?? []
      list.push(r.roleId)
      map.set(r.adminId, list)
    }
    return map
  }

  private async findActiveById(adminId: string): Promise<Admin> {
    const a = await this.adminRepo.findOne({ where: { id: adminId, isDeleted: 0 } })
    if (!a) throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND, '管理员不存在')
    return a
  }

  /**
   * 失效权限缓存（DESIGN_P3 §2.5）
   */
  private async invalidatePermissionCache(adminId: string): Promise<void> {
    try {
      await this.redis.del(PERM_CACHE_KEY(adminId))
    } catch (err) {
      this.logger.warn(`Redis DEL ${PERM_CACHE_KEY(adminId)} 失败：${(err as Error).message}`)
    }
  }

  private toVo(a: Admin, roleIds: string[]): AdminDetailVo {
    return {
      id: a.id,
      username: a.username,
      nickname: a.nickname,
      avatarUrl: a.avatarUrl,
      mobileTail4: a.mobileTail4,
      email: a.email,
      isSuper: a.isSuper,
      status: a.status,
      lastLoginAt: a.lastLoginAt,
      roleIds,
      createdAt: a.createdAt
    }
  }
}
