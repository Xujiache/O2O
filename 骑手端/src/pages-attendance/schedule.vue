<template>
  <view class="page">
    <BizEmpty v-if="slots.length === 0" title="本月暂无排班" desc="请联系站长确认" scene="data" />
    <view v-else>
      <view
        v-for="s in slots"
        :key="`${s.date}-${s.startAt}`"
        class="slot"
        :class="{ 'slot--mine': s.isMine }"
      >
        <view class="slot__date">{{ s.date }}</view>
        <view class="slot__time">{{ s.startAt }} - {{ s.endAt }}</view>
        <text v-if="s.isMine" class="slot__mine">我的班次</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import dayjs from 'dayjs'
  import { fetchSchedule } from '@/api/attendance'
  import type { ScheduleSlot } from '@/types/biz'
  import { logger } from '@/utils/logger'

  /**
   * 排班一览（本月）
   *   T7.38
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const slots = ref<ScheduleSlot[]>([])

  onShow(async () => {
    try {
      slots.value = await fetchSchedule({ yearMonth: dayjs().format('YYYY-MM') })
    } catch (e) {
      logger.warn('schedule.fail', { e: String(e) })
      slots.value = []
    }
  })
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .slot {
    display: flex;
    align-items: center;
    padding: 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-left: 6rpx solid transparent;
    border-radius: 12rpx;

    &--mine {
      border-left-color: $uni-color-primary;
    }

    &__date {
      flex: 1;
      font-size: 26rpx;
      font-weight: 600;
    }

    &__time {
      margin-right: 16rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__mine {
      padding: 2rpx 12rpx;
      font-size: 20rpx;
      color: #fff;
      background: $uni-color-primary;
      border-radius: 8rpx;
    }
  }
</style>
