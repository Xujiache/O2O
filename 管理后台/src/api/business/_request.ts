/**
 * 业务 axios 实例
 *
 * 区别于 `@/utils/http`（框架默认）：
 * - baseURL 统一加 `/admin` 前缀（与后端 P3/P4 admin namespace 对齐）
 * - 自动注入业务请求头：X-Client-Type / X-Admin-Id / X-Sign / X-Trace-Id
 * - 401 单飞处理（避免并发刷新风暴）
 * - 请求/响应日志埋点（traceId）
 *
 * @module api/business/_request
 */
import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig
} from 'axios'
import { useUserStore } from '@/store/modules/user'
import { ApiStatus } from '@/utils/http/status'
import { genTraceId } from '@/utils/business/trace'
import { genNonce, genSign } from '@/utils/business/sign'
import { isMockEnabled, mockDispatch } from './_mock'
import type { BaseResponse } from '@/types'

interface BizRequestConfig extends AxiosRequestConfig {
  /** 是否需要签名（写操作通常 true） */
  needSign?: boolean
  /** 是否抛出业务错误（默认 true） */
  throwBizError?: boolean
  /** 是否静默 401（默认 false 走全局重定向登录） */
  silent401?: boolean
}

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  needSign?: boolean
  silent401?: boolean
  throwBizError?: boolean
}

const { VITE_API_URL } = import.meta.env as Record<string, string>
const ADMIN_SIGN_SECRET = (import.meta.env.VITE_ADMIN_SIGN_SECRET as string | undefined) || ''
const ADMIN_BASE = '/admin'

const instance: AxiosInstance = axios.create({
  timeout: 20_000,
  baseURL: (VITE_API_URL || '/').replace(/\/$/, '') + ADMIN_BASE,
  validateStatus: (s) => s >= 200 && s < 300
})

let unauthorizedShowing = false
let unauthorizedTimer: ReturnType<typeof setTimeout> | null = null

instance.interceptors.request.use((config: ExtendedAxiosRequestConfig) => {
  const userStore = useUserStore()
  const ts = Date.now()
  const nonce = genNonce()
  const traceId = genTraceId()

  config.headers = config.headers || ({} as InternalAxiosRequestConfig['headers'])
  config.headers.set('X-Client-Type', 'admin')
  config.headers.set('X-Trace-Id', traceId)
  config.headers.set('X-Timestamp', String(ts))
  config.headers.set('X-Nonce', nonce)
  if (userStore.accessToken) {
    config.headers.set('Authorization', `Bearer ${userStore.accessToken}`)
  }
  if (userStore.info?.userId) {
    config.headers.set('X-Admin-Id', String(userStore.info.userId))
  }

  if (config.needSign) {
    const params = (config.params || {}) as Record<string, unknown>
    const data =
      config.data && typeof config.data === 'object' ? (config.data as Record<string, unknown>) : {}
    const sign = genSign({ ...params, ...data }, ts, nonce, ADMIN_SIGN_SECRET || undefined)
    config.headers.set('X-Sign', sign)
  }

  if (config.data && !(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers.set('Content-Type', 'application/json')
  }
  return config
})

instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status
    const cfg = error?.config as ExtendedAxiosRequestConfig | undefined
    if (status === ApiStatus.unauthorized && !cfg?.silent401) {
      handleUnauthorizedDebounced()
    }
    return Promise.reject(error)
  }
)

function handleUnauthorizedDebounced(): void {
  if (unauthorizedShowing) return
  unauthorizedShowing = true
  try {
    useUserStore().logOut()
  } catch {
    /* ignore */
  }
  if (unauthorizedTimer) clearTimeout(unauthorizedTimer)
  unauthorizedTimer = setTimeout(() => {
    unauthorizedShowing = false
  }, 3000)
}

function normalizeBizPayload<T>(payload: T): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }
  const pagePayload = payload as {
    list?: unknown
    meta?: { page?: unknown; pageSize?: unknown; total?: unknown }
    records?: unknown
  }
  if (
    Array.isArray(pagePayload.list) &&
    pagePayload.records === undefined &&
    pagePayload.meta &&
    typeof pagePayload.meta === 'object'
  ) {
    const { page, pageSize, total } = pagePayload.meta
    if (typeof page === 'number' && typeof pageSize === 'number' && typeof total === 'number') {
      return {
        ...(payload as Record<string, unknown>),
        records: pagePayload.list,
        total,
        page,
        pageSize
      } as T
    }
  }
  return payload
}

/**
 * 业务请求统一入口
 *
 * @param config 业务 axios 配置
 * @returns 后端 BaseResponse 中的 data 字段
 */
export async function bizRequest<T = unknown>(config: BizRequestConfig): Promise<T> {
  const finalConfig: ExtendedAxiosRequestConfig = {
    ...config
  } as ExtendedAxiosRequestConfig
  if (
    ['POST', 'PUT'].includes(String(config.method || 'GET').toUpperCase()) &&
    config.params &&
    !config.data
  ) {
    finalConfig.data = config.params
    finalConfig.params = undefined
  }
  if (isMockEnabled() && config.url) {
    const params = (finalConfig.params || {}) as Record<string, unknown>
    const mocked = await mockDispatch<T>(
      config.url,
      String(config.method || 'GET'),
      params,
      finalConfig.data
    )
    if (mocked.matched) return mocked.data as T
  }
  const res = await instance.request<BaseResponse<T>>(finalConfig)
  const body = res.data
  if (body && body.code === ApiStatus.success) {
    return normalizeBizPayload(body.data as T)
  }
  if (config.throwBizError === false) {
    return (body?.data as T) ?? (undefined as unknown as T)
  }
  throw new Error(body?.msg || '业务请求失败')
}

export const bizApi = {
  get<T = unknown>(url: string, params?: Record<string, unknown>, opts?: BizRequestConfig) {
    return bizRequest<T>({ ...opts, url, method: 'GET', params })
  },
  post<T = unknown>(url: string, data?: unknown, opts?: BizRequestConfig) {
    return bizRequest<T>({ ...opts, url, method: 'POST', data, needSign: opts?.needSign ?? true })
  },
  put<T = unknown>(url: string, data?: unknown, opts?: BizRequestConfig) {
    return bizRequest<T>({ ...opts, url, method: 'PUT', data, needSign: opts?.needSign ?? true })
  },
  del<T = unknown>(url: string, params?: Record<string, unknown>, opts?: BizRequestConfig) {
    return bizRequest<T>({
      ...opts,
      url,
      method: 'DELETE',
      params,
      needSign: opts?.needSign ?? true
    })
  }
}
