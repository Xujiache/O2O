import { rootRequest } from '@/utils/request'

/**
 * 健康检查（调试用）
 * 功能：调用后端 /health 验证前后端联通
 * 参数：无
 * 返回值：Promise<{ status: string; info?: unknown; error?: unknown; details?: unknown }>
 *         —— 与 @nestjs/terminus 标准返回结构对齐（见 DESIGN_P1 §4.3）
 * 用途：P1 联调时可在任意页面 onMounted 中调用确认链路；
 *       改用 rootRequest 避免带上 /api/v1 前缀造成 404（I-01 修复）
 */
export function fetchHealth(): Promise<{
  status: string
  info?: unknown
  error?: unknown
  details?: unknown
}> {
  return rootRequest.get('/health') as unknown as Promise<{
    status: string
    info?: unknown
    error?: unknown
    details?: unknown
  }>
}
