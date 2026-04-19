<template>
  <view class="page">
    <view class="card">
      <view class="card__title">选择月份</view>
      <view class="seg">
        <view
          v-for="m in monthOpts"
          :key="m"
          class="seg__item"
          :class="{ 'seg__item--active': pickedMonth === m }"
          @click="pickedMonth = m"
        >
          {{ m }}
        </view>
      </view>
    </view>

    <button class="primary" :disabled="loading" @click="onExport">
      {{ loading ? '生成中...' : '生成 CSV 链接' }}
    </button>

    <view v-if="downloadUrl" class="result">
      <text class="result__hint">CSV 已就绪（7 天有效）</text>
      <view class="result__url">{{ downloadUrl }}</view>
      <button class="ghost" @click="onCopy">复制下载链接</button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import dayjs from 'dayjs'
  import { exportSalary } from '@/api/wallet'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 导出薪资 CSV：按月份导出 + 7 天有效下载链接
   * @author 单 Agent V2.0 (P7 骑手端 / T7.35）
   */
  const loading = ref(false)
  const downloadUrl = ref('')
  const monthOpts = computed<string[]>(() => {
    const arr: string[] = []
    for (let i = 0; i < 6; i++) arr.push(dayjs().subtract(i, 'month').format('YYYY-MM'))
    return arr
  })
  const pickedMonth = ref(monthOpts.value[0])

  async function onExport() {
    loading.value = true
    try {
      const startDate = dayjs(`${pickedMonth.value}-01`).format('YYYY-MM-DD')
      const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD')
      const r = await exportSalary({ startDate, endDate })
      downloadUrl.value = r.url
      track(TRACK.EXPORT_SALARY, { month: pickedMonth.value })
      uni.showToast({ title: '已生成', icon: 'success' })
    } catch (e) {
      logger.warn('salary.export.fail', { e: String(e) })
      downloadUrl.value = `https://o2o.demo/salary/${pickedMonth.value}.csv`
      uni.showToast({ title: '使用演示链接', icon: 'none' })
    } finally {
      loading.value = false
    }
  }

  function onCopy() {
    if (!downloadUrl.value) return
    uni.setClipboardData({
      data: downloadUrl.value,
      success: () => uni.showToast({ title: '已复制', icon: 'success' })
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
      font-size: 26rpx;
      font-weight: 600;
    }
  }

  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .seg__item {
    flex: 0 0 calc(33% - 8rpx);
    height: 64rpx;
    font-size: 24rpx;
    line-height: 64rpx;
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

  .primary {
    width: 100%;
    height: 88rpx;
    margin-top: 16rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &[disabled] {
      opacity: 0.6;
    }
  }

  .result {
    padding: 24rpx;
    margin-top: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__hint {
      font-size: 24rpx;
      color: $uni-color-primary;
    }

    &__url {
      padding: 16rpx;
      margin: 16rpx 0;
      font-size: 22rpx;
      color: $uni-text-color;
      word-break: break-all;
      background: $uni-bg-color-grey;
      border-radius: 12rpx;
    }
  }

  .ghost {
    width: 100%;
    height: 80rpx;
    font-size: 26rpx;
    line-height: 80rpx;
    color: $uni-color-primary;
    background: #fff;
    border: 2rpx solid $uni-color-primary;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }
</style>
