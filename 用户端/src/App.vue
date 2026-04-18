<script setup lang="ts">
  import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'

  /**
   * 应用根组件
   * 功能：拦截小程序生命周期，后续用于埋点、更新检查、登录态恢复等
   * 参数：无
   * 返回值：无
   * 用途：P5 阶段扩展全局逻辑；P1 仅记录启动日志
   */
  onLaunch(() => {
    console.log('[O2O 用户端] onLaunch')
  })

  onShow(() => {
    console.log('[O2O 用户端] onShow')
  })

  onHide(() => {
    console.log('[O2O 用户端] onHide')
  })
</script>

<style lang="scss">
  /* 全局样式入口，后续在 src/uni.scss 与各端单独扩展 */
</style>
