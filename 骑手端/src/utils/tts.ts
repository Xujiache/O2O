/**
 * @file tts.ts
 * @stage P7/T7.14 (Sprint 2) + T7.43 (Sprint 6)
 * @desc 文字转语音播报（中文）
 *
 * 平台支持：
 *   - APP（5+）：plus.speech.speak（中文 zh-CN）
 *   - H5：使用 SpeechSynthesisUtterance（如可用）
 *   - 其他：降级为震动 + toast
 *
 * 实现策略：用运行时检测代替 #ifdef，避免 TS unreachable-code
 *   plus.speech.speak() 是 5+ 文档暴露但 @dcloudio/types 未声明的方法
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'

/** 5+ plus.speech 自定义类型 */
interface PlusSpeechCustom {
  speak: (
    opt: { text: string; lang?: string; rate?: number; pitch?: number },
    success?: () => void,
    error?: (e: unknown) => void
  ) => void
  stop: () => void
}

/** 安全获取 plus.speech */
function getSpeech(): PlusSpeechCustom | null {
  try {
    const p = (globalThis as { plus?: { speech?: unknown } }).plus
    if (p?.speech) return p.speech as PlusSpeechCustom
  } catch {
    /* ignore */
  }
  return null
}

let isSpeaking = false

/** 检测当前 TTS 后端 */
function detectBackend(): 'app' | 'h5' | 'mp' {
  if (getSpeech()) return 'app'
  if (typeof window !== 'undefined') {
    const w = window as unknown as { speechSynthesis?: unknown }
    if (w.speechSynthesis) return 'h5'
  }
  return 'mp'
}

/**
 * 播放 TTS 文本
 * @param text 中文文本
 * @param opt rate 语速 0.5-2.0；pitch 音调 0.5-2.0；volume 0-1（仅 H5）
 */
export function playTTS(
  text: string,
  opt: { rate?: number; pitch?: number; volume?: number } = {}
): Promise<void> {
  return new Promise((resolve) => {
    if (!text) {
      resolve()
      return
    }
    const backend = detectBackend()

    if (backend === 'app') {
      try {
        const speech = getSpeech()
        if (speech) {
          isSpeaking = true
          speech.speak(
            {
              text,
              lang: 'zh-CN',
              rate: opt.rate ?? 1.0,
              pitch: opt.pitch ?? 1.0
            },
            () => {
              isSpeaking = false
              resolve()
            },
            (e: unknown) => {
              isSpeaking = false
              logger.warn('tts.app.fail', { e: String(e) })
              resolve()
            }
          )
          return
        }
      } catch (e) {
        logger.warn('tts.app.error', { e: String(e) })
      }
      resolve()
      return
    }

    if (backend === 'h5') {
      try {
        type Utter = {
          lang: string
          rate: number
          pitch: number
          volume: number
          onend: () => void
        }
        const w = window as unknown as {
          speechSynthesis?: { speak: (u: Utter) => void; cancel: () => void }
          SpeechSynthesisUtterance?: new (text: string) => Utter
        }
        if (w.speechSynthesis && w.SpeechSynthesisUtterance) {
          const utter = new w.SpeechSynthesisUtterance(text)
          utter.lang = 'zh-CN'
          utter.rate = opt.rate ?? 1.0
          utter.pitch = opt.pitch ?? 1.0
          utter.volume = opt.volume ?? 1.0
          utter.onend = () => resolve()
          w.speechSynthesis.speak(utter)
          return
        }
      } catch (e) {
        logger.warn('tts.h5.fail', { e: String(e) })
      }
      resolve()
      return
    }

    /* mp 与其他平台：降级为震动 + toast */
    try {
      uni.vibrateLong({})
      uni.showToast({ title: text, icon: 'none', duration: 3000 })
    } catch (e) {
      logger.warn('tts.mp.fallback.fail', { e: String(e) })
    }
    resolve()
  })
}

/** 停止当前 TTS 播报 */
export function stopTTS(): void {
  try {
    const speech = getSpeech()
    if (speech) {
      speech.stop()
      isSpeaking = false
      return
    }
  } catch {
    /* noop */
  }
  try {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { speechSynthesis?: { cancel: () => void } }
      w.speechSynthesis?.cancel()
    }
  } catch {
    /* noop */
  }
}

/** 当前是否正在播报 */
export function isTTSSpeaking(): boolean {
  return isSpeaking
}

/**
 * 派单专用 TTS 文案构造器
 * 例：buildDispatchSpeech({ businessType: 'takeout', distance: 850, fee: 12.5 })
 *      → "新订单，外卖，距离 850 米，预估 12 元"
 */
export function buildDispatchSpeech(opt: {
  businessType: 'takeout' | 'errand'
  distance: number
  fee: number | string
}): string {
  const biz = opt.businessType === 'takeout' ? '外卖' : '跑腿'
  const dist =
    opt.distance < 1000
      ? `${Math.round(opt.distance)} 米`
      : `${(opt.distance / 1000).toFixed(1)} 公里`
  const fee = Math.round(Number(opt.fee))
  return `新订单，${biz}，距离 ${dist}，预估 ${fee} 元`
}
