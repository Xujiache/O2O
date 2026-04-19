/**
 * @file sentry.ts
 * @stage P6/T6.44 (Sprint 6)
 * @desc 崩溃监控对接（Sentry HTTP envelope 简化版）
 *
 * 实现策略：
 *   - 不依赖 @sentry/* SDK（包大小过大），手写 envelope HTTP 上报
 *   - 上报路径：${dsn 派生的 envelope endpoint}
 *   - APP 端通过 plus.runtime.uncaughtException + Vue.config.errorHandler 捕获
 *   - 小程序通过 wx.onError + Vue.config.errorHandler 捕获
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'

let initialized = false
let dsn = ''
let environment = 'development'
let release = '0.1.0'
let userCtx: { id?: string; mchntNo?: string } = {}
let envelopeEndpoint = ''
let publicKey = ''
let projectId = ''

/**
 * 解析 DSN
 * 格式：https://<key>@<host>/<project_id>
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

/** 初始化 Sentry */
export function initSentry(opt: { dsn: string; environment?: string; release?: string }): void {
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
  dsn = opt.dsn
  environment = opt.environment ?? 'development'
  release = opt.release ?? '0.1.0'
  envelopeEndpoint = parsed.endpoint
  publicKey = parsed.key
  projectId = parsed.projectId
  initialized = true
  logger.info('sentry.init.ok', { env: environment, release, projectId })
}

/** 构造 envelope 头 */
function buildAuthHeader(): string {
  return [
    'Sentry sentry_version=7',
    `sentry_client=o2o-mchnt/${release}`,
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
    sdk: { name: 'sentry.javascript.o2o-mchnt', version: release },
    environment,
    release,
    user: userCtx.id ? { id: userCtx.id, mchnt_no: userCtx.mchntNo } : undefined,
    tags: { client: 'merchant' },
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

function genEventId(): string {
  /* 32 位 hex */
  const hex = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)]
  return s
}

/** 上报 envelope */
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

/** 上报异常 */
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
      stacktrace: errorObj?.stack
        ? {
            frames: parseStackFrames(errorObj.stack)
          }
        : undefined
    },
    extra: ctx
  })
  sendEnvelope(event)
}

/** 上报自定义消息 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  if (!initialized) return
  const event = buildEvent({ type: 'message', message, level })
  sendEnvelope(event)
}

/** 设置用户上下文（登录后调用） */
export function setSentryUser(user: { id: string; mchntNo?: string }): void {
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
      frames.push({
        function: m[1],
        filename: m[2],
        lineno: Number(m[3])
      })
    }
  }
  return frames.reverse()
}

/** 当前 Sentry 状态（调试用） */
export function getSentryState(): { initialized: boolean; dsn: string; environment: string } {
  return { initialized, dsn, environment }
}
