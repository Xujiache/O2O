<template>
  <view class="page page-pay">
    <BizLoading v-if="loading" fullscreen text="加载订单中..." />
    <BizError v-else-if="loadError" :title="loadError" desc="请稍后重试" @retry="loadAll" />
    <template v-else>
      <view class="page-pay__hero">
        <text class="page-pay__hero-label">需付金额</text>
        <text class="page-pay__hero-amount">{{ formatAmount(payAmount) }}</text>
        <view class="page-pay__hero-countdown">
          <text v-if="!expired" class="page-pay__hero-countdown-text">
            支付剩余 {{ countdownText }}
          </text>
          <text v-else class="page-pay__hero-countdown-expired">订单已超时，请重新下单</text>
        </view>
      </view>

      <view class="page-pay__methods">
        <text class="page-pay__methods-title">选择支付方式</text>
        <view
          class="page-pay__method"
          :class="{ 'page-pay__method--active': payMethod === 1 }"
          @tap="onSelectMethod(1)"
        >
          <view class="page-pay__method-icon page-pay__method-icon--wx">
            <text>微</text>
          </view>
          <view class="page-pay__method-info">
            <text class="page-pay__method-name">微信支付</text>
            <text class="page-pay__method-desc">推荐使用</text>
          </view>
          <view class="page-pay__radio" :class="{ 'page-pay__radio--on': payMethod === 1 }">
            <text v-if="payMethod === 1" class="page-pay__radio-mark">✓</text>
          </view>
        </view>

        <view
          class="page-pay__method"
          :class="{
            'page-pay__method--active': payMethod === 3 && balanceEnough,
            'page-pay__method--disabled': !balanceEnough
          }"
          @tap="onSelectMethod(3)"
        >
          <view class="page-pay__method-icon page-pay__method-icon--balance">
            <text>余</text>
          </view>
          <view class="page-pay__method-info">
            <text class="page-pay__method-name">余额支付</text>
            <text class="page-pay__method-desc">{{ balanceDesc }}</text>
          </view>
          <view class="page-pay__radio" :class="{ 'page-pay__radio--on': payMethod === 3 }">
            <text v-if="payMethod === 3" class="page-pay__radio-mark">✓</text>
          </view>
        </view>
      </view>

      <view class="page-pay__tip">
        <text>付款后概不退还，如需退款请通过订单详情发起售后</text>
      </view>

      <view class="page-pay__action">
        <button class="page-pay__btn" :disabled="paying || expired" :loading="paying" @tap="onPay">
          {{ payBtnText }}
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/pay/index.vue
   * @stage P5/T5.41, T5.43 (Sprint 7)
   * @desc 收银台：金额展示 + 倒计时 + 微信/余额支付 + 订阅消息授权
   *   - 调 createPayment 拿 JSAPI 参数 → uni.requestPayment 唤起微信支付
   *   - 余额支付直接确认（后端返回 SUCCESS 状态）
   *   - 立即支付前调 requestSubscribe 请求订阅授权
   * @author 单 Agent V2.0
   */
  import { ref, computed, onUnmounted } from 'vue'
  import { onLoad, onUnload } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizError from '@/components/biz/BizError.vue'
  import { getOrderDetail } from '@/api/order'
  import { createPayment } from '@/api/pay'
  import { getWallet } from '@/api/wallet'
  import { getSubscribeTemplates } from '@/api/msg'
  import { requestSubscribe } from '@/utils/subscribe'
  import { formatAmount, compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import type { OrderType, PayResult } from '@/types/biz'

  /** 订单查询 / 收银态 */
  const orderNo = ref<string>('')
  const orderType = ref<OrderType>(1)
  const payAmount = ref<string>('0')
  const createdAt = ref<string>('')
  const balance = ref<string>('0')

  /** 选中支付方式：1 微信 / 3 余额 */
  const payMethod = ref<1 | 3>(1)

  const loading = ref<boolean>(true)
  const loadError = ref<string>('')
  const paying = ref<boolean>(false)

  /** 倒计时（秒） */
  const remainSec = ref<number>(0)
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  /** 节流：500ms 防重复点击 */
  let lastClickTs = 0

  /** 订单超时时长 15 分钟 */
  const ORDER_TTL_MS = 15 * 60 * 1000

  /**
   * 余额是否足以支付（用 compareAmount 大数比较，避免 number 浮点；P5-REVIEW-01 R1 / I-03）
   */
  const balanceEnough = computed<boolean>(() => {
    return compareAmount(balance.value, payAmount.value) >= 0
  })

  const balanceDesc = computed<string>(() => {
    if (balanceEnough.value) {
      return `可用 ${formatAmount(balance.value)}`
    }
    return `余额不足（${formatAmount(balance.value)}）`
  })

  const expired = computed<boolean>(() => remainSec.value <= 0 && createdAt.value !== '')

  const countdownText = computed<string>(() => {
    const total = Math.max(0, remainSec.value)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${pad2(m)}:${pad2(s)}`
  })

  const payBtnText = computed<string>(() => {
    if (paying.value) return '支付中...'
    if (expired.value) return '支付超时'
    return `立即支付 ${formatAmount(payAmount.value)}`
  })

  onLoad((options?: Record<string, string | undefined>) => {
    const no = options?.orderNo
    if (!no) {
      loadError.value = '订单参数缺失'
      loading.value = false
      return
    }
    orderNo.value = no
    void loadAll()
  })

  onUnload(() => {
    stopCountdown()
  })

  onUnmounted(() => {
    stopCountdown()
  })

  /** 同时拉取订单详情 + 钱包余额 */
  async function loadAll(): Promise<void> {
    loading.value = true
    loadError.value = ''
    try {
      const [order, wallet] = await Promise.all([
        getOrderDetail(orderNo.value),
        getWallet().catch(() => ({ balance: '0' }))
      ])
      payAmount.value = order.payAmount
      orderType.value = order.orderType
      createdAt.value = order.createdAt
      balance.value = wallet.balance
      startCountdown()
    } catch (e) {
      logger.warn('pay.loadAll.fail', { orderNo: orderNo.value, e: String(e) })
      loadError.value = '订单加载失败'
    } finally {
      loading.value = false
    }
  }

  /** 启动倒计时（每秒刷新） */
  function startCountdown(): void {
    stopCountdown()
    refreshRemain()
    countdownTimer = setInterval(() => {
      refreshRemain()
      if (remainSec.value <= 0) {
        stopCountdown()
        onCountdownExpire()
      }
    }, 1000)
  }

  function stopCountdown(): void {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  function refreshRemain(): void {
    if (!createdAt.value) return
    const created = new Date(createdAt.value).getTime()
    if (Number.isNaN(created)) {
      remainSec.value = 0
      return
    }
    const ms = created + ORDER_TTL_MS - Date.now()
    remainSec.value = Math.max(0, Math.floor(ms / 1000))
  }

  function onCountdownExpire(): void {
    uni.showToast({ title: '支付超时', icon: 'none', duration: 1500 })
    setTimeout(() => {
      uni.redirectTo({ url: `/pages-order/detail?orderNo=${orderNo.value}` })
    }, 1500)
  }

  /** 选择支付方式 */
  function onSelectMethod(m: 1 | 3): void {
    if (m === 3 && !balanceEnough.value) {
      uni.showToast({ title: '余额不足，请选择其他方式', icon: 'none' })
      return
    }
    payMethod.value = m
  }

  /** 立即支付 */
  function onPay(): void {
    const now = Date.now()
    if (now - lastClickTs < 500) return
    lastClickTs = now
    if (paying.value || expired.value) return
    if (payMethod.value === 3 && !balanceEnough.value) {
      uni.showToast({ title: '余额不足', icon: 'none' })
      return
    }
    track(TRACK.CLICK_PAY, {
      orderNo: orderNo.value,
      orderType: orderType.value,
      payMethod: payMethod.value
    })
    void doPay()
  }

  /** 真正发起支付：先订阅授权 → createPayment → uni.requestPayment */
  async function doPay(): Promise<void> {
    paying.value = true
    try {
      await requestSubscribeIfNeeded()
      const r = await createPayment({
        orderNo: orderNo.value,
        orderType: orderType.value,
        payMethod: payMethod.value,
        clientType: 'jsapi'
      })
      if (payMethod.value === 1) {
        await invokeWxPay(r)
      }
      handlePayInitiated(r)
    } catch (e) {
      paying.value = false
      const msg = e instanceof Error ? e.message : String(e)
      track(TRACK.PAY_FAIL, {
        orderNo: orderNo.value,
        payMethod: payMethod.value,
        reason: msg
      })
      logger.warn('pay.doPay.fail', { orderNo: orderNo.value, e: msg })
      const lower = msg.toLowerCase()
      if (lower.includes('cancel')) {
        uni.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        uni.showToast({ title: msg || '支付失败，请重试', icon: 'none' })
      }
    }
  }

  /** 拉模板 ID 并请求订阅授权（失败不阻塞下单流程） */
  async function requestSubscribeIfNeeded(): Promise<void> {
    try {
      const tpl = await getSubscribeTemplates()
      if (tpl?.tmplIds?.length) {
        await requestSubscribe(tpl.tmplIds)
      }
    } catch (e) {
      logger.warn('pay.subscribe.fail', { e: String(e) })
    }
  }

  /** 调用微信小程序支付 */
  function invokeWxPay(r: PayResult): Promise<void> {
    return new Promise((resolve, reject) => {
      const j = r.jsapi
      if (!j) {
        reject(new Error('支付参数缺失'))
        return
      }
      uni.requestPayment({
        provider: 'wxpay',
        timeStamp: j.timeStamp,
        nonceStr: j.nonceStr,
        package: j.package,
        signType: j.signType,
        paySign: j.paySign,
        success: () => resolve(),
        fail: (err: { errMsg?: string }) => {
          const errMsg = err?.errMsg ?? ''
          reject(new Error(errMsg || '支付未完成'))
        }
      })
    })
  }

  /** 跳支付结果页 */
  function handlePayInitiated(r: PayResult): void {
    if (payMethod.value === 3) {
      track(TRACK.PAY_SUCCESS, {
        orderNo: orderNo.value,
        payNo: r.payNo,
        payMethod: 3
      })
    }
    stopCountdown()
    uni.redirectTo({ url: `/pages-pay/result?payNo=${encodeURIComponent(r.payNo)}` })
  }

  function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`
  }
</script>

<style lang="scss" scoped>
  .page-pay {
    min-height: 100vh;
    padding-bottom: 32rpx;
    background: #f5f6f8;

    &__hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 80rpx 32rpx 64rpx;
      background: linear-gradient(135deg, #ff6a1a 0%, #ff8e53 100%);
    }

    &__hero-label {
      font-size: 26rpx;
      color: rgba(255, 255, 255, 0.85);
    }

    &__hero-amount {
      margin-top: 16rpx;
      font-size: 88rpx;
      font-weight: 600;
      color: #fff;
    }

    &__hero-countdown {
      margin-top: 24rpx;
    }

    &__hero-countdown-text {
      padding: 8rpx 24rpx;
      font-size: 24rpx;
      color: #fff;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 24rpx;
    }

    &__hero-countdown-expired {
      padding: 8rpx 24rpx;
      font-size: 24rpx;
      color: #fff;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 24rpx;
    }

    &__methods {
      padding: 24rpx;
      margin: 24rpx;
      background: #fff;
      border-radius: 16rpx;
    }

    &__methods-title {
      display: block;
      padding: 8rpx 0 24rpx;
      font-size: 28rpx;
      font-weight: 500;
      color: #333;
    }

    &__method {
      display: flex;
      align-items: center;
      padding: 24rpx 8rpx;
      border-bottom: 1rpx solid #f2f2f2;

      &:last-child {
        border-bottom: 0;
      }

      &--disabled {
        opacity: 0.45;
      }
    }

    &__method-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64rpx;
      height: 64rpx;
      margin-right: 24rpx;
      font-size: 28rpx;
      color: #fff;
      border-radius: 16rpx;

      &--wx {
        background: #07c160;
      }

      &--balance {
        background: #ff6a1a;
      }
    }

    &__method-info {
      flex: 1;
    }

    &__method-name {
      display: block;
      font-size: 30rpx;
      font-weight: 500;
      color: #333;
    }

    &__method-desc {
      display: block;
      margin-top: 6rpx;
      font-size: 22rpx;
      color: #999;
    }

    &__radio {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36rpx;
      height: 36rpx;
      border: 2rpx solid #c0c4cc;
      border-radius: 50%;

      &--on {
        background: #ff6a1a;
        border-color: #ff6a1a;
      }
    }

    &__radio-mark {
      font-size: 22rpx;
      line-height: 1;
      color: #fff;
    }

    &__tip {
      padding: 16rpx 32rpx;
      font-size: 22rpx;
      color: #999;
      text-align: center;
    }

    &__action {
      padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
    }

    &__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 88rpx;
      font-size: 32rpx;
      font-weight: 500;
      color: #fff;
      background: #ff6a1a;
      border: none;
      border-radius: 44rpx;

      &[disabled],
      &[disabled]:active {
        background: #ffc6a8;
      }
    }
  }
</style>
