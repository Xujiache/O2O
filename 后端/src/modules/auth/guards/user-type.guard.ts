/**
 * @file user-type.guard.ts
 * @stage P3 / T3.4 占位
 * @desc 端类型守卫：与 `@UserTypes('admin')` 等装饰器配合
 * @stub-by 员工 B（员工 A T3.4 接管，本占位实现可直接保留）
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BizErrorCode } from '../../../common/error-codes'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { USER_TYPES_KEY, type UserType } from '../decorators/user-types.decorator'
import type { AuthUser } from '../decorators/current-user.decorator'

@Injectable()
export class UserTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * 校验当前登录用户的 userType 是否在装饰器白名单内
   * 参数：ctx
   * 返回值：true 或抛 20004
   */
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserType[]>(USER_TYPES_KEY, [
      ctx.getHandler(),
      ctx.getClass()
    ])
    if (!required || required.length === 0) return true
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>()
    const user = req.user
    if (!user) {
      throw new BusinessException(BizErrorCode.AUTH_TOKEN_MISSING)
    }
    if (!required.includes(user.userType)) {
      throw new BusinessException(BizErrorCode.AUTH_USER_TYPE_MISMATCH)
    }
    return true
  }
}
