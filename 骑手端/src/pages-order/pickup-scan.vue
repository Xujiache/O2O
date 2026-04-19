<template>
  <view class="ph"
    ><view class="ph__t">取件核验</view
    ><view class="ph__d">Sprint 3 实装（T7.19）：扫码 + 输入 + 错码 3 次冻结 30s</view></view
  >
</template>
<script setup lang="ts">
  /** Sprint 3 实装 */
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
