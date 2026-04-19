<script setup lang="ts">
  /**
   * @file App.vue
   * @stage P5/T5.5 (Sprint 1)
   * @desc 应用根组件：拦截小程序生命周期，恢复登录态、初始化定位、初始化 WebSocket
   * @author 单 Agent V2.0
   */
  import { onLaunch, onShow, onHide, onError } from '@dcloudio/uni-app'
  import { useUserStore } from '@/store/user'
  import { useAppStore } from '@/store/app'
  import { logger } from '@/utils/logger'

  /**
   * 应用启动：恢复 token、上报启动事件、初始化 store
   * 注（P5-REVIEW-01 R1 / I-04）：user store 已挂载 pinia-plugin-persistedstate
   * 自动从 'o2o_user' key 恢复 token/refreshToken/profile；这里 user.restore()
   * 作为 P3/P4 既有 STORAGE_KEYS 的双保险（避免老安装包升级丢登录态）
   */
  onLaunch(() => {
    const app = useAppStore()
    const user = useUserStore()
    app.initSysInfo()
    user.restore()
    logger.info('app.launch', { version: app.appVersion })
  })

  /** 应用前台 */
  onShow(() => {
    const app = useAppStore()
    app.onForeground()
  })

  /** 应用后台 */
  onHide(() => {
    const app = useAppStore()
    app.onBackground()
  })

  /** 全局异常 */
  onError((err) => {
    logger.error('app.error', { err: String(err) })
  })
</script>

<style lang="scss">
  /* 全局重置 */
  page {
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      'Helvetica Neue',
      Helvetica,
      Segoe UI,
      Arial,
      Roboto,
      'PingFang SC',
      'Microsoft YaHei',
      sans-serif;
    color: $color-text-primary;
    background-color: $color-bg-page;
  }

  view,
  scroll-view,
  swiper,
  swiper-item {
    box-sizing: border-box;
  }

  /* 通用 page 容器 */
  .page {
    min-height: 100vh;
    background: $color-bg-page;
  }

  .page-white {
    min-height: 100vh;
    background: $color-bg-white;
  }

  /* 文本颜色辅助类 */
  .text-primary {
    color: $color-text-primary;
  }

  .text-regular {
    color: $color-text-regular;
  }

  .text-secondary {
    color: $color-text-secondary;
  }

  .text-brand {
    color: $color-primary;
  }

  .text-danger {
    color: $color-danger;
  }

  .text-bold {
    font-weight: $font-weight-bold;
  }

  .text-medium {
    font-weight: $font-weight-medium;
  }

  /* Flex 辅助类 */
  .flex-1 {
    flex: 1;
  }

  .row {
    display: flex;
    flex-direction: row;
  }

  .col {
    display: flex;
    flex-direction: column;
  }

  /* 通用卡片 */
  .card {
    background: $color-bg-white;
    border-radius: $radius-md;
    box-shadow: $shadow-sm;
  }

  /* 安全区 */
  .safe-bottom {
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
