<template>
  <view class="page page-dc">
    <view class="dc-tip">
      <text>阶梯配送费按距离区间收取，请按从小到大顺序填写</text>
    </view>

    <view class="dc-rules">
      <view v-for="(r, idx) in rules" :key="idx" class="dc-rule">
        <text class="dc-rule__num">{{ idx + 1 }}</text>
        <view class="dc-rule__body">
          <view class="dc-rule__field">
            <text class="dc-rule__label">距离上限（米）</text>
            <input
              v-model.number="r.distanceMax"
              class="dc-rule__input"
              type="number"
              :placeholder="idx === rules.length - 1 ? '无限制' : '5000'"
            />
          </view>
          <view class="dc-rule__field">
            <text class="dc-rule__label">配送费（元）</text>
            <input v-model="r.fee" class="dc-rule__input" type="digit" placeholder="5.00" />
          </view>
        </view>
        <text v-if="rules.length > 1" class="dc-rule__remove" @click="removeRule(idx)">×</text>
      </view>
      <view v-if="rules.length < 5" class="dc-add" @click="addRule">+ 添加阶梯</view>
    </view>

    <view class="dc-actions">
      <BizBtn type="primary" block :disabled="submitting" @click="onSave">
        {{ submitting ? '保存中...' : '保存配送设置' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import type { DeliveryFeeRule } from '@/types/biz'
  import { getDeliveryFeeRules, setDeliveryFeeRules } from '@/api/shop'
  import { mockEnabled, delay } from '@/api/_mock'
  import { compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 配送设置（阶梯费 / 起送价 / 预订单）（T6.15）
   *
   * 阶梯规则约束：
   *   - distanceMax 必须递增
   *   - fee 必须 >= 0（用 compareAmount，禁止 Number 比）
   *   - 最后一档 distanceMax 留空 = 无限制
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.15)
   */
  const shopStore = useShopStore()
  const submitting = ref<boolean>(false)
  const rules = ref<DeliveryFeeRule[]>([
    { distanceMax: 1000, fee: '3.00' },
    { distanceMax: 3000, fee: '5.00' }
  ])

  onMounted(async () => {
    if (!shopStore.currentShopId) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    try {
      const list = mockEnabled()
        ? await delay(rules.value)
        : await getDeliveryFeeRules(shopStore.currentShopId)
      if (list && list.length > 0) rules.value = list
    } catch (e) {
      logger.warn('dc.load.fail', { e: String(e) })
    }
  })

  function addRule() {
    rules.value.push({ distanceMax: 5000, fee: '6.00' })
  }
  function removeRule(idx: number) {
    rules.value.splice(idx, 1)
  }

  function validate(): boolean {
    if (rules.value.length === 0) {
      uni.showToast({ title: '至少 1 条阶梯', icon: 'none' })
      return false
    }
    let lastMax = -1
    for (const r of rules.value) {
      if (typeof r.distanceMax !== 'number' || Number.isNaN(r.distanceMax) || r.distanceMax <= 0) {
        uni.showToast({ title: '距离须为正整数', icon: 'none' })
        return false
      }
      if (r.distanceMax <= lastMax) {
        uni.showToast({ title: '距离须递增', icon: 'none' })
        return false
      }
      lastMax = r.distanceMax
      /* 用 currency.js 比较，禁止 Number(r.fee) */
      if (compareAmount(r.fee, '0') < 0) {
        uni.showToast({ title: '配送费不能为负', icon: 'none' })
        return false
      }
    }
    return true
  }

  async function onSave() {
    if (!validate()) return
    submitting.value = true
    try {
      if (!mockEnabled()) {
        await setDeliveryFeeRules(shopStore.currentShopId, rules.value)
      }
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('dc.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-dc {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .dc-tip {
    padding: 16rpx 24rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-color-primary;
    background: $uni-color-primary-light;
    border-radius: $uni-border-radius-base;
  }

  .dc-rules {
    padding: 24rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .dc-rule {
    display: flex;
    align-items: center;
    padding: 16rpx 0;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }

    &__num {
      width: 48rpx;
      margin-right: 16rpx;
      font-size: 26rpx;
      color: $uni-color-primary;
      text-align: center;
    }

    &__body {
      display: flex;
      flex: 1;
      gap: 16rpx;
    }

    &__field {
      flex: 1;
    }

    &__label {
      display: block;
      margin-bottom: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__input {
      width: 100%;
      height: 64rpx;
      padding: 0 16rpx;
      font-size: 26rpx;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }

    &__remove {
      margin-left: 16rpx;
      font-size: 36rpx;
      color: $uni-color-error;
    }
  }

  .dc-add {
    padding: 16rpx;
    margin-top: 16rpx;
    font-size: 24rpx;
    color: $uni-color-primary;
    text-align: center;
    border: 2rpx dashed $uni-color-primary;
    border-radius: $uni-border-radius-base;
  }

  .dc-actions {
    padding: 24rpx;
  }
</style>
