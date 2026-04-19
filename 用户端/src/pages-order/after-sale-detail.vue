<template>
  <view class="page after-sale-detail">
    <BizLoading v-if="loading && !info" fullscreen text="加载中..." />
    <BizError v-else-if="loadError && !info" :title="loadError" @retry="onRetry" />

    <template v-if="info">
      <view class="after-sale-detail__status">
        <text class="after-sale-detail__status-name">{{ statusText(info.status) }}</text>
        <text class="after-sale-detail__status-tip">{{ statusTip(info.status) }}</text>
      </view>

      <view class="card after-sale-detail__progress">
        <view
          v-for="(node, idx) in steps"
          :key="node.code"
          class="after-sale-detail__step"
          :class="{
            'after-sale-detail__step--done': node.done,
            'after-sale-detail__step--cur': node.cur
          }"
        >
          <view class="after-sale-detail__step-dot" />
          <view class="after-sale-detail__step-info">
            <text class="after-sale-detail__step-label">{{ node.label }}</text>
            <text v-if="node.time" class="after-sale-detail__step-time">{{ node.time }}</text>
          </view>
          <view v-if="idx < steps.length - 1" class="after-sale-detail__step-line" />
        </view>
      </view>

      <view class="card after-sale-detail__form">
        <view class="after-sale-detail__row">
          <text class="after-sale-detail__row-label">售后单号</text>
          <text class="after-sale-detail__row-value">{{ info.id }}</text>
        </view>
        <view class="after-sale-detail__row">
          <text class="after-sale-detail__row-label">订单编号</text>
          <text class="after-sale-detail__row-value">{{ info.orderNo }}</text>
        </view>
        <view class="after-sale-detail__row">
          <text class="after-sale-detail__row-label">退款金额</text>
          <text class="after-sale-detail__row-value">{{ formatAmount(info.refundAmount) }}</text>
        </view>
        <view class="after-sale-detail__row">
          <text class="after-sale-detail__row-label">售后原因</text>
          <text class="after-sale-detail__row-value">{{ info.reason }}</text>
        </view>
        <view class="after-sale-detail__row">
          <text class="after-sale-detail__row-label">申请时间</text>
          <text class="after-sale-detail__row-value">{{ formatTime(info.createdAt) }}</text>
        </view>
        <view v-if="info.finishedAt" class="after-sale-detail__row">
          <text class="after-sale-detail__row-label">完成时间</text>
          <text class="after-sale-detail__row-value">{{ formatTime(info.finishedAt) }}</text>
        </view>
      </view>

      <view v-if="info.evidenceUrls?.length" class="card after-sale-detail__evidence">
        <text class="after-sale-detail__evidence-label">凭证图</text>
        <view class="after-sale-detail__evidence-grid">
          <image
            v-for="(url, i) in info.evidenceUrls"
            :key="url + i"
            class="after-sale-detail__evidence-img"
            :src="url"
            mode="aspectFill"
            @tap="previewImage(i)"
          />
        </view>
      </view>

      <view v-if="info.merchantReply" class="card after-sale-detail__reply">
        <view class="after-sale-detail__reply-head">
          <text class="after-sale-detail__reply-label">商家回复</text>
          <text v-if="info.merchantHandleAt" class="after-sale-detail__reply-time">
            {{ formatTime(info.merchantHandleAt) }}
          </text>
        </view>
        <text class="after-sale-detail__reply-content">{{ info.merchantReply }}</text>
      </view>

      <view class="after-sale-detail__bottom-spacer" />
      <view v-if="canApplyArbitration" class="after-sale-detail__bottom safe-bottom">
        <view class="after-sale-detail__btn" @tap="goArbitrate">
          <text>申请仲裁</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-order/after-sale-detail.vue
   * @stage P5/T5.30 (Sprint 5)
   * @desc 售后进度：进度条 + 详情 + 凭证 + 商家回复 + 申请仲裁（status=拒绝 时）
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizError from '@/components/biz/BizError.vue'
  import { getAfterSale } from '@/api/order'
  import type { AfterSale } from '@/types/biz'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /** 售后状态枚举（与后端对齐）：
   *  0=申请中 / 1=商家处理中 / 2=同意 / 3=拒绝 / 4=退款中 / 5=已退款 / 6=用户取消 */
  const STATUS_TEXT: Record<number, string> = {
    0: '申请中',
    1: '商家处理中',
    2: '商家同意',
    3: '商家拒绝',
    4: '退款中',
    5: '已退款',
    6: '用户取消'
  }

  const STATUS_TIP: Record<number, string> = {
    0: '已提交，等待商家处理',
    1: '商家正在处理您的售后申请',
    2: '商家已同意，正在执行退款',
    3: '商家拒绝了您的申请，您可以申请平台仲裁',
    4: '退款处理中，预计 1-3 个工作日到账',
    5: '退款已到账',
    6: '您已取消该售后申请'
  }

  const id = ref<string>('')
  const info = ref<AfterSale | null>(null)
  const loading = ref<boolean>(false)
  const loadError = ref<string>('')

  onLoad((options?: Record<string, string>) => {
    id.value = String(options?.id ?? '')
    if (!id.value) {
      uni.showToast({ title: '缺少售后单号', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    void load()
  })

  onPullDownRefresh(() => {
    void load().finally(() => uni.stopPullDownRefresh())
  })

  async function load() {
    loading.value = true
    try {
      const r = await getAfterSale(id.value)
      info.value = r
      loadError.value = ''
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('after.sale.detail.fail', { id: id.value, e: msg })
      loadError.value = msg || '加载失败'
    } finally {
      loading.value = false
    }
  }

  function onRetry() {
    void load()
  }

  function statusText(s: number): string {
    return STATUS_TEXT[s] ?? '未知'
  }

  function statusTip(s: number): string {
    return STATUS_TIP[s] ?? ''
  }

  /** 进度条节点 */
  const steps = computed<
    { code: string; label: string; done: boolean; cur: boolean; time: string }[]
  >(() => {
    const cur = info.value?.status ?? 0
    const createdAt = info.value?.createdAt ?? ''
    const handleAt = info.value?.merchantHandleAt ?? ''
    const finishedAt = info.value?.finishedAt ?? ''
    const list = [
      {
        code: 'apply',
        label: '提交申请',
        done: cur >= 0,
        cur: cur === 0,
        time: createdAt ? formatTime(createdAt) : ''
      },
      {
        code: 'merchant',
        label: '商家处理',
        done: cur >= 1,
        cur: cur === 1,
        time: handleAt ? formatTime(handleAt) : ''
      },
      {
        code: 'agree',
        label: cur === 3 ? '商家拒绝' : '商家同意',
        done: cur >= 2 && cur !== 3,
        cur: cur === 2 || cur === 3,
        time: handleAt && cur >= 2 ? formatTime(handleAt) : ''
      },
      {
        code: 'refund',
        label: '退款中',
        done: cur >= 4,
        cur: cur === 4,
        time: ''
      },
      {
        code: 'done',
        label: '已退款',
        done: cur === 5,
        cur: cur === 5,
        time: cur === 5 && finishedAt ? formatTime(finishedAt) : ''
      }
    ]
    return list
  })

  /** 商家拒绝时显示申请仲裁按钮 */
  const canApplyArbitration = computed<boolean>(() => info.value?.status === 3)

  function previewImage(idx: number) {
    const urls = info.value?.evidenceUrls ?? []
    if (urls.length === 0) return
    uni.previewImage({
      current: urls[idx],
      urls: [...urls]
    })
  }

  function goArbitrate() {
    if (!info.value) return
    uni.navigateTo({
      url: `/pages-order/arbitrate?relatedNo=${info.value.id}&relatedType=2`
    })
  }
</script>

<style lang="scss" scoped>
  .after-sale-detail {
    min-height: 100vh;
    padding-bottom: 24rpx;
    background: $color-bg-page;

    &__status {
      padding: 48rpx 32rpx 32rpx;
      color: $color-text-inverse;
      background: linear-gradient(135deg, $color-primary 0%, $color-primary-light 100%);
    }

    &__status-name {
      font-size: 40rpx;
      font-weight: $font-weight-bold;
    }

    &__status-tip {
      display: block;
      margin-top: 12rpx;
      font-size: $font-size-sm;
      opacity: 0.9;
    }

    &__progress {
      padding: 32rpx 24rpx 16rpx;
      margin: 24rpx;
    }

    &__step {
      position: relative;
      display: flex;
      gap: 24rpx;
      padding-bottom: 32rpx;
    }

    &__step-dot {
      flex-shrink: 0;
      width: 24rpx;
      height: 24rpx;
      margin-top: 8rpx;
      background: $color-divider;
      border-radius: $radius-circle;
    }

    &__step--done &__step-dot {
      background: $color-primary;
    }

    &__step--cur &__step-dot {
      background: $color-primary;
      box-shadow: 0 0 0 6rpx rgba(255, 106, 26, 0.18);
    }

    &__step-line {
      position: absolute;
      top: 24rpx;
      bottom: -8rpx;
      left: 11rpx;
      width: 2rpx;
      background: $color-divider;
    }

    &__step--done &__step-line {
      background: $color-primary;
    }

    &__step-info {
      display: flex;
      flex: 1;
      flex-direction: column;
    }

    &__step-label {
      font-size: $font-size-base;
      color: $color-text-regular;
    }

    &__step--done &__step-label,
    &__step--cur &__step-label {
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__step-time {
      margin-top: 4rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__form,
    &__evidence,
    &__reply {
      padding: 24rpx;
      margin: 24rpx;
    }

    &__row {
      display: flex;
      justify-content: space-between;
      padding: 8rpx 0;
      font-size: $font-size-sm;
    }

    &__row-label {
      color: $color-text-secondary;
    }

    &__row-value {
      color: $color-text-primary;
    }

    &__evidence-label,
    &__reply-label {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__evidence-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
      margin-top: 16rpx;
    }

    &__evidence-img {
      width: 160rpx;
      height: 160rpx;
      background-color: $color-divider;
      border-radius: $radius-sm;
    }

    &__reply-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12rpx;
    }

    &__reply-time {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__reply-content {
      font-size: $font-size-sm;
      line-height: 1.6;
      color: $color-text-regular;
    }

    &__bottom-spacer {
      height: 144rpx;
    }

    &__bottom {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      padding: 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__btn {
      @include flex-center;

      height: 88rpx;
      font-size: $font-size-md;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-lg;
    }
  }
</style>
