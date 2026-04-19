<template>
  <view class="page page-ih">
    <BizEmpty title="发票抬头" desc="本页用于管理常用发票抬头；S5 完整实现" scene="finance">
      <template #action>
        <BizBtn type="primary" text="返回" @click="goBack" />
      </template>
    </BizEmpty>
  </view>
</template>

<script setup lang="ts">
  /**
   * 发票抬头管理（占位 → S5 完整实现）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  function goBack() {
    uni.navigateBack()
  }
</script>

<style lang="scss" scoped>
  .page-ih {
    min-height: 100vh;
    background: $uni-bg-color-grey;
  }
</style>
