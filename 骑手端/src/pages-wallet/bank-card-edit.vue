<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="field__label">持卡人姓名</text>
        <input v-model="form.holderName" class="field__input" maxlength="20" />
      </view>
      <view class="field">
        <text class="field__label">银行卡号</text>
        <input
          v-model="form.cardNoMask"
          class="field__input"
          type="number"
          maxlength="20"
          placeholder="请输入完整卡号"
        />
      </view>
      <view class="field">
        <text class="field__label">银行名称</text>
        <input v-model="form.bankName" class="field__input" placeholder="如：工商银行" />
      </view>
      <view class="field">
        <text class="field__label">卡类型</text>
        <view class="seg">
          <view
            class="seg__item"
            :class="{ 'seg__item--active': form.cardType === 1 }"
            @click="form.cardType = 1"
          >
            借记卡
          </view>
          <view
            class="seg__item"
            :class="{ 'seg__item--active': form.cardType === 2 }"
            @click="form.cardType = 2"
          >
            信用卡
          </view>
        </view>
      </view>
    </view>

    <button class="primary" :disabled="!canSubmit || submitting" @click="onSubmit">
      {{ submitting ? '提交中...' : '保存' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed } from 'vue'
  import { useWalletStore } from '@/store'

  /**
   * 添加银行卡
   * @author 单 Agent V2.0 (P7 骑手端 / T7.34)
   */
  const wallet = useWalletStore()
  const submitting = ref(false)
  const form = reactive({
    holderName: '',
    cardNoMask: '',
    bankName: '',
    cardType: 1 as 1 | 2
  })

  const canSubmit = computed(
    () =>
      form.holderName.trim().length > 1 &&
      /^\d{15,20}$/.test(form.cardNoMask) &&
      form.bankName.trim().length > 0
  )

  async function onSubmit() {
    if (!canSubmit.value) {
      uni.showToast({ title: '请检查输入', icon: 'none' })
      return
    }
    submitting.value = true
    const ok = await wallet.addBankCard({
      holderName: form.holderName.trim(),
      cardNoMask: `**** **** **** ${form.cardNoMask.slice(-4)}`,
      bankName: form.bankName.trim(),
      cardType: form.cardType
    })
    submitting.value = false
    if (ok) {
      uni.showToast({ title: '添加成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
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
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .field {
    margin-bottom: 24rpx;

    &__label {
      display: block;
      margin-bottom: 12rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__input {
      width: 100%;
      height: 80rpx;
      padding: 0 24rpx;
      font-size: 28rpx;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }
  }

  .seg {
    display: flex;
    gap: 16rpx;
  }

  .seg__item {
    flex: 1;
    height: 72rpx;
    font-size: 26rpx;
    line-height: 72rpx;
    text-align: center;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: $uni-border-radius-base;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }

  .primary {
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
</style>
