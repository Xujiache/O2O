<template>
  <view class="page">
    <view class="hero">
      <view class="hero__icon">💰</view>
      <view class="hero__text">{{ rule.text }}</view>
    </view>

    <view class="card">
      <view class="card__title">基础配送费</view>
      <view class="big">{{ formatAmount(rule.baseFee) }} / 单</view>
    </view>

    <view class="card">
      <view class="card__title">距离阶梯</view>
      <view v-for="(t, i) in rule.distanceTiers" :key="i" class="tier">
        <text>{{ i === 0 ? '0' : prevDist(i) }}m - {{ t.distanceMax }}m</text>
        <text class="tier__add">{{
          t.addFee === '0' ? '不加价' : `+${formatAmount(t.addFee)}`
        }}</text>
      </view>
    </view>

    <view class="card">
      <view class="card__title">高峰期加成</view>
      <view class="big">{{ rule.rushHourMultiplier }} 倍</view>
      <view class="hint">11:00-13:00 / 17:00-19:30 / 22:00-23:30</view>
    </view>

    <view class="card">
      <view class="card__title">恶劣天气补贴</view>
      <view class="big">{{ formatAmount(rule.badWeatherBonus) }} / 单</view>
      <view class="hint">下雨/下雪/极端温度自动触发</view>
    </view>

    <BizBtn type="primary" block @click="goExport">导出薪资明细 (CSV)</BizBtn>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { fetchSalaryRule } from '@/api/wallet'
  import type { SalaryRule } from '@/types/biz'
  import { formatAmount } from '@/utils/format'
  import { mockResolve } from '@/api/_mock'

  /**
   * 薪资规则展示
   * @author 单 Agent V2.0 (P7 骑手端 / T7.35)
   */
  const rule = ref<SalaryRule>(mockResolve.salaryRule)

  onMounted(async () => {
    try {
      rule.value = await fetchSalaryRule()
    } catch {
      /* fallback mock */
    }
  })

  function prevDist(i: number): number {
    return rule.value.distanceTiers[i - 1].distanceMax
  }

  function goExport() {
    uni.navigateTo({ url: '/pages-wallet/salary-export' })
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .hero {
    display: flex;
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: $uni-color-primary-light;
    border-radius: 16rpx;

    &__icon {
      margin-right: 16rpx;
      font-size: 56rpx;
    }

    &__text {
      flex: 1;
      font-size: 24rpx;
      line-height: 1.6;
      color: $uni-color-primary-dark;
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

  .big {
    font-size: 40rpx;
    font-weight: 700;
    color: $uni-color-primary;
  }

  .tier {
    display: flex;
    justify-content: space-between;
    padding: 12rpx 0;
    font-size: 24rpx;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }

    &__add {
      color: $uni-color-primary;
    }
  }

  .hint {
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }
</style>
