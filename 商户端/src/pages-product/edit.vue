<template>
  <view class="page page-pe">
    <view class="form-section">
      <text class="form-section__title">基础信息</text>

      <view class="form-field">
        <text class="form-label">商品名称</text>
        <input v-model="form.name" class="form-input" placeholder="如：黑椒牛柳饭" maxlength="30" />
      </view>

      <view class="form-field">
        <text class="form-label">商品描述</text>
        <textarea
          v-model="form.description"
          class="form-textarea"
          maxlength="200"
          placeholder="可选"
        />
      </view>

      <view class="form-field">
        <text class="form-label">所属分类</text>
        <picker :value="categoryIdx" :range="categoryNames" @change="onCategoryChange">
          <view class="form-input form-input--picker">{{ form.categoryName || '请选择' }}</view>
        </picker>
      </view>

      <view class="form-field">
        <text class="form-label">商品图（最多 9 张）</text>
        <view class="upload-list">
          <view v-for="(img, idx) in form.images" :key="idx" class="upload-list__item">
            <image :src="img" class="upload-img" mode="aspectFill" />
            <text class="upload-list__remove" @click="removeImage(idx)">×</text>
          </view>
          <view v-if="form.images.length < 9" class="upload-list__add" @click="onUpload">+</view>
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">标签</text>
        <view class="pe-tags">
          <text
            v-for="t in tagOptions"
            :key="t"
            class="pe-tag"
            :class="{ 'pe-tag--active': form.tags.includes(t) }"
            @click="toggleTag(t)"
            >{{ t }}</text
          >
        </view>
      </view>
    </view>

    <view class="form-section">
      <view class="row-between">
        <text class="form-section__title">规格 / SKU</text>
        <switch :checked="form.hasSku === 1" color="#2F80ED" @change="onToggleSku" />
      </view>

      <view v-if="form.hasSku === 0" class="form-field">
        <view class="row-between">
          <text class="form-label">价格（元）</text>
          <input
            v-model="form.price"
            class="form-input form-input--small"
            type="digit"
            placeholder="0.00"
          />
        </view>
        <view class="row-between">
          <text class="form-label">库存</text>
          <input
            v-model.number="form.stockQty"
            class="form-input form-input--small"
            type="number"
            placeholder="0"
          />
        </view>
      </view>

      <view v-else class="form-field">
        <view v-for="(sku, idx) in form.skus" :key="idx" class="pe-sku">
          <input
            v-model="sku.name"
            class="form-input pe-sku__name"
            placeholder="规格名（如：大份）"
            maxlength="20"
          />
          <input
            v-model="sku.price"
            class="form-input pe-sku__price"
            type="digit"
            placeholder="价格"
          />
          <input
            v-model.number="sku.stockQty"
            class="form-input pe-sku__stock"
            type="number"
            placeholder="库存"
          />
          <text v-if="form.skus.length > 1" class="pe-sku__remove" @click="removeSku(idx)">×</text>
        </view>
        <view v-if="form.skus.length < 5" class="pe-sku-add" @click="addSku">+ 添加规格</view>
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
  import { reactive, ref, computed, onMounted } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useShopStore } from '@/store'
  import type { ProductCategory } from '@/types/biz'
  import { listCategories, getProduct, createProduct, updateProduct } from '@/api/product'
  import { chooseAndUpload } from '@/api/file'
  import { mockEnabled, mockCategories, delay } from '@/api/_mock'
  import { compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 商品编辑（T6.27）
   *
   * 字段：name / description / images(<=9) / categoryId / hasSku / skus / stockQty / tags / price
   *
   * P5 经验：库存校验 stockQty >= 0；价格用 compareAmount
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()
  const editId = ref<string>('')
  const submitting = ref<boolean>(false)
  const categories = ref<ProductCategory[]>([])
  const categoryIdx = ref<number>(-1)

  const tagOptions = ['新品', '招牌', '推荐', '辣', '素', '低脂', '热销']

  const form = reactive({
    name: '',
    description: '',
    categoryId: '',
    categoryName: '',
    images: [] as string[],
    price: '0.00',
    hasSku: 0 as 0 | 1,
    stockQty: 0,
    skus: [] as { name: string; price: string; stockQty: number }[],
    tags: [] as string[]
  })

  const categoryNames = computed<string[]>(() => categories.value.map((c) => c.name))

  onLoad((opt) => {
    const o = opt as { id?: string } | undefined
    if (o?.id) editId.value = o.id
  })

  onMounted(async () => {
    track(TRACK.VIEW_PRODUCT_EDIT, { isEdit: Boolean(editId.value) })
    await loadCategories()
    if (editId.value) await loadProduct()
  })

  async function loadCategories() {
    try {
      categories.value = mockEnabled()
        ? await delay(mockCategories)
        : await listCategories(shopStore.currentShopId)
    } catch (e) {
      logger.warn('pe.cat.fail', { e: String(e) })
    }
  }

  async function loadProduct() {
    try {
      const p = mockEnabled() ? null : await getProduct(editId.value)
      if (p) {
        form.name = p.name
        form.description = p.description ?? ''
        form.categoryId = p.categoryId
        form.categoryName = p.categoryName ?? ''
        form.images = [...p.images]
        form.price = p.price
        form.hasSku = p.hasSku
        form.stockQty = p.stockQty ?? 0
        form.skus =
          p.skus?.map((s) => ({ name: s.name, price: s.price, stockQty: s.stockQty })) ?? []
        form.tags = [...(p.tags ?? [])]
        categoryIdx.value = categories.value.findIndex((c) => c.id === p.categoryId)
      }
    } catch (e) {
      logger.warn('pe.load.fail', { e: String(e) })
    }
  }

  function onCategoryChange(e: { detail: { value: number } }) {
    categoryIdx.value = e.detail.value
    const c = categories.value[e.detail.value]
    if (c) {
      form.categoryId = c.id
      form.categoryName = c.name
    }
  }

  async function onUpload() {
    try {
      const remain = 9 - form.images.length
      if (remain <= 0) return
      const urls = await chooseAndUpload(remain, 'product_image', true)
      form.images = [...form.images, ...urls]
    } catch (e) {
      logger.warn('pe.upload.fail', { e: String(e) })
    }
  }

  function removeImage(idx: number) {
    form.images.splice(idx, 1)
  }

  function toggleTag(t: string) {
    const idx = form.tags.indexOf(t)
    if (idx >= 0) form.tags.splice(idx, 1)
    else form.tags.push(t)
  }

  function onToggleSku(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    form.hasSku = v ? 1 : 0
    if (v && form.skus.length === 0) {
      form.skus.push({ name: '默认', price: form.price, stockQty: form.stockQty })
    }
  }

  function addSku() {
    form.skus.push({ name: '', price: '0.00', stockQty: 0 })
  }
  function removeSku(idx: number) {
    form.skus.splice(idx, 1)
  }

  function validate(): boolean {
    if (!form.name.trim()) {
      uni.showToast({ title: '请填写商品名称', icon: 'none' })
      return false
    }
    if (!form.categoryId) {
      uni.showToast({ title: '请选择分类', icon: 'none' })
      return false
    }
    if (form.images.length === 0) {
      uni.showToast({ title: '至少上传 1 张商品图', icon: 'none' })
      return false
    }
    if (form.hasSku === 0) {
      if (compareAmount(form.price, '0') <= 0) {
        uni.showToast({ title: '价格必须 > 0', icon: 'none' })
        return false
      }
      if (!Number.isInteger(form.stockQty) || form.stockQty < 0) {
        uni.showToast({ title: '库存须为非负整数', icon: 'none' })
        return false
      }
    } else {
      if (form.skus.length === 0) {
        uni.showToast({ title: '请至少添加 1 个规格', icon: 'none' })
        return false
      }
      for (const s of form.skus) {
        if (!s.name.trim()) {
          uni.showToast({ title: '规格名必填', icon: 'none' })
          return false
        }
        if (compareAmount(s.price, '0') <= 0) {
          uni.showToast({ title: `规格「${s.name}」价格必须 > 0`, icon: 'none' })
          return false
        }
        if (!Number.isInteger(s.stockQty) || s.stockQty < 0) {
          uni.showToast({ title: `规格「${s.name}」库存须为非负整数`, icon: 'none' })
          return false
        }
      }
    }
    return true
  }

  async function onSave() {
    if (!validate()) return
    submitting.value = true
    try {
      const params = {
        shopId: shopStore.currentShopId,
        categoryId: form.categoryId,
        name: form.name,
        description: form.description,
        images: form.images,
        price: form.price,
        hasSku: form.hasSku,
        isCombo: 0 as 0 | 1,
        stockQty: form.hasSku === 0 ? form.stockQty : undefined,
        skus: form.hasSku === 1 ? form.skus : undefined,
        tags: form.tags
      }
      if (mockEnabled()) {
        await delay({ ok: true })
      } else if (editId.value) {
        await updateProduct(editId.value, params)
      } else {
        await createProduct(params)
      }
      track(editId.value ? TRACK.UPDATE_PRODUCT : TRACK.CREATE_PRODUCT, { id: editId.value })
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('pe.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-pe {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .form-section {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      display: block;
      margin-bottom: 16rpx;
      font-size: 28rpx;
      font-weight: 600;
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

    &--picker {
      display: flex;
      align-items: center;
      line-height: 80rpx;
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

  .upload-img {
    width: 100%;
    height: 100%;
  }

  .pe-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .pe-tag {
    padding: 8rpx 16rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: 999rpx;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }

  .pe-sku {
    display: flex;
    gap: 12rpx;
    align-items: center;
    margin-bottom: 16rpx;

    &__name {
      flex: 2;
    }

    &__price {
      flex: 1.5;
    }

    &__stock {
      flex: 1;
    }

    &__remove {
      font-size: 32rpx;
      color: $uni-color-error;
    }
  }

  .pe-sku-add {
    padding: 16rpx;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: $uni-color-primary;
    text-align: center;
    border: 2rpx dashed $uni-color-primary;
    border-radius: $uni-border-radius-base;
  }

  .form-actions {
    padding: 24rpx 0;
  }
</style>
