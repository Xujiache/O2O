<template>
  <view class="page page-white addr-edit">
    <view class="addr-edit__parse" @tap="onParseClick">
      <text class="addr-edit__parse-icon">📋</text>
      <text class="addr-edit__parse-text">智能识别：粘贴一段地址自动填充</text>
      <text class="addr-edit__parse-arrow">›</text>
    </view>

    <view v-if="parseInputVisible" class="addr-edit__parse-area">
      <textarea
        v-model="parseText"
        class="addr-edit__parse-textarea"
        placeholder="例：张三 13800001234 北京市朝阳区xx街道xx小区5号楼"
        auto-height
      />
      <view class="addr-edit__parse-actions">
        <view class="addr-edit__parse-cancel" @tap="parseInputVisible = false">取消</view>
        <view class="addr-edit__parse-submit" @tap="onParseSubmit">识别</view>
      </view>
    </view>

    <view class="addr-edit__form">
      <view class="addr-edit__row">
        <text class="addr-edit__label">姓名</text>
        <input
          v-model="form.name"
          class="addr-edit__input"
          placeholder="收货人姓名"
          maxlength="20"
        />
      </view>
      <view class="addr-edit__row">
        <text class="addr-edit__label">手机号</text>
        <input
          v-model="form.mobile"
          class="addr-edit__input"
          type="number"
          placeholder="11 位手机号"
          maxlength="11"
        />
      </view>
      <picker mode="region" :value="regionValue" @change="onRegionChange">
        <view class="addr-edit__row">
          <text class="addr-edit__label">所在地区</text>
          <text class="addr-edit__value" :class="{ 'addr-edit__value--muted': !hasRegion }">
            {{ hasRegion ? `${form.province} ${form.city} ${form.district}` : '请选择' }}
          </text>
          <text class="addr-edit__arrow">›</text>
        </view>
      </picker>
      <view class="addr-edit__row addr-edit__row--detail">
        <text class="addr-edit__label">详细地址</text>
        <view class="addr-edit__detail-wrap">
          <input
            v-model="form.detail"
            class="addr-edit__input"
            placeholder="楼栋 / 门牌号"
            maxlength="120"
          />
          <view class="addr-edit__map-btn" @tap="onChooseLocation">
            <text>📍 地图</text>
          </view>
        </view>
      </view>
      <view class="addr-edit__row addr-edit__row--tag">
        <text class="addr-edit__label">标签</text>
        <view class="addr-edit__tags">
          <view
            v-for="t in tagOptions"
            :key="t"
            class="addr-edit__tag"
            :class="{ 'addr-edit__tag--active': form.tag === t }"
            @tap="form.tag = t"
          >
            <text>{{ t }}</text>
          </view>
          <input
            v-model="customTag"
            class="addr-edit__tag-custom"
            placeholder="自定义"
            maxlength="6"
            @blur="onCustomTagBlur"
          />
        </view>
      </view>
      <view class="addr-edit__row">
        <text class="addr-edit__label">设为默认</text>
        <switch :checked="form.isDefault === 1" color="#ff6a1a" @change="onDefaultChange" />
      </view>
    </view>

    <view class="addr-edit__actions">
      <button class="addr-edit__btn" :loading="saving" :disabled="!canSubmit" @tap="onSave">
        保存
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/address-edit.vue
   * @stage P5/T5.34 (Sprint 6)
   * @desc 收货地址新增 / 编辑：智能识别 + region picker + chooseLocation + 标签 + 默认
   * @author 单 Agent V2.0
   */
  import { ref, reactive, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { getAddress, createAddress, updateAddress, parseAddressText } from '@/api/user'
  import type { UserAddress } from '@/types/biz'
  import { logger } from '@/utils/logger'

  const tagOptions = ['家', '公司', '学校']

  const editId = ref<string>('')
  const saving = ref<boolean>(false)
  const parseInputVisible = ref<boolean>(false)
  const parseText = ref<string>('')
  const customTag = ref<string>('')

  const form = reactive<{
    name: string
    mobile: string
    province: string
    city: string
    district: string
    detail: string
    lng: number
    lat: number
    tag: string | null
    isDefault: 0 | 1
  }>({
    name: '',
    mobile: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    lng: 0,
    lat: 0,
    tag: null,
    isDefault: 0
  })

  const hasRegion = computed<boolean>(() => Boolean(form.province && form.city && form.district))

  const regionValue = computed<string[]>(() => {
    if (!hasRegion.value) return ['北京市', '北京市', '东城区']
    return [form.province, form.city, form.district]
  })

  const canSubmit = computed<boolean>(() => {
    if (saving.value) return false
    if (!form.name.trim()) return false
    if (!/^1\d{10}$/.test(form.mobile)) return false
    if (!hasRegion.value) return false
    if (!form.detail.trim()) return false
    return true
  })

  onLoad((options) => {
    const id = options?.id
    if (id) {
      editId.value = id
      void loadDetail(id)
    }
  })

  async function loadDetail(id: string) {
    try {
      const r = await getAddress(id)
      Object.assign(form, {
        name: r.name,
        mobile: r.mobile,
        province: r.province,
        city: r.city,
        district: r.district,
        detail: r.detail,
        lng: r.lng,
        lat: r.lat,
        tag: r.tag,
        isDefault: r.isDefault
      })
      if (r.tag && !tagOptions.includes(r.tag)) {
        customTag.value = r.tag
      }
      uni.setNavigationBarTitle({ title: '编辑地址' })
    } catch (e) {
      logger.warn('addr.detail.fail', { e: String(e) })
    }
  }

  function onParseClick() {
    parseInputVisible.value = !parseInputVisible.value
  }

  async function onParseSubmit() {
    const text = parseText.value.trim()
    if (!text) {
      uni.showToast({ title: '请输入地址文本', icon: 'none' })
      return
    }
    try {
      const r = await parseAddressText(text)
      if (r.name) form.name = r.name
      if (r.mobile) form.mobile = r.mobile
      if (r.province) form.province = r.province
      if (r.city) form.city = r.city
      if (r.district) form.district = r.district
      if (r.detail) form.detail = r.detail
      uni.showToast({ title: '识别成功', icon: 'success' })
      parseInputVisible.value = false
    } catch (e) {
      logger.warn('addr.parse.fail', { e: String(e) })
    }
  }

  function onRegionChange(e: { detail: { value: string[] } }) {
    const [p, c, d] = e.detail.value
    form.province = p ?? ''
    form.city = c ?? ''
    form.district = d ?? ''
  }

  function onChooseLocation() {
    uni.chooseLocation({
      success: (res) => {
        if (res.address) {
          form.detail = `${res.address}${res.name ? ' ' + res.name : ''}`.trim()
        } else if (res.name) {
          form.detail = res.name
        }
        form.lng = res.longitude
        form.lat = res.latitude
      },
      fail: (err) => {
        logger.warn('addr.chooseLocation.fail', { e: String(err.errMsg ?? '') })
      }
    })
  }

  function onCustomTagBlur() {
    if (customTag.value.trim()) {
      form.tag = customTag.value.trim()
    }
  }

  function onDefaultChange(e: { detail: { value: boolean } }) {
    form.isDefault = e.detail.value ? 1 : 0
  }

  async function onSave() {
    if (!canSubmit.value) return
    saving.value = true
    const payload: Omit<UserAddress, 'id' | 'createdAt'> = {
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      province: form.province,
      city: form.city,
      district: form.district,
      detail: form.detail.trim(),
      lng: form.lng,
      lat: form.lat,
      tag: form.tag,
      isDefault: form.isDefault
    }
    try {
      if (editId.value) {
        await updateAddress(editId.value, payload)
      } else {
        await createAddress(payload)
      }
      uni.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('addr.save.fail', { e: String(e) })
    } finally {
      saving.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .addr-edit {
    padding-bottom: 64rpx;

    &__parse {
      @include flex-between;

      padding: 24rpx 32rpx;
      background: rgba(255, 106, 26, 0.06);
      border-bottom: 1rpx solid $color-divider;
    }

    &__parse-icon {
      margin-right: 16rpx;
      font-size: $font-size-md;
    }

    &__parse-text {
      flex: 1;
      font-size: $font-size-base;
      color: $color-primary;
    }

    &__parse-arrow {
      font-size: $font-size-md;
      color: $color-primary;
    }

    &__parse-area {
      padding: 16rpx 32rpx 24rpx;
      background: $color-bg-white;
      border-bottom: 1rpx solid $color-divider;
    }

    &__parse-textarea {
      width: 100%;
      min-height: 160rpx;
      padding: 16rpx;
      font-size: $font-size-base;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__parse-actions {
      display: flex;
      gap: 16rpx;
      justify-content: flex-end;
      margin-top: 16rpx;
    }

    &__parse-cancel,
    &__parse-submit {
      padding: 8rpx 32rpx;
      font-size: $font-size-sm;
      border-radius: $radius-md;
    }

    &__parse-cancel {
      color: $color-text-regular;
      background: $color-divider;
    }

    &__parse-submit {
      color: $color-text-inverse;
      background: $color-primary;
    }

    &__form {
      background: $color-bg-white;
    }

    &__row {
      @include flex-between;

      padding: 28rpx 32rpx;
      border-bottom: 1rpx solid $color-divider;

      &--detail {
        flex-wrap: wrap;
      }

      &--tag {
        align-items: flex-start;
      }
    }

    &__label {
      width: 160rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__input {
      flex: 1;
      height: 48rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      text-align: right;
    }

    &__value {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-regular;
      text-align: right;

      &--muted {
        color: $color-text-secondary;
      }
    }

    &__arrow {
      margin-left: 12rpx;
      font-size: $font-size-md;
      color: $color-text-placeholder;
    }

    &__detail-wrap {
      display: flex;
      flex: 1;
      align-items: center;
    }

    &__map-btn {
      flex-shrink: 0;
      padding: 8rpx 16rpx;
      margin-left: 12rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-sm;
    }

    &__tags {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 16rpx;
      justify-content: flex-end;
    }

    &__tag {
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      background: $color-bg-page;
      border-radius: $radius-md;

      &--active {
        color: $color-text-inverse;
        background: $color-primary;
      }
    }

    &__tag-custom {
      width: 160rpx;
      height: 56rpx;
      padding: 0 16rpx;
      font-size: $font-size-sm;
      text-align: center;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__actions {
      padding: 48rpx 32rpx 0;
    }

    &__btn {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      line-height: 88rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;

      &[disabled] {
        background: #ffc6a8;
      }
    }
  }
</style>
