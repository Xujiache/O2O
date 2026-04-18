import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'

/**
 * 统一 API 响应体结构（后端 NestJS 全局响应拦截器约定，详见 DESIGN_P1 §4）
 * - 成功：code === 0
 * - 失败：code !== 0（HttpException 为 HTTP 状态码；未捕获异常为 1000 兜底）
 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp?: number
}

/**
 * 读取 Vite 注入的运行时环境变量
 * 功能：屏蔽 uni-app / Vite / 原生 APP 环境变量差异
 * 参数：key 环境变量键名
 * 返回值：string 对应值（未定义时回退空串）
 * 用途：request 实例中读取 VITE_API_BASE_URL 等
 */
function getEnv(key: string): string {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env
  if (viteEnv && key in viteEnv) return viteEnv[key] ?? ''
  return ''
}

/**
 * 从带 /api/vN 前缀的 base URL 中剥离出根域名
 * 功能：fetchHealth 等根级端点（如 /health、/docs）需要跳过 /api/v1 前缀
 * 参数：url 形如 http://host:port/api/v1
 * 返回值：去掉尾部 /api/vN(/ 可选) 的根 URL
 * 用途：rootRequest 的 baseURL 计算（I-01 修复根因）
 */
function stripApiPrefix(url: string): string {
  return url.replace(/\/api\/v\d+\/?$/i, '')
}

const apiBase = getEnv('VITE_API_BASE_URL') || 'http://localhost:3000/api/v1'
const rootBase = stripApiPrefix(apiBase)
const timeout = Number(getEnv('VITE_API_TIMEOUT')) || 15000

/**
 * 为任意 axios 实例安装「请求 / 响应」拦截器
 * 功能：统一注入 token、统一解包 { code, message, data }、统一错误提示
 *       供 request（业务前缀 /api/v1）与 rootRequest（根级端点）共同复用
 * 参数：instance axios 实例；name 实例名称（仅用于调试日志区分）
 * 返回值：AxiosInstance（原实例，便于链式调用）
 * 用途：createRequest / createRootRequest 内部调用，禁止对外直接使用
 */
function installInterceptors(instance: AxiosInstance, name: string): AxiosInstance {
  instance.interceptors.request.use(
    (config) => {
      try {
        const uniGlobal = (globalThis as { uni?: { getStorageSync?: (k: string) => string } }).uni
        const token = uniGlobal?.getStorageSync?.('token')
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`
        }
      } catch {
        /* H5 或非 uni 环境，静默忽略 */
      }
      return config
    },
    (err) => Promise.reject(err)
  )

  instance.interceptors.response.use(
    (res: AxiosResponse<ApiResponse>) => {
      const body = res.data
      if (body && body.code === 0) return body.data as unknown as AxiosResponse
      return Promise.reject(new Error(body?.message || `[${name}] 业务错误`))
    },
    (err) => {
      const message = err?.response?.data?.message || err.message || '网络异常，请稍后再试'
      return Promise.reject(new Error(message))
    }
  )
  return instance
}

/**
 * 创建业务 API axios 实例（baseURL 含 /api/v1 前缀）
 * 功能：所有业务 API 请求走同一实例
 * 参数：无
 * 返回值：AxiosInstance
 * 用途：P7+ 业务 API 封装统一依赖此实例
 */
function createRequest(): AxiosInstance {
  const instance = axios.create({
    baseURL: apiBase,
    timeout,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
  return installInterceptors(instance, 'request')
}

/**
 * 创建根级 API axios 实例（baseURL 不含 /api/v1）
 * 功能：专供 /health、/docs 等不在业务前缀下的系统级端点调用
 * 参数：无
 * 返回值：AxiosInstance
 * 用途：api/index.ts 的 fetchHealth 等系统端点；避免 404（I-01）
 */
function createRootRequest(): AxiosInstance {
  const instance = axios.create({
    baseURL: rootBase,
    timeout,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
  return installInterceptors(instance, 'rootRequest')
}

export const request = createRequest()
export const rootRequest = createRootRequest()

/**
 * 通用 GET 请求（走 /api/v1 前缀）
 * 参数：url 路径；config axios 可选配置
 * 返回值：Promise<T> 解包后的业务数据
 */
export function get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request.get(url, config) as unknown as Promise<T>
}

/**
 * 通用 POST 请求（走 /api/v1 前缀）
 * 参数：url 路径；data 请求体；config axios 可选配置
 * 返回值：Promise<T> 解包后的业务数据
 */
export function post<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  return request.post(url, data, config) as unknown as Promise<T>
}
