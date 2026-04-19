<template>
  <view class="page invoice-apply">
    <view class="invoice-apply__sec">
      <view class="invoice-apply__sec-title">订单信息</view>
      <view v-if="orderNo" class="invoice-apply__row">
        <text class="invoice-apply__label">订单编号</text>
        <text class="invoice-apply__value">{{ orderNo }}</text>
      </view>
      <view v-else class="invoice-apply__row" @tap="onChooseOrder">
        <text class="invoice-apply__label">选择订单</text>
        <text class="invoice-apply__value invoice-apply__value--muted">{{
          orderText || '请输入订单号'
        }}</text>
        <text class="invoice-apply__arrow">›</text>
      </view>
      <view class="invoice-apply__row">
        <text class="invoice-apply__label">开票金额</text>
        <input
          v-model="form.amount"
          class="invoice-apply__input"
          type="digit"
          placeholder="按订单金额自动开票可不填"
        />
      </view>
    </view>

    <view class="invoice-apply__sec">
      <view class="invoice-apply__sec-title">发票抬头</view>
      <view class="invoice-apply__row" @tap="goHeader">
        <text class="invoice-apply__label">选择抬头</text>
        <text
          class="invoice-apply__value"
          :class="{ 'invoice-apply__value--muted': !selectedHeader }"
        >
          {{ selectedHeader ? selectedHeader.title : '请选择抬头' }}
        </text>
        <text class="invoice-apply__arrow">›</text>
      </view>
      <view v-if="selectedHeader" class="invoice-apply__sub">
        <text>{{ selectedHeader.titleType === 2 ? '单位' : '个人' }}</text>
        <text v-if="selectedHeader.taxNo">税号：{{ selectedHeader.taxNo }}</text>
      </view>
    </view>

    <view class="invoice-apply__sec">
      <view class="invoice-apply__sec-title">接收邮箱</view>
      <view class="invoice-apply__row">
        <text class="invoice-apply__label">邮箱</text>
        <input
          v-model="form.email"
          class="invoice-apply__input"
          type="text"
          placeholder="用于接收电子发票 PDF"
          maxlength="60"
        />
      </view>
    </view>

    <view class="invoice-apply__actions">
      <button
        class="invoice-apply__btn"
        :loading="submitting"
        :disabled="!canSubmit"
        @tap="onSubmit"
      >
        提交申请
      </button>
    </view>

    <BizDialog
      v-model:visible="orderDialog"
      title="输入订单号"
      :show-cancel="true"
      confirm-text="确定"
      @confirm="onConfirmOrder"
    >
      <input v-model="orderInput" class="invoice-apply__order-input" placeholder="请输入订单编号" />
    </BizDialog>

    <BizDialog
      v-model:visible="headerDialog"
      title="选择抬头"
      :show-cancel="false"
      confirm-text="关闭"
    >
      <BizLoading v-if="headerLoading" />
      <view v-else-if="headers.length === 0" class="invoice-apply__empty">
        <text>暂无抬头，请先去添加</text>
        <view class="invoice-apply__add" @tap="goHeaderManage">前往添加</view>
      </view>
      <scroll-view v-else scroll-y class="invoice-apply__header-list">
        <view
          v-for="h in headers"
          :key="h.id"
          class="invoice-apply__header-item"
          :class="{ 'invoice-apply__header-item--active': selectedHeader?.id === h.id }"
          @tap="onPickHeader(h)"
        >
          <text class="invoice-apply__header-name">{{ h.title }}</text>
          <text class="invoice-apply__header-meta">
            {{ h.titleType === 2 ? '单位' : '个人' }}{{ h.taxNo ? ' · ' + h.taxNo : '' }}
          </text>
        </view>
      </scroll-view>
    </BizDialog>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/invoice-apply.vue
   * @stage P5/T5.38 (Sprint 6)
   * @desc 申请开票：订单 + 抬头 + 邮箱；调 applyInvoice
   * @author 单 Agent V2.0
   */
  import { ref, reactive, computed } from 'vue'
  import { onLoad, onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import { listInvoiceHeaders, applyInvoice } from '@/api/invoice'
  import type { InvoiceHeader } from '@/types/biz'
  import { logger } from '@/utils/logger'

  const orderNo = ref<string>('')
  const orderText = ref<string>('')
  const orderDialog = ref<boolean>(false)
  const orderInput = ref<string>('')

  const headerDialog = ref<boolean>(false)
  const headerLoading = ref<boolean>(false)
  const headers = ref<InvoiceHeader[]>([])
  const selectedHeader = ref<InvoiceHeader | null>(null)

  const submitting = ref<boolean>(false)
  const form = reactive<{ amount: string; email: string }>({
    amount: '',
    email: ''
  })

  const canSubmit = computed<boolean>(() => {
    if (submitting.value) return false
    if (!orderNo.value) return false
    if (!selectedHeader.value) return false
    return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(form.email)
  })

  onLoad((options) => {
    if (options?.orderNo) {
      orderNo.value = options.orderNo
      orderText.value = options.orderNo
    }
  })

  onShow(() => {
    void loadHeaders(true)
  })

  async function loadHeaders(silentDialog = false) {
    headerLoading.value = !silentDialog
    try {
      headers.value = await listInvoiceHeaders()
      if (!selectedHeader.value) {
        const def = headers.value.find((h) => h.isDefault === 1) ?? headers.value[0]
        if (def) {
          selectedHeader.value = def
          if (def.email) form.email = def.email
        }
      }
    } catch (e) {
      logger.warn('invoice.headers.fail', { e: String(e) })
    } finally {
      headerLoading.value = false
    }
  }

  function onChooseOrder() {
    orderInput.value = orderText.value
    orderDialog.value = true
  }

  function onConfirmOrder() {
    const v = orderInput.value.trim()
    if (!v) {
      uni.showToast({ title: '请输入订单号', icon: 'none' })
      return
    }
    orderNo.value = v
    orderText.value = v
  }

  async function goHeader() {
    if (headers.value.length === 0) {
      await loadHeaders()
    }
    headerDialog.value = true
  }

  function onPickHeader(h: InvoiceHeader) {
    selectedHeader.value = h
    if (h.email && !form.email) form.email = h.email
    headerDialog.value = false
  }

  function goHeaderManage() {
    headerDialog.value = false
    uni.navigateTo({ url: '/pages-user/invoice-header' })
  }

  async function onSubmit() {
    if (!canSubmit.value || !selectedHeader.value) return
    submitting.value = true
    try {
      await applyInvoice({
        orderNo: orderNo.value,
        titleType: selectedHeader.value.titleType,
        title: selectedHeader.value.title,
        taxNo: selectedHeader.value.taxNo,
        email: form.email,
        amount: form.amount || undefined
      })
      uni.showToast({ title: '申请已提交', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('invoice.apply.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .invoice-apply {
    padding-bottom: 64rpx;

    &__sec {
      padding: 0 32rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
    }

    &__sec-title {
      padding: 24rpx 0 16rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__row {
      @include flex-between;

      padding: 28rpx 0;
      border-top: 1rpx solid $color-divider;

      &:first-of-type {
        border-top: none;
      }
    }

    &__label {
      width: 160rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__value {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-regular;
      text-align: right;

      @include ellipsis(1);

      &--muted {
        color: $color-text-secondary;
      }
    }

    &__input {
      flex: 1;
      height: 48rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      text-align: right;
    }

    &__arrow {
      margin-left: 12rpx;
      font-size: $font-size-md;
      color: $color-text-placeholder;
    }

    &__sub {
      display: flex;
      gap: 16rpx;
      padding-bottom: 24rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__actions {
      padding: 32rpx 32rpx 0;
    }

    &__btn {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      line-height: 88rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;

      &[disabled] {
        background: #ffc6a8;
      }
    }

    &__order-input {
      width: 100%;
      height: 64rpx;
      padding: 0 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__empty {
      padding: 32rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__add {
      display: inline-block;
      padding: 8rpx 24rpx;
      margin-top: 16rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-md;
    }

    &__header-list {
      max-height: 60vh;
    }

    &__header-item {
      padding: 24rpx 0;
      border-bottom: 1rpx solid $color-divider;

      &--active {
        .invoice-apply__header-name {
          color: $color-primary;
        }
      }
    }

    &__header-name {
      display: block;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
      text-align: left;
    }

    &__header-meta {
      display: block;
      margin-top: 8rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
      text-align: left;
    }
  }
</style>
