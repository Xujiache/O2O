<template>
  <view class="page page-wd">
    <view class="wd-card">
      <text class="wd-title">申请提现</text>
      <text class="wd-balance">可提现余额：{{ formatAmount(available, '') }} 元</text>

      <view class="form-field">
        <text class="form-label">提现金额（元）</text>
        <input v-model="form.amount" class="form-input" type="digit" placeholder="0.00" />
        <text class="wd-quick" @click="form.amount = available">全部提现</text>
      </view>

      <view class="form-field">
        <text class="form-label">收款银行卡</text>
        <picker :value="cardIdx" :range="cardLabels" @change="onCardChange">
          <view class="form-input form-input--picker">
            {{ cardLabels[cardIdx] || '请选择银行卡' }}
          </view>
        </picker>
      </view>

      <view class="form-field">
        <view class="form-row">
          <input
            v-model="form.smsCode"
            class="form-input form-input--flex"
            type="number"
            placeholder="手机短信验证码"
            maxlength="6"
          />
          <button class="wd-sms" :disabled="smsCountdown > 0" @click="onSendSms">
            {{ smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码' }}
          </button>
        </view>
      </view>

      <BizBtn type="primary" block :disabled="submitting" @click="onSubmit">
        {{ submitting ? '提交中...' : '确认提现' }}
      </BizBtn>

      <view class="wd-tip">
        <text>· T+1 到账，最迟次日 18 点</text>
        <text>· 单笔上限 100,000 元</text>
        <text>· 单日上限 200,000 元</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed, onMounted } from 'vue'
  import { listBankCards, applyWithdraw } from '@/api/wallet'
  import { sendSmsCode } from '@/api/auth'
  import { getOverview } from '@/api/finance'
  import type { BankCard } from '@/types/biz'
  import { useShopStore, useAuthStore } from '@/store'
  import { mockEnabled, delay } from '@/api/_mock'
  import { compareAmount, formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 申请提现（T6.31）
   *
   * 校验：
   *   - 金额 > 0 且 <= 可提现余额（compareAmount，禁止 Number 直接比）
   *   - 银行卡必选
   *   - 短信验证码 6 位
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()
  const authStore = useAuthStore()

  const available = ref<string>('0.00')
  const cards = ref<BankCard[]>([])
  const cardIdx = ref<number>(0)
  const submitting = ref<boolean>(false)
  const smsCountdown = ref<number>(0)
  let smsTimer: ReturnType<typeof setInterval> | null = null

  const form = reactive({
    amount: '',
    smsCode: ''
  })

  const cardLabels = computed<string[]>(() =>
    cards.value.map((c) => `${c.bankName} (${c.cardNoMask})${c.isDefault ? ' [默认]' : ''}`)
  )

  onMounted(async () => {
    await loadOverview()
    await loadCards()
  })

  async function loadOverview() {
    try {
      const r = mockEnabled()
        ? { available: '12580.50' }
        : await getOverview(shopStore.currentShopId)
      available.value = r.available
    } catch (e) {
      logger.warn('wd.overview.fail', { e: String(e) })
    }
  }

  async function loadCards() {
    try {
      cards.value = mockEnabled()
        ? await delay([
            {
              id: 'bc-1',
              holderName: authStore.profile?.contactName ?? '',
              cardNoMask: '****1234',
              bankName: '中国工商银行',
              cardType: 1,
              isDefault: 1
            }
          ] as BankCard[])
        : await listBankCards()
      cardIdx.value = cards.value.findIndex((c) => c.isDefault === 1)
      if (cardIdx.value < 0) cardIdx.value = 0
    } catch (e) {
      logger.warn('wd.cards.fail', { e: String(e) })
    }
  }

  function onCardChange(e: { detail: { value: number } }) {
    cardIdx.value = e.detail.value
  }

  function startCountdown() {
    smsCountdown.value = 60
    smsTimer = setInterval(() => {
      smsCountdown.value -= 1
      if (smsCountdown.value <= 0 && smsTimer) {
        clearInterval(smsTimer)
        smsTimer = null
      }
    }, 1000)
  }

  async function onSendSms() {
    const mobile = authStore.profile?.mobile
    if (!mobile) {
      uni.showToast({ title: '账号未绑手机号', icon: 'none' })
      return
    }
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await sendSmsCode({ mobile, scene: 'withdraw' })
      }
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      startCountdown()
    } catch (e) {
      logger.warn('wd.sms.fail', { e: String(e) })
    }
  }

  async function onSubmit() {
    if (cards.value.length === 0) {
      uni.showToast({ title: '请先添加银行卡', icon: 'none' })
      return
    }
    if (compareAmount(form.amount, '0') <= 0) {
      uni.showToast({ title: '提现金额必须 > 0', icon: 'none' })
      return
    }
    if (compareAmount(form.amount, available.value) > 0) {
      uni.showToast({ title: '提现金额超过余额', icon: 'none' })
      return
    }
    if (compareAmount(form.amount, '100000') > 0) {
      uni.showToast({ title: '单笔上限 10 万元', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(form.smsCode)) {
      uni.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({})
      } else {
        await applyWithdraw({
          amount: form.amount,
          cardId: cards.value[cardIdx.value].id,
          smsCode: form.smsCode
        })
      }
      track(TRACK.WITHDRAW_APPLY, { amount: form.amount })
      uni.showToast({ title: '已提交，T+1 到账', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('wd.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-wd {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .wd-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .wd-title {
    display: block;
    font-size: 30rpx;
    font-weight: 600;
  }

  .wd-balance {
    display: block;
    margin-top: 8rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .form-field {
    position: relative;
    margin-bottom: 24rpx;
  }

  .form-label {
    display: block;
    margin-bottom: 12rpx;
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .form-input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &--flex {
      flex: 1;
      margin-right: 16rpx;
    }

    &--picker {
      display: flex;
      align-items: center;
      line-height: 80rpx;
    }
  }

  .form-row {
    display: flex;
    align-items: center;
  }

  .wd-sms {
    width: 200rpx;
    height: 80rpx;
    padding: 0;
    font-size: 24rpx;
    line-height: 80rpx;
    color: $uni-color-primary;
    background: #fff;
    border: 2rpx solid $uni-color-primary;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &[disabled] {
      color: $uni-text-color-disable;
      border-color: $uni-text-color-disable;
    }
  }

  .wd-quick {
    position: absolute;
    top: 56rpx;
    right: 16rpx;
    font-size: 22rpx;
    color: $uni-color-primary;
  }

  .wd-tip {
    margin-top: 24rpx;
    font-size: 22rpx;
    line-height: 1.8;
    color: $uni-text-color-grey;
  }
</style>
