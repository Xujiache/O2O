<template>
  <view class="page page-bh">
    <view class="bh-tip">
      <text>每天可设置多个时段；点击「复制到其他天」批量同步</text>
    </view>

    <!-- W6.E.4：当前营业状态（由后端 cron 每分钟根据 business_hours 自动切换） -->
    <view class="bh-status">
      <view class="bh-status__row">
        <text class="bh-status__label">当前营业状态</text>
        <view class="bh-status__value" :class="`bh-status__value--${currentStatus}`">
          <view class="bh-status__dot" />
          <text>{{ currentStatusText }}</text>
        </view>
      </view>
      <text class="bh-status__hint">
        系统每分钟按下方营业时段自动切换；如需手动「临时歇业」，请前往店铺设置页
      </text>
    </view>

    <view class="bh-list">
      <view v-for="(d, dIdx) in days" :key="d.weekday" class="bh-day">
        <view class="bh-day__header row-between">
          <view class="row">
            <text class="bh-day__name">{{ weekdayName(d.weekday) }}</text>
            <switch
              :checked="d.isOpen === 1"
              color="#2F80ED"
              @change="(e: unknown) => onToggleDay(dIdx, e)"
            />
          </view>
          <text v-if="d.isOpen === 1" class="bh-day__copy" @click="onCopyDay(dIdx)">
            复制到其他天
          </text>
        </view>

        <view v-if="d.isOpen === 1" class="bh-periods">
          <view v-for="(p, pIdx) in d.periods" :key="pIdx" class="bh-period">
            <picker
              mode="time"
              :value="p.start"
              @change="(e: unknown) => onChangeStart(dIdx, pIdx, e)"
            >
              <view class="bh-period__time">{{ p.start }}</view>
            </picker>
            <text class="bh-period__sep">~</text>
            <picker mode="time" :value="p.end" @change="(e: unknown) => onChangeEnd(dIdx, pIdx, e)">
              <view class="bh-period__time">{{ p.end }}</view>
            </picker>
            <text
              v-if="d.periods.length > 1"
              class="bh-period__remove"
              @click="removePeriod(dIdx, pIdx)"
              >×</text
            >
          </view>
          <view v-if="d.periods.length < 3" class="bh-add" @click="addPeriod(dIdx)"
            >+ 添加时段</view
          >
        </view>
      </view>
    </view>

    <view class="bh-actions">
      <BizBtn type="primary" block :disabled="submitting" @click="onSave">
        {{ submitting ? '保存中...' : '保存营业时间' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import type { BusinessHourDay } from '@/types/biz'
  import { getBusinessHours, getShopDetail, setBusinessHours } from '@/api/shop'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'

  /**
   * 营业时间编辑（T6.13）
   *
   * - 7 天逐项配置（周一到周日）
   * - 每天最多 3 个时段
   * - 「复制到其他天」一键同步周一到周五 / 全周
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.13)
   */
  const shopStore = useShopStore()
  const submitting = ref<boolean>(false)
  const days = ref<BusinessHourDay[]>([])

  /**
   * 当前 business_status（由后端 cron 决定）
   *   0 打烊 / 1 营业 / 2 临时歇业
   */
  const currentStatus = ref<0 | 1 | 2>(0)

  /** 状态文案 */
  const currentStatusText = computed<string>(() => {
    if (currentStatus.value === 1) return '营业中'
    if (currentStatus.value === 2) return '临时歇业'
    return '已打烊'
  })

  onMounted(async () => {
    if (!shopStore.currentShopId) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    try {
      const list = mockEnabled()
        ? await delay(genDefault())
        : await getBusinessHours(shopStore.currentShopId)
      days.value = list && list.length === 7 ? list : genDefault()
    } catch (e) {
      logger.warn('bh.load.fail', { e: String(e) })
      days.value = genDefault()
    }
    /* W6.E.4：拉取店铺详情同步 cron 当前 business_status */
    if (!mockEnabled()) {
      try {
        const detail = await getShopDetail(shopStore.currentShopId)
        const s = (detail as { businessStatus?: number; isOpen?: number }).businessStatus
        if (s === 0 || s === 1 || s === 2) currentStatus.value = s
      } catch (e) {
        logger.warn('bh.status.load.fail', { e: String(e) })
      }
    }
  })

  function genDefault(): BusinessHourDay[] {
    const r: BusinessHourDay[] = []
    for (let i = 0; i < 7; i++) {
      r.push({
        weekday: i as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        isOpen: 1,
        periods: [{ start: '10:00', end: '21:00' }]
      })
    }
    return r
  }

  function weekdayName(w: number): string {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][w]
  }

  function onToggleDay(idx: number, e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    days.value[idx].isOpen = v ? 1 : 0
  }

  function onChangeStart(dIdx: number, pIdx: number, e: unknown) {
    const v = (e as { detail?: { value?: string } })?.detail?.value
    if (v) days.value[dIdx].periods[pIdx].start = v
  }
  function onChangeEnd(dIdx: number, pIdx: number, e: unknown) {
    const v = (e as { detail?: { value?: string } })?.detail?.value
    if (v) days.value[dIdx].periods[pIdx].end = v
  }

  function addPeriod(idx: number) {
    days.value[idx].periods.push({ start: '12:00', end: '14:00' })
  }
  function removePeriod(dIdx: number, pIdx: number) {
    days.value[dIdx].periods.splice(pIdx, 1)
  }

  function onCopyDay(idx: number) {
    uni.showActionSheet({
      itemList: ['复制到全周', '复制到周一-周五', '复制到周六-周日'],
      success: (res) => {
        const src = JSON.parse(JSON.stringify(days.value[idx])) as BusinessHourDay
        if (res.tapIndex === 0) {
          for (let i = 0; i < 7; i++) {
            days.value[i].isOpen = src.isOpen
            days.value[i].periods = JSON.parse(JSON.stringify(src.periods))
          }
        } else if (res.tapIndex === 1) {
          for (let i = 1; i <= 5; i++) {
            days.value[i].isOpen = src.isOpen
            days.value[i].periods = JSON.parse(JSON.stringify(src.periods))
          }
        } else if (res.tapIndex === 2) {
          for (const i of [0, 6]) {
            days.value[i].isOpen = src.isOpen
            days.value[i].periods = JSON.parse(JSON.stringify(src.periods))
          }
        }
        uni.showToast({ title: '已复制', icon: 'success' })
      }
    })
  }

  /** 校验：每个时段 start < end */
  function validate(): boolean {
    for (const d of days.value) {
      if (d.isOpen !== 1) continue
      for (const p of d.periods) {
        if (p.start >= p.end) {
          uni.showToast({ title: `${weekdayName(d.weekday)} 时段无效`, icon: 'none' })
          return false
        }
      }
    }
    return true
  }

  async function onSave() {
    if (!validate()) return
    submitting.value = true
    try {
      if (!mockEnabled()) {
        await setBusinessHours(shopStore.currentShopId, days.value)
      }
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('bh.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-bh {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .bh-tip {
    padding: 16rpx 24rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-color-primary;
    background: $uni-color-primary-light;
    border-radius: $uni-border-radius-base;
  }

  .bh-status {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12rpx;
    }

    &__label {
      font-size: 28rpx;
      font-weight: 500;
      color: $uni-text-color;
    }

    &__value {
      display: flex;
      gap: 8rpx;
      align-items: center;
      padding: 4rpx 16rpx;
      font-size: 24rpx;
      border-radius: 999rpx;

      &--0 {
        color: $uni-text-color-grey;
        background: $uni-bg-color-grey;
      }

      &--1 {
        color: #fff;
        background: $uni-color-success;
      }

      &--2 {
        color: #fff;
        background: $uni-color-warning;
      }
    }

    &__dot {
      width: 12rpx;
      height: 12rpx;
      background: currentColor;
      border-radius: 50%;
    }

    &__hint {
      display: block;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .bh-day {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__header {
      margin-bottom: 16rpx;
    }

    &__name {
      margin-right: 16rpx;
      font-size: 28rpx;
      font-weight: 500;
      color: $uni-text-color;
    }

    &__copy {
      font-size: 24rpx;
      color: $uni-color-primary;
    }
  }

  .bh-periods {
    padding-top: 16rpx;
    border-top: 1rpx solid $uni-border-color;
  }

  .bh-period {
    display: flex;
    align-items: center;
    margin-bottom: 16rpx;

    &__time {
      padding: 8rpx 24rpx;
      font-size: 26rpx;
      color: $uni-text-color;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }

    &__sep {
      margin: 0 16rpx;
      color: $uni-text-color-grey;
    }

    &__remove {
      margin-left: 16rpx;
      font-size: 36rpx;
      color: $uni-color-error;
    }
  }

  .bh-add {
    padding: 16rpx;
    font-size: 24rpx;
    color: $uni-color-primary;
    text-align: center;
    border: 2rpx dashed $uni-color-primary;
    border-radius: $uni-border-radius-base;
  }

  .bh-actions {
    padding: 24rpx;
    margin-top: 24rpx;
  }
</style>
