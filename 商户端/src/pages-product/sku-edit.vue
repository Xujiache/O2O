<template>
  <view class="page page-se">
    <BizEmpty
      title="SKU 详细编辑"
      desc="本页用于多规格商品的属性矩阵编辑（如：尺寸×口味）；S5 版本完整实现"
      scene="product"
    >
      <template #action>
        <BizBtn type="primary" text="返回商品编辑" @click="goBack" />
      </template>
    </BizEmpty>
  </view>
</template>

<script setup lang="ts">
  /**
   * SKU 详细编辑（占位，T6.27 主体已合并到 edit.vue）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  function goBack() {
    uni.navigateBack()
  }
</script>

<style lang="scss" scoped>
  .page-se {
    min-height: 100vh;
    background: $uni-bg-color-grey;
  }
</style>
