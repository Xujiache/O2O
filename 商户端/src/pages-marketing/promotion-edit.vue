<template>
  <view class="page page-pme">
    <view class="pme-card">
      <text class="pme-title">{{ editId ? '编辑活动' : '新建活动' }}</text>

      <view class="form-field">
        <text class="form-label">活动类型</text>
        <view class="pme-types">
          <text
            v-for="t in types"
            :key="t.code"
            class="pme-type"
            :class="{ 'pme-type--active': form.promotionType === t.code }"
            @click="form.promotionType = t.code"
            >{{ t.name }}</text
          >
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">活动名称</text>
        <input
          v-model="form.name"
          class="form-input"
          placeholder="如：满 50 减 10"
          maxlength="30"
        />
      </view>

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

      <view class="form-field" v-if="form.promotionType === 1">
        <text class="form-label">满减规则（如：满 50 减 5）</text>
        <view class="row pme-rule">
          <text>满</text>
          <input v-model="form.config.threshold" class="form-input pme-rule__input" type="digit" />
          <text>元 减</text>
          <input v-model="form.config.reduce" class="form-input pme-rule__input" type="digit" />
          <text>元</text>
        </view>
      </view>

      <view class="form-field" v-if="form.promotionType === 2">
        <text class="form-label">折扣率（0-1，如 0.8 表示 8 折）</text>
        <input v-model="form.config.discount" class="form-input" type="digit" placeholder="0.80" />
      </view>

      <view class="form-field" v-if="form.promotionType === 3">
        <text class="form-label">拼单优惠（满 X 人减 Y 元）</text>
        <view class="row pme-rule">
          <text>满</text>
          <input
            v-model.number="form.config.peopleCount"
            class="form-input pme-rule__input"
            type="number"
          />
          <text>人 减</text>
          <input v-model="form.config.reduce" class="form-input pme-rule__input" type="digit" />
          <text>元</text>
        </view>
      </view>

      <view class="form-field" v-if="form.promotionType === 4">
        <text class="form-label">新品推荐说明</text>
        <textarea
          v-model="form.config.desc"
          class="form-textarea"
          placeholder="新品上架推荐文案"
          maxlength="100"
        />
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
  import { createPromotion, updatePromotion } from '@/api/marketing'
  import { mockEnabled, delay } from '@/api/_mock'
  import { compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 营销活动编辑（T6.36）
   *
   * 类型按 promotionType 切换 config 字段：
   *   1 满减：threshold + reduce
   *   2 折扣：discount
   *   3 拼单：peopleCount + reduce
   *   4 新品：desc
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()
  const editId = ref<string>('')
  const submitting = ref<boolean>(false)

  const types = [
    { code: 1 as const, name: '满减' },
    { code: 2 as const, name: '折扣' },
    { code: 3 as const, name: '拼单' },
    { code: 4 as const, name: '新品' }
  ]

  const today = new Date().toISOString().slice(0, 10)
  const monthLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const form = reactive({
    promotionType: 1 as 1 | 2 | 3 | 4,
    name: '',
    validFrom: today,
    validTo: monthLater,
    config: {} as Record<string, string | number>
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
      uni.showToast({ title: '请填写活动名', icon: 'none' })
      return false
    }
    if (form.validFrom >= form.validTo) {
      uni.showToast({ title: '结束日期须在开始之后', icon: 'none' })
      return false
    }
    if (form.promotionType === 1) {
      const t = String(form.config.threshold ?? '0')
      const r = String(form.config.reduce ?? '0')
      if (compareAmount(t, '0') <= 0 || compareAmount(r, '0') <= 0) {
        uni.showToast({ title: '满 / 减金额必须 > 0', icon: 'none' })
        return false
      }
      if (compareAmount(r, t) >= 0) {
        uni.showToast({ title: '减额必须小于满额', icon: 'none' })
        return false
      }
    }
    if (form.promotionType === 2) {
      const d = String(form.config.discount ?? '0')
      if (compareAmount(d, '0') <= 0 || compareAmount(d, '1') >= 0) {
        uni.showToast({ title: '折扣率必须在 (0, 1)', icon: 'none' })
        return false
      }
    }
    return true
  }

  async function onSave() {
    if (!validate()) return
    submitting.value = true
    try {
      const payload = {
        shopId: shopStore.currentShopId,
        promotionType: form.promotionType,
        name: form.name,
        config: form.config,
        validFrom: `${form.validFrom}T00:00:00.000Z`,
        validTo: `${form.validTo}T23:59:59.999Z`,
        status: 1 as const
      }
      if (mockEnabled()) {
        await delay({})
      } else if (editId.value) {
        await updatePromotion(editId.value, payload)
      } else {
        await createPromotion(payload)
      }
      track(TRACK.CREATE_PROMOTION, { type: form.promotionType })
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('pme.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-pme {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .pme-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .pme-title {
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

  .form-textarea {
    width: 100%;
    min-height: 160rpx;
    padding: 16rpx 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .pme-types {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12rpx;
  }

  .pme-type {
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

  .pme-rule {
    gap: 8rpx;
    align-items: center;

    &__input {
      width: 140rpx;
      text-align: center;
    }
  }
</style>
