<template>
  <view class="page page-order">
    <BizEmpty title="订单管理" desc="将在 Sprint 3 上线，敬请期待" scene="order">
      <template #action>
        <button class="btn-back" @click="goWorkbench">返回工作台</button>
      </template>
    </BizEmpty>
  </view>
</template>

<script setup lang="ts">
  import { onLoad } from '@dcloudio/uni-app'
  import { track, TRACK } from '@/utils/track'

  /**
   * 订单管理（tabBar 占位 → S3 实现）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  onLoad(() => {
    track(TRACK.VIEW_ORDER_LIST)
  })

  function goWorkbench() {
    uni.switchTab({ url: '/pages/home/workbench' })
  }
</script>

<style lang="scss" scoped>
  .page-order {
    min-height: 100vh;
    background: $uni-bg-color-grey;
  }

  .btn-back {
    height: 72rpx;
    padding: 0 32rpx;
    font-size: 26rpx;
    line-height: 72rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }
</style>
