/**
 * X-Trace-Id 生成与缓存
 *
 * 用途：所有业务请求自动注入 traceId，与后端操作日志 / 接口日志关联
 *
 * @module utils/business/trace
 */

import { STORAGE_KEYS, bizGet, bizSet } from './storage-keys'

/** 当前会话级 traceId 序列号 */
let seq = bizGet<number>(STORAGE_KEYS.TRACE_SEQ, 0)

/**
 * 生成 36 位 traceId：admin-{timestamp36}-{seq36}-{rand}
 */
export function genTraceId(): string {
  seq = (seq + 1) % 1_000_000
  bizSet(STORAGE_KEYS.TRACE_SEQ, seq)
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `admin-${ts}-${seq.toString(36)}-${rand}`
}
