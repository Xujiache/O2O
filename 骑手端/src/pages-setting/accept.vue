<template>
  <view class="page">
    <view class="card">
      <view class="card__title">接单模式</view>
      <view class="row">
        <text class="row__label">系统派单</text>
        <switch color="#00B578" :checked="pref.mode === 1" @change="onModeSwitch" />
      </view>
      <view class="row__hint">关闭后不再接收 DispatchModal 弹层，仅可在大厅手动抢单</view>
    </view>

    <view class="card">
      <view class="card__title">接单类型</view>
      <view class="seg">
        <view
          v-for="b in bizTypes"
          :key="b.value"
          class="seg__item"
          :class="{ 'seg__item--active': pref.bizType === b.value }"
          @click="onBizChange(b.value)"
        >
          {{ b.label }}
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card__title">接单半径</view>
      <view class="row">
        <text class="row__label">{{ pref.radius }} 米</text>
      </view>
      <slider
        :value="pref.radius"
        :min="500"
        :max="5000"
        :step="500"
        block-size="24"
        :show-value="false"
        active-color="#00B578"
        @change="onRadiusSlider"
      />
      <view class="row__hint">超出半径的订单不再推送，最大 5km</view>
    </view>

    <view class="card">
      <view class="card__title">同时配送上限</view>
      <view class="seg">
        <view
          v-for="n in [1, 2, 3, 4, 5]"
          :key="n"
          class="seg__item"
          :class="{ 'seg__item--active': pref.maxConcurrent === n }"
          @click="onConcurrentChange(n)"
        >
          {{ n }} 单
        </view>
      </view>
      <view class="row__hint">超过此数即不再接受派单 / 抢单</view>
    </view>

    <view class="card">
      <view class="card__title">顺路单</view>
      <view class="row">
        <text class="row__label">允许顺路推荐</text>
        <switch color="#00B578" :checked="pref.acceptRouteShare" @change="onRouteSwitch" />
      </view>
      <view class="row__hint">配送途中将额外推送同向订单，提升单价</view>
    </view>

    <BizBtn type="primary" block @click="onSave">保存设置</BizBtn>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useWorkStore } from '@/store'
  import type { AcceptPreference } from '@/types/biz'

  /**
   * 接单偏好：mode / bizType / radius / maxConcurrent / acceptRouteShare
   *   即时生效（store 内部已 silent 同步至 /rider/preference）
   * @author 单 Agent V2.0 (P7 骑手端 / T7.16）
   */
  const work = useWorkStore()
  const pref = ref<AcceptPreference>({ ...work.preference })

  const bizTypes: { value: 1 | 2 | 3; label: string }[] = [
    { value: 3, label: '全部' },
    { value: 1, label: '外卖' },
    { value: 2, label: '跑腿' }
  ]

  onMounted(() => {
    pref.value = { ...work.preference }
  })

  function onModeChange(v: boolean) {
    pref.value.mode = v ? 1 : 2
    void work.setPreference(pref.value)
  }

  function onModeSwitch(e: Event) {
    const v = (e as Event & { detail: { value: boolean } }).detail.value
    onModeChange(Boolean(v))
  }

  function onRouteSwitch(e: Event) {
    const v = (e as Event & { detail: { value: boolean } }).detail.value
    onRouteChange(Boolean(v))
  }

  function onRadiusSlider(e: Event) {
    const v = (e as Event & { detail: { value: number } }).detail.value
    onRadiusChange(Number(v))
  }

  function onBizChange(v: 1 | 2 | 3) {
    pref.value.bizType = v
    void work.setPreference(pref.value)
  }

  function onRadiusChange(v: number) {
    if (v < 500 || v > 5000) {
      uni.showToast({ title: '半径必须 500-5000 米', icon: 'none' })
      return
    }
    pref.value.radius = v
    void work.setPreference(pref.value)
  }

  function onConcurrentChange(v: number) {
    pref.value.maxConcurrent = v
    void work.setPreference(pref.value)
  }

  function onRouteChange(v: boolean) {
    pref.value.acceptRouteShare = v
    void work.setPreference(pref.value)
  }

  function onSave() {
    void work.setPreference(pref.value).then(() => {
      uni.showToast({ title: '已保存', icon: 'success' })
    })
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
      font-size: 28rpx;
      font-weight: 600;
      color: $uni-text-color;
    }
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8rpx 0;

    &__label {
      font-size: 26rpx;
      color: $uni-text-color;
    }

    &__hint {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .seg {
    display: flex;
    gap: 12rpx;
  }

  .seg__item {
    flex: 1;
    height: 64rpx;
    font-size: 24rpx;
    line-height: 64rpx;
    color: $uni-text-color-grey;
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
</style>
