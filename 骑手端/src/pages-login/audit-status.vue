<template>
  <view class="page page-audit">
    <view v-if="status" class="head">
      <view class="head__icon">{{ statusIcon }}</view>
      <view class="head__title">{{ statusText }}</view>
      <view class="head__desc">{{ statusDesc }}</view>
    </view>

    <view v-if="status?.rejectReason" class="reject">
      <view class="reject__title">驳回原因</view>
      <view class="reject__content">{{ status.rejectReason }}</view>
    </view>

    <view class="meta">
      <view class="meta__row">
        <text class="meta__label">提交时间</text>
        <text class="meta__value">{{ formatTime(status?.submittedAt) }}</text>
      </view>
      <view v-if="status?.reviewedAt" class="meta__row">
        <text class="meta__label">审核时间</text>
        <text class="meta__value">{{ formatTime(status.reviewedAt) }}</text>
      </view>
    </view>

    <view class="actions">
      <button v-if="status?.status === 'rejected'" class="primary" @click="goRetry">
        重新提交资质
      </button>
      <button v-else-if="status?.status === 'approved'" class="primary" @click="goWorkbench">
        进入工作台
      </button>
      <button v-else class="primary" @click="refresh">
        {{ refreshing ? '刷新中...' : '刷新状态' }}
      </button>
      <button class="ghost" @click="logout">退出登录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed, onUnmounted } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { getAuditStatus } from '@/api/auth'
  import type { RiderAuditStatus } from '@/types/biz'
  import { useAuthStore } from '@/store'
  import { formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 审核状态轮询：每 5s 刷新一次直到 approved / rejected
   * @author 单 Agent V2.0 (P7 骑手端 / T7.9)
   */
  const auth = useAuthStore()
  const status = ref<RiderAuditStatus | null>(null)
  const refreshing = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  const statusIcon = computed(() => {
    switch (status.value?.status) {
      case 'approved':
        return '✅'
      case 'rejected':
        return '❌'
      case 'supplement':
        return '⚠️'
      default:
        return '⏳'
    }
  })

  const statusText = computed(() => {
    switch (status.value?.status) {
      case 'approved':
        return '审核通过'
      case 'rejected':
        return '审核驳回'
      case 'supplement':
        return '需补充材料'
      default:
        return '审核中'
    }
  })

  const statusDesc = computed(() => {
    switch (status.value?.status) {
      case 'approved':
        return '恭喜！现在可以登录工作台开始接单'
      case 'rejected':
        return '请根据下方原因调整后重新提交'
      case 'supplement':
        return '请按提示补充材料'
      default:
        return '通常 1 个工作日内审核完成'
    }
  })

  async function refresh() {
    refreshing.value = true
    try {
      const data = await getAuditStatus()
      status.value = data
      if (data.status === 'approved' && auth.user) {
        auth.setUser({ ...auth.user, status: 'approved' })
        if (timer) {
          clearInterval(timer)
          timer = null
        }
      }
    } catch (e) {
      logger.warn('audit.status.fail', { e: String(e) })
      /* 后端不可用 fallback：用 mock 当前态 */
      if (!status.value) {
        status.value = {
          status: auth.user?.status === 'approved' ? 'approved' : 'pending',
          submittedAt: new Date().toISOString()
        }
      }
    } finally {
      refreshing.value = false
    }
  }

  onShow(() => {
    void refresh()
    /* 5s 轮询，approved 后停止 */
    if (!timer) {
      timer = setInterval(() => {
        if (status.value?.status === 'approved') return
        void refresh()
      }, 5_000)
    }
  })

  onUnmounted(() => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  })

  function goRetry() {
    uni.reLaunch({ url: '/pages-login/qualification' })
  }

  function goWorkbench() {
    uni.reLaunch({ url: '/pages/home/workbench' })
  }

  function logout() {
    void auth.logout().then(() => {
      uni.reLaunch({ url: '/pages/login/index' })
    })
  }
</script>

<style lang="scss" scoped>
  .page-audit {
    min-height: 100vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }

  .head {
    padding: 64rpx 32rpx;
    margin-bottom: 24rpx;
    text-align: center;
    background: #fff;
    border-radius: 16rpx;

    &__icon {
      font-size: 96rpx;
    }

    &__title {
      margin: 16rpx 0 8rpx;
      font-size: 36rpx;
      font-weight: 600;
    }

    &__desc {
      font-size: 26rpx;
      color: $uni-text-color-grey;
    }
  }

  .reject {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: rgb(255 77 79 / 6%);
    border: 2rpx solid $uni-color-error;
    border-radius: $uni-border-radius-base;

    &__title {
      margin-bottom: 12rpx;
      font-size: 26rpx;
      font-weight: 600;
      color: $uni-color-error;
    }

    &__content {
      font-size: 24rpx;
      line-height: 1.6;
      color: $uni-text-color;
    }
  }

  .meta {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: $uni-border-radius-base;

    &__row {
      display: flex;
      justify-content: space-between;
      padding: 12rpx 0;
      font-size: 24rpx;
    }

    &__label {
      color: $uni-text-color-grey;
    }

    &__value {
      color: $uni-text-color;
    }
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  .primary,
  .ghost {
    width: 100%;
    height: 88rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }

  .primary {
    color: #fff;
    background: $uni-color-primary;
  }

  .ghost {
    color: $uni-text-color-grey;
    background: $uni-bg-color-grey;
  }
</style>
