<template>
  <view class="page">
    <view class="hint">
      <text>转单需平台审核（约 1-3 分钟），通过后订单将释放给其他骑手；</text>
      <text>转单过多会扣减信用分，请合理使用</text>
    </view>

    <view class="card">
      <view class="card__title">转单理由</view>
      <view class="seg">
        <view
          v-for="r in reasons"
          :key="r"
          class="seg__item"
          :class="{ 'seg__item--active': form.reason === r }"
          @click="form.reason = r"
        >
          {{ r }}
        </view>
      </view>
      <textarea
        v-if="form.reason === '其他'"
        v-model="customReason"
        class="textarea"
        placeholder="请补充其他理由"
        maxlength="200"
      />
    </view>

    <button class="primary" :disabled="!canSubmit || submitting" @click="onSubmit">
      {{ submitting ? '提交中...' : '提交转单' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useOrderStore } from '@/store'
  import type { RiderTransferApply } from '@/types/biz'

  /**
   * 转单申请：理由（含自定义）+ 平台审核
   * @author 单 Agent V2.0 (P7 骑手端 / T7.23)
   */
  const orderStore = useOrderStore()
  const submitting = ref(false)
  const customReason = ref('')

  const reasons = ['车辆故障', '生病不适', '路线超出范围', '订单超时无法完成', '其他']

  const form = reactive<RiderTransferApply>({
    orderNo: '',
    reason: ''
  })

  const canSubmit = computed(() => {
    if (!form.reason) return false
    if (form.reason === '其他' && customReason.value.trim().length === 0) return false
    return true
  })

  onLoad((q) => {
    const params = q as Record<string, string | undefined>
    form.orderNo = params.orderNo ?? ''
  })

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    const finalReason = form.reason === '其他' ? customReason.value.trim() : form.reason
    const ok = await orderStore.transfer({ orderNo: form.orderNo, reason: finalReason })
    submitting.value = false
    if (ok) {
      uni.showToast({ title: '已提交，等待平台审核', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } else {
      uni.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx 24rpx 200rpx;
    background: $uni-bg-color-grey;
  }

  .hint {
    padding: 16rpx;
    margin-bottom: 16rpx;
    font-size: 22rpx;
    color: $uni-color-warning;
    background: rgb(250 140 22 / 8%);
    border-radius: 12rpx;
    text {
      display: block;
      line-height: 1.6;
    }
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
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .seg__item {
    flex: 0 0 calc(50% - 6rpx);
    height: 64rpx;
    font-size: 24rpx;
    line-height: 64rpx;
    color: $uni-text-color-grey;
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
    min-height: 160rpx;
    padding: 16rpx;
    margin-top: 16rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .primary {
    width: 100%;
    height: 88rpx;
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
