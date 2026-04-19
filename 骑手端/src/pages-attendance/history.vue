<template>
  <view class="page">
    <view class="month-row">
      <picker mode="date" :value="month" fields="month" @change="onMonth">
        <view class="month-pick">📅 {{ month }}</view>
      </picker>
    </view>

    <view class="summary">
      <view class="summary__cell">
        <view class="summary__num">{{ totalOnlineHours }}</view>
        <view class="summary__label">在线小时</view>
      </view>
      <view class="summary__cell">
        <view class="summary__num">{{ workDays }}</view>
        <view class="summary__label">出勤天数</view>
      </view>
      <view class="summary__cell">
        <view class="summary__num">{{ absentDays }}</view>
        <view class="summary__label">旷工天数</view>
      </view>
    </view>

    <BizEmpty v-if="days.length === 0" title="暂无考勤记录" scene="data" />
    <view v-for="d in days" :key="d.date" class="day">
      <view class="day__head">
        <text class="day__date">{{ d.date }}</text>
        <text v-if="d.isAbsent" class="day__absent">旷工</text>
        <text v-else-if="d.onLeave" class="day__leave">请假</text>
      </view>
      <view class="day__row">
        <text>上班：{{ d.checkInAt ? formatTime(d.checkInAt, 'HH:mm') : '-' }}</text>
        <text>下班：{{ d.checkOutAt ? formatTime(d.checkOutAt, 'HH:mm') : '-' }}</text>
        <text>{{ formatOnlineHours(d.onlineSeconds) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import dayjs from 'dayjs'
  import { onShow } from '@dcloudio/uni-app'
  import { fetchAttendanceHistory } from '@/api/attendance'
  import type { AttendanceDay } from '@/types/biz'
  import { formatTime, formatOnlineHours } from '@/utils/format'
  import { mockResolve } from '@/api/_mock'

  /**
   * 考勤记录（按月）
   *   T7.37
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const month = ref(dayjs().format('YYYY-MM'))
  const days = ref<AttendanceDay[]>([])

  const totalOnlineHours = computed(() => {
    const sec = days.value.reduce((s, d) => s + d.onlineSeconds, 0)
    return Math.floor(sec / 3600)
  })

  const workDays = computed(() => days.value.filter((d) => !d.isAbsent && !d.onLeave).length)
  const absentDays = computed(() => days.value.filter((d) => d.isAbsent).length)

  onShow(async () => {
    try {
      days.value = await fetchAttendanceHistory({ yearMonth: month.value })
    } catch {
      days.value = mockResolve.attendanceDays
    }
  })

  function onMonth(e: Event) {
    const detail = (e as Event & { detail: { value: string } }).detail
    month.value = detail.value
    void load()
  }

  async function load() {
    try {
      days.value = await fetchAttendanceHistory({ yearMonth: month.value })
    } catch {
      days.value = mockResolve.attendanceDays
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .month-row {
    margin-bottom: 16rpx;
    text-align: center;
  }

  .month-pick {
    display: inline-block;
    padding: 12rpx 32rpx;
    font-size: 28rpx;
    color: $uni-color-primary;
    background: #fff;
    border-radius: 32rpx;
  }

  .summary {
    display: flex;
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__cell {
      flex: 1;
      text-align: center;
    }

    &__num {
      font-size: 36rpx;
      font-weight: 700;
      color: $uni-color-primary;
    }

    &__label {
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .day {
    padding: 16rpx 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-radius: 12rpx;

    &__head {
      display: flex;
      align-items: center;
      margin-bottom: 8rpx;
    }

    &__date {
      flex: 1;
      font-size: 26rpx;
      font-weight: 600;
    }

    &__absent {
      padding: 2rpx 12rpx;
      font-size: 20rpx;
      color: #fff;
      background: $uni-color-error;
      border-radius: 8rpx;
    }

    &__leave {
      padding: 2rpx 12rpx;
      font-size: 20rpx;
      color: #fff;
      background: $uni-color-warning;
      border-radius: 8rpx;
    }

    &__row {
      display: flex;
      justify-content: space-between;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }
</style>
