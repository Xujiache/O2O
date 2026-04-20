/**
 * @file jwt-auth.guard.ts
 * @stage P3/T3.4
 * @desc 全局 JWT 鉴权守卫（passport-jwt 实现）
 * @author 员工 A（接管 B 的占位）
 *
 * 行为：
 *   - 标注 `@Public()` → 直接放行
 *   - 否则走 passport-jwt：HS512 验签 → JwtStrategy.validate() → 注入 req.user
 *   - 验签失败 / payload 异常 → 抛 BusinessException 统一编码
 *
 * 注册方式：
 *   - 已全局注册，见 app.module.ts providers → { provide: APP_GUARD, useClass: JwtAuthGuard }
 *   - 公开接口使用 @Public() 跳过鉴权
 */

import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import type { Observable } from 'rxjs'
import { BizErrorCode } from '../../../common/error-codes'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  /**
   * Nest CanActivate 入口
   * 参数：ctx ExecutionContext
   * 返回值：boolean / Promise / Observable
   */
  canActivate(ctx: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass()
    ])
    if (isPublic) return true
    return super.canActivate(ctx) as boolean | Promise<boolean> | Observable<boolean>
  }

  /**
   * 鉴权失败统一封装为业务异常
   * 参数：err passport 抛出的错误；user JwtStrategy.validate 返回值
   * 返回值：user（成功）或抛 BusinessException
   */
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err instanceof BusinessException) throw err
    if (err) {
      throw new BusinessException(
        BizErrorCode.AUTH_TOKEN_INVALID,
        (err as Error).message ?? '令牌无效'
      )
    }
    if (!user) {
      /* info 通常是 'jwt expired' / 'No auth token' / 'invalid signature' */
      const reason =
        info && typeof info === 'object' && 'message' in info
          ? String((info as { message: unknown }).message)
          : '未登录或令牌无效'
      const isExpired = reason.toLowerCase().includes('expired')
      throw new BusinessException(
        isExpired ? BizErrorCode.AUTH_TOKEN_EXPIRED : BizErrorCode.AUTH_TOKEN_MISSING,
        reason
      )
    }
    return user
  }
}
