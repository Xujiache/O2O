/**
 * @file sentry.ts
 * @stage P6/T6.44 (Sprint 6)
 * @desc 崩溃监控对接（Sentry）
 *
 * 平台：APP（5+ nativePlugin）/ 小程序（HTTP 上报）
 * P6 范围：
 *   - initSentry() / captureException() / captureMessage() 接口
 *   - 真实 SDK 集成归 S6
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'

let initialized = false
let dsn = ''

/** 初始化 Sentry */
export function initSentry(opt: { dsn: string; environment?: string; release?: string }): void {
  if (initialized) return
  dsn = opt.dsn
  if (!dsn) {
    logger.warn('sentry.init.skip', { reason: 'empty dsn' })
    return
  }
  initialized = true
  logger.info('sentry.init.ok', { env: opt.environment, release: opt.release })
}

/** 上报异常 */
export function captureException(err: unknown, ctx?: Record<string, unknown>): void {
  if (!initialized) {
    logger.warn('sentry.error.not-init', { e: String(err) })
    return
  }
  /* 简化：实际需调用 nativePlugin 或 HTTP envelope；S6 阶段实现 */
  logger.error('sentry.exception', { err: String(err), ctx })
}

/** 上报自定义消息 */
export function captureMessage(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  if (!initialized) return
  logger.info('sentry.message', { message, level })
}

/** 设置用户上下文（登录后调用） */
export function setSentryUser(user: { id: string; mchntNo?: string }): void {
  if (!initialized) return
  logger.info('sentry.user', user)
}

/** 清除用户上下文（退出登录） */
export function clearSentryUser(): void {
  if (!initialized) return
  logger.info('sentry.user.clear')
}
