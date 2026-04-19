/**
 * @file ringtone.ts
 * @stage P6/T6.20 (Sprint 3) + T6.42 (Sprint 6)
 * @desc 新订单铃声 + iOS 静音保活音频
 *
 * 调用：
 *   - startRingtone() / stopRingtone(): 新订单循环铃声
 *   - startSilentAudio() / stopSilentAudio(): iOS 后台保活
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'

let audioCtx: UniApp.InnerAudioContext | null = null
let isPlaying = false
let silentCtx: UniApp.InnerAudioContext | null = null

/** 默认铃声路径（uni-app 静态资源） */
const DEFAULT_RING = '/static/audio/new-order.mp3'
const SILENT_AUDIO = '/static/audio/silent.wav'

/** 安全检查 plus 是否存在（5+ APP 才有） */
function hasPlus(): boolean {
  try {
    const p = (globalThis as { plus?: unknown }).plus
    return Boolean(p)
  } catch {
    return false
  }
}

/**
 * 启动新订单铃声
 * @param opt loop 是否循环；volume 0-1
 */
export function startRingtone(opt: { loop?: boolean; volume?: number; src?: string } = {}): void {
  try {
    if (audioCtx) {
      stopRingtone()
    }
    audioCtx = uni.createInnerAudioContext()
    audioCtx.src = opt.src ?? DEFAULT_RING
    audioCtx.loop = opt.loop ?? true
    audioCtx.volume = opt.volume ?? 1.0
    audioCtx.autoplay = true
    audioCtx.onPlay(() => {
      isPlaying = true
      logger.info('ringtone.play')
    })
    audioCtx.onStop(() => {
      isPlaying = false
      logger.info('ringtone.stop')
    })
    audioCtx.onEnded(() => {
      if (audioCtx?.loop) return
      isPlaying = false
    })
    audioCtx.onError((err) => {
      logger.warn('ringtone.error', { err: String(err.errMsg ?? '') })
      isPlaying = false
    })
    audioCtx.play()
  } catch (e) {
    logger.warn('ringtone.start.fail', { e: String(e) })
  }
}

/** 停止铃声 */
export function stopRingtone(): void {
  try {
    if (audioCtx) {
      audioCtx.stop()
      audioCtx.destroy()
      audioCtx = null
    }
    isPlaying = false
  } catch (e) {
    logger.warn('ringtone.stop.fail', { e: String(e) })
  }
}

/** 当前是否在播放 */
export function isRingtonePlaying(): boolean {
  return isPlaying
}

/**
 * 启动静音保活音频（仅 iOS APP 端需要）
 * 0 分贝循环播放，欺骗 iOS 系统不挂起 APP
 */
export function startSilentAudio(): void {
  try {
    if (!hasPlus()) return
    const sys = uni.getSystemInfoSync()
    if (sys.platform !== 'ios') return
    if (silentCtx) return
    silentCtx = uni.createInnerAudioContext()
    silentCtx.src = SILENT_AUDIO
    silentCtx.loop = true
    silentCtx.volume = 0
    silentCtx.autoplay = true
    silentCtx.play()
    logger.info('keepalive.silent.start')
  } catch (e) {
    logger.warn('keepalive.silent.fail', { e: String(e) })
  }
}

/** 停止静音保活音频 */
export function stopSilentAudio(): void {
  try {
    if (silentCtx) {
      silentCtx.stop()
      silentCtx.destroy()
      silentCtx = null
    }
  } catch {
    /* noop */
  }
}
