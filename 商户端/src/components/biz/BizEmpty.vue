<template>
  <view class="biz-empty">
    <view class="biz-empty__icon" :style="{ fontSize: iconSize }">{{ iconChar }}</view>
    <text class="biz-empty__title">{{ title }}</text>
    <text v-if="desc" class="biz-empty__desc">{{ desc }}</text>
    <view v-if="$slots.action" class="biz-empty__action">
      <slot name="action" />
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  /**
   * 空状态占位组件
   *
   * 用法：
   *   <BizEmpty title="暂无订单" desc="开店即可接单" />
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  interface Props {
    /** 标题 */
    title?: string
    /** 描述 */
    desc?: string
    /** 图标尺寸 */
    iconSize?: string
    /** 场景：order/product/data/review/finance/network */
    scene?: 'order' | 'product' | 'data' | 'review' | 'finance' | 'network' | 'default'
  }

  const props = withDefaults(defineProps<Props>(), {
    title: '暂无数据',
    desc: '',
    iconSize: '120rpx',
    scene: 'default'
  })

  const iconChar = computed(() => {
    switch (props.scene) {
      case 'order':
        return '📋'
      case 'product':
        return '🛒'
      case 'data':
        return '📊'
      case 'review':
        return '💬'
      case 'finance':
        return '💰'
      case 'network':
        return '🔌'
      default:
        return '📭'
    }
  })
</script>

<style lang="scss" scoped>
  .biz-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80rpx 32rpx;

    &__icon {
      margin-bottom: 24rpx;
      line-height: 1;
    }

    &__title {
      margin-bottom: 8rpx;
      font-size: 28rpx;
      font-weight: 500;
      color: $uni-text-color;
    }

    &__desc {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__action {
      margin-top: 32rpx;
    }
  }
</style>
