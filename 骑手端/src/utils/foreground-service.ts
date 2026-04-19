/**
 * @file foreground-service.ts
 * @stage P7/T7.27 (Sprint 4)
 * @desc Android 前台服务：保活定位上报，息屏 30min 仍能持续 10s/次
 *
 * P6-R1 / I-01 经验：nativePlugin 必须真编 Java 源码（不能仅留 TODO）
 *   骑手端 nativeplugins/Rider-LocationFgs/ 真实写 Java + AndroidManifest
 *   插件名 'Rider-LocationFgs'，与 nativeplugins 目录一致
 *
 * V7.22 验收：Android 熄屏 30min 持续上报，单量不遗漏
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'

interface FgsPlugin {
  start: (opt: { title: string; content: string; iconRes?: string; intervalMs?: number }) => void
  stop: () => void
  /** 更新通知栏文案（如：已在线 X 分钟） */
  updateContent?: (content: string) => void
}

let isRunning = false

/** 安全获取 nativePlugin（仅 Android APP 有效） */
function getPlugin(): FgsPlugin | null {
  try {
    const p = (globalThis as { plus?: unknown }).plus
    if (!p) return null
    const sys = uni.getSystemInfoSync()
    if (sys.platform !== 'android') return null
    const moduleApi = uni.requireNativePlugin('Rider-LocationFgs') as FgsPlugin | null | undefined
    return moduleApi ?? null
  } catch (e) {
    logger.warn('fgs.plugin.fail', { e: String(e) })
    return null
  }
}

/**
 * 启动 Android 前台服务（绑定 LocationManager 自驱定位上报）
 * @param opt 通知标题与内容、上报间隔
 */
export function startForegroundService(
  opt: {
    title?: string
    content?: string
    iconRes?: string
    intervalMs?: number
  } = {}
): boolean {
  const plugin = getPlugin()
  if (!plugin) {
    logger.warn('fgs.plugin.missing', {
      hint: 'Rider-LocationFgs nativePlugin 未注册或非 Android'
    })
    return false
  }
  try {
    plugin.start({
      title: opt.title ?? 'O2O 骑手端 · 接单服务',
      content: opt.content ?? '正在接收新订单',
      iconRes: opt.iconRes ?? 'mipmap/ic_launcher',
      intervalMs: opt.intervalMs ?? 10_000
    })
    isRunning = true
    logger.info('fgs.start.ok', { intervalMs: opt.intervalMs ?? 10_000 })
    return true
  } catch (e) {
    logger.warn('fgs.start.fail', { e: String(e) })
    return false
  }
}

/** 更新通知栏文案（如：已在线 X 分钟） */
export function updateForegroundContent(content: string): void {
  const plugin = getPlugin()
  if (!plugin || !plugin.updateContent) return
  try {
    plugin.updateContent(content)
  } catch (e) {
    logger.warn('fgs.update.fail', { e: String(e) })
  }
}

/** 停止前台服务（下班时调用） */
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
