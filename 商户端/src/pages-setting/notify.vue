<template>
  <view class="page page-notify">
    <view class="notify-card">
      <text class="notify-title">新订单提醒</text>

      <view class="notify-row">
        <text class="notify-label">语音播报</text>
        <switch
          :checked="settings.newOrderTts === 1"
          color="#2F80ED"
          @change="(e: unknown) => onToggle('newOrderTts', e)"
        />
      </view>
      <view class="notify-row">
        <text class="notify-label">铃声</text>
        <switch
          :checked="settings.newOrderRingtone === 1"
          color="#2F80ED"
          @change="(e: unknown) => onToggle('newOrderRingtone', e)"
        />
      </view>
      <view class="notify-row notify-row--col">
        <text class="notify-label">铃声音量：{{ settings.ringtoneVolume }}%</text>
        <slider
          :value="settings.ringtoneVolume"
          :min="0"
          :max="100"
          :step="10"
          activeColor="#2F80ED"
          @change="(e: unknown) => onVolume(e)"
        />
      </view>
      <view class="notify-row">
        <text class="notify-label">铃声循环</text>
        <switch
          :checked="settings.ringtoneLoop === 1"
          color="#2F80ED"
          @change="(e: unknown) => onToggle('ringtoneLoop', e)"
        />
      </view>
    </view>

    <view class="notify-card">
      <text class="notify-title">自动接单</text>
      <view class="notify-row">
        <text class="notify-label">开启</text>
        <switch
          :checked="settings.autoAccept === 1"
          color="#2F80ED"
          @change="(e: unknown) => onToggle('autoAccept', e)"
        />
      </view>
      <view v-if="settings.autoAccept === 1" class="notify-row">
        <text class="notify-label">倒计时（秒）</text>
        <input
          v-model.number="settings.autoAcceptCountdown"
          class="notify-input"
          type="number"
          @blur="onCountdownBlur"
        />
      </view>
    </view>

    <view class="notify-tip">
      <text>· 通知设置仅影响 APP 端新订单弹层</text>
      <text>· 小程序版受限于平台政策，无法循环铃声 / TTS 播报</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue'
  import { useNotifySettingsStore } from '@/store'

  /**
   * 通知/语音/铃声设置（T6.39）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const notifyStore = useNotifySettingsStore()
  const settings = computed(() => notifyStore.settings)

  watch(
    settings,
    () => {
      /* persistedstate 自动同步 */
    },
    { deep: true }
  )

  function onToggle(
    field: 'newOrderTts' | 'newOrderRingtone' | 'ringtoneLoop' | 'autoAccept',
    e: unknown
  ) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    notifyStore.update({ [field]: v ? 1 : 0 })
  }

  function onVolume(e: unknown) {
    const v = (e as { detail?: { value?: number } })?.detail?.value
    if (typeof v === 'number') {
      notifyStore.update({ ringtoneVolume: Math.max(0, Math.min(100, v)) })
    }
  }

  function onCountdownBlur() {
    const v = settings.value.autoAcceptCountdown
    if (!Number.isInteger(v) || v < 3 || v > 30) {
      notifyStore.update({ autoAcceptCountdown: 5 })
      uni.showToast({ title: '倒计时须为 3-30 秒', icon: 'none' })
    }
  }
</script>

<style lang="scss" scoped>
  .page-notify {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .notify-card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .notify-title {
    display: block;
    margin-bottom: 16rpx;
    font-size: 28rpx;
    font-weight: 600;
  }

  .notify-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16rpx 0;

    &--col {
      flex-direction: column;
      gap: 8rpx;
      align-items: stretch;
    }
  }

  .notify-label {
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .notify-input {
    width: 160rpx;
    height: 64rpx;
    padding: 0 16rpx;
    font-size: 26rpx;
    text-align: center;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .notify-tip {
    padding: 24rpx;
    font-size: 22rpx;
    line-height: 1.8;
    color: $uni-text-color-grey;
  }
</style>
