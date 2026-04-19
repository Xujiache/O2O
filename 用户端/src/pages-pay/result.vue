<template>
  <view class="page result">
    <view v-if="status === 'SUCCESS'" class="result__panel result__panel--success">
      <view class="result__icon result__icon--ok">
        <text class="result__icon-mark">✓</text>
      </view>
      <text class="result__title">支付成功</text>
      <text class="result__amount">{{ formatAmount(amount) }}</text>
      <text class="result__sub">支付方式：{{ payMethodText }}</text>
      <view class="result__actions">
        <button class="result__btn result__btn--primary" @tap="goOrderDetail">查看订单</button>
        <button class="result__btn result__btn--ghost" @tap="goHome">返回首页</button>
      </view>
    </view>

    <view
      v-else-if="status === 'FAILED' || status === 'CLOSED' || status === 'REFUNDED'"
      class="result__panel result__panel--fail"
    >
      <view class="result__icon result__icon--fail">
        <text class="result__icon-mark">✕</text>
      </view>
      <text class="result__title">支付未完成</text>
      <text class="result__sub">{{ failReason }}</text>
      <view class="result__actions">
        <button class="result__btn result__btn--primary" @tap="onRetry">重试支付</button>
        <button class="result__btn result__btn--ghost" @tap="onContactCs">联系客服</button>
      </view>
    </view>

    <view v-else class="result__panel result__panel--pending">
      <BizLoading text="支付处理中，请稍候..." />
      <text class="result__pending-tip">已查询 {{ pollCount }} / {{ MAX_POLL }} 次</text>
      <view class="result__actions">
        <button class="result__btn result__btn--ghost" @tap="onManualRefresh">手动刷新</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-pay/result.vue
   * @stage P5/T5.42 (Sprint 7)
   * @desc 支付结果页：3s 轮询 getPayStatus（最多 30 次） + WS payment:result 备份
   *   - 成功：跳订单详情 / 返回首页
   *   - 失败：重试支付 / 联系客服
   *   - 处理中：loading + 已查询次数
   * @author 单 Agent V2.0
   */
  import { ref, computed, onUnmounted } from 'vue'
  import { onLoad, onUnload } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import { getPayStatus } from '@/api/pay'
  import { ws } from '@/utils/ws'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import type { PayStatus } from '@/types/biz'

  const payNo = ref<string>('')
  const status = ref<PayStatus['status']>('CREATED')
  const orderNo = ref<string>('')
  const amount = ref<string>('0')
  const failReason = ref<string>('支付失败')
  const pollCount = ref<number>(0)

  /** 客服电话（占位，正式发布前由后端 sys_config 下发） */
  const CS_PHONE = '400-000-0000'
  const MAX_POLL = 30
  const POLL_INTERVAL_MS = 3000

  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let unsubWs: (() => void) | null = null
  let querying = false

  const isFinal = computed<boolean>(
    () =>
      status.value === 'SUCCESS' ||
      status.value === 'FAILED' ||
      status.value === 'CLOSED' ||
      status.value === 'REFUNDED'
  )

  const payMethodText = computed<string>(() => '微信/余额支付')

  onLoad((options?: Record<string, string | undefined>) => {
    const pn = options?.payNo
    if (!pn) {
      uni.showToast({ title: '参数缺失', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    payNo.value = pn
    void queryOnce()
    schedulePoll()
    subscribeWs()
  })

  onUnload(() => {
    cleanup()
  })

  onUnmounted(() => {
    cleanup()
  })

  function cleanup(): void {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    if (unsubWs) {
      unsubWs()
      unsubWs = null
    }
  }

  /** 单次查询 */
  async function queryOnce(): Promise<void> {
    if (isFinal.value || querying || !payNo.value) return
    querying = true
    try {
      const r = await getPayStatus(payNo.value)
      orderNo.value = r.orderNo
      amount.value = r.amount
      applyStatus(r.status, 'poll')
    } catch (e) {
      logger.warn('result.poll.fail', { e: String(e) })
    } finally {
      querying = false
    }
  }

  /** 应用一次状态变更（轮询/WS 共用） */
  function applyStatus(next: PayStatus['status'], source: 'poll' | 'ws'): void {
    if (isFinal.value) return
    status.value = next
    if (next === 'SUCCESS') {
      track(TRACK.PAY_SUCCESS, { payNo: payNo.value, source })
      cleanup()
    } else if (next === 'FAILED') {
      failReason.value = '支付失败，可重试或联系客服'
      track(TRACK.PAY_FAIL, { payNo: payNo.value, reason: 'FAILED', source })
      cleanup()
    } else if (next === 'CLOSED') {
      failReason.value = '订单已关闭，无法支付'
      track(TRACK.PAY_FAIL, { payNo: payNo.value, reason: 'CLOSED', source })
      cleanup()
    } else if (next === 'REFUNDED') {
      failReason.value = '订单已退款'
      track(TRACK.PAY_FAIL, { payNo: payNo.value, reason: 'REFUNDED', source })
      cleanup()
    }
  }

  /** 调度下一次轮询 */
  function schedulePoll(): void {
    if (pollTimer || isFinal.value) return
    pollTimer = setTimeout(() => {
      pollTimer = null
      pollCount.value += 1
      void queryOnce().finally(() => {
        if (pollCount.value < MAX_POLL && !isFinal.value) {
          schedulePoll()
        }
      })
    }, POLL_INTERVAL_MS)
  }

  /** WS 备份订阅 */
  function subscribeWs(): void {
    interface PayResultEvent {
      payNo: string
      status: PayStatus['status']
      orderNo?: string
      amount?: string
    }
    unsubWs = ws.subscribe<PayResultEvent>('payment:result', (event) => {
      const d = event.data
      if (!d || d.payNo !== payNo.value) return
      if (d.orderNo) orderNo.value = d.orderNo
      if (d.amount) amount.value = d.amount
      applyStatus(d.status, 'ws')
    })
  }

  /** 用户主动刷新 */
  function onManualRefresh(): void {
    void queryOnce()
  }

  function goOrderDetail(): void {
    if (!orderNo.value) {
      uni.switchTab({ url: '/pages/order/index' })
      return
    }
    uni.redirectTo({ url: `/pages-order/detail?orderNo=${encodeURIComponent(orderNo.value)}` })
  }

  function goHome(): void {
    uni.switchTab({ url: '/pages/index/index' })
  }

  /** 重试支付：跳回收银台（如果有 orderNo），否则返回 */
  function onRetry(): void {
    if (orderNo.value) {
      uni.redirectTo({ url: `/pages/pay/index?orderNo=${encodeURIComponent(orderNo.value)}` })
      return
    }
    uni.navigateBack()
  }

  function onContactCs(): void {
    uni.makePhoneCall({
      phoneNumber: CS_PHONE,
      fail: () => {
        uni.showToast({ title: '请稍后重试', icon: 'none' })
      }
    })
  }
</script>

<style lang="scss" scoped>
  .result {
    min-height: 100vh;
    padding: 96rpx 32rpx;
    background: #f5f6f8;

    &__panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64rpx 32rpx 48rpx;
      background: #fff;
      border-radius: 24rpx;
    }

    &__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 160rpx;
      height: 160rpx;
      border-radius: 50%;

      &--ok {
        background: #67c23a;
      }

      &--fail {
        background: #f56c6c;
      }
    }

    &__icon-mark {
      font-size: 96rpx;
      font-weight: 600;
      line-height: 1;
      color: #fff;
    }

    &__title {
      margin-top: 32rpx;
      font-size: 36rpx;
      font-weight: 600;
      color: #333;
    }

    &__amount {
      margin-top: 24rpx;
      font-size: 64rpx;
      font-weight: 600;
      color: #ff6a1a;
    }

    &__sub {
      margin-top: 16rpx;
      font-size: 26rpx;
      color: #999;
      text-align: center;
    }

    &__pending-tip {
      margin-top: 16rpx;
      font-size: 24rpx;
      color: #999;
    }

    &__actions {
      display: flex;
      flex-direction: column;
      gap: 16rpx;
      width: 100%;
      margin-top: 64rpx;
    }

    &__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 80rpx;
      font-size: 28rpx;
      border: none;
      border-radius: 40rpx;

      &--primary {
        color: #fff;
        background: #ff6a1a;
      }

      &--ghost {
        color: #ff6a1a;
        background: rgba(255, 106, 26, 0.08);
      }
    }
  }
</style>
