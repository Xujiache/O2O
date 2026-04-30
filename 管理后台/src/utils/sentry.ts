/**
 * @file sentry.ts
 * @stage P9/W2.C.2 (Sprint 2) — Sentry HTTP envelope 真发送（管理后台）
 * @desc 不依赖 @sentry/* SDK 包，手写 envelope 协议向 Sentry 上报异常 / 消息。
 *
 * 协议参考：https://develop.sentry.dev/sdk/envelopes/
 *   POST <dsn-host>/api/<project>/envelope/
 *   body 三行：{header}\n{item_header}\n{event}
 *
 * 设计要点：
 *   - DSN 为空时整体禁用，所有 capture 调用 no-op
 *   - 用 fetch + keepalive 上报，页面 unload 时也能尽力发送
 *   - 与 Vue.config.errorHandler / window.onerror / unhandledrejection 集成
 *
 * @author Agent C (P9 Sprint 2)
 */

let initialized = false
let dsnUrl = ''
let environment = 'development'
let release = '0.1.0'
let userCtx: { id?: string; userType?: string } = {}
let envelopeEndpoint = ''
let publicKey = ''

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
 * 初始化 Sentry（DSN 为空时跳过）
 * @param opt DSN/环境/版本号
 */
export function setupSentry(opt: SentryInitOptions): void {
  if (initialized) return
  if (!opt.dsn) {
    console.warn('[sentry.init.skip] empty dsn')
    return
  }
  const parsed = parseDsn(opt.dsn)
  if (!parsed) {
    console.warn('[sentry.init.skip] invalid dsn')
    return
  }
  dsnUrl = opt.dsn
  environment = opt.environment ?? 'development'
  release = opt.release ?? '0.1.0'
  envelopeEndpoint = parsed.endpoint
  publicKey = parsed.key
  initialized = true

  /* 全局兜底：window.onerror / unhandledrejection */
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (ev) => {
      captureException(ev.error ?? new Error(ev.message), {
        source: 'window.onerror',
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno
      })
    })
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev.reason as unknown
      captureException(reason instanceof Error ? reason : new Error(String(reason)), {
        source: 'unhandledrejection'
      })
    })
  }
}

/** 别名（与商户/骑手端 initSentry 命名一致） */
export const initSentry = setupSentry

/** 构造 envelope auth 头 */
function buildAuthHeader(): string {
  return [
    'Sentry sentry_version=7',
    `sentry_client=o2o-admin/${release}`,
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
    sdk: { name: 'sentry.javascript.o2o-admin', version: release },
    environment,
    release,
    user: userCtx.id ? { id: userCtx.id, userType: userCtx.userType ?? 'admin' } : undefined,
    tags: { client: 'admin' },
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

/** 上报 envelope（fetch keepalive） */
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

    void fetch(envelopeEndpoint, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': buildAuthHeader()
      },
      keepalive: true
    }).catch((err: unknown) => {
      console.warn('[sentry.send.fail]', String(err))
    })
  } catch (e) {
    console.warn('[sentry.send.error]', String(e))
  }
}

/**
 * 上报异常
 * @param err 任意被抛出的对象
 * @param ctx 业务上下文（页面 / 路由 / 自定义字段）
 */
export function captureException(err: unknown, ctx?: Record<string, unknown>): void {
  if (!initialized) return
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
 * 设置用户上下文（管理员登录后调用）
 * @param user 管理员身份
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
