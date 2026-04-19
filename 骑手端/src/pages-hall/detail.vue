<template>
  <view class="placeholder">
    <view class="placeholder__title">订单详情（接单前预览）</view>
    <view class="placeholder__desc">Sprint 2 实装（T7.13）</view>
  </view>
</template>

<script setup lang="ts">
  /** Sprint 2 实装 */
</script>

<style lang="scss" scoped>
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
    &__title {
      margin-bottom: 12rpx;
      font-size: 30rpx;
      font-weight: 600;
    }
    &__desc {
      font-size: 24rpx;
      color: $uni-text-color-grey;
      text-align: center;
    }
  }
</style>
