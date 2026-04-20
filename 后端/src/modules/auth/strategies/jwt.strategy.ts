/**
 * @file jwt.strategy.ts
 * @stage P3/T3.4
 * @desc passport-jwt 策略：HS512 验签 + payload 校验（uid/userType/tenantId/ver/iat/exp）
 * @author 员工 A
 *
 * Token 来源：Authorization: Bearer <jwt>
 * 校验链：
 *   1) 算法 HS512 + secret（来自 ConfigService('jwt.secret')）
 *   2) payload 字段完整性
 *   3) ver 字段比对：从 Redis `auth:tokenver:{userType}:{uid}` 取最新版本号；
 *      若 payload.ver < currentVer → 拒绝（一键吊销机制）
 *   4) 通过 → 返回 AuthUser，由 passport 自动挂到 req.user
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import Redis from 'ioredis'
import { BizErrorCode } from '../../../common/error-codes'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import type { AuthUser } from '../decorators/current-user.decorator'

/**
 * JWT Payload（与 DESIGN_P3 §2.2 一致）
 * 必含 6 字段：uid / userType / tenantId / ver / iat / exp
 */
export interface JwtPayload {
  uid: string
  userType: 'user' | 'merchant' | 'rider' | 'admin'
  tenantId: number
  ver: number
  iat: number
  exp: number
  /* 可选透传字段 */
  isSuper?: boolean
  merchantId?: string
}

/** Redis Key：每用户 token 版本号（用于一键失效） */
export const TOKEN_VER_KEY = (userType: string, uid: string): string =>
  `auth:tokenver:${userType}:${uid}`

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name)

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    const secret = config.get<string>('jwt.secret')
    if (!secret || secret.length < 16) {
      throw new Error('[JwtStrategy] JWT_SECRET 缺失或过短（< 16 字符）')
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS512']
    })
  }

  /**
   * passport-jwt 验签通过后回调
   * 参数：payload 已验签的 JWT payload
   * 返回值：AuthUser（被 passport 注入 req.user）
   * 错误：payload 不完整 / ver 已失效 → 抛 BusinessException(20002 / 20005)
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload?.uid || !payload?.userType || payload.ver == null) {
      throw new BusinessException(BizErrorCode.AUTH_TOKEN_INVALID, 'JWT payload 字段缺失')
    }

    /* ver 强制失效校验：从 Redis 取最新版本，payload.ver 必须 >= 当前版本 */
    try {
      const currentVerStr = await this.redis.get(TOKEN_VER_KEY(payload.userType, payload.uid))
      if (currentVerStr != null) {
        const currentVer = parseInt(currentVerStr, 10)
        if (Number.isFinite(currentVer) && payload.ver < currentVer) {
          throw new BusinessException(BizErrorCode.AUTH_TOKEN_EXPIRED, '令牌已被吊销')
        }
      }
    } catch (err) {
      if (err instanceof BusinessException) throw err
      const failMode = this.config.get<string>('jwt.verFailMode', 'close')
      if (failMode === 'close') {
        this.logger.error(
          `Redis 取 token ver 失败（fail-close 模式拒绝）：${(err as Error).message}`
        )
        throw new BusinessException(BizErrorCode.AUTH_TOKEN_INVALID, 'Token 校验服务暂不可用')
      }
      this.logger.warn(`Redis 取 token ver 失败（fail-open 模式放行）：${(err as Error).message}`)
    }

    return {
      uid: payload.uid,
      userType: payload.userType,
      tenantId: payload.tenantId,
      ver: payload.ver,
      isSuper: payload.isSuper,
      merchantId: payload.merchantId
    }
  }
}
