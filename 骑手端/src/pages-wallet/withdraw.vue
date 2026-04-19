<template>
  <view class="page">
    <view class="card">
      <view class="card__title">提现金额</view>
      <view class="amount-input">
        <text class="amount-symbol">¥</text>
        <input v-model="form.amount" class="amount__field" type="digit" placeholder="0.00" />
      </view>
      <view class="balance-row">
        <text>可提现 {{ formatAmount(wallet.overview.available) }}</text>
        <text class="link" @click="onAll">全部提现</text>
      </view>
    </view>

    <view class="card">
      <view class="card__title">银行卡</view>
      <view v-if="wallet.bankCards.length > 0">
        <view
          v-for="c in wallet.bankCards"
          :key="c.id"
          class="bank"
          :class="{ 'bank--active': form.cardId === c.id }"
          @click="form.cardId = c.id"
        >
          <view class="bank__col">
            <text class="bank__name">{{ c.bankName }}</text>
            <text class="bank__no">{{ c.cardNoMask }}</text>
          </view>
          <text v-if="form.cardId === c.id" class="check">✓</text>
        </view>
      </view>
      <view v-else class="empty-bank" @click="goAddCard">+ 暂无银行卡，去添加</view>
    </view>

    <button class="primary" :disabled="!canSubmit || submitting" @click="onSubmit">
      {{ submitting ? '提交中...' : '提交提现申请' }}
    </button>

    <view class="tips">
      <text>* T+1 工作日到账；周末顺延</text>
      <text>* 单笔金额范围 1.00 - 50000.00 元</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useWalletStore } from '@/store'
  import { formatAmount, compareAmount } from '@/utils/format'
  import { mockResolve } from '@/api/_mock'
  import { track, TRACK } from '@/utils/track'

  /**
   * 提现申请：金额（compareAmount 大数比较） + 银行卡选择
   *   T7.34
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const wallet = useWalletStore()
  const submitting = ref(false)
  const form = reactive({ amount: '', cardId: '' })

  const canSubmit = computed(() => {
    if (!form.cardId) return false
    if (!form.amount) return false
    if (compareAmount(form.amount, '1.00') < 0) return false
    if (compareAmount(form.amount, '50000.00') > 0) return false
    if (compareAmount(form.amount, wallet.overview.available) > 0) return false
    return true
  })

  onLoad(async () => {
    await wallet.refresh().catch(() => {
      wallet.overview = { ...mockResolve.walletOverview }
    })
    await wallet.loadBankCards().catch(() => {
      wallet.bankCards = mockResolve.bankCards
    })
    if (wallet.bankCards.length > 0) {
      const def = wallet.bankCards.find((c) => c.isDefault === 1) ?? wallet.bankCards[0]
      form.cardId = def.id
    }
  })

  function onAll() {
    form.amount = wallet.overview.available
  }

  function goAddCard() {
    uni.navigateTo({ url: '/pages-wallet/bank-card-edit' })
  }

  async function onSubmit() {
    if (!canSubmit.value) {
      uni.showToast({ title: '请检查金额或银行卡', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      const ok = await wallet.applyWithdraw({ amount: form.amount, cardId: form.cardId })
      if (ok) {
        track(TRACK.WITHDRAW_APPLY, { amount: form.amount })
        uni.showToast({ title: '提现申请已提交', icon: 'success' })
        setTimeout(() => uni.navigateBack(), 600)
      }
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
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

  .amount-input {
    display: flex;
    align-items: baseline;
    padding-bottom: 16rpx;
    border-bottom: 2rpx solid $uni-color-primary;
  }

  .amount-symbol {
    font-size: 36rpx;
    color: $uni-color-primary;
  }

  .amount__field {
    flex: 1;
    height: 80rpx;
    margin-left: 16rpx;
    font-size: 56rpx;
    font-weight: 700;
    color: $uni-color-primary-dark;
  }

  .balance-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .link {
    color: $uni-color-primary;
  }

  .bank {
    display: flex;
    align-items: center;
    padding: 16rpx;
    border: 2rpx solid transparent;
    border-radius: 12rpx;

    &--active {
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }

    &__col {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 26rpx;
    }

    &__no {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .check {
    font-size: 32rpx;
    color: $uni-color-primary;
  }

  .empty-bank {
    padding: 24rpx 16rpx;
    font-size: 24rpx;
    color: $uni-color-primary;
    text-align: center;
    background: $uni-color-primary-light;
    border-radius: 12rpx;
  }

  .primary {
    width: 100%;
    height: 88rpx;
    margin-top: 16rpx;
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
    margin-top: 24rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;

    text {
      display: block;
      line-height: 1.6;
    }
  }
</style>
