/**
 * @file foreground-service.ts
 * @stage P6/T6.41 (Sprint 6)
 * @desc Android 前台服务：保活 WebSocket，息屏 30min 仍能收新单
 *
 * P6 范围：startForegroundService() / stopForegroundService() 接口
 *   真实 nativePlugin 编写归 S6 / T6.41 详细实现
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'

interface FgsPlugin {
  start: (opt: { title: string; content: string; iconRes?: string }) => void
  stop: () => void
}

let isRunning = false

/** 安全获取 nativePlugin（仅 Android APP 有效） */
function getPlugin(): FgsPlugin | null {
  try {
    const p = (globalThis as { plus?: unknown }).plus
    if (!p) return null
    const sys = uni.getSystemInfoSync()
    if (sys.platform !== 'android') return null
    const moduleApi = uni.requireNativePlugin('Mchnt-ForegroundService') as
      | FgsPlugin
      | null
      | undefined
    return moduleApi ?? null
  } catch (e) {
    logger.warn('fgs.plugin.fail', { e: String(e) })
    return null
  }
}

/**
 * 启动 Android 前台服务
 * @param opt 通知标题与内容
 */
export function startForegroundService(
  opt: {
    title?: string
    content?: string
    iconRes?: string
  } = {}
): boolean {
  const plugin = getPlugin()
  if (!plugin) {
    logger.warn('fgs.plugin.missing', {
      hint: 'Mchnt-ForegroundService nativePlugin 未注册或非 Android'
    })
    return false
  }
  try {
    plugin.start({
      title: opt.title ?? 'O2O 商户端 · 接单服务',
      content: opt.content ?? '正在接收新订单，请保持常驻',
      iconRes: opt.iconRes ?? 'mipmap/ic_launcher'
    })
    isRunning = true
    logger.info('fgs.start.ok')
    return true
  } catch (e) {
    logger.warn('fgs.start.fail', { e: String(e) })
    return false
  }
}

/** 停止前台服务 */
export function stopForegroundService(): void {
  const plugin = getPlugin()
  if (!plugin) return
  try {
    plugin.stop()
    isRunning = false
    logger.info('fgs.stop.ok')
  } catch (e) {
    logger.warn('fgs.stop.fail', { e: String(e) })
  }
}

/** 当前是否运行中 */
export function isFgsRunning(): boolean {
  return isRunning
}
