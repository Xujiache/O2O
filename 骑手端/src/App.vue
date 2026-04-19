<script setup lang="ts">
  import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
  import { logger } from '@/utils/logger'
  import { initSentry, captureException } from '@/utils/sentry'
  import { startWs, stopWs } from '@/utils/ws'
  import { onJPushNotificationClick, onJPushTransparentMessage } from '@/utils/jpush'
  import { useAuthStore } from '@/store/auth'
  import { useDispatchStore } from '@/store/dispatch'
  import { useOrderStore } from '@/store/order'
  import { useMsgStore } from '@/store/msg'
  import { useWalletStore } from '@/store/wallet'
  import { useLocationStore } from '@/store/location'
  import type { DispatchOrder, RiderOrder, Message } from '@/types/biz'

  /**
   * 应用根组件
   * 功能：拦截 APP 生命周期，统一启动 Sentry / WS / JPush 监听 / 推动 store 持久化恢复
   * 用途：P7 主入口；S1 注入基础设施，后续 Sprint 在此扩展
   */
  onLaunch(() => {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env
    /* Sentry：dsn 为空则自动跳过 */
    initSentry({
      dsn: env?.VITE_SENTRY_DSN ?? '',
      environment: env?.VITE_APP_ENV ?? 'development',
      release: env?.VITE_APP_VERSION ?? '0.1.0'
    })

    /* 全局未捕获异常上报 */
    try {
      const p = (
        globalThis as {
          plus?: { runtime?: { uncaughtException?: (cb: (e: Error) => void) => void } }
        }
      ).plus
      if (p?.runtime?.uncaughtException) {
        p.runtime.uncaughtException((e: Error) => captureException(e, { source: 'plus.runtime' }))
      }
    } catch (e) {
      logger.warn('app.launch.crash-handler.fail', { e: String(e) })
    }

    /* 恢复 auth store */
    const auth = useAuthStore()
    auth.restore()

    /* 已登录则启动 WS + 监听极光推送回调 */
    if (auth.isLoggedIn && auth.user?.id) {
      startWs(auth.user.id)
    }
    onJPushNotificationClick((payload) => {
      const orderNo = (payload?.orderNo ?? payload?.order_no) as string | undefined
      if (orderNo) {
        uni.navigateTo({ url: `/pages-order/detail?orderNo=${orderNo}` })
      }
    })
    /* 透传消息：派单 / 转单结果 / 紧急回执（与 WS 双发） */
    onJPushTransparentMessage((payload) => {
      const topic = payload?.topic as string | undefined
      const data = (payload?.data ?? payload) as unknown
      if (!topic) return
      const dispatch = useDispatchStore()
      const order = useOrderStore()
      const msg = useMsgStore()
      const wallet = useWalletStore()
      switch (topic) {
        case 'rider:dispatch:new':
          dispatch.handleNewDispatch(data as DispatchOrder)
          break
        case 'rider:order:status:changed':
          order.handleStatusChanged(data as Partial<RiderOrder>)
          break
        case 'rider:transfer:result':
        case 'rider:order:abnormal:reply':
        case 'rider:emergency:ack':
          msg.handleSystemEvent(topic, data as Record<string, unknown>)
          break
        case 'rider:wallet:balance:changed':
          wallet.refresh()
          break
        case 'rider:message:new':
          msg.handleNewMessage(data as Message)
          break
        default:
          break
      }
    })

    logger.info('app.launch')
  })

  onShow(() => {
    /* 应用回到前台：检查 token 是否过期 / 重启 WS */
    const auth = useAuthStore()
    if (auth.isLoggedIn && auth.user?.id) {
      startWs(auth.user.id)
    }
    /* iOS 静音保活在前台时不需要，由 location store 在上下班切换时控制 */
    logger.info('app.show')
  })

  onHide(() => {
    /* 应用进入后台：保留 WS（由保活机制承接），但停止 UI 相关副作用 */
    const location = useLocationStore()
    void location.flushOnBackground()
    logger.info('app.hide')
  })

  /* 仅当 store 模块需要在 onLaunch 之前消费时调用，否则会在登出时直接调用 stopWs */
  void stopWs
</script>

<style lang="scss">
  /* 全局样式入口（uni.scss 全局变量已注入） */
  page {
    background-color: #f5f7fa;
  }
</style>
