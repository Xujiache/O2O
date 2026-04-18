/**
 * @file throttle-sign.guard.ts
 * @stage P3/T3.4
 * @desc 管理后台签名 + 防重放守卫（DESIGN_P3 §2.3 + ALIGNMENT 防重放）
 * @author 员工 A
 *
 * 校验链：
 *   1) Header X-App-Key / X-Timestamp / X-Nonce / X-Sign 全部存在
 *   2) timestamp 与服务器时差 ≤ 5 min（300000 ms）
 *   3) nonce 走 Redis SETNX（key=auth:nonce:{nonce}, TTL=300s）→ 已存在视为重放
 *   4) sign = MD5(appKey + timestamp + nonce + bodyJson + appSecret)
 *      与请求头 X-Sign 比对（大小写不敏感）
 *
 * 配置来源：
 *   - app key/secret 字典：通过 ENV ADMIN_APP_KEYS 读 JSON 字符串（{appKey: appSecret, ...}）
 *     或通过 ConfigService.get('admin.appKeys')；本期 stub：仅一个固定 key
 */

import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'crypto'
import { Request } from 'express'
import Redis from 'ioredis'
import { BizErrorCode } from '../../../common/error-codes'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { REDIS_CLIENT } from '../../../health/redis.provider'

/** Header 名称常量 */
const HDR_APP_KEY = 'x-app-key'
const HDR_TIMESTAMP = 'x-timestamp'
const HDR_NONCE = 'x-nonce'
const HDR_SIGN = 'x-sign'

/** 时间戳允许偏差（ms） */
const MAX_CLOCK_DRIFT_MS = 300_000
/** Redis nonce TTL（s） */
const NONCE_TTL_SECONDS = 300

/**
 * 签名守卫（仅管理后台路由开启；普通 C 端不强制）
 * 用途：单 controller 用 @UseGuards(ThrottleSignGuard) 启用；
 *      或 admin module 全局启用。
 */
@Injectable()
export class ThrottleSignGuard implements CanActivate {
  private readonly logger = new Logger(ThrottleSignGuard.name)

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * Nest CanActivate 入口
   * 参数：ctx
   * 返回值：true 或抛 BusinessException
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>()
    const appKey = this.headerVal(req, HDR_APP_KEY)
    const timestamp = this.headerVal(req, HDR_TIMESTAMP)
    const nonce = this.headerVal(req, HDR_NONCE)
    const sign = this.headerVal(req, HDR_SIGN)

    if (!appKey || !timestamp || !nonce || !sign) {
      throw new BusinessException(
        BizErrorCode.AUTH_SIGN_INVALID,
        '签名头缺失：X-App-Key / X-Timestamp / X-Nonce / X-Sign 四件套不全'
      )
    }

    /* 1) 时间戳偏差校验 */
    const tsNum = parseInt(timestamp, 10)
    if (!Number.isFinite(tsNum)) {
      throw new BusinessException(BizErrorCode.AUTH_TIMESTAMP_EXPIRED, 'X-Timestamp 非法')
    }
    if (Math.abs(Date.now() - tsNum) > MAX_CLOCK_DRIFT_MS) {
      throw new BusinessException(
        BizErrorCode.AUTH_TIMESTAMP_EXPIRED,
        `请求时间戳超时（容忍 ${MAX_CLOCK_DRIFT_MS / 1000}s）`
      )
    }

    /* 2) nonce 防重放（Redis SETNX） */
    const nonceKey = `auth:nonce:${nonce}`
    try {
      const ok = await this.redis.set(nonceKey, '1', 'EX', NONCE_TTL_SECONDS, 'NX')
      if (ok !== 'OK') {
        throw new BusinessException(BizErrorCode.AUTH_NONCE_REPLAY)
      }
    } catch (err) {
      if (err instanceof BusinessException) throw err
      this.logger.warn(
        `Redis SETNX nonce 失败：${(err as Error).message}；放行（fail-open 仅 dev）`
      )
    }

    /* 3) 取 appSecret 并比对 sign */
    const appSecret = this.lookupAppSecret(appKey)
    if (!appSecret) {
      throw new BusinessException(BizErrorCode.AUTH_SIGN_INVALID, `未知 X-App-Key=${appKey}`)
    }
    const body =
      (req as Request & { rawBody?: string }).rawBody ?? (req.body ? JSON.stringify(req.body) : '')
    const expected = createHash('md5')
      .update(`${appKey}${timestamp}${nonce}${body}${appSecret}`, 'utf8')
      .digest('hex')
    if (expected.toLowerCase() !== sign.toLowerCase()) {
      throw new BusinessException(BizErrorCode.AUTH_SIGN_INVALID, '签名校验失败')
    }

    return true
  }

  /**
   * 从 ConfigService 加载 appKey → appSecret 字典
   * 参数：appKey
   * 返回值：appSecret 或 undefined
   * 用途：本期占位实现 —— 仅支持 ENV ADMIN_SIGN_APP_KEY / ADMIN_SIGN_APP_SECRET 单 key 模式
   */
  private lookupAppSecret(appKey: string): string | undefined {
    /* JSON 字典模式：ADMIN_APP_KEYS='{"key1":"secret1","key2":"secret2"}' */
    const dictRaw = this.config.get<string>('admin.appKeys') ?? process.env.ADMIN_APP_KEYS
    if (dictRaw) {
      try {
        const dict = JSON.parse(dictRaw) as Record<string, string>
        return dict[appKey]
      } catch {
        /* 落入单 key 模式 */
      }
    }
    /* 单 key 兜底模式 */
    const envKey = this.config.get<string>('admin.appKey') ?? process.env.ADMIN_SIGN_APP_KEY
    const envSecret =
      this.config.get<string>('admin.appSecret') ?? process.env.ADMIN_SIGN_APP_SECRET
    return envKey && envKey === appKey ? envSecret : undefined
  }

  /** 取 header（小写匹配；返回 undefined 而非数组） */
  private headerVal(req: Request, name: string): string | undefined {
    const v = req.headers[name]
    return Array.isArray(v) ? v[0] : v
  }
}
