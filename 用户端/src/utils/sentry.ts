/**
 * @file sentry.ts
 * @stage P9/W2.C.2 (Sprint 2) — Sentry HTTP envelope 真发送（用户端）
 * @desc 不依赖 @sentry/* SDK 包，手写 envelope 协议向 Sentry 上报异常 / 消息。
 *
 * 协议参考：https://develop.sentry.dev/sdk/envelopes/
 *   POST <dsn-host>/api/<project>/envelope/
 *   body 三行：{header}\n{item_header}\n{event}
 *
 * 设计要点：
 *   - DSN 为空时整体禁用，所有 capture 调用 no-op
 *   - 用 uni.request 上报，避免依赖 fetch/XHR
 *   - 用户端登录态 → setSentryUser({ id, userType:'user' })
 *
 * @author Agent C (P9 Sprint 2)
 */
import { logger } from './logger'

let initialized = false
let dsnUrl = ''
let environment = 'development'
let release = '0.1.0'
let userCtx: { id?: string; userType?: string } = {}
let envelopeEndpoint = ''
let publicKey = ''
let projectId = ''

/** Sentry 初始化参数 */
export interface SentryInitOptions {
  dsn: string
  environment?: string
  release?: string
}

/**
 * 解析 DSN
 * 格式：https://<key>@<host>/<project_id>
 * @param dsnStr DSN 字符串
 */
function parseDsn(dsnStr: string): { endpoint: string; key: string; projectId: string } | null {
  try {
    const m = dsnStr.match(/^(https?:\/\/)([^@]+)@([^/]+)\/(.+)$/)
    if (!m) return null
    const [, scheme, key, host, pid] = m
    return {
      endpoint: `${scheme}${host}/api/${pid}/envelope/`,
      key,
      projectId: pid
    }
  } catch {
    return null
  }
}

/**
 * 初始化 Sentry
 * @param opt DSN/环境/版本号；DSN 为空时跳过初始化
 */
export function initSentry(opt: SentryInitOptions): void {
  if (initialized) return
  if (!opt.dsn) {
    logger.warn('sentry.init.skip', { reason: 'empty dsn' })
    return
  }
  const parsed = parseDsn(opt.dsn)
  if (!parsed) {
    logger.warn('sentry.init.skip', { reason: 'invalid dsn' })
    return
  }
  dsnUrl = opt.dsn
  environment = opt.environment ?? 'development'
  release = opt.release ?? '0.1.0'
  envelopeEndpoint = parsed.endpoint
  publicKey = parsed.key
  projectId = parsed.projectId
  initialized = true
  logger.info('sentry.init.ok', { env: environment, release, projectId })
}

/** 别名（与文档要求的 setupSentry 一致） */
export const setupSentry = initSentry

/** 构造 envelope auth 头 */
function buildAuthHeader(): string {
  return [
    'Sentry sentry_version=7',
    `sentry_client=o2o-user/${release}`,
    `sentry_key=${publicKey}`
  ].join(', ')
}

/** 构造 event payload */
function buildEvent(payload: {
  type: 'event' | 'message'
  message?: string
  level?: 'info' | 'warning' | 'error'
  exception?: { type: string; value: string; stacktrace?: { frames: unknown[] } }
  extra?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    event_id: genEventId(),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    sdk: { name: 'sentry.javascript.o2o-user', version: release },
    environment,
    release,
    user: userCtx.id ? { id: userCtx.id, userType: userCtx.userType ?? 'user' } : undefined,
    tags: { client: 'user' },
    level: payload.level ?? (payload.exception ? 'error' : 'info'),
    message: payload.message,
    exception: payload.exception
      ? {
          values: [
            {
              type: payload.exception.type,
              value: payload.exception.value,
              stacktrace: payload.exception.stacktrace
            }
          ]
        }
      : undefined,
    extra: payload.extra
  }
}

/** 生成 32 位 hex event id */
function genEventId(): string {
  const hex = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)]
  return s
}

/** 上报 envelope（uni.request） */
function sendEnvelope(event: Record<string, unknown>): void {
  if (!initialized) return
  try {
    const eventStr = JSON.stringify(event)
    const headerStr = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
      sdk: event.sdk
    })
    const itemHeader = JSON.stringify({
      type: 'event',
      length: eventStr.length,
      content_type: 'application/json'
    })
    const body = `${headerStr}\n${itemHeader}\n${eventStr}\n`

    uni.request({
      url: envelopeEndpoint,
      method: 'POST',
      data: body,
      header: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': buildAuthHeader()
      },
      success: () => {
        logger.info('sentry.send.ok', { eventId: event.event_id })
      },
      fail: (err) => {
        logger.warn('sentry.send.fail', { err: String(err.errMsg ?? '') })
      }
    })
  } catch (e) {
    logger.warn('sentry.send.error', { e: String(e) })
  }
}

/**
 * 上报异常
 * @param err 任意被抛出的对象
 * @param ctx 业务上下文（traceId / orderNo / page ...）
 */
export function captureException(err: unknown, ctx?: Record<string, unknown>): void {
  if (!initialized) {
    logger.warn('sentry.error.not-init', { e: String(err) })
    return
  }
  const errorObj = err as { name?: string; message?: string; stack?: string }
  const event = buildEvent({
    type: 'event',
    exception: {
      type: errorObj?.name ?? 'Error',
      value: errorObj?.message ?? String(err),
      stacktrace: errorObj?.stack ? { frames: parseStackFrames(errorObj.stack) } : undefined
    },
    extra: ctx
  })
  sendEnvelope(event)
}

/**
 * 上报自定义消息
 * @param message 消息文本
 * @param level 级别（info/warning/error）
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  if (!initialized) return
  const event = buildEvent({ type: 'message', message, level })
  sendEnvelope(event)
}

/**
 * 设置用户上下文（登录后调用）
 * @param user 用户身份
 */
export function setSentryUser(user: { id: string; userType?: string }): void {
  userCtx = user
}

/** 清除用户上下文（退出登录） */
export function clearSentryUser(): void {
  userCtx = {}
}

/** 简化栈解析 */
function parseStackFrames(stack: string): { filename: string; function: string; lineno: number }[] {
  const frames: { filename: string; function: string; lineno: number }[] = []
  const lines = stack.split('\n')
  for (const line of lines) {
    const m = line.match(/at\s+(.+?)\s+\((.+):(\d+):\d+\)/)
    if (m) {
      frames.push({ function: m[1], filename: m[2], lineno: Number(m[3]) })
    }
  }
  return frames.reverse()
}

/** 当前 Sentry 状态（调试用） */
export function getSentryState(): { initialized: boolean; dsn: string; environment: string } {
  return { initialized, dsn: dsnUrl, environment }
}
