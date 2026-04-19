<template>
  <view v-if="visible && currentOrder" class="nom">
    <view class="nom-mask" />
    <view class="nom-panel">
      <view class="nom-header">
        <text class="nom-header__icon">🔔</text>
        <text class="nom-header__title">您有新订单</text>
        <text class="nom-header__no">{{ currentOrder.orderNo }}</text>
      </view>

      <view class="nom-body">
        <view class="nom-amount">
          <text class="nom-amount__label">订单金额</text>
          <text class="nom-amount__value">{{ formatAmount(currentOrder.payAmount) }}</text>
        </view>

        <view class="nom-info">
          <view class="nom-row">
            <text class="nom-row__label">收件人</text>
            <text>{{ currentOrder.receiverName }}（{{ currentOrder.receiverMobile }}）</text>
          </view>
          <view class="nom-row">
            <text class="nom-row__label">送达地址</text>
            <text>{{ currentOrder.receiverAddress }}</text>
          </view>
          <view class="nom-row">
            <text class="nom-row__label">距离</text>
            <text>{{ formatDistance(currentOrder.distance) }}</text>
          </view>
          <view v-if="currentOrder.remark" class="nom-row">
            <text class="nom-row__label">备注</text>
            <text class="nom-row__remark">{{ currentOrder.remark }}</text>
          </view>
        </view>

        <view class="nom-items">
          <text class="nom-items__title">商品（{{ totalQty }} 件）</text>
          <view
            v-for="it in currentOrder.items"
            :key="`${it.productId}-${it.skuId}`"
            class="nom-item"
          >
            <text class="nom-item__name"
              >{{ it.productName }} {{ it.skuName ? `(${it.skuName})` : '' }}</text
            >
            <text class="nom-item__qty">×{{ it.qty }}</text>
            <text class="nom-item__price">{{ formatAmount(it.subtotal) }}</text>
          </view>
        </view>
      </view>

      <view class="nom-footer">
        <view v-if="autoAcceptCountdown > 0" class="nom-countdown">
          {{ autoAcceptCountdown }}s 后自动接单
        </view>
        <view class="nom-btns">
          <button class="nom-btn nom-btn--reject" @click="onReject">拒单</button>
          <button class="nom-btn nom-btn--ignore" @click="onIgnore">稍后处理</button>
          <button class="nom-btn nom-btn--accept" @click="onAccept">立即接单</button>
        </view>
        <view class="nom-mute" @click="onToggleMute">
          {{ muted ? '🔕 已静音本条' : '🔔 长按 2s 静音本条' }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
  import { useOrderStore, useNotifySettingsStore, useShopStore } from '@/store'
  import type { MerchantOrder } from '@/types/biz'
  import { startRingtone, stopRingtone } from '@/utils/ringtone'
  import { playTTS, stopTTS } from '@/utils/tts'
  import { acceptOrder, rejectOrder } from '@/api/order'
  import { mockEnabled, delay } from '@/api/_mock'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * NewOrderModal 全屏新订单浮层（S3 核心体验 / T6.20）
   *
   * 触发：
   *   - WS topic merchant:order:new 推送时调用 orderStore.pushNewOrder()
   *   - 极光推送在 APP 后台时唤醒（兜底通道）
   *
   * 功能：
   *   - 全屏（覆盖状态栏，safe-area-inset-top）
   *   - TTS 播报「您有新订单，金额 XX 元」
   *   - 铃声循环（音量从 NotifySettings 读取）
   *   - 自动接单：5s 倒计时（autoAccept=1 + 营业中）
   *   - 长按 2s 静音本条
   *   - 拒单 / 稍后处理 / 立即接单
   *
   * P5 经验：金额展示用 formatAmount，避免精度问题
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.20)
   */
  const orderStore = useOrderStore()
  const notifyStore = useNotifySettingsStore()
  const shopStore = useShopStore()

  const visible = computed<boolean>(() => orderStore.newOrderQueue.length > 0)
  const currentOrder = computed<MerchantOrder | null>(() => orderStore.newOrderQueue[0] ?? null)
  const totalQty = computed<number>(() =>
    currentOrder.value ? currentOrder.value.items.reduce((s, it) => s + it.qty, 0) : 0
  )

  const muted = ref<boolean>(false)
  const autoAcceptCountdown = ref<number>(0)
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  /** 订单变化时触发铃声 + TTS + 自动接单倒计时 */
  watch(
    () => currentOrder.value?.orderNo,
    (newNo) => {
      if (!newNo) {
        cleanup()
        return
      }
      muted.value = false
      onNewOrderPushed()
    }
  )

  onMounted(() => {
    if (currentOrder.value) {
      onNewOrderPushed()
    }
  })

  onBeforeUnmount(() => {
    cleanup()
  })

  function onNewOrderPushed() {
    if (!currentOrder.value) return
    track(TRACK.RECEIVE_NEW_ORDER, { orderNo: currentOrder.value.orderNo })
    /* 铃声 */
    if (notifyStore.settings.newOrderRingtone === 1 && !muted.value) {
      startRingtone({
        loop: notifyStore.settings.ringtoneLoop === 1,
        volume: notifyStore.settings.ringtoneVolume / 100
      })
    }
    /* TTS */
    if (notifyStore.settings.newOrderTts === 1 && !muted.value) {
      void playTTS(`您有新订单，金额 ${currentOrder.value.payAmount} 元`)
    }
    /* 自动接单 */
    if (notifyStore.settings.autoAccept === 1 && shopStore.isOpen) {
      startAutoAccept()
    }
  }

  function startAutoAccept() {
    autoAcceptCountdown.value = notifyStore.settings.autoAcceptCountdown
    countdownTimer = setInterval(() => {
      autoAcceptCountdown.value -= 1
      if (autoAcceptCountdown.value <= 0) {
        stopAutoAccept()
        void onAccept()
      }
    }, 1000)
  }

  function stopAutoAccept() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    autoAcceptCountdown.value = 0
  }

  function cleanup() {
    stopAutoAccept()
    stopRingtone()
    stopTTS()
  }

  function onToggleMute() {
    muted.value = !muted.value
    if (muted.value) {
      stopRingtone()
      stopTTS()
    }
  }

  async function onAccept() {
    if (!currentOrder.value) return
    const orderNo = currentOrder.value.orderNo
    cleanup()
    try {
      if (mockEnabled()) {
        await delay({ ok: true, estimatedCookMin: 25 })
      } else {
        await acceptOrder(orderNo)
      }
      track(TRACK.CLICK_ACCEPT_ORDER, { orderNo })
      uni.showToast({ title: '已接单', icon: 'success' })
      orderStore.shiftNewOrder()
    } catch (e) {
      logger.warn('nom.accept.fail', { e: String(e) })
    }
  }

  async function onReject() {
    if (!currentOrder.value) return
    const orderNo = currentOrder.value.orderNo
    uni.showActionSheet({
      itemList: ['菜品已售完', '门店繁忙', '配送范围超出', '其他'],
      success: async (res) => {
        const reason = ['菜品已售完', '门店繁忙', '配送范围超出', '其他'][res.tapIndex]
        cleanup()
        try {
          if (mockEnabled()) {
            await delay({ ok: true })
          } else {
            await rejectOrder(orderNo, reason)
          }
          track(TRACK.CLICK_REJECT_ORDER, { orderNo, reason })
          uni.showToast({ title: '已拒单', icon: 'none' })
          orderStore.shiftNewOrder()
        } catch (e) {
          logger.warn('nom.reject.fail', { e: String(e) })
        }
      }
    })
  }

  function onIgnore() {
    cleanup()
    /* "稍后处理"：把订单从弹层队列移除，但保留在订单列表 pending 中 */
    orderStore.shiftNewOrder()
  }
</script>

<style lang="scss" scoped>
  .nom {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    padding-top: constant(safe-area-inset-top);
    padding-top: env(safe-area-inset-top);
  }

  .nom-mask {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 70%);
  }

  .nom-panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fff;
  }

  .nom-header {
    display: flex;
    align-items: center;
    padding: 32rpx;
    color: #fff;
    background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%);

    &__icon {
      margin-right: 16rpx;
      font-size: 48rpx;
      animation: nom-shake 0.6s infinite;
    }

    &__title {
      flex: 1;
      font-size: 36rpx;
      font-weight: 600;
    }

    &__no {
      font-size: 22rpx;
      opacity: 0.85;
    }
  }

  @keyframes nom-shake {
    0% {
      transform: rotate(-15deg);
    }

    50% {
      transform: rotate(15deg);
    }

    100% {
      transform: rotate(-15deg);
    }
  }

  .nom-body {
    flex: 1;
    padding: 32rpx;
    overflow-y: auto;
  }

  .nom-amount {
    padding: 32rpx;
    margin-bottom: 24rpx;
    text-align: center;
    background: $uni-color-primary-light;
    border-radius: 16rpx;

    &__label {
      display: block;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__value {
      display: block;
      margin-top: 8rpx;
      font-size: 64rpx;
      font-weight: 700;
      color: $uni-color-primary;
    }
  }

  .nom-info {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: $uni-bg-color-grey;
    border-radius: 16rpx;
  }

  .nom-row {
    display: flex;
    margin-bottom: 12rpx;
    font-size: 26rpx;

    &__label {
      width: 120rpx;
      color: $uni-text-color-grey;
    }

    &__remark {
      flex: 1;
      color: $uni-color-warning;
    }
  }

  .nom-items {
    padding: 24rpx;
    background: $uni-bg-color-grey;
    border-radius: 16rpx;

    &__title {
      display: block;
      margin-bottom: 12rpx;
      font-size: 26rpx;
      font-weight: 500;
      color: $uni-text-color;
    }
  }

  .nom-item {
    display: flex;
    align-items: center;
    padding: 8rpx 0;
    font-size: 24rpx;

    &__name {
      flex: 1;
    }

    &__qty {
      width: 80rpx;
      color: $uni-text-color-grey;
      text-align: center;
    }

    &__price {
      width: 120rpx;
      text-align: right;
    }
  }

  .nom-footer {
    padding: 32rpx;
    padding-bottom: calc(32rpx + constant(safe-area-inset-bottom));
    padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
    background: #fff;
    border-top: 1rpx solid $uni-border-color;
  }

  .nom-countdown {
    margin-bottom: 16rpx;
    font-size: 24rpx;
    color: $uni-color-warning;
    text-align: center;
  }

  .nom-btns {
    display: flex;
    gap: 16rpx;
  }

  .nom-btn {
    flex: 1;
    height: 96rpx;
    padding: 0;
    font-size: 30rpx;
    line-height: 96rpx;
    color: $uni-text-color;
    background: $uni-bg-color-grey;
    border: none;
    border-radius: 12rpx;

    &::after {
      border: none;
    }

    &--reject {
      color: #fff;
      background: $uni-color-error;
    }

    &--ignore {
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
    }

    &--accept {
      flex: 2;
      color: #fff;
      background: $uni-color-success;
    }
  }

  .nom-mute {
    margin-top: 16rpx;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
