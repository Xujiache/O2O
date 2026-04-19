<template>
  <view class="page takeout">
    <view class="takeout__hero">
      <text class="takeout__title">外卖点餐</text>
      <text class="takeout__subtitle">附近优选 · 准时送达</text>
    </view>
    <BizLoading text="正在加载附近店铺..." />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/takeout/index.vue
   * @stage P5/T5.13 (Sprint 2)
   * @desc 外卖独立 tab 页（首页推荐入口直跳店铺列表，本页保留兼容路由）
   * @author 单 Agent V2.0
   */
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'

  onLoad(() => {
    /* 默认跳首页（首页 tab 即外卖+跑腿混合入口） */
    setTimeout(() => uni.switchTab({ url: '/pages/index/index' }), 200)
  })
</script>

<style lang="scss" scoped>
  .takeout {
    padding: 64rpx 32rpx;
    text-align: center;

    &__title {
      font-size: 40rpx;
      font-weight: 600;
      color: #ff6a1a;
    }

    &__subtitle {
      display: block;
      margin-top: 16rpx;
      font-size: 28rpx;
      color: #999;
    }
  }
</style>
