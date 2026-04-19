<template>
  <view class="page errand">
    <view class="errand__hero">
      <text class="errand__title">同城跑腿</text>
      <text class="errand__subtitle">帮送 · 帮取 · 帮买 · 帮排队</text>
    </view>

    <view class="errand__grid">
      <view v-for="s in services" :key="s.code" class="errand__card" @tap="goService(s.code)">
        <text class="errand__card-icon">{{ s.icon }}</text>
        <text class="errand__card-name">{{ s.name }}</text>
        <text class="errand__card-desc">{{ s.desc }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/errand/index.vue
   * @stage P5/T5.21 (Sprint 4)
   * @desc 跑腿首页：4 服务入口（帮送/帮取/帮买/帮排队）
   * @author 单 Agent V2.0
   */
  import { onShow } from '@dcloudio/uni-app'
  import { useUserStore } from '@/store/user'
  import { track, TRACK } from '@/utils/track'

  const services = [
    { code: 'deliver', name: '帮送', icon: '📦', desc: '寄件 · 送达' },
    { code: 'pickup', name: '帮取', icon: '🚚', desc: '快递 · 文件' },
    { code: 'buy', name: '帮买', icon: '🛒', desc: '商品代购' },
    { code: 'queue', name: '帮排队', icon: '🧍', desc: '排队代办' }
  ] as const

  onShow(() => {
    track(TRACK.VIEW_ERRAND)
  })

  function goService(code: string) {
    const user = useUserStore()
    if (!user.isLogin) {
      uni.navigateTo({
        url: `/pages/login/index?redirect=${encodeURIComponent(`/pages-errand/${code}`)}`
      })
      return
    }
    uni.navigateTo({ url: `/pages-errand/${code}` })
  }
</script>

<style lang="scss" scoped>
  .errand {
    min-height: 100vh;
    background: linear-gradient(135deg, #ff6a1a 0%, #ff8e53 30%, #f5f6f8 30%);

    &__hero {
      padding: 64rpx 32rpx 48rpx;
    }

    &__title {
      font-size: 48rpx;
      font-weight: 600;
      color: #fff;
    }

    &__subtitle {
      display: block;
      margin-top: 16rpx;
      font-size: 26rpx;
      color: rgba(255, 255, 255, 0.85);
    }

    &__grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
      padding: 0 24rpx;
    }

    &__card {
      display: flex;
      flex: 0 0 calc((100% - 16rpx) / 2);
      flex-direction: column;
      align-items: center;
      padding: 48rpx 24rpx;
      background: #fff;
      border-radius: 16rpx;
      box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
    }

    &__card-icon {
      font-size: 64rpx;
    }

    &__card-name {
      margin-top: 16rpx;
      font-size: 32rpx;
      font-weight: 500;
      color: #333;
    }

    &__card-desc {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: #999;
    }
  }
</style>
