<template>
  <view class="page page-ce">
    <view class="ce-card">
      <text class="ce-title">{{ editId ? '编辑店铺券' : '新建店铺券' }}</text>

      <view class="form-field">
        <text class="form-label">券名称</text>
        <input v-model="form.name" class="form-input" placeholder="如：满 50 减 5" maxlength="30" />
      </view>

      <view class="form-field">
        <text class="form-label">类型</text>
        <view class="ce-types">
          <text
            v-for="t in types"
            :key="t.code"
            class="ce-type"
            :class="{ 'ce-type--active': form.couponType === t.code }"
            @click="form.couponType = t.code"
            >{{ t.name }}</text
          >
        </view>
      </view>

      <view class="form-field row-between">
        <text class="form-label">{{ form.couponType === 2 ? '折扣率' : '立减/满减金额' }}</text>
        <input
          v-model="form.discountValue"
          class="form-input form-input--small"
          type="digit"
          placeholder="0"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">满 X 元可用</text>
        <input
          v-model="form.minOrderAmount"
          class="form-input form-input--small"
          type="digit"
          placeholder="0"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">总数量</text>
        <input
          v-model.number="form.totalQty"
          class="form-input form-input--small"
          type="number"
          placeholder="100"
        />
      </view>

      <view class="form-field">
        <text class="form-label">有效期</text>
        <view class="ce-types">
          <text
            class="ce-type"
            :class="{ 'ce-type--active': form.validType === 1 }"
            @click="form.validType = 1"
            >永久</text
          >
          <text
            class="ce-type"
            :class="{ 'ce-type--active': form.validType === 2 }"
            @click="form.validType = 2"
            >期限</text
          >
        </view>
      </view>

      <view v-if="form.validType === 2">
        <view class="form-field row-between">
          <text class="form-label">开始日期</text>
          <picker
            mode="date"
            :value="form.validFrom"
            @change="(e: unknown) => onDate('validFrom', e)"
          >
            <view class="form-input form-input--small">{{ form.validFrom }}</view>
          </picker>
        </view>
        <view class="form-field row-between">
          <text class="form-label">结束日期</text>
          <picker mode="date" :value="form.validTo" @change="(e: unknown) => onDate('validTo', e)">
            <view class="form-input form-input--small">{{ form.validTo }}</view>
          </picker>
        </view>
      </view>

      <BizBtn type="primary" block :disabled="submitting" @click="onSave">
        {{ submitting ? '保存中...' : '保存' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useShopStore } from '@/store'
  import { createCoupon, updateCoupon } from '@/api/marketing'
  import { mockEnabled, delay } from '@/api/_mock'
  import { compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 店铺券编辑（T6.35）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()
  const editId = ref<string>('')
  const submitting = ref<boolean>(false)

  const types = [
    { code: 1 as const, name: '满减' },
    { code: 2 as const, name: '折扣' },
    { code: 3 as const, name: '立减' }
  ]

  const today = new Date().toISOString().slice(0, 10)
  const monthLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const form = reactive({
    name: '',
    couponType: 1 as 1 | 2 | 3,
    discountValue: '5',
    minOrderAmount: '50',
    totalQty: 100,
    validType: 2 as 1 | 2,
    validFrom: today,
    validTo: monthLater
  })

  onLoad((opt) => {
    const id = (opt as Record<string, string> | undefined)?.id
    if (id) editId.value = id
  })

  function onDate(field: 'validFrom' | 'validTo', e: unknown) {
    const v = (e as { detail?: { value?: string } })?.detail?.value
    if (v) form[field] = v
  }

  function validate(): boolean {
    if (!form.name.trim()) {
      uni.showToast({ title: '请填写券名称', icon: 'none' })
      return false
    }
    if (compareAmount(form.discountValue, '0') <= 0) {
      uni.showToast({ title: '优惠值必须 > 0', icon: 'none' })
      return false
    }
    if (form.couponType === 2 && compareAmount(form.discountValue, '1') >= 0) {
      uni.showToast({ title: '折扣率必须 < 1', icon: 'none' })
      return false
    }
    if (compareAmount(form.minOrderAmount, '0') < 0) {
      uni.showToast({ title: '门槛不能为负', icon: 'none' })
      return false
    }
    if (!Number.isInteger(form.totalQty) || form.totalQty <= 0) {
      uni.showToast({ title: '数量须为正整数', icon: 'none' })
      return false
    }
    if (form.validType === 2 && form.validFrom >= form.validTo) {
      uni.showToast({ title: '结束日期须在开始之后', icon: 'none' })
      return false
    }
    return true
  }

  async function onSave() {
    if (!validate()) return
    submitting.value = true
    try {
      const payload = {
        shopId: shopStore.currentShopId,
        couponType: form.couponType,
        name: form.name,
        discountValue: form.discountValue,
        minOrderAmount: form.minOrderAmount,
        totalQty: form.totalQty,
        validType: form.validType,
        validFrom: form.validType === 2 ? `${form.validFrom}T00:00:00.000Z` : undefined,
        validTo: form.validType === 2 ? `${form.validTo}T23:59:59.999Z` : undefined,
        status: 1 as const
      }
      if (mockEnabled()) {
        await delay({})
      } else if (editId.value) {
        await updateCoupon(editId.value, payload)
      } else {
        await createCoupon(payload)
      }
      track(TRACK.CREATE_COUPON, { type: form.couponType })
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('ce.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-ce {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .ce-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .ce-title {
    display: block;
    margin-bottom: 24rpx;
    font-size: 30rpx;
    font-weight: 600;
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

  .ce-types {
    display: flex;
    gap: 12rpx;
  }

  .ce-type {
    flex: 1;
    padding: 16rpx;
    font-size: 24rpx;
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
</style>
