/**
 * @file logger.ts
 * @stage P5/T5.3 (Sprint 1)
 * @desc 统一日志封装：禁止 console.log；按 level 走 console.warn/error 与 uni.log
 * @author 单 Agent V2.0
 */

/** 允许的日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * 读取运行时 mode（dev / prod）
 * 功能：仅 dev 输出 debug/info；prod 仅 warn/error
 */
function isDev(): boolean {
  const env = (import.meta as unknown as { env?: { MODE?: string; DEV?: boolean } }).env
  return Boolean(env?.DEV) || env?.MODE === 'development'
}

/**
 * 内部统一输出
 * @param level 日志级别
 * @param tag 业务标签（如 `app.launch`）
 * @param payload 任意结构化负载
 */
function emit(level: LogLevel, tag: string, payload?: unknown): void {
  const time = new Date().toISOString()
  const line = `[${time}] [${level.toUpperCase()}] [${tag}]`
  if (level === 'error') {
    console.error(line, payload ?? '')
  } else if (level === 'warn') {
    console.warn(line, payload ?? '')
  } else if (isDev()) {
    console.warn(line, payload ?? '')
  }
}

/** Logger API */
export const logger = {
  /** 调试级（仅 dev 输出） */
  debug(tag: string, payload?: unknown) {
    emit('debug', tag, payload)
  },
  /** 普通信息（仅 dev 输出） */
  info(tag: string, payload?: unknown) {
    emit('info', tag, payload)
  },
  /** 警告（始终输出） */
  warn(tag: string, payload?: unknown) {
    emit('warn', tag, payload)
  },
  /** 错误（始终输出） */
  error(tag: string, payload?: unknown) {
    emit('error', tag, payload)
  }
}
