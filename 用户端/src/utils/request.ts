/**
 * @file request.ts
 * @stage P5/T5.3 (Sprint 1)
 * @desc 基于 uni.request 的统一 HTTP 客户端：
 *   - 自动注入 Authorization Bearer
 *   - 解包 { code, message, data }
 *   - 401 自动 refresh + 重放（仅一次）
 *   - 网络错误指数退避重试 3 次
 *   - 业务错误码统一 toast / 行为
 *   - 支持 X-Idem-Key（下单等幂等场景）
 * @author 单 Agent V2.0
 */
import { logger } from './logger'
import { getStorage, setStorage, removeStorage, STORAGE_KEYS } from './storage'

/** 后端统一响应体 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  traceId?: string
  timestamp?: number
}

/** 业务错误（带 code） */
export class BizError extends Error {
  constructor(
    public code: number,
    message: string,
    public traceId?: string
  ) {
    super(message)
    this.name = 'BizError'
  }
}

/** 请求选项 */
export interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: unknown
  headers?: Record<string, string>
  /** 是否绕过 401 自动 refresh（auth/refresh 自身用） */
  skipAuthRefresh?: boolean
  /** 是否静默错误（不弹 toast） */
  silent?: boolean
  /** 超时（毫秒），默认 15s */
  timeout?: number
  /** 是否走根路径（不带 /api/v1 前缀） */
  rootPath?: boolean
  /** 重试次数（仅网络错误生效），默认 3 */
  retry?: number
  /** 幂等 key（下单等场景，自动生成） */
  idemKey?: string
  /** 服务端要求的额外 header（如 X-Sign） */
  extraHeaders?: Record<string, string>
}

/** 401 处理：单飞 refresh，避免并发刷新打满 */
let refreshPromise: Promise<string | null> | null = null

/** 读取 env 变量 */
function getEnv(key: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.[key] ?? ''
}

const API_BASE = getEnv('VITE_API_BASE_URL') || 'http://localhost:3000/api/v1'
const ROOT_BASE = API_BASE.replace(/\/api\/v\d+\/?$/i, '')
const DEFAULT_TIMEOUT = Number(getEnv('VITE_API_TIMEOUT')) || 15000

/**
 * 拼接最终 URL
 * @param url 路径
 * @param rootPath 是否根路径
 */
function buildUrl(url: string, rootPath = false): string {
  if (/^https?:\/\//.test(url)) return url
  const base = rootPath ? ROOT_BASE : API_BASE
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * 静默 refresh token（单飞）
 * @returns 新 accessToken；失败返回 null
 */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = getStorage<string>(STORAGE_KEYS.REFRESH_TOKEN)
  if (!refreshToken) return null
  try {
    const data = await rawRequest<{ accessToken: string; refreshToken: string }>({
      url: '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
      skipAuthRefresh: true,
      silent: true,
      retry: 0
    })
    setStorage(STORAGE_KEYS.TOKEN, data.accessToken, 1000 * 60 * 60 * 24 * 7)
    setStorage(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken, 1000 * 60 * 60 * 24 * 30)
    return data.accessToken
  } catch (e) {
    logger.warn('auth.refresh.fail', { e: String(e) })
    return null
  }
}

/**
 * 401 → 跳转登录
 */
function redirectLogin(): void {
  removeStorage(STORAGE_KEYS.TOKEN)
  removeStorage(STORAGE_KEYS.REFRESH_TOKEN)
  removeStorage(STORAGE_KEYS.USER_INFO)
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  if (cur && cur.route?.includes('pages/login')) return
  uni.reLaunch({ url: '/pages/login/index' })
}

/**
 * 错误码 toast 文案表（节选 P4 §10.4 错误码字典）
 */
const ERROR_TOAST: Record<number, string> = {
  10001: '请求参数有误',
  10010: '资源不存在',
  10011: '操作冲突，请重试',
  10101: '超出配送范围',
  10200: '库存不足，请刷新',
  10300: '订单不存在',
  10301: '订单当前状态不允许该操作',
  10302: '非本人订单',
  10401: '请勿重复支付',
  10402: '余额不足',
  10501: '退款金额超限',
  10600: '暂无可派骑手',
  10700: '优惠券不可用',
  20003: '权限不足',
  30001: '操作过于频繁，请稍后重试',
  30003: '请勿重复提交'
}

/**
 * 业务错误统一处理
 * @param code 业务码
 * @param message 后端消息
 * @param silent 是否静默
 */
function handleBizError(code: number, message: string, silent: boolean): void {
  if (silent) return
  const text = ERROR_TOAST[code] ?? message ?? '操作失败'
  uni.showToast({ title: text, icon: 'none', duration: 2000 })
}

/** 网络错误延迟（指数退避） */
function backoff(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** attempt, 5000)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 真正的请求函数（不含 401 处理）
 * @param opt 请求选项
 * @returns 解包后业务数据
 */
function rawRequest<T = unknown>(opt: RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = getStorage<string>(STORAGE_KEYS.TOKEN)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      ...(opt.extraHeaders ?? {}),
      ...(opt.headers ?? {})
    }
    if (token && !opt.skipAuthRefresh) {
      headers.Authorization = `Bearer ${token}`
    }
    if (opt.idemKey) {
      headers['X-Idem-Key'] = opt.idemKey
    }

    uni.request({
      url: buildUrl(opt.url, opt.rootPath),
      method: opt.method ?? 'GET',
      data: opt.data as never,
      header: headers,
      timeout: opt.timeout ?? DEFAULT_TIMEOUT,
      success: (res) => {
        const statusCode = (res as UniApp.RequestSuccessCallbackResult).statusCode
        const body = (res as UniApp.RequestSuccessCallbackResult).data as ApiResponse<T> | T

        if (statusCode === 401) {
          reject(new BizError(20001, 'AUTH_TOKEN_INVALID'))
          return
        }
        if (statusCode >= 500) {
          reject(new Error(`服务异常 (${statusCode})`))
          return
        }
        if (statusCode === 200 || statusCode === 201) {
          if (body && typeof body === 'object' && 'code' in body) {
            const r = body as ApiResponse<T>
            if (r.code === 0) {
              resolve(r.data)
            } else {
              reject(new BizError(r.code, r.message, r.traceId))
            }
            return
          }
          resolve(body as T)
          return
        }
        if (statusCode === 400 && body && typeof body === 'object' && 'code' in body) {
          const r = body as ApiResponse<T>
          reject(new BizError(r.code, r.message, r.traceId))
          return
        }
        reject(new Error(`HTTP ${statusCode}`))
      },
      fail: (err) => {
        reject(new Error(err.errMsg ?? '网络异常，请稍后再试'))
      }
    })
  })
}

/**
 * 公开请求函数（带 401 自动 refresh + 网络重试 + 错误 toast）
 * @param opt 请求选项
 * @returns 解包后业务数据
 */
export async function request<T = unknown>(opt: RequestOptions): Promise<T> {
  const retry = opt.retry ?? 3
  const silent = opt.silent ?? false
  let lastError: unknown

  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      return await rawRequest<T>(opt)
    } catch (e) {
      lastError = e
      if (e instanceof BizError) {
        // 401 → 尝试 refresh + 重放一次
        if (e.code === 20001 && !opt.skipAuthRefresh) {
          const newToken = await refreshAccessToken()
          if (newToken) {
            try {
              return await rawRequest<T>(opt)
            } catch (retryErr) {
              if (retryErr instanceof BizError && retryErr.code === 20001) {
                redirectLogin()
              } else if (retryErr instanceof BizError) {
                handleBizError(retryErr.code, retryErr.message, silent)
              }
              throw retryErr
            }
          }
          redirectLogin()
          handleBizError(e.code, '登录已过期', silent)
          throw e
        }
        // 其他业务错误：toast + 抛出
        handleBizError(e.code, e.message, silent)
        throw e
      }
      // 网络错误：指数退避重试
      if (attempt < retry) {
        logger.warn('request.retry', { url: opt.url, attempt: attempt + 1 })
        await backoff(attempt)
        continue
      }
      if (!silent) {
        uni.showToast({ title: '网络异常，请稍后再试', icon: 'none' })
      }
      throw e
    }
  }
  throw lastError
}

/** GET 快捷方法 */
export function get<T = unknown>(
  url: string,
  query?: Record<string, unknown>,
  opt?: Omit<RequestOptions, 'url' | 'method' | 'data'>
): Promise<T> {
  let finalUrl = url
  if (query && Object.keys(query).length > 0) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) finalUrl = `${url}${url.includes('?') ? '&' : '?'}${qs}`
  }
  return request<T>({ ...opt, url: finalUrl, method: 'GET' })
}

/** POST 快捷方法 */
export function post<T = unknown>(
  url: string,
  data?: unknown,
  opt?: Omit<RequestOptions, 'url' | 'method' | 'data'>
): Promise<T> {
  return request<T>({ ...opt, url, method: 'POST', data })
}

/** PUT 快捷方法 */
export function put<T = unknown>(
  url: string,
  data?: unknown,
  opt?: Omit<RequestOptions, 'url' | 'method' | 'data'>
): Promise<T> {
  return request<T>({ ...opt, url, method: 'PUT', data })
}

/** PATCH 快捷方法 */
export function patch<T = unknown>(
  url: string,
  data?: unknown,
  opt?: Omit<RequestOptions, 'url' | 'method' | 'data'>
): Promise<T> {
  return request<T>({ ...opt, url, method: 'PATCH', data })
}

/** DELETE 快捷方法 */
export function del<T = unknown>(
  url: string,
  opt?: Omit<RequestOptions, 'url' | 'method' | 'data'>
): Promise<T> {
  return request<T>({ ...opt, url, method: 'DELETE' })
}

/**
 * 生成幂等 key（下单等场景）
 * @returns 32 位随机 hex
 */
export function genIdemKey(): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}
