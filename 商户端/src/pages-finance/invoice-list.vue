<template>
  <view class="page page-il">
    <scroll-view scroll-y class="il-list" @scrolltolower="loadMore">
      <view v-for="i in invoices" :key="i.id" class="il-item">
        <view class="row-between">
          <text class="il-amount">{{ formatAmount(i.amount, '') }} 元</text>
          <text class="il-status" :class="`il-status--${i.status}`">{{
            statusText(i.status)
          }}</text>
        </view>
        <text class="il-title">{{ i.title }}</text>
        <text v-if="i.invoiceNo" class="il-no">发票号：{{ i.invoiceNo }}</text>
        <text class="il-time">申请：{{ formatTime(i.createdAt) }}</text>
        <view class="il-actions">
          <BizBtn v-if="i.pdfUrl" type="primary" text="查看 PDF" @click="onViewPdf(i.pdfUrl)" />
        </view>
      </view>
      <BizEmpty v-if="!loading && invoices.length === 0" title="暂无发票" scene="finance">
        <template #action>
          <BizBtn type="primary" text="申请发票" @click="goApply" />
        </template>
      </BizEmpty>
      <BizLoading v-if="loading" />
    </scroll-view>

    <view v-if="invoices.length > 0" class="il-actions-fixed">
      <BizBtn type="primary" block text="申请发票" @click="goApply" />
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import type { InvoiceApply } from '@/types/biz'
  import { listInvoices } from '@/api/invoice'
  import { mockEnabled, delay } from '@/api/_mock'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 发票记录（T6.32）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const invoices = ref<InvoiceApply[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  function statusText(s: number): string {
    return s === 1 ? '待开' : s === 2 ? '已开' : '失败'
  }

  onMounted(() => {
    void loadMore()
  })

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      if (mockEnabled()) {
        invoices.value = await delay([] as InvoiceApply[])
        hasMore.value = false
      } else {
        const r = await listInvoices({ cursor: cursor.value, limit: 20 })
        invoices.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('il.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function goApply() {
    uni.navigateTo({ url: '/pages-finance/invoice-apply' })
  }

  function onViewPdf(url: string) {
    uni.downloadFile({
      url,
      success: (r) => {
        uni.openDocument({ filePath: r.tempFilePath, fileType: 'pdf' })
      }
    })
  }
</script>

<style lang="scss" scoped>
  .page-il {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .il-list {
    flex: 1;
    padding: 16rpx;
  }

  .il-item {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 12rpx;
  }

  .il-amount {
    font-size: 32rpx;
    font-weight: 600;
  }

  .il-status {
    padding: 4rpx 16rpx;
    font-size: 22rpx;
    border-radius: 999rpx;

    &--1 {
      color: $uni-color-warning;
      background: rgb(250 140 22 / 12%);
    }

    &--2 {
      color: $uni-color-success;
      background: rgb(82 196 26 / 12%);
    }

    &--3 {
      color: $uni-color-error;
      background: rgb(255 77 79 / 12%);
    }
  }

  .il-title {
    display: block;
    margin-top: 8rpx;
    font-size: 26rpx;
  }

  .il-no {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .il-time {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
  }

  .il-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12rpx;
  }

  .il-actions-fixed {
    padding: 24rpx;
    background: #fff;
    border-top: 1rpx solid $uni-border-color;
  }
</style>
