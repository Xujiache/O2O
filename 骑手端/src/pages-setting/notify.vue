<template>
  <view class="page">
    <view class="card">
      <view class="card__title">派单提醒</view>
      <view class="row">
        <text class="row__label">语音播报（TTS）</text>
        <switch color="#00B578" :checked="ui.notify.dispatchTts === 1" @change="onTts" />
      </view>
      <view class="row__hint">"新订单，外卖，距离 X 米，预估 X 元"</view>
      <view class="row">
        <text class="row__label">铃声</text>
        <switch color="#00B578" :checked="ui.notify.dispatchRingtone === 1" @change="onRing" />
      </view>
      <view class="row">
        <text class="row__label">铃声循环</text>
        <switch color="#00B578" :checked="ui.notify.ringtoneLoop === 1" @change="onLoop" />
      </view>
      <view class="row">
        <text class="row__label">振动</text>
        <switch color="#00B578" :checked="ui.notify.vibrate === 1" @change="onVibrate" />
      </view>
    </view>

    <view class="card">
      <view class="card__title">铃声音量</view>
      <slider
        :value="ui.notify.ringtoneVolume"
        :min="0"
        :max="100"
        :step="10"
        block-size="24"
        active-color="#00B578"
        show-value
        @change="onVolume"
      />
    </view>

    <view class="card">
      <view class="card__title">试听铃声</view>
      <BizBtn type="primary" block @click="onTry">▶ 播放铃声</BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { useUiStore } from '@/store'
  import { startRingtone, stopRingtone } from '@/utils/ringtone'

  /**
   * 通知设置：铃声/TTS/振动 + 音量
   *   T7.43
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const ui = useUiStore()

  function onTts(e: Event) {
    const v = (e as Event & { detail: { value: boolean } }).detail.value
    ui.setNotify({ dispatchTts: v ? 1 : 0 })
  }

  function onRing(e: Event) {
    const v = (e as Event & { detail: { value: boolean } }).detail.value
    ui.setNotify({ dispatchRingtone: v ? 1 : 0 })
  }

  function onLoop(e: Event) {
    const v = (e as Event & { detail: { value: boolean } }).detail.value
    ui.setNotify({ ringtoneLoop: v ? 1 : 0 })
  }

  function onVibrate(e: Event) {
    const v = (e as Event & { detail: { value: boolean } }).detail.value
    ui.setNotify({ vibrate: v ? 1 : 0 })
  }

  function onVolume(e: Event) {
    const v = (e as Event & { detail: { value: number } }).detail.value
    ui.setNotify({ ringtoneVolume: Number(v) })
  }

  function onTry() {
    startRingtone({ loop: false, volume: ui.notify.ringtoneVolume / 100 })
    setTimeout(() => stopRingtone(), 3000)
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

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8rpx 0;

    &__label {
      font-size: 26rpx;
    }

    &__hint {
      margin-bottom: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }
</style>
