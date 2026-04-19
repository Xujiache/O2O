<script setup lang="ts">
  import { onLaunch, onShow, onHide, onError } from '@dcloudio/uni-app'
  import { useAppStore, useAuthStore, useShopStore } from '@/store'
  import { startWs, stopWs } from '@/utils/ws'
  import { startSilentAudio, stopSilentAudio } from '@/utils/ringtone'
  import { startForegroundService, stopForegroundService } from '@/utils/foreground-service'
  import { onJPushNotificationClick } from '@/utils/jpush'
  import { logger } from '@/utils/logger'
  import { captureException } from '@/utils/sentry'

  /**
   * 商户端根组件
   *
   * 生命周期：
   *   onLaunch  → 恢复 store / 启动 WS / 启动保活 / 监听极光推送点击
   *   onShow    → 应用前台时启动 WS（如未连接）
   *   onHide    → 应用后台不主动断 WS（依赖前台服务保活）
   *   onError   → 全局未捕获错误上报 Sentry
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */

  const appStore = useAppStore()
  const authStore = useAuthStore()
  const shopStore = useShopStore()

  function bootBackgroundServices() {
    if (!authStore.isLogin) return
    /* 启动 WebSocket */
    if (authStore.profile?.id) {
      startWs(authStore.profile.id, shopStore.currentShopId || undefined)
    }
    /* 启动 Android 前台服务（仅 Android） */
    startForegroundService()
    /* 启动 iOS 静音保活（仅 iOS） */
    startSilentAudio()
  }

  function teardownBackgroundServices() {
    stopWs()
    stopForegroundService()
    stopSilentAudio()
  }

  onLaunch(() => {
    logger.info('app.launch', {
      isLogin: authStore.isLogin,
      shopId: shopStore.currentShopId
    })
    /* 监听推送通知点击：跳转订单详情 */
    onJPushNotificationClick((payload) => {
      const orderNo = payload.orderNo as string | undefined
      if (orderNo) {
        uni.navigateTo({ url: `/pages-order/detail?orderNo=${orderNo}` })
      }
    })
    bootBackgroundServices()
  })

  onShow(() => {
    appStore.onForeground()
    if (authStore.isLogin && authStore.profile?.id) {
      startWs(authStore.profile.id, shopStore.currentShopId || undefined)
    }
  })

  onHide(() => {
    appStore.onForeground()
    /* APP 后台时保留 WS 与 ForegroundService（不调用 teardown） */
  })

  onError((err) => {
    logger.error('app.uncaught', { err })
    captureException(err)
  })

  /** 暴露给子页面调用：退出登录后调用以清理后台服务 */
  defineExpose({ teardownBackgroundServices })
</script>

<style lang="scss">
  /* 全局样式入口（uni.scss 已注入；此处仅写跨页面统一样式） */
  page {
    font-family:
      -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', Helvetica, Arial,
      sans-serif;
    font-size: 28rpx;
    color: $uni-text-color;
    background: $uni-bg-color-grey;
  }

  .row {
    display: flex;
    align-items: center;
  }

  .row-between {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .row-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col {
    display: flex;
    flex-direction: column;
  }

  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
