<template>
  <view class="page page-ps">
    <view class="ps-card">
      <text class="ps-title">打印机设置</text>

      <view class="form-field row-between">
        <text class="form-label">已绑定打印机</text>
        <text class="ps-device">{{ printerStore.device?.name || '未绑定' }}</text>
      </view>
      <view class="ps-state row-between">
        <text class="ps-state__label">连接状态</text>
        <text class="ps-state__value" :class="`ps-state__value--${stateClass}`">{{
          stateText
        }}</text>
      </view>

      <view class="ps-btns">
        <BizBtn type="primary" text="扫描打印机" :disabled="scanning" @click="onScan" />
        <BizBtn v-if="printerStore.device" type="default" text="断开连接" @click="onDisconnect" />
      </view>

      <view v-if="devices.length > 0" class="ps-devices">
        <text class="ps-devices__title">附近设备</text>
        <view v-for="d in devices" :key="d.deviceId" class="ps-device-item" @click="onConnect(d)">
          <text class="ps-device-item__name">{{ d.name }}</text>
          <text class="ps-device-item__rssi">RSSI: {{ d.RSSI ?? '-' }}</text>
        </view>
      </view>
    </view>

    <view class="ps-card">
      <text class="ps-title">打印参数</text>

      <view class="form-field row-between">
        <text class="form-label">纸宽</text>
        <view class="ps-radio">
          <text
            class="ps-radio__opt"
            :class="{ 'ps-radio__opt--active': printerStore.paperWidth === 58 }"
            @click="onChangeWidth(58)"
            >58 mm</text
          >
          <text
            class="ps-radio__opt"
            :class="{ 'ps-radio__opt--active': printerStore.paperWidth === 80 }"
            @click="onChangeWidth(80)"
            >80 mm</text
          >
        </view>
      </view>

      <view class="form-field row-between">
        <text class="form-label">自动打印（接单后）</text>
        <switch :checked="printerStore.autoPrint" color="#2F80ED" @change="onToggleAutoPrint" />
      </view>

      <view class="form-field row-between">
        <text class="form-label">自动重连</text>
        <switch :checked="printerStore.autoConnect" color="#2F80ED" @change="onToggleAutoConnect" />
      </view>

      <view class="form-field row-between">
        <text class="form-label">每单打印份数</text>
        <view class="ps-stepper">
          <text class="ps-stepper__btn" @click="changeCopies(-1)">-</text>
          <text class="ps-stepper__num">{{ printerStore.copies }}</text>
          <text class="ps-stepper__btn" @click="changeCopies(1)">+</text>
        </view>
      </view>
    </view>

    <view class="ps-tip">
      <text>蓝牙打印仅 APP 端支持；连接前请确保打印机已开机并处于配对模式。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { usePrinterStore } from '@/store'
  import type { PrinterDevice } from '@/utils/bluetooth-printer'
  import { printer } from '@/utils/bluetooth-printer'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 打印机设置（T6.23）
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const printerStore = usePrinterStore()
  const devices = ref<PrinterDevice[]>([])
  const scanning = ref<boolean>(false)

  const stateText = computed<string>(() => {
    switch (printer.getState()) {
      case 'connected':
        return '已连接'
      case 'connecting':
        return '连接中...'
      case 'printing':
        return '打印中...'
      case 'error':
        return '错误'
      default:
        return '未连接'
    }
  })

  const stateClass = computed<string>(() => {
    switch (printer.getState()) {
      case 'connected':
      case 'printing':
        return 'ok'
      case 'error':
        return 'err'
      default:
        return 'idle'
    }
  })

  async function onScan() {
    scanning.value = true
    try {
      const list = await printer.scan(8000)
      devices.value = list
      if (list.length === 0) {
        uni.showToast({ title: '未发现可用设备', icon: 'none' })
      }
    } catch (e) {
      logger.warn('printer.scan.fail', { e: String(e) })
      uni.showToast({ title: String(e), icon: 'none' })
    } finally {
      scanning.value = false
    }
  }

  async function onConnect(d: PrinterDevice) {
    try {
      await printer.connect(d)
      printerStore.setDevice(d)
      printerStore.setState('connected')
      track(TRACK.PRINTER_CONNECT, { name: d.name })
      uni.showToast({ title: '已连接', icon: 'success' })
    } catch (e) {
      logger.warn('printer.connect.fail', { e: String(e) })
      uni.showToast({ title: String(e), icon: 'none' })
    }
  }

  async function onDisconnect() {
    try {
      await printer.disconnect()
      printerStore.setDevice(null)
      printerStore.setState('disconnected')
      track(TRACK.PRINTER_DISCONNECT)
      uni.showToast({ title: '已断开', icon: 'success' })
    } catch (e) {
      logger.warn('printer.disconnect.fail', { e: String(e) })
    }
  }

  function onChangeWidth(w: 58 | 80) {
    printerStore.paperWidth = w
  }

  function onToggleAutoPrint(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    printerStore.autoPrint = v
  }
  function onToggleAutoConnect(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    printerStore.autoConnect = v
  }

  function changeCopies(delta: number) {
    const n = printerStore.copies + delta
    if (n >= 1 && n <= 5) {
      printerStore.copies = n
    }
  }
</script>

<style lang="scss" scoped>
  .page-ps {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .ps-card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .ps-title {
    display: block;
    margin-bottom: 16rpx;
    font-size: 28rpx;
    font-weight: 600;
  }

  .form-field {
    padding: 16rpx 0;
  }

  .form-label {
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .ps-device {
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .ps-state {
    padding: 16rpx 0;

    &__label {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__value {
      font-size: 24rpx;

      &--ok {
        color: $uni-color-success;
      }

      &--err {
        color: $uni-color-error;
      }

      &--idle {
        color: $uni-text-color-grey;
      }
    }
  }

  .ps-btns {
    display: flex;
    gap: 16rpx;
    margin-top: 16rpx;
  }

  .ps-devices {
    margin-top: 24rpx;

    &__title {
      display: block;
      margin-bottom: 12rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }
  }

  .ps-device-item {
    display: flex;
    justify-content: space-between;
    padding: 16rpx;
    margin-bottom: 8rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &__name {
      font-size: 26rpx;
      color: $uni-text-color;
    }

    &__rssi {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .ps-radio {
    display: flex;
    gap: 12rpx;

    &__opt {
      padding: 8rpx 24rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
      border: 2rpx solid transparent;
      border-radius: $uni-border-radius-base;

      &--active {
        color: $uni-color-primary;
        background: $uni-color-primary-light;
        border-color: $uni-color-primary;
      }
    }
  }

  .ps-stepper {
    display: flex;
    gap: 16rpx;
    align-items: center;

    &__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56rpx;
      height: 56rpx;
      font-size: 32rpx;
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-radius: 50%;
    }

    &__num {
      width: 60rpx;
      font-size: 28rpx;
      text-align: center;
    }
  }

  .ps-tip {
    padding: 16rpx 24rpx;
    font-size: 22rpx;
    color: $uni-color-warning;
    text-align: center;
  }
</style>
