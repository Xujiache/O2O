<template>
  <view v-if="visible && currentDispatch" class="dm">
    <view class="dm-mask" />
    <view class="dm-panel">
      <!-- 顶部：业务类型 + 模式 + 订单号 -->
      <view class="dm-header" :class="`dm-header--biz${currentDispatch.businessType}`">
        <text class="dm-header__icon">🚴</text>
        <text class="dm-header__title">{{ headerTitle }}</text>
        <text class="dm-header__no">{{ currentDispatch.orderNo }}</text>
      </view>

      <view class="dm-body">
        <view class="dm-amount">
          <text class="dm-amount__label">配送费</text>
          <text class="dm-amount__value">{{ formatAmount(currentDispatch.deliveryFee) }}</text>
        </view>

        <view class="dm-route">
          <view class="dm-route__line">
            <text class="dm-dot dm-dot--start">A</text>
            <view class="dm-route__col">
              <text class="dm-route__name">{{ currentDispatch.pickupName }}</text>
              <text class="dm-route__addr">{{ currentDispatch.pickupAddress }}</text>
              <text class="dm-route__dist"
                >距您 {{ formatDistance(currentDispatch.pickupDistance) }}</text
              >
            </view>
          </view>
          <view class="dm-route__line">
            <text class="dm-dot dm-dot--end">B</text>
            <view class="dm-route__col">
              <text class="dm-route__name">{{ currentDispatch.deliverName }}</text>
              <text class="dm-route__addr">{{ currentDispatch.deliverAddress }}</text>
              <text class="dm-route__dist"
                >配送 {{ formatDistance(currentDispatch.deliverDistance) }} · 预计
                {{ currentDispatch.estDeliverMin }} 分钟</text
              >
            </view>
          </view>
        </view>

        <view v-if="currentDispatch.remark" class="dm-remark"
          >备注：{{ currentDispatch.remark }}</view
        >
      </view>

      <view class="dm-footer">
        <!-- 派单模式：15s 倒计时；抢单模式：还剩 X 单 -->
        <view
          v-if="isDispatch"
          class="dm-countdown"
          :class="{ 'dm-countdown--urgent': countdown <= 5 }"
        >
          {{ countdown }}s 后自动拒单
        </view>
        <view v-else class="dm-countdown dm-countdown--grab"> 抢单池剩余 {{ hallRest }} 单 </view>

        <view class="dm-btns">
          <button class="dm-btn dm-btn--reject" @click="onReject">拒单</button>
          <button class="dm-btn dm-btn--detail" @click="onDetail">详情</button>
          <button class="dm-btn dm-btn--accept" @click="onAccept">{{ acceptText }}</button>
        </view>

        <view class="dm-mute" @click="onToggleMute">
          {{ muted ? '🔕 已静音本条' : '🔔 点击静音本条' }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onBeforeUnmount } from 'vue'
  import type { DispatchOrder } from '@/types/biz'
  import { useDispatchStore, useUiStore } from '@/store'
  import { startRingtone, stopRingtone } from '@/utils/ringtone'
  import { playTTS, stopTTS, buildDispatchSpeech } from '@/utils/tts'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 派单全屏弹层（DispatchModal）
   *
   * V7.7 验收标准（提示词 §5.1 / 严禁与商户端 5s 混淆）：
   *   派单模式：15s 倒计时 + TTS + 循环铃声；超时自动拒单
   *   抢单模式：显示"抢单池剩余 X 单"；不自动倒计时
   *
   * 三按钮：拒单 / 详情 / 立即接单（与 P6 商户端 NewOrderModal 文案不同）
   * 静音 / JSDoc / 文案三者必须一致（P6-R1 / I-04 教训）
   *
   * @author 单 Agent V2.0 (P7 骑手端 / T7.14)
   */

  /** 弹层可见性（仅当 currentDispatch 存在时） */
  const visible = ref(true)
  /** 是否静音本条（仅本条；切换下一条派单后自动恢复） */
  const muted = ref(false)
  /** 当前倒计时（秒；派单模式默认 15s，由 countdownSec 注入） */
  const countdown = ref(15)
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  const dispatchStore = useDispatchStore()
  const ui = useUiStore()

  /** 当前应显示的派单 */
  const currentDispatch = computed<DispatchOrder | null>(() => dispatchStore.currentDispatch)
  /** 是否系统派单（dispatchMode=1 显示倒计时；dispatchMode=2 抢单不倒计时） */
  const isDispatch = computed<boolean>(() => currentDispatch.value?.dispatchMode === 1)
  /** 接单按钮文案：派单模式"立即接单 (X)" / 抢单模式"立即抢单" */
  const acceptText = computed<string>(() =>
    isDispatch.value ? `接单 (${countdown.value})` : '立即抢单'
  )
  /** 抢单池剩余（抢单模式显示） */
  const hallRest = computed<number>(() => Math.max(0, dispatchStore.hallList.length - 1))
  /** 顶部标题：外卖派单 / 跑腿抢单 等 */
  const headerTitle = computed<string>(() => {
    if (!currentDispatch.value) return ''
    const biz = currentDispatch.value.businessType === 1 ? '外卖' : '跑腿'
    const mode = currentDispatch.value.dispatchMode === 1 ? '派单' : '抢单'
    return `${biz}${mode}`
  })

  /**
   * 监听新派单到达：启动铃声 + TTS + 倒计时（15s）
   */
  watch(
    () => currentDispatch.value?.orderNo,
    (newOrderNo, oldOrderNo) => {
      if (newOrderNo === oldOrderNo) return
      stopAll()
      if (!currentDispatch.value) return
      visible.value = true
      muted.value = false
      const sec = currentDispatch.value.countdownSec ?? 15
      countdown.value = sec
      /* 仅派单模式倒计时 */
      if (isDispatch.value) {
        startCountdown()
      }
      /* 派单模式 + 用户开了铃声 → 循环铃声；TTS 一次性 */
      const wantRing = ui.notify.dispatchRingtone === 1
      const wantTts = ui.notify.dispatchTts === 1
      if (wantRing) {
        startRingtone({
          loop: ui.notify.ringtoneLoop === 1,
          volume: ui.notify.ringtoneVolume / 100
        })
      }
      if (wantTts && currentDispatch.value) {
        const text = buildDispatchSpeech({
          businessType: currentDispatch.value.businessType === 1 ? 'takeout' : 'errand',
          distance: currentDispatch.value.pickupDistance,
          fee: currentDispatch.value.deliveryFee
        })
        void playTTS(text)
      }
      track(TRACK.RECEIVE_DISPATCH, {
        orderNo: currentDispatch.value.orderNo,
        mode: currentDispatch.value.dispatchMode
      })
    },
    { immediate: true }
  )

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) {
        if (countdownTimer) {
          clearInterval(countdownTimer)
          countdownTimer = null
        }
        void onTimeout()
      }
    }, 1000)
  }

  function stopAll() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    stopRingtone()
    stopTTS()
  }

  /** 接单 */
  async function onAccept() {
    if (!currentDispatch.value) return
    const orderNo = currentDispatch.value.orderNo
    stopAll()
    let ok: boolean
    if (currentDispatch.value.dispatchMode === 1) {
      ok = await dispatchStore.acceptDispatch(orderNo)
    } else {
      ok = await dispatchStore.grabOrder(orderNo)
    }
    if (ok) {
      uni.showToast({ title: '接单成功', icon: 'success' })
      uni.navigateTo({ url: `/pages-order/detail?orderNo=${orderNo}` })
    } else {
      uni.showToast({ title: '接单失败，请重试', icon: 'none' })
    }
  }

  /** 拒单 */
  async function onReject() {
    if (!currentDispatch.value) return
    const orderNo = currentDispatch.value.orderNo
    stopAll()
    await dispatchStore.rejectDispatch(orderNo)
    uni.showToast({ title: '已拒单', icon: 'none' })
  }

  /** 查看详情：跳到派单详情页（接单前预览） */
  function onDetail() {
    if (!currentDispatch.value) return
    /* 不停止铃声/倒计时，让骑手返回后还能继续响应 */
    uni.navigateTo({ url: `/pages-hall/detail?orderNo=${currentDispatch.value.orderNo}` })
  }

  /** 倒计时归零：自动拒单 */
  async function onTimeout() {
    if (!currentDispatch.value) return
    const orderNo = currentDispatch.value.orderNo
    stopAll()
    await dispatchStore.timeoutDispatch(orderNo)
    uni.showToast({ title: '已超时自动拒单', icon: 'none' })
    track(TRACK.DISPATCH_TIMEOUT, { orderNo })
    logger.info('dispatch.timeout.auto-reject', { orderNo })
  }

  /**
   * 静音本条：单击切换；与文案保持一致（P6-R1 / I-04 教训）
   */
  function onToggleMute() {
    muted.value = !muted.value
    if (muted.value) {
      stopRingtone()
      stopTTS()
    }
  }

  onBeforeUnmount(() => {
    stopAll()
  })
</script>

<style lang="scss" scoped>
  .dm {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: env(safe-area-inset-top) 24rpx env(safe-area-inset-bottom);
  }

  .dm-mask {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 70%);
  }

  .dm-panel {
    position: relative;
    z-index: 1;
    width: 92%;
    max-height: 84vh;
    overflow-y: auto;
    background: #fff;
    border-radius: 24rpx;
    box-shadow: 0 12rpx 36rpx rgb(0 0 0 / 22%);
  }

  .dm-header {
    display: flex;
    align-items: center;
    padding: 32rpx 32rpx 24rpx;
    color: #fff;
    border-radius: 24rpx 24rpx 0 0;

    &--biz1 {
      background: linear-gradient(135deg, $uni-color-primary 0%, $uni-color-primary-dark 100%);
    }

    &--biz2 {
      background: linear-gradient(135deg, #fa8c16 0%, #d96c00 100%);
    }

    &__icon {
      margin-right: 16rpx;
      font-size: 40rpx;
    }

    &__title {
      flex: 1;
      font-size: 32rpx;
      font-weight: 700;
    }

    &__no {
      font-size: 22rpx;
      opacity: 0.9;
    }
  }

  .dm-body {
    padding: 32rpx;
  }

  .dm-amount {
    padding: 24rpx;
    margin-bottom: 24rpx;
    text-align: center;
    background: $uni-color-primary-light;
    border-radius: 16rpx;

    &__label {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__value {
      display: block;
      margin-top: 8rpx;
      font-size: 56rpx;
      font-weight: 700;
      color: $uni-color-primary-dark;
    }
  }

  .dm-route {
    padding: 24rpx;
    background: $uni-bg-color-grey;
    border-radius: 16rpx;
  }

  .dm-route__line {
    display: flex;
    padding: 16rpx 0;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  .dm-dot {
    width: 36rpx;
    height: 36rpx;
    margin-top: 4rpx;
    margin-right: 16rpx;
    font-size: 22rpx;
    font-weight: 600;
    line-height: 36rpx;
    color: #fff;
    text-align: center;
    border-radius: 50%;

    &--start {
      background: #fa8c16;
    }

    &--end {
      background: $uni-color-primary;
    }
  }

  .dm-route__col {
    flex: 1;
  }

  .dm-route__name {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .dm-route__addr {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .dm-route__dist {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: $uni-color-primary;
  }

  .dm-remark {
    padding: 16rpx;
    margin-top: 16rpx;
    font-size: 22rpx;
    color: $uni-color-warning;
    background: rgb(250 140 22 / 8%);
    border-radius: 12rpx;
  }

  .dm-footer {
    padding: 16rpx 32rpx 32rpx;
    border-top: 1rpx solid $uni-border-color;
  }

  .dm-countdown {
    margin: 16rpx 0;
    font-size: 28rpx;
    font-weight: 700;
    color: $uni-color-warning;
    text-align: center;

    &--urgent {
      font-size: 36rpx;
      color: $uni-color-error;
      animation: blink 0.5s ease-in-out infinite alternate;
    }

    &--grab {
      color: $uni-color-info;
    }
  }

  @keyframes blink {
    0% {
      opacity: 1;
    }

    100% {
      opacity: 0.4;
    }
  }

  .dm-btns {
    display: flex;
    gap: 16rpx;
    margin: 16rpx 0;
  }

  .dm-btn {
    flex: 1;
    height: 88rpx;
    padding: 0;
    font-size: 28rpx;
    font-weight: 600;
    line-height: 88rpx;
    color: #fff;
    border: none;
    border-radius: 12rpx;

    &::after {
      border: none;
    }

    &--reject {
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
    }

    &--detail {
      color: $uni-color-primary;
      background: #fff;
      border: 2rpx solid $uni-color-primary;
    }

    &--accept {
      flex: 1.6;
      background: $uni-color-primary;
    }
  }

  .dm-mute {
    margin-top: 16rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }
</style>
