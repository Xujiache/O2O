/**
 * @file current-user.decorator.ts
 * @stage P3
 * @desc `@CurrentUser()` 参数装饰器，从 request.user 取出登录态
 * @stub-by 员工 B（员工 A T3.4 实现 JwtAuthGuard 时把 JWT payload 挂到 req.user 即可）
 */
import { ExecutionContext, createParamDecorator } from '@nestjs/common'

/** 登录态 payload（与 JWT payload 对齐，DESIGN_P3 §2.2） */
export interface AuthUser {
  uid: string
  userType: 'user' | 'merchant' | 'rider' | 'admin'
  tenantId: number
  ver: number
  // 管理员超管标识（PermissionGuard 优先放行）
  isSuper?: boolean
  // 子账号场景，附带商户 ID
  merchantId?: string
}

/**
 * `@CurrentUser()` 参数装饰器
 * 参数：data 可选取属性名（如 `@CurrentUser('uid')` 直接拿 uid）
 * 返回值：AuthUser 或单字段
 * 用途：Controller 方法形参注入当前登录用户
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): unknown => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>()
    const user = req.user
    if (!user) return undefined
    return data ? user[data] : user
  }
)
