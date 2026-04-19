/**
 * @file subscribe.ts
 * @stage P7/T7.1 (Sprint 1)
 * @desc 订阅消息授权封装：骑手端为 iOS/Android APP，无微信小程序，
 *   故全量降级为系统通知权限申请（POST_NOTIFICATIONS / iOS 通知设置）。
 *
 * 与商户端 / 用户端保持同名 export 便于复用 store 模式。
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'

/**
 * 申请系统通知权限（APP 端）
 * @returns 'granted' / 'denied' / 'unknown'
 */
export function requestNotifyPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  return new Promise((resolve) => {
    try {
      const p = (
        globalThis as {
          plus?: {
            push?: { setAlias?: () => void }
            runtime?: { hasPermission?: (k: string) => string }
          }
        }
      ).plus
      if (!p) {
        resolve('unknown')
        return
      }
      /* HBuilderX 5+ APP 通知权限通常通过 plus.android.requestPermissions 或 iOS 推送注册触发 */
      try {
        uni.getSetting({
          success: (res) => {
            const auth = res.authSetting as unknown as Record<string, boolean | undefined>
            const v = auth?.['scope.notification']
            resolve(v === true ? 'granted' : v === false ? 'denied' : 'unknown')
          },
          fail: () => resolve('unknown')
        })
      } catch (e) {
        logger.warn('subscribe.notify.getSetting.fail', { e: String(e) })
        resolve('unknown')
      }
    } catch (e) {
      logger.warn('subscribe.notify.fail', { e: String(e) })
      resolve('unknown')
    }
  })
}

/**
 * 兼容商户端 API：无小程序模板订阅，直接返回空 Map
 * @param _tmplIds 仅占位
 */
export function requestSubscribe(
  _tmplIds: string[]
): Promise<Record<string, 'accept' | 'reject' | 'ban' | 'unknown'>> {
  return Promise.resolve({})
}
