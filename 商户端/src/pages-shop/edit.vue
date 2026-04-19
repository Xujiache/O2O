<template>
  <view class="page page-shop-edit">
    <view class="form-section">
      <text class="form-section__title">基础信息</text>

      <view class="form-field">
        <text class="form-label">店铺名称</text>
        <input v-model="form.name" class="form-input" placeholder="店铺名称" maxlength="30" />
      </view>

      <view class="form-field">
        <text class="form-label">店铺简介</text>
        <textarea
          v-model="form.intro"
          class="form-textarea"
          placeholder="一句话介绍您的店铺"
          maxlength="100"
        />
      </view>

      <view class="form-field">
        <text class="form-label">店铺公告</text>
        <textarea
          v-model="form.announcement"
          class="form-textarea"
          placeholder="给顾客的公告（满减 / 配送说明等）"
          maxlength="200"
        />
      </view>

      <view class="form-field">
        <text class="form-label">联系电话</text>
        <input
          v-model="form.contactPhone"
          class="form-input"
          type="text"
          placeholder="联系电话"
          maxlength="20"
        />
      </view>

      <view class="form-field">
        <text class="form-label">营业地址</text>
        <input v-model="form.address" class="form-input" placeholder="详细地址" maxlength="100" />
      </view>
    </view>

    <view class="form-section">
      <text class="form-section__title">店铺图片</text>

      <view class="form-field">
        <text class="form-label">店铺 Logo</text>
        <view class="upload-card upload-card--square" @click="onUploadLogo">
          <image v-if="form.logo" :src="form.logo" class="upload-img" mode="aspectFill" />
          <view v-else class="upload-placeholder">
            <text>+</text>
            <text>上传 Logo</text>
          </view>
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">店铺封面</text>
        <view class="upload-card" @click="onUploadCover">
          <image v-if="form.cover" :src="form.cover" class="upload-img" mode="aspectFill" />
          <view v-else class="upload-placeholder">
            <text>+</text>
            <text>上传封面</text>
          </view>
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">店铺图片（最多 6 张）</text>
        <view class="upload-list">
          <view v-for="(img, idx) in form.images" :key="idx" class="upload-list__item">
            <image :src="img" class="upload-img" mode="aspectFill" />
            <text class="upload-list__remove" @click="removeImage(idx)">×</text>
          </view>
          <view v-if="form.images.length < 6" class="upload-list__add" @click="onUploadImages">
            <text>+</text>
          </view>
        </view>
      </view>
    </view>

    <view class="form-section">
      <text class="form-section__title">运营参数</text>

      <view class="form-field row-between">
        <text class="form-label">起送价</text>
        <input
          v-model="form.minAmount"
          class="form-input form-input--small"
          type="digit"
          placeholder="0.00"
        />
      </view>
      <view class="form-field row-between">
        <text class="form-label">预计制作时长（分钟）</text>
        <input
          v-model.number="form.prepareMin"
          class="form-input form-input--small"
          type="number"
          placeholder="20"
        />
      </view>
      <view class="form-field row-between">
        <text class="form-label">支持预订单</text>
        <switch :checked="form.supportPreOrder === 1" color="#2F80ED" @change="onTogglePreOrder" />
      </view>
      <view class="form-field row-between">
        <text class="form-label">支持发票</text>
        <switch :checked="form.supportInvoice === 1" color="#2F80ED" @change="onToggleInvoice" />
      </view>
    </view>

    <view class="form-actions">
      <BizBtn type="primary" block :disabled="submitting" @click="onSave">
        {{ submitting ? '保存中...' : '保存' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import { updateShop } from '@/api/shop'
  import { chooseAndUpload } from '@/api/file'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { compareAmount } from '@/utils/format'

  /**
   * 店铺信息编辑（T6.12）
   *
   * 字段：name / intro / announcement / contactPhone / address / logo / cover / images
   *      minAmount / prepareMin / supportPreOrder / supportInvoice
   *
   * P5 经验：minAmount 必须用 string + currency.js 校验（compareAmount）
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.12)
   */
  const shopStore = useShopStore()
  const submitting = ref<boolean>(false)

  const form = reactive({
    name: '',
    intro: '',
    announcement: '',
    contactPhone: '',
    address: '',
    logo: '',
    cover: '',
    images: [] as string[],
    minAmount: '0.00',
    prepareMin: 20,
    supportPreOrder: 0 as 0 | 1,
    supportInvoice: 0 as 0 | 1
  })

  onMounted(() => {
    const s = shopStore.currentShop
    if (!s) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    form.name = s.name
    form.intro = s.intro ?? ''
    form.announcement = s.announcement ?? ''
    form.contactPhone = s.contactPhone
    form.address = s.address
    form.logo = s.logo
    form.cover = s.cover ?? ''
    form.images = s.images ?? []
    form.minAmount = s.minAmount
    form.prepareMin = s.prepareMin
    form.supportPreOrder = s.supportPreOrder
    form.supportInvoice = s.supportInvoice
  })

  async function onUploadLogo() {
    try {
      const urls = await chooseAndUpload(1, 'shop_image', true)
      if (urls.length > 0) form.logo = urls[0]
    } catch (e) {
      logger.warn('shop-edit.upload.logo.fail', { e: String(e) })
    }
  }
  async function onUploadCover() {
    try {
      const urls = await chooseAndUpload(1, 'shop_image', true)
      if (urls.length > 0) form.cover = urls[0]
    } catch (e) {
      logger.warn('shop-edit.upload.cover.fail', { e: String(e) })
    }
  }
  async function onUploadImages() {
    try {
      const remain = 6 - form.images.length
      if (remain <= 0) return
      const urls = await chooseAndUpload(remain, 'shop_image', true)
      form.images = [...form.images, ...urls]
    } catch (e) {
      logger.warn('shop-edit.upload.images.fail', { e: String(e) })
    }
  }

  function removeImage(idx: number) {
    form.images.splice(idx, 1)
  }

  function onTogglePreOrder(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    form.supportPreOrder = v ? 1 : 0
  }
  function onToggleInvoice(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    form.supportInvoice = v ? 1 : 0
  }

  async function onSave() {
    if (!form.name.trim()) {
      uni.showToast({ title: '请输入店铺名称', icon: 'none' })
      return
    }
    if (!form.contactPhone.trim()) {
      uni.showToast({ title: '请输入联系电话', icon: 'none' })
      return
    }
    if (compareAmount(form.minAmount, '0') < 0) {
      uni.showToast({ title: '起送价不能为负', icon: 'none' })
      return
    }
    if (!Number.isInteger(form.prepareMin) || form.prepareMin <= 0) {
      uni.showToast({ title: '制作时长须为正整数', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
        shopStore.updateCurrentShop({ ...form })
      } else {
        const updated = await updateShop(shopStore.currentShopId, {
          name: form.name,
          intro: form.intro,
          announcement: form.announcement,
          contactPhone: form.contactPhone,
          address: form.address,
          logo: form.logo,
          cover: form.cover,
          images: form.images,
          minAmount: form.minAmount,
          prepareMin: form.prepareMin,
          supportPreOrder: form.supportPreOrder,
          supportInvoice: form.supportInvoice
        })
        shopStore.updateCurrentShop(updated)
      }
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('shop-edit.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-shop-edit {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .form-section {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      display: block;
      margin-bottom: 24rpx;
      font-size: 28rpx;
      font-weight: 600;
      color: $uni-text-color;
    }
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
      width: 240rpx;
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

  .upload-card {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 240rpx;
    overflow: hidden;
    background: $uni-bg-color-grey;
    border: 2rpx dashed $uni-border-color;
    border-radius: $uni-border-radius-base;

    &--square {
      width: 200rpx;
      height: 200rpx;
    }
  }

  .upload-img {
    width: 100%;
    height: 100%;
  }

  .upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .upload-list {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;

    &__item {
      position: relative;
      width: 180rpx;
      height: 180rpx;
      overflow: hidden;
      border-radius: $uni-border-radius-base;
    }

    &__remove {
      position: absolute;
      top: 4rpx;
      right: 4rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36rpx;
      height: 36rpx;
      font-size: 24rpx;
      line-height: 1;
      color: #fff;
      background: rgb(0 0 0 / 60%);
      border-radius: 50%;
    }

    &__add {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 180rpx;
      height: 180rpx;
      font-size: 60rpx;
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
      border: 2rpx dashed $uni-border-color;
      border-radius: $uni-border-radius-base;
    }
  }

  .form-actions {
    padding: 24rpx;
  }
</style>
