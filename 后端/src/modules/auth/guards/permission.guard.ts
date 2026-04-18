/**
 * @file permission.guard.ts
 * @stage P3 / T3.8（员工 B 自有产出）
 * @desc 权限守卫：与 `@Permissions('xxx')` 装饰器协同，从 Redis Set
 *       `auth:permissions:{adminId}` 校验权限码（AND 语义；缺一即拒）
 *
 * 与员工 A 的 JwtAuthGuard 协同链：
 *   JwtAuthGuard（解析 token，注入 req.user） →
 *   UserTypeGuard（限定 admin 端） →
 *   PermissionGuard（本守卫，校验权限码）
 *
 * 缓存契约（DESIGN_P3 §2.5）：
 *   Key: auth:permissions:{adminId}     类型 Set     TTL 7200s（2h）
 *   特殊成员：'*' 表示超管（admin.is_super=1）通配，直接放行
 *   写入点：AuthService.login（员工 A）；本 Guard 在 cache miss 时自动从 DB 重建
 *   失效点：
 *     - 角色权限变更 → AdminService.refreshAdminPermissionCache(adminId)
 *     - 全局权限重置 → AdminService.flushAllPermissionCache()
 *
 * 错误码：
 *   - 未登录或缺 user 上下文 → 20001 (AUTH_TOKEN_MISSING)
 *   - 缺权限                 → 20003 (AUTH_PERMISSION_DENIED)
 */
import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { BizErrorCode } from '../../../common/error-codes'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import type { AuthUser } from '../decorators/current-user.decorator'
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator'

/** Redis Key 模板：admin 维度权限码 Set，TTL 2h */
export const PERM_CACHE_KEY = (adminId: string): string => `auth:permissions:${adminId}`
/** 缓存 TTL（秒）—— DESIGN_P3 §2.5：2h */
export const PERM_CACHE_TTL_SECONDS = 7200
/** 通配标记：超管放行用 */
export const PERM_WILDCARD = '*'

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name)

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Nest CanActivate 入口
   * 参数：ctx
   * 返回值：true 或抛 BusinessException(20003)
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass()
    ])
    if (!required || required.length === 0) {
      // 未注解：跳过权限校验（仅经过 JwtAuthGuard 即可）
      return true
    }

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>()
    const user = req.user
    if (!user) {
      throw new BusinessException(BizErrorCode.AUTH_TOKEN_MISSING)
    }

    // 仅 admin 端进入权限点判定；其他端不允许命中带 @Permissions 的接口
    if (user.userType !== 'admin') {
      throw new BusinessException(BizErrorCode.AUTH_USER_TYPE_MISMATCH)
    }

    // 超管短路（payload 标识 / 缓存通配 都视作放行）
    if (user.isSuper === true) return true

    const codes = await this.loadPermissions(user.uid)
    if (codes.has(PERM_WILDCARD)) return true

    // AND 语义：注解所列权限必须全部命中
    for (const code of required) {
      if (!codes.has(code)) {
        throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, `缺少权限：${code}`)
      }
    }
    return true
  }

  /**
   * 取 admin 权限码集合（缓存优先；miss 时从 DB 重建）
   * 参数：adminId 管理员 ID
   * 返回值：Set<string> 权限码集合
   * 用途：本守卫内部使用；AdminService 也可调用以预热
   */
  async loadPermissions(adminId: string): Promise<Set<string>> {
    const key = PERM_CACHE_KEY(adminId)
    try {
      const cached = await this.redis.smembers(key)
      if (cached && cached.length > 0) {
        return new Set(cached)
      }
    } catch (err) {
      this.logger.warn(`Redis SMEMBERS ${key} 失败：${(err as Error).message}；降级到 DB`)
    }

    const fromDb = await this.queryPermissionsFromDb(adminId)
    if (fromDb.size > 0) {
      // 异步回写缓存（不阻塞主链路）
      void this.writeCache(adminId, fromDb)
    }
    return fromDb
  }

  /**
   * 从 DB 查询 admin 的全部权限码（join admin_role + role_permission + permission）
   * 参数：adminId
   * 返回值：Set<string>（resource_code 集合；包含 admin.is_super=1 时返回 {'*'}）
   * 用途：缓存 miss 时回源；DESIGN_P3 §2.5 缓存重建
   */
  private async queryPermissionsFromDb(adminId: string): Promise<Set<string>> {
    const result = new Set<string>()
    try {
      // 1) 检查超管
      const superRows = await this.dataSource.query(
        'SELECT is_super FROM `admin` WHERE id = ? AND is_deleted = 0 LIMIT 1',
        [adminId]
      )
      if (Array.isArray(superRows) && superRows[0]?.is_super === 1) {
        result.add(PERM_WILDCARD)
        return result
      }
      // 2) 普通管理员：通过 admin_role / role_permission / permission 三表 join
      const rows = await this.dataSource.query(
        `SELECT DISTINCT p.resource_code
           FROM admin_role ar
           INNER JOIN role_permission rp ON rp.role_id = ar.role_id AND rp.is_deleted = 0
           INNER JOIN permission p ON p.id = rp.permission_id AND p.is_deleted = 0 AND p.status = 1
          WHERE ar.admin_id = ? AND ar.is_deleted = 0`,
        [adminId]
      )
      if (Array.isArray(rows)) {
        for (const r of rows as Array<{ resource_code: string }>) {
          if (r.resource_code) result.add(r.resource_code)
        }
      }
    } catch (err) {
      this.logger.error(
        `查询 admin ${adminId} 权限失败：${(err as Error).message}`,
        (err as Error).stack
      )
    }
    return result
  }

  /**
   * 写入权限缓存（Set + TTL 2h）
   * 参数：adminId / codes 权限码集合
   * 返回值：Promise<void>
   * 用途：cache miss 回写；AuthService.login / AdminService.refreshAdminPermissionCache 调用
   */
  async writeCache(adminId: string, codes: Set<string>): Promise<void> {
    const key = PERM_CACHE_KEY(adminId)
    if (codes.size === 0) {
      // 空集合也写入 placeholder 防止缓存穿透：写入一个非法标记 + 短 TTL
      try {
        await this.redis.sadd(key, '__empty__')
        await this.redis.expire(key, 60)
      } catch (err) {
        this.logger.warn(`Redis 写入空权限缓存 ${key} 失败：${(err as Error).message}`)
      }
      return
    }
    try {
      const pipeline = this.redis.pipeline()
      pipeline.del(key)
      pipeline.sadd(key, ...Array.from(codes))
      pipeline.expire(key, PERM_CACHE_TTL_SECONDS)
      await pipeline.exec()
    } catch (err) {
      this.logger.warn(`Redis 写入权限缓存 ${key} 失败：${(err as Error).message}`)
    }
  }
}
