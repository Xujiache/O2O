/**
 * @file sentry.service.ts
 * @stage P9/W2.C.1 (Sprint 2)
 * @desc Sentry 后端上报服务 — 包装 @sentry/node 的 init / captureException / captureMessage / setUser / setContext。
 *
 * 设计要点：
 *   - 通过 SENTRY_DSN 环境变量决定是否启用；未配置时所有 capture 调用静默 no-op，不阻断启动
 *   - 在 onModuleInit 中懒初始化，确保 ConfigModule 已 ready
 *   - 仅依赖 @sentry/node ^9（由 A 在 backend/package.json 安装）
 *
 * @author Agent C (P9 Sprint 2)
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Sentry from '@sentry/node'

/** captureException 上下文（traceId / userId / userType / 自定义业务字段） */
export type SentryContext = Record<string, unknown>

/**
 * Sentry 上报服务（应用级单例）
 *
 * 用法：
 *   constructor(private readonly sentry: SentryService) {}
 *   this.sentry.captureException(err, { traceId, userId })
 */
@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name)
  private enabled = false

  constructor(private readonly config: ConfigService) {}

  /**
   * 模块初始化：根据 SENTRY_DSN 决定启用与否
   * 功能：调用 Sentry.init 完成 SDK 初始化（仅当 DSN 非空）
   * 用途：NestJS 自动调用，无需手动触发
   */
  onModuleInit(): void {
    const dsn = this.config.get<string>('SENTRY_DSN')
    if (!dsn) {
      this.logger.warn('SENTRY_DSN 未配置，Sentry 上报已禁用')
      return
    }
    Sentry.init({
      dsn,
      environment: this.config.get<string>('NODE_ENV') ?? 'development',
      release: this.config.get<string>('SENTRY_RELEASE') ?? 'unknown',
      tracesSampleRate: Number(this.config.get<string>('SENTRY_TRACES_SAMPLE_RATE') ?? '0.1')
    })
    this.enabled = true
    this.logger.log('Sentry 已启用')
  }

  /**
   * 上报异常
   * @param error 任意被抛出的对象（会被 SDK 兜底序列化）
   * @param ctx 业务上下文（traceId / userId / userType / path / method ...）
   */
  captureException(error: unknown, ctx?: SentryContext): void {
    if (!this.enabled) return
    Sentry.withScope((scope: Sentry.Scope) => {
      if (ctx) {
        for (const [key, value] of Object.entries(ctx)) {
          if (value === undefined) continue
          scope.setExtra(key, value)
        }
        if (typeof ctx.userId === 'string') {
          scope.setUser({ id: ctx.userId })
        }
        if (typeof ctx.traceId === 'string') {
          scope.setTag('traceId', ctx.traceId)
        }
        if (typeof ctx.userType === 'string') {
          scope.setTag('userType', ctx.userType)
        }
      }
      Sentry.captureException(error)
    })
  }

  /**
   * 上报自定义消息（非异常，例如风控告警）
   * @param msg 消息文本
   * @param level 严重级别，默认 info
   */
  captureMessage(msg: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.enabled) return
    Sentry.captureMessage(msg, level)
  }

  /**
   * 设置当前用户上下文（登录态变化时调用）
   * @param uid 用户 ID
   * @param userType 用户类型（user / merchant / rider / admin）
   */
  setUser(uid: string, userType?: string): void {
    if (!this.enabled) return
    Sentry.setUser({ id: uid, ...(userType ? { userType } : {}) })
  }

  /**
   * 设置任意上下文 key（与 captureException 的 ctx 区别：长期粘附在 scope 上）
   * @param key 上下文键
   * @param ctx 上下文对象
   */
  setContext(key: string, ctx: Record<string, unknown>): void {
    if (!this.enabled) return
    Sentry.setContext(key, ctx)
  }

  /** 当前是否启用（用于测试 / 健康检查） */
  isEnabled(): boolean {
    return this.enabled
  }
}
