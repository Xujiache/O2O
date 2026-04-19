<template>
  <view class="page page-audit">
    <view class="audit-card">
      <view v-if="status === 0" class="audit-state audit-state--pending">
        <text class="audit-state__icon">⏳</text>
        <text class="audit-state__title">审核中</text>
        <text class="audit-state__desc">材料已提交，预计 24 小时内完成审核。</text>
        <text class="audit-state__hint">页面 5 秒自动刷新一次</text>
      </view>

      <view v-else-if="status === 1" class="audit-state audit-state--ok">
        <text class="audit-state__icon">✅</text>
        <text class="audit-state__title">审核通过</text>
        <text class="audit-state__desc">恭喜您，已正式入驻 O2O 平台。</text>
        <button class="audit-btn" @click="goWorkbench">立即进入工作台</button>
      </view>

      <view v-else-if="status === 2" class="audit-state audit-state--rejected">
        <text class="audit-state__icon">❌</text>
        <text class="audit-state__title">审核未通过</text>
        <text class="audit-state__desc">{{ rejectReason || '请按要求补充资料' }}</text>
        <button class="audit-btn audit-btn--reapply" @click="goReapply">重新提交资料</button>
      </view>

      <view v-else-if="status === 3" class="audit-state audit-state--pending">
        <text class="audit-state__icon">📝</text>
        <text class="audit-state__title">补充资料中</text>
        <text class="audit-state__desc">您的材料已重新提交，等待审核。</text>
        <text class="audit-state__hint">页面 5 秒自动刷新一次</text>
      </view>
    </view>

    <view class="audit-footer">
      <text class="audit-footer__text">问题咨询：</text>
      <text class="audit-footer__phone">400-123-4567</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onUnmounted } from 'vue'
  import { onLoad, onShow, onHide } from '@dcloudio/uni-app'
  import { getAuditStatus } from '@/api/auth'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 审核状态查询页
   *
   * 行为：
   *   - onLoad / onShow：拉一次状态
   *   - 5 秒轮询：仅 pending(0) / 补料中(3) 时
   *   - status === 1 → 跳转工作台
   *   - status === 2 → 显示驳回原因 + 重新提交按钮
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.9)
   */

  const applyId = ref<string>('')
  const status = ref<0 | 1 | 2 | 3>(0)
  const rejectReason = ref<string>('')
  let timer: ReturnType<typeof setInterval> | null = null

  onLoad((opt) => {
    const id = (opt as Record<string, string> | undefined)?.id
    if (id) applyId.value = id
    void refresh()
    startPolling()
  })

  onShow(() => {
    /* 返回页时若 timer 被清，重启 */
    if (status.value === 0 || status.value === 3) {
      startPolling()
    }
  })

  onHide(() => {
    stopPolling()
  })

  onUnmounted(() => {
    stopPolling()
  })

  function startPolling() {
    if (timer) return
    timer = setInterval(() => {
      void refresh()
    }, 5000)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function refresh() {
    try {
      const result = mockEnabled()
        ? await delay<{
            status: 0 | 1 | 2 | 3
            rejectReason?: string
            submittedAt: string
            reviewedAt?: string
          }>({
            status: 0,
            submittedAt: new Date().toISOString()
          })
        : await getAuditStatus(applyId.value)
      status.value = result.status
      rejectReason.value = result.rejectReason ?? ''
      if (result.status === 1) {
        track(TRACK.APPLY_APPROVED, { applyId: applyId.value })
        stopPolling()
      } else if (result.status === 2) {
        track(TRACK.APPLY_REJECTED, { applyId: applyId.value })
        stopPolling()
      }
    } catch (e) {
      logger.warn('audit.refresh.fail', { e: String(e) })
    }
  }

  function goWorkbench() {
    uni.reLaunch({ url: '/pages/home/workbench' })
  }

  function goReapply() {
    uni.redirectTo({ url: `/pages-login/register?reapply=${applyId.value}` })
  }
</script>

<style lang="scss" scoped>
  .page-audit {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 80rpx 32rpx;
    background: $uni-bg-color-grey;
  }

  .audit-card {
    flex: 1;
    padding: 80rpx 48rpx;
    background: #fff;
    border-radius: 24rpx;
    box-shadow: 0 4rpx 16rpx rgb(0 0 0 / 4%);
  }

  .audit-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    &__icon {
      margin-bottom: 24rpx;
      font-size: 120rpx;
      line-height: 1;
    }

    &__title {
      margin-bottom: 16rpx;
      font-size: 36rpx;
      font-weight: 600;
      color: $uni-text-color;
    }

    &__desc {
      max-width: 480rpx;
      font-size: 26rpx;
      line-height: 1.6;
      color: $uni-text-color-grey;
    }

    &__hint {
      margin-top: 24rpx;
      font-size: 22rpx;
      color: $uni-text-color-placeholder;
    }

    &--ok .audit-state__title {
      color: $uni-color-success;
    }

    &--rejected .audit-state__title {
      color: $uni-color-error;
    }
  }

  .audit-btn {
    width: 100%;
    height: 88rpx;
    margin-top: 48rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &--reapply {
      background: $uni-color-warning;
    }
  }

  .audit-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 48rpx;
    font-size: 24rpx;

    &__text {
      color: $uni-text-color-grey;
    }

    &__phone {
      color: $uni-color-primary;
    }
  }
</style>
