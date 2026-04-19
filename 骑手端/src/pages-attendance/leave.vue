<template>
  <view class="page">
    <view class="card">
      <view class="card__title">请假类型</view>
      <view class="seg">
        <view
          v-for="t in types"
          :key="t.value"
          class="seg__item"
          :class="{ 'seg__item--active': form.leaveType === t.value }"
          @click="form.leaveType = t.value"
        >
          {{ t.label }}
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card__title">起止日期</view>
      <view class="date-row">
        <picker mode="date" :value="form.startDate" @change="onStart">
          <view class="date-cell">📅 {{ form.startDate || '开始日期' }}</view>
        </picker>
        <text class="hyphen">至</text>
        <picker mode="date" :value="form.endDate" @change="onEnd">
          <view class="date-cell">📅 {{ form.endDate || '结束日期' }}</view>
        </picker>
      </view>
    </view>

    <view class="card">
      <view class="card__title">请假理由</view>
      <textarea
        v-model="form.reason"
        class="textarea"
        placeholder="请详细说明请假原因，便于平台审核"
        maxlength="200"
      />
    </view>

    <button class="primary" :disabled="!canSubmit || submitting" @click="onSubmit">
      {{ submitting ? '提交中...' : '提交请假申请' }}
    </button>

    <view v-if="historyVisible && history.length > 0" class="history">
      <view class="history__title">最近申请</view>
      <view v-for="h in history" :key="h.id" class="history__row">
        <text>{{ h.startDate }} ~ {{ h.endDate }}</text>
        <text :class="`status status--${h.status}`">{{ statusText(h.status) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed } from 'vue'
  import dayjs from 'dayjs'
  import { onShow } from '@dcloudio/uni-app'
  import { applyLeave, fetchLeaveHistory } from '@/api/attendance'
  import type { LeaveApply } from '@/types/biz'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 请假申请 + 历史
   *   T7.38
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const submitting = ref(false)
  const historyVisible = ref(false)
  const history = ref<LeaveApply[]>([])

  const types: { value: 1 | 2 | 3; label: string }[] = [
    { value: 1, label: '事假' },
    { value: 2, label: '病假' },
    { value: 3, label: '调休' }
  ]

  const form = reactive({
    leaveType: 1 as 1 | 2 | 3,
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
    reason: ''
  })

  const canSubmit = computed(() => {
    if (!form.startDate || !form.endDate) return false
    if (dayjs(form.endDate).isBefore(dayjs(form.startDate))) return false
    if (form.reason.trim().length < 5) return false
    return true
  })

  onShow(async () => {
    try {
      history.value = await fetchLeaveHistory()
      historyVisible.value = true
    } catch (e) {
      logger.warn('leave.history.fail', { e: String(e) })
    }
  })

  function onStart(e: Event) {
    form.startDate = (e as Event & { detail: { value: string } }).detail.value
  }

  function onEnd(e: Event) {
    form.endDate = (e as Event & { detail: { value: string } }).detail.value
  }

  function statusText(s: 'pending' | 'approved' | 'rejected'): string {
    return ({ pending: '待审核', approved: '已通过', rejected: '已驳回' } as const)[s] ?? '-'
  }

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    try {
      await applyLeave(form)
      track(TRACK.APPLY_LEAVE, { type: form.leaveType })
      uni.showToast({ title: '已提交，等待审核', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('leave.apply.fail', { e: String(e) })
      uni.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      submitting.value = false
    }
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
    gap: 12rpx;
  }

  .seg__item {
    flex: 1;
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

  .date-row {
    display: flex;
    gap: 16rpx;
    align-items: center;
  }

  .date-cell {
    flex: 1;
    height: 72rpx;
    padding: 0 16rpx;
    font-size: 24rpx;
    line-height: 72rpx;
    color: $uni-text-color;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .hyphen {
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .textarea {
    width: 100%;
    min-height: 200rpx;
    padding: 16rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
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

  .history {
    padding: 24rpx;
    margin-top: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 16rpx;
      font-size: 26rpx;
      font-weight: 600;
    }

    &__row {
      display: flex;
      justify-content: space-between;
      padding: 12rpx 0;
      font-size: 22rpx;
    }
  }

  .status {
    &--pending {
      color: $uni-color-warning;
    }

    &--approved {
      color: $uni-color-primary;
    }

    &--rejected {
      color: $uni-color-error;
    }
  }
</style>
