/**
 * @file permissions.decorator.ts
 * @stage P3 / T3.8（员工 B 自有产出，PermissionGuard 配套）
 * @desc `@Permissions('shop:update', 'order:list')` 标注接口所需权限码
 *
 * 与 PermissionGuard 协同：
 *   - JwtAuthGuard 先校验登录（员工 A）
 *   - UserTypeGuard 限定 admin 端（员工 A）
 *   - PermissionGuard 比对 Redis `auth:permissions:{adminId}` Set 是否包含
 *     注解所列全部 code（AND 语义）；缺一即拒
 *   - 超管（admin.is_super=1）登录时缓存写入 `*` 通配，PermissionGuard 直接放行
 */
import { SetMetadata } from '@nestjs/common'

export const PERMISSIONS_KEY = 'permissions'

/**
 * `@Permissions(...codes)` 装饰器
 * 参数：codes 一个或多个 permission.resource_code（菜单/按钮/接口三层均可）
 * 返回值：装饰器
 * 用途：管理后台 Controller 方法上注解需要的权限码
 */
export const Permissions = (...codes: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, codes)
