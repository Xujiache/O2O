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
   *   <BizEmpty title="暂无订单" desc="上班后即可接单" scene="order" />
   *
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  interface Props {
    title?: string
    desc?: string
    iconSize?: string
    /** 场景：dispatch / order / wallet / msg / network / data */
    scene?: 'dispatch' | 'order' | 'wallet' | 'msg' | 'network' | 'data' | 'default'
  }

  const props = withDefaults(defineProps<Props>(), {
    title: '暂无数据',
    desc: '',
    iconSize: '120rpx',
    scene: 'default'
  })

  const iconChar = computed(() => {
    switch (props.scene) {
      case 'dispatch':
        return '🚴'
      case 'order':
        return '📋'
      case 'wallet':
        return '💰'
      case 'msg':
        return '💬'
      case 'network':
        return '🔌'
      case 'data':
        return '📊'
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
