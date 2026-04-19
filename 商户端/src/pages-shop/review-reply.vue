<template>
  <view class="page page-rr">
    <view class="rr-card">
      <text class="rr-title">回复评价</text>
      <textarea
        v-model="reply"
        class="rr-textarea"
        placeholder="请输入回复内容（200 字内）"
        maxlength="200"
      />
      <text class="rr-count">{{ reply.length }} / 200</text>

      <view class="rr-templates">
        <text class="rr-templates__label">快捷回复：</text>
        <view class="rr-templates__list">
          <text v-for="t in templates" :key="t" class="rr-tpl" @click="reply = t">{{ t }}</text>
        </view>
      </view>

      <BizBtn type="primary" block :disabled="submitting || !reply.trim()" @click="onSubmit">
        {{ submitting ? '提交中...' : '提交回复' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { replyReview } from '@/api/shop'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 回复评价（T6.16）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const reviewId = ref<string>('')
  const reply = ref<string>('')
  const submitting = ref<boolean>(false)

  const templates = [
    '感谢您的支持，我们会继续努力！',
    '抱歉给您带来不愉快，我们已收到反馈并改进。',
    '感谢宝贵建议，我们将认真改进。',
    '欢迎再次光临，期待为您服务！'
  ]

  onLoad((opt) => {
    const id = (opt as Record<string, string> | undefined)?.id
    if (id) reviewId.value = id
  })

  async function onSubmit() {
    if (!reply.value.trim()) return
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await replyReview(reviewId.value, reply.value)
      }
      track(TRACK.REPLY_REVIEW, { reviewId: reviewId.value })
      uni.showToast({ title: '回复成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('rr.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-rr {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .rr-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .rr-title {
    display: block;
    margin-bottom: 16rpx;
    font-size: 30rpx;
    font-weight: 600;
  }

  .rr-textarea {
    width: 100%;
    min-height: 240rpx;
    padding: 16rpx 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .rr-count {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
    text-align: right;
  }

  .rr-templates {
    margin: 24rpx 0;

    &__label {
      display: block;
      margin-bottom: 12rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__list {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
    }
  }

  .rr-tpl {
    padding: 8rpx 16rpx;
    font-size: 22rpx;
    color: $uni-color-primary;
    background: $uni-color-primary-light;
    border-radius: 999rpx;
  }
</style>
