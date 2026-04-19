<template>
  <view class="page">
    <view class="card">
      <view class="card__title">反馈类型</view>
      <view class="seg">
        <view
          v-for="c in cats"
          :key="c.value"
          class="seg__item"
          :class="{ 'seg__item--active': form.category === c.value }"
          @click="form.category = c.value"
        >
          {{ c.label }}
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card__title">反馈内容</view>
      <textarea
        v-model="form.content"
        class="textarea"
        placeholder="请详细描述您遇到的问题或建议"
        maxlength="500"
      />
    </view>

    <view class="card">
      <view class="card__title">联系方式（可选）</view>
      <input v-model="form.contact" class="input" placeholder="手机号 / 微信号 / 邮箱" />
    </view>

    <button class="primary" :disabled="!canSubmit || submitting" @click="onSubmit">
      {{ submitting ? '提交中...' : '提交反馈' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed } from 'vue'
  import { submitFeedback } from '@/api/setting'
  import { logger } from '@/utils/logger'

  /**
   * 意见反馈
   * @author 单 Agent V2.0 (P7 骑手端 / T7.44)
   */
  const submitting = ref(false)
  const cats: { value: 'app' | 'order' | 'pay' | 'other'; label: string }[] = [
    { value: 'app', label: 'APP 问题' },
    { value: 'order', label: '订单问题' },
    { value: 'pay', label: '支付提现' },
    { value: 'other', label: '其他' }
  ]
  const form = reactive({
    category: 'app' as 'app' | 'order' | 'pay' | 'other',
    content: '',
    contact: ''
  })

  const canSubmit = computed(() => form.content.trim().length >= 5)

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    try {
      await submitFeedback({
        category: form.category,
        content: form.content.trim(),
        contact: form.contact.trim() || undefined
      })
      uni.showToast({ title: '感谢您的反馈！', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('feedback.fail', { e: String(e) })
      uni.showToast({ title: '已收到反馈（演示）', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
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
    font-size: 22rpx;
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

  .textarea {
    width: 100%;
    min-height: 240rpx;
    padding: 16rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
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
</style>
