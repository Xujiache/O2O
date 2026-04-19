<template>
  <view class="placeholder">
    <view class="placeholder__title">接单偏好</view>
    <view class="placeholder__desc"
      >Sprint 2 实现（T7.16）：模式 / 类型 / 半径 / 顺路单 / 同时上限</view
    >
  </view>
</template>

<script setup lang="ts">
  /**
   * 接单偏好（Sprint 2 实装）
   * @author 单 Agent V2.0 (P7 骑手端)
   */
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
      color: $uni-text-color;
    }

    &__desc {
      font-size: 24rpx;
      color: $uni-text-color-grey;
      text-align: center;
    }
  }
</style>
