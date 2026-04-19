<template>
  <view class="page">
    <view class="hero">
      <view class="hero__lvl">Lv.{{ info.level }}</view>
      <view class="hero__points">信用积分 {{ info.currentPoints }}</view>
      <view class="hero__progress">
        <view class="hero__bar" :style="{ width: progress + '%' }" />
      </view>
      <view class="hero__hint">距升级 Lv.{{ info.level + 1 }} 还差 {{ info.remaining }} 分</view>
    </view>

    <view class="card">
      <view class="card__title">等级权益</view>
      <view class="benefit">
        <text>· 配送费上浮 {{ benefit.feeUpRate }}%</text>
        <text>· 派单优先级 +{{ benefit.dispatchBonus }}%</text>
        <text>· 高峰加成 {{ benefit.rushHourMultiplier }}x</text>
      </view>
    </view>

    <view class="card">
      <view class="card__title">升级规则</view>
      <view class="rule">{{ info.description }}</view>
    </view>

    <view class="card">
      <view class="card__title">5 级体系</view>
      <view class="ladder">
        <view
          v-for="i in 5"
          :key="i"
          class="ladder__item"
          :class="{ 'ladder__item--active': info.level >= i }"
        >
          Lv.{{ i }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { fetchLevelInfo } from '@/api/stat'
  import type { RiderLevelInfo } from '@/types/biz'
  import { mockResolve } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 等级 + 积分
   *   T7.40
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const info = ref<RiderLevelInfo>(mockResolve.levelInfo)

  const progress = computed(() => {
    const total = info.value.currentPoints + info.value.remaining
    if (total <= 0) return 0
    return Math.min(100, Math.round((info.value.currentPoints / total) * 100))
  })

  const benefit = computed(() => {
    /* 等级 → 权益（前端配置占位，权威以后端 sys_config 为准） */
    const map: Record<
      number,
      { feeUpRate: number; dispatchBonus: number; rushHourMultiplier: number }
    > = {
      1: { feeUpRate: 0, dispatchBonus: 0, rushHourMultiplier: 1.0 },
      2: { feeUpRate: 2, dispatchBonus: 5, rushHourMultiplier: 1.2 },
      3: { feeUpRate: 5, dispatchBonus: 10, rushHourMultiplier: 1.5 },
      4: { feeUpRate: 8, dispatchBonus: 15, rushHourMultiplier: 1.8 },
      5: { feeUpRate: 12, dispatchBonus: 25, rushHourMultiplier: 2.0 }
    }
    return map[info.value.level] ?? map[1]
  })

  onShow(async () => {
    track(TRACK.VIEW_LEVEL)
    try {
      info.value = await fetchLevelInfo()
    } catch (e) {
      logger.warn('level.fail', { e: String(e) })
    }
  })
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .hero {
    padding: 32rpx;
    margin-bottom: 16rpx;
    color: #fff;
    text-align: center;
    background: linear-gradient(135deg, $uni-color-primary 0%, #00d68a 100%);
    border-radius: 16rpx;

    &__lvl {
      font-size: 64rpx;
      font-weight: 700;
    }

    &__points {
      margin-top: 8rpx;
      font-size: 24rpx;
      opacity: 0.9;
    }

    &__progress {
      height: 16rpx;
      margin: 16rpx 0 8rpx;
      overflow: hidden;
      background: rgb(255 255 255 / 22%);
      border-radius: 8rpx;
    }

    &__bar {
      height: 100%;
      background: #fff;
    }

    &__hint {
      font-size: 22rpx;
      opacity: 0.9;
    }
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 16rpx;
      font-size: 26rpx;
      font-weight: 600;
    }
  }

  .benefit {
    text {
      display: block;
      font-size: 24rpx;
      line-height: 2;
      color: $uni-text-color;
    }
  }

  .rule {
    font-size: 24rpx;
    line-height: 1.8;
    color: $uni-text-color-grey;
  }

  .ladder {
    display: flex;
    gap: 8rpx;
  }

  .ladder__item {
    flex: 1;
    height: 64rpx;
    font-size: 22rpx;
    line-height: 64rpx;
    color: $uni-text-color-grey;
    text-align: center;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &--active {
      color: #fff;
      background: $uni-color-primary;
    }
  }
</style>
