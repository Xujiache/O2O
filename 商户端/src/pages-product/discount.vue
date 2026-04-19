<template>
  <view class="page page-disc">
    <view class="disc-card">
      <text class="disc-title">限时折扣</text>
      <text class="disc-desc">商品：{{ productName }}</text>

      <view class="form-field">
        <text class="form-label">折扣类型</text>
        <view class="disc-types">
          <view
            class="disc-type"
            :class="{ 'disc-type--active': form.discountType === 1 }"
            @click="form.discountType = 1"
            >立减</view
          >
          <view
            class="disc-type"
            :class="{ 'disc-type--active': form.discountType === 2 }"
            @click="form.discountType = 2"
            >折扣</view
          >
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">{{
          form.discountType === 1 ? '立减金额（元）' : '折扣率（如 0.8 表示 8 折）'
        }}</text>
        <input
          v-model="form.value"
          class="form-input"
          type="digit"
          :placeholder="form.discountType === 1 ? '5.00' : '0.80'"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">开始时间</text>
        <picker
          mode="date"
          :value="form.validFrom"
          @change="(e: unknown) => onDate('validFrom', e)"
        >
          <view class="form-input form-input--small">{{ form.validFrom }}</view>
        </picker>
      </view>
      <view class="form-field row-between">
        <text class="form-label">结束时间</text>
        <picker mode="date" :value="form.validTo" @change="(e: unknown) => onDate('validTo', e)">
          <view class="form-input form-input--small">{{ form.validTo }}</view>
        </picker>
      </view>

      <view class="disc-actions">
        <BizBtn v-if="hasDiscount" type="default" text="清除折扣" @click="onClear" />
        <BizBtn type="primary" :disabled="submitting" @click="onSave">{{
          submitting ? '保存中...' : '保存'
        }}</BizBtn>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { setProductDiscount, clearProductDiscount } from '@/api/product'
  import { mockEnabled, delay } from '@/api/_mock'
  import { compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 限时折扣（T6.28）
   *
   * 1 立减 / 2 折扣（折扣率 0-1）
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const productId = ref<string>('')
  const productName = ref<string>('')
  const submitting = ref<boolean>(false)
  const hasDiscount = ref<boolean>(false)

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  const form = reactive({
    discountType: 1 as 1 | 2,
    value: '5.00',
    validFrom: today,
    validTo: tomorrow
  })

  onLoad((opt) => {
    const o = opt as { id?: string; name?: string } | undefined
    if (o?.id) productId.value = o.id
    if (o?.name) productName.value = decodeURIComponent(o.name)
  })

  function onDate(field: 'validFrom' | 'validTo', e: unknown) {
    const v = (e as { detail?: { value?: string } })?.detail?.value
    if (v) form[field] = v
  }

  function validate(): boolean {
    if (compareAmount(form.value, '0') <= 0) {
      uni.showToast({ title: '折扣值必须 > 0', icon: 'none' })
      return false
    }
    if (form.discountType === 2 && compareAmount(form.value, '1') >= 0) {
      uni.showToast({ title: '折扣率必须 < 1', icon: 'none' })
      return false
    }
    if (form.validFrom >= form.validTo) {
      uni.showToast({ title: '结束时间须在开始之后', icon: 'none' })
      return false
    }
    return true
  }

  async function onSave() {
    if (!validate()) return
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await setProductDiscount(productId.value, {
          discountType: form.discountType,
          value: form.value,
          validFrom: form.validFrom + 'T00:00:00.000Z',
          validTo: form.validTo + 'T23:59:59.999Z'
        })
      }
      uni.showToast({ title: '折扣已生效', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('disc.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }

  async function onClear() {
    submitting.value = true
    try {
      if (!mockEnabled()) await clearProductDiscount(productId.value)
      hasDiscount.value = false
      uni.showToast({ title: '已清除', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('disc.clear.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-disc {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .disc-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .disc-title {
    display: block;
    font-size: 30rpx;
    font-weight: 600;
  }

  .disc-desc {
    display: block;
    margin-top: 4rpx;
    margin-bottom: 24rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .form-field {
    margin-bottom: 24rpx;
  }

  .form-label {
    display: block;
    margin-bottom: 12rpx;
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .form-input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &--small {
      width: 280rpx;
      line-height: 80rpx;
      text-align: center;
    }
  }

  .disc-types {
    display: flex;
    gap: 16rpx;
  }

  .disc-type {
    flex: 1;
    padding: 24rpx;
    font-size: 26rpx;
    color: $uni-text-color;
    text-align: center;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: 12rpx;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }

  .disc-actions {
    display: flex;
    gap: 16rpx;
    margin-top: 16rpx;
  }
</style>
