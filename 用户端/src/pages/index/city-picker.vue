<template>
  <view class="page city">
    <view class="city__current">
      <text class="city__current-label">当前定位</text>
      <view class="city__current-name" @tap="onAutoLocate">
        <text>{{ store.city?.cityName ?? '点击重新定位' }}</text>
      </view>
    </view>

    <view class="city__search">
      <input v-model="kw" class="city__search-input" placeholder="输入城市名 / 拼音搜索" />
    </view>

    <BizLoading v-if="loading" />
    <BizEmpty v-else-if="!loading && filtered.length === 0" text="暂无开通城市" />
    <scroll-view v-else scroll-y class="city__list">
      <view v-for="c in filtered" :key="c.cityCode" class="city__item" @tap="onPick(c)">
        <text class="city__item-name">{{ c.cityName }}</text>
        <text v-if="c.letter" class="city__item-letter">{{ c.letter }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/index/city-picker.vue
   * @stage P5/T5.9 (Sprint 1)
   * @desc 城市选择：定位 + 搜索 + 列表；选中后写 location store 并返回
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { useLocationStore } from '@/store/location'
  import { autoLocate, loadOpenedCities } from '@/utils/location'
  import type { City } from '@/types/biz'

  const store = useLocationStore()
  const loading = ref<boolean>(true)
  const list = ref<City[]>([])
  const kw = ref<string>('')

  const filtered = computed<City[]>(() => {
    if (!kw.value) return list.value
    const k = kw.value.toLowerCase()
    return list.value.filter(
      (c) =>
        c.cityName.toLowerCase().includes(k) ||
        c.pinyin.toLowerCase().includes(k) ||
        c.letter.toLowerCase().includes(k)
    )
  })

  onLoad(async () => {
    list.value = await loadOpenedCities()
    loading.value = false
  })

  async function onAutoLocate() {
    loading.value = true
    await autoLocate()
    loading.value = false
  }

  function onPick(c: City) {
    store.setCity(c)
    uni.navigateBack()
  }
</script>

<style lang="scss" scoped>
  .city {
    min-height: 100vh;

    &__current {
      padding: 24rpx 32rpx;
      background: $color-bg-white;
    }

    &__current-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__current-name {
      margin-top: 12rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-primary;
    }

    &__search {
      padding: 16rpx 32rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__search-input {
      height: 64rpx;
      padding: 0 24rpx;
      font-size: $font-size-base;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__list {
      height: calc(100vh - 240rpx);
    }

    &__item {
      @include flex-between;

      padding: 24rpx 32rpx;
      background: $color-bg-white;
      border-bottom: 1rpx solid $color-divider;
    }

    &__item-name {
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__item-letter {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }
  }
</style>
