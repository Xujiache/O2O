<script setup lang="ts">
  import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'

  /**
   * 应用根组件
   * 功能：拦截 APP 生命周期，后续用于定位上报、订单语音播报、后台保活
   * 参数：无
   * 返回值：无
   * 用途：P7 阶段扩展全局逻辑；P1 仅记录启动日志
   */
  onLaunch(() => {
    console.log('[O2O 骑手端] onLaunch')
  })

  onShow(() => {
    console.log('[O2O 骑手端] onShow')
  })

  onHide(() => {
    console.log('[O2O 骑手端] onHide')
  })
</script>

<style lang="scss">
  /* 全局样式入口 */
</style>
