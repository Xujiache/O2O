<template>
  <view class="ph"
    ><view class="ph__t">账单明细</view><view class="ph__d">Sprint 5 实装（T7.33）</view></view
  >
</template>
<script setup lang="ts">
  /** Sprint 5 实装 */
</script>
<style lang="scss" scoped>
  .ph {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }
  .ph__t {
    margin-bottom: 12rpx;
    font-size: 30rpx;
    font-weight: 600;
  }
  .ph__d {
    font-size: 24rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }
</style>
