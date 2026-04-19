<template>
  <view class="order-list">
    <view class="placeholder">我的订单 — Sprint 3 实现（T7.17~T7.25）</view>
  </view>
</template>

<script setup lang="ts">
  /**
   * 我的订单占位页（Sprint 3 实装：6 Tab + 子条件区分，规避 P5 statusIn:[55] 重复 bug）
   * @author 单 Agent V2.0 (P7 骑手端)
   */
</script>

<style lang="scss" scoped>
  .order-list {
    min-height: 100vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }

  .placeholder {
    padding: 32rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
    text-align: center;
    background: #fff;
    border-radius: 16rpx;
  }
</style>
