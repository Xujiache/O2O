<template>
  <view class="pickup-code">
    <view class="pickup-code__head">
      <text class="pickup-code__title">取件码</text>
      <text class="pickup-code__hint">请向骑手出示此码完成交接</text>
    </view>

    <view class="pickup-code__board">
      <text class="pickup-code__digits">{{ formattedCode }}</text>
      <view class="pickup-code__copy" @tap="onCopy">
        <text class="pickup-code__copy-text">复制</text>
      </view>
    </view>

    <view v-if="proofs && proofs.length" class="pickup-code__proofs">
      <view class="pickup-code__proofs-head">
        <text class="pickup-code__proofs-title">配送凭证</text>
        <text class="pickup-code__proofs-count">{{ proofs.length }} 张</text>
      </view>
      <view class="pickup-code__proofs-grid">
        <view
          v-for="(url, i) in proofs"
          :key="`${i}-${url}`"
          class="pickup-code__proof-cell"
          @tap="onPreview(i)"
        >
          <image class="pickup-code__proof-img" :src="url" mode="aspectFill" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file PickupCode.vue
   * @stage P5/T5.26 (Sprint 4)
   * @desc 跑腿取件码 + 配送凭证图：6 位 CHAR(6) 大字号 + 复制；凭证 3 列网格 + 大图预览
   * @author 单 Agent V2.0
   */
  import { computed, defineProps, withDefaults } from 'vue'
  import { logger } from '@/utils/logger'

  const props = withDefaults(
    defineProps<{
      /** 6 位取件码（CHAR(6)，PRD 与 P4 状态机对齐） */
      code: string
      /** 凭证图 URL 列表（OrderProof.imageUrl[]，可空） */
      proofs?: string[]
    }>(),
    {
      proofs: () => [] as string[]
    }
  )

  /** 视觉分组：前 3 后 3 中间空格，提升可读性 */
  const formattedCode = computed<string>(() => {
    const c = (props.code ?? '').toString().toUpperCase()
    if (c.length <= 3) return c
    return `${c.slice(0, 3)} ${c.slice(3)}`
  })

  /** 复制取件码到剪贴板 */
  function onCopy() {
    const c = props.code ?? ''
    if (!c) {
      uni.showToast({ title: '取件码为空', icon: 'none' })
      return
    }
    uni.setClipboardData({
      data: c,
      success: () => {
        uni.showToast({ title: '已复制取件码', icon: 'success' })
      },
      fail: (err) => {
        logger.warn('pickup.copy.fail', { err: String(err.errMsg ?? '') })
      }
    })
  }

  /** 大图预览 */
  function onPreview(idx: number) {
    const list = props.proofs ?? []
    if (list.length === 0) return
    uni.previewImage({
      current: list[idx],
      urls: [...list],
      fail: (err) => {
        logger.warn('pickup.preview.fail', { err: String(err.errMsg ?? '') })
      }
    })
  }
</script>

<style lang="scss" scoped>
  .pickup-code {
    margin: 24rpx;
    padding: 32rpx 28rpx;
    background: $color-bg-white;
    border-radius: $radius-lg;
    box-shadow: $shadow-sm;

    &__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 24rpx;
    }

    &__title {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__hint {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__board {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 32rpx 32rpx;
      background: linear-gradient(135deg, rgba(255, 106, 26, 0.08), rgba(255, 142, 83, 0.04));
      border: 2rpx dashed rgba(255, 106, 26, 0.3);
      border-radius: $radius-md;
    }

    &__digits {
      flex: 1;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 64rpx;
      font-weight: $font-weight-bold;
      color: $color-primary;
      letter-spacing: 12rpx;
    }

    &__copy {
      flex-shrink: 0;
      padding: 12rpx 32rpx;
      background: $color-primary;
      border-radius: $radius-lg;

      &:active {
        background: $color-primary-dark;
      }
    }

    &__copy-text {
      font-size: $font-size-sm;
      color: $color-text-inverse;
    }

    &__proofs {
      margin-top: 32rpx;
    }

    &__proofs-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 16rpx;
    }

    &__proofs-title {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__proofs-count {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__proofs-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
    }

    &__proof-cell {
      flex: 0 0 calc((100% - 24rpx) / 3);
      aspect-ratio: 1;
      overflow: hidden;
      background: $color-bg-hover;
      border-radius: $radius-md;
    }

    &__proof-img {
      width: 100%;
      height: 100%;
    }
  }
</style>
