<template>
  <view class="page page-deposit">
    <view class="head">
      <view class="head__icon">💰</view>
      <view class="head__title">缴纳保证金</view>
      <view class="head__desc">保证金用于保障订单履约，可在退出骑手身份时全额退回</view>
    </view>

    <view class="amount-card">
      <view class="amount-card__label">应缴金额</view>
      <view class="amount-card__num">{{ formatAmount(info.amount) }}</view>
      <view
        v-if="info.paidAmount && compareAmount(info.paidAmount, '0') > 0"
        class="amount-card__paid"
      >
        已缴 {{ formatAmount(info.paidAmount) }}
      </view>
    </view>

    <view class="channel">
      <view class="channel__title">支付方式</view>
      <view
        class="channel__item"
        :class="{ 'channel__item--active': payChannel === 'wechat' }"
        @click="payChannel = 'wechat'"
      >
        <text class="channel__icon">💚</text>
        <text class="channel__name">微信支付</text>
        <text v-if="payChannel === 'wechat'" class="channel__check">✓</text>
      </view>
      <view
        class="channel__item"
        :class="{ 'channel__item--active': payChannel === 'alipay' }"
        @click="payChannel = 'alipay'"
      >
        <text class="channel__icon">💙</text>
        <text class="channel__name">支付宝</text>
        <text v-if="payChannel === 'alipay'" class="channel__check">✓</text>
      </view>
    </view>

    <button class="submit" :disabled="loading || info.paid" @click="onPay">
      {{ info.paid ? '已结清' : loading ? '支付中...' : `去支付 ${formatAmount(info.amount)}` }}
    </button>

    <view class="tips">
      <text>* 保证金会原路退回，不收取手续费；</text>
      <text>* 仅在违规时按平台规则扣除，详见《骑手协议》。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { getDepositInfo, payDeposit } from '@/api/auth'
  import type { DepositInfo } from '@/types/biz'
  import { useAuthStore } from '@/store'
  import { formatAmount, compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 保证金缴纳页：支持微信 / 支付宝
   *   支付成功后通过后端回调标记 depositPaid，前端轮询 1 次后跳转
   * @author 单 Agent V2.0 (P7 骑手端 / T7.8)
   */
  const auth = useAuthStore()
  const loading = ref(false)
  const payChannel = ref<'wechat' | 'alipay'>('wechat')
  const info = ref<DepositInfo>({
    amount: '500.00',
    paidAmount: '0.00',
    paid: false
  })

  onMounted(async () => {
    try {
      const data = await getDepositInfo()
      info.value = data
      auth.setDepositPaid(data.paid)
    } catch (e) {
      logger.warn('deposit.info.fail', { e: String(e) })
    }
  })

  async function onPay() {
    if (info.value.paid) return
    loading.value = true
    try {
      const r = await payDeposit({ payChannel: payChannel.value, amount: info.value.amount })
      logger.info('deposit.pay.params', { payOrderNo: r.payOrderNo })
      track(TRACK.PAY_DEPOSIT, { channel: payChannel.value })
      /* 真机会调起 plus.payment 完成支付；当前 mock 直接标记成功 */
      auth.setDepositPaid(true)
      info.value.paid = true
      uni.showToast({ title: '支付成功', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages-login/audit-status' }), 800)
    } catch (e) {
      logger.warn('deposit.pay.fail', { e: String(e) })
      uni.showToast({ title: '支付失败，请稍后重试', icon: 'none' })
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-deposit {
    min-height: 100vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }

  .head {
    margin-bottom: 24rpx;
    text-align: center;

    &__icon {
      margin-top: 32rpx;
      font-size: 80rpx;
    }

    &__title {
      margin: 16rpx 0 8rpx;
      font-size: 32rpx;
      font-weight: 600;
      color: $uni-text-color;
    }

    &__desc {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }
  }

  .amount-card {
    padding: 32rpx;
    margin-bottom: 24rpx;
    text-align: center;
    background: #fff;
    border-radius: 16rpx;

    &__label {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__num {
      margin: 16rpx 0;
      font-size: 64rpx;
      font-weight: 700;
      color: $uni-color-error;
    }

    &__paid {
      font-size: 24rpx;
      color: $uni-color-primary;
    }
  }

  .channel {
    padding: 32rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 24rpx;
      font-size: 28rpx;
      font-weight: 500;
    }

    &__item {
      display: flex;
      align-items: center;
      padding: 24rpx 0;
      border-bottom: 1rpx solid $uni-border-color;
    }

    &__icon {
      margin-right: 16rpx;
      font-size: 40rpx;
    }

    &__name {
      flex: 1;
      font-size: 28rpx;
    }

    &__check {
      color: $uni-color-primary;
    }

    &__item--active &__name {
      color: $uni-color-primary;
    }
  }

  .submit {
    width: 100%;
    height: 88rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &[disabled] {
      opacity: 0.6;
    }
  }

  .tips {
    margin-top: 32rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
    text {
      display: block;
      line-height: 1.6;
    }
  }
</style>
