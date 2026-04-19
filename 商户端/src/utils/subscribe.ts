/**
 * @file subscribe.ts
 * @stage P6/T6.2 (Sprint 1)
 * @desc 微信订阅消息授权封装：仅小程序版生效；APP 版直接 resolve 空
 *   商户端订阅模板：新订单 / 订单状态变更 / 退款申请 / 提现结果
 *   失败时不阻塞业务（与 P5 用户端策略一致）
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'
import { track, TRACK } from './track'

/**
 * 请求订阅消息授权
 * @param tmplIds 模板 ID 列表（从后端 /merchant/messages/subscribe-templates 拿）
 * @returns Map<tmplId, 'accept'|'reject'|'ban'|'unknown'>
 */
export function requestSubscribe(
  tmplIds: string[]
): Promise<Record<string, 'accept' | 'reject' | 'ban' | 'unknown'>> {
  return new Promise((resolve) => {
    if (!tmplIds || tmplIds.length === 0) {
      resolve({})
      return
    }
    track('request_subscribe', { count: tmplIds.length })
    /* 仅微信小程序生效；H5 / App 直接 resolve 空 */
    interface SubscribeFn {
      (opt: {
        tmplIds: string[]
        success?: (res: Record<string, string>) => void
        fail?: (err: { errMsg?: string }) => void
      }): void
    }
    const u = uni as unknown as { requestSubscribeMessage?: SubscribeFn }
    const req = u.requestSubscribeMessage
    if (typeof req !== 'function') {
      resolve({})
      return
    }
    req({
      tmplIds,
      success: (res: Record<string, string>) => {
        const result: Record<string, 'accept' | 'reject' | 'ban' | 'unknown'> = {}
        let acceptCount = 0
        for (const id of tmplIds) {
          const v = res[id]
          if (v === 'accept' || v === 'reject' || v === 'ban') {
            result[id] = v
            if (v === 'accept') acceptCount += 1
          } else {
            result[id] = 'unknown'
          }
        }
        if (acceptCount > 0) track(TRACK.RECEIVE_NEW_ORDER, { count: acceptCount, ack: 'accept' })
        else track('subscribe_reject', { count: tmplIds.length })
        resolve(result)
      },
      fail: (err: { errMsg?: string }) => {
        logger.warn('subscribe.fail', { err: String(err.errMsg ?? '') })
        const result: Record<string, 'accept' | 'reject' | 'ban' | 'unknown'> = {}
        for (const id of tmplIds) result[id] = 'unknown'
        resolve(result)
      }
    })
  })
}
