<script setup lang="ts">
  import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'

  /**
   * 应用根组件
   * 功能：拦截 APP / 小程序生命周期，后续用于订单语音提醒、登录态恢复等
   * 参数：无
   * 返回值：无
   * 用途：P6 阶段扩展全局逻辑；P1 仅记录启动日志
   */
  onLaunch(() => {
    console.log('[O2O 商户端] onLaunch')
  })

  onShow(() => {
    console.log('[O2O 商户端] onShow')
  })

  onHide(() => {
    console.log('[O2O 商户端] onHide')
  })
</script>

<style lang="scss">
  /* 全局样式入口 */
</style>
