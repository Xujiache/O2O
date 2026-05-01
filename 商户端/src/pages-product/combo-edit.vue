<template>
  <view class="page page-combo">
    <view class="form-section">
      <text class="form-section__title">套餐基础信息</text>

      <view class="form-field">
        <text class="form-label">套餐名称</text>
        <input v-model="form.name" class="form-input" placeholder="如：双人套餐 A" maxlength="30" />
      </view>

      <view class="form-field">
        <text class="form-label">套餐描述</text>
        <textarea
          v-model="form.description"
          class="form-textarea"
          maxlength="200"
          placeholder="可选"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">套餐价（元）</text>
        <input
          v-model="form.price"
          class="form-input form-input--small"
          type="digit"
          placeholder="0.00"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">原价（元，可选）</text>
        <input
          v-model="form.originalPrice"
          class="form-input form-input--small"
          type="digit"
          placeholder="0.00"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">折扣率（0~1，可选）</text>
        <input
          v-model="form.discountRate"
          class="form-input form-input--small"
          type="digit"
          placeholder="0.85"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">库存</text>
        <input
          v-model.number="form.stockQty"
          class="form-input form-input--small"
          type="number"
          placeholder="0"
        />
      </view>
    </view>

    <view class="form-section">
      <view class="row-between">
        <text class="form-section__title">套餐子商品</text>
        <text class="combo__add" @click="onAddItem">+ 添加</text>
      </view>

      <BizEmpty v-if="form.items.length === 0" text="尚未添加子商品" />

      <view v-else>
        <view v-for="(it, idx) in form.items" :key="idx" class="combo__item">
          <picker
            class="combo__item-picker"
            :value="indexOfProduct(it.productId)"
            :range="productNames"
            @change="(e: unknown) => onPickProduct(idx, e)"
          >
            <view class="form-input form-input--picker u-line-1">
              {{ it.productName || '请选择商品' }}
            </view>
          </picker>
          <input
            v-model.number="it.qty"
            class="form-input form-input--small combo__item-qty"
            type="number"
            placeholder="数量"
          />
          <text class="combo__item-remove" @click="onRemoveItem(idx)">×</text>
        </view>
      </view>
    </view>

    <view class="form-section">
      <text class="form-section__title">可售时段</text>

      <view class="form-field row-between">
        <text class="form-label">可售范围</text>
        <picker :value="periodModeIdx" :range="periodModeNames" @change="onPeriodModeChange">
          <view class="form-input form-input--picker">{{ periodModeNames[periodModeIdx] }}</view>
        </picker>
      </view>

      <view v-if="form.periodMode === 'custom'" class="combo__period">
        <view class="combo__period-row">
          <picker
            mode="time"
            :value="form.startTime"
            @change="(e: unknown) => onTimeChange('start', e)"
          >
            <view class="form-input form-input--small">{{ form.startTime }}</view>
          </picker>
          <text class="combo__period-sep">~</text>
          <picker
            mode="time"
            :value="form.endTime"
            @change="(e: unknown) => onTimeChange('end', e)"
          >
            <view class="form-input form-input--small">{{ form.endTime }}</view>
          </picker>
        </view>
      </view>
    </view>

    <view class="form-actions">
      <BizBtn type="primary" block :disabled="submitting" @click="onSave">
        {{ submitting ? '保存中...' : '保存套餐' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-product/combo-edit.vue
   * @stage P9 Sprint 6 / W6.E.3
   * @desc 套餐独立编辑 UI（基础信息 + 子商品 + 可售时段）
   * @author 单 Agent V2.0（Sprint 6 Agent E）
   *
   * 数据模型：
   *   - 套餐基础：name / description / price / originalPrice / discountRate / stockQty
   *   - 子商品：items[] = { productId, productName, qty }
   *   - 可售时段：periodMode = all-day / weekday / custom；custom 时 startTime/endTime
   *
   * 提交：
   *   - 已存在 createProduct 入参 isCombo=1 + comboItems → 直接调
   *   - 时段配置当前后端无独立字段；本期前端先骨架，后续后端补 sale_period_mode + sale_period
   *     → 在 description 末尾追加可售时段字符串作为 P9 阶段过渡（不阻塞主链路）
   *
   * 注：本页面骨架优先；不强求新建后端端点，已尽量复用 createProduct
   */
  import { reactive, ref, computed, onMounted } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { useShopStore } from '@/store'
  import {
    listProducts,
    createProduct,
    updateProduct,
    getProduct,
    type ProductCreateParams
  } from '@/api/product'
  import type { Product, ComboItem } from '@/types/biz'
  import { compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /** 可售时段模式 */
  type PeriodMode = 'all-day' | 'weekday' | 'custom'

  /** 套餐表单（含可售时段；后端尚未支持时段字段，本期作为前端骨架） */
  interface ComboForm {
    name: string
    description: string
    price: string
    originalPrice: string
    discountRate: string
    stockQty: number
    items: Array<{ productId: string; productName: string; qty: number }>
    periodMode: PeriodMode
    startTime: string
    endTime: string
  }

  const shopStore = useShopStore()

  /** 编辑态：传入 productId 即编辑已有套餐 */
  const editId = ref<string>('')
  /** 提交中 */
  const submitting = ref<boolean>(false)
  /** 候选子商品列表（同店铺非套餐普通商品） */
  const candidateProducts = ref<Product[]>([])

  const form = reactive<ComboForm>({
    name: '',
    description: '',
    price: '0.00',
    originalPrice: '',
    discountRate: '',
    stockQty: 0,
    items: [],
    periodMode: 'all-day',
    startTime: '10:00',
    endTime: '14:00'
  })

  /** 时段模式选项 */
  const periodModeNames = ['全天可售', '仅工作日', '自定义时段']
  const periodModeIdx = computed<number>(() => {
    if (form.periodMode === 'all-day') return 0
    if (form.periodMode === 'weekday') return 1
    return 2
  })

  /** picker 用：候选商品名称 */
  const productNames = computed<string[]>(() =>
    candidateProducts.value.map((p) => `${p.name}（¥${p.price}）`)
  )

  onLoad((opt) => {
    const o = opt as { id?: string } | undefined
    if (o?.id) editId.value = o.id
  })

  onMounted(async () => {
    if (!shopStore.currentShopId) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    await Promise.all([loadCandidateProducts(), loadEditingCombo()])
  })

  /** 加载同店铺普通商品（不含其他套餐） */
  async function loadCandidateProducts(): Promise<void> {
    try {
      const r = await listProducts({
        shopId: shopStore.currentShopId,
        page: 1,
        pageSize: 100
      })
      candidateProducts.value = (r.list ?? []).filter((p) => p.isCombo !== 1)
    } catch (e) {
      logger.warn('combo.candidates.load.fail', { e: String(e) })
      candidateProducts.value = []
    }
  }

  /** 编辑态：加载已有套餐数据 */
  async function loadEditingCombo(): Promise<void> {
    if (!editId.value) return
    try {
      const p = await getProduct(editId.value)
      form.name = p.name
      form.description = p.description ?? ''
      form.price = p.price ?? '0.00'
      form.originalPrice = p.originalPrice ?? ''
      form.stockQty = p.stockQty ?? 0
      form.items = (p.comboItems ?? []).map((c) => ({
        productId: c.productId,
        productName: c.productName,
        qty: c.qty
      }))
    } catch (e) {
      logger.warn('combo.load.fail', { e: String(e) })
      uni.showToast({ title: '加载套餐失败', icon: 'none' })
    }
  }

  /** picker：根据 productId 取候选索引 */
  function indexOfProduct(productId: string): number {
    if (!productId) return -1
    return candidateProducts.value.findIndex((p) => p.id === productId)
  }

  function onPickProduct(idx: number, e: unknown): void {
    const v = (e as { detail?: { value?: number | string } })?.detail?.value
    const pickIdx = typeof v === 'number' ? v : Number(v)
    if (!Number.isInteger(pickIdx)) return
    const p = candidateProducts.value[pickIdx]
    if (!p) return
    form.items[idx].productId = p.id
    form.items[idx].productName = p.name
  }

  function onAddItem(): void {
    if (form.items.length >= 10) {
      uni.showToast({ title: '最多 10 个子商品', icon: 'none' })
      return
    }
    form.items.push({ productId: '', productName: '', qty: 1 })
  }

  function onRemoveItem(idx: number): void {
    form.items.splice(idx, 1)
  }

  function onPeriodModeChange(e: unknown): void {
    const v = (e as { detail?: { value?: number | string } })?.detail?.value
    const idx = typeof v === 'number' ? v : Number(v)
    if (idx === 0) form.periodMode = 'all-day'
    else if (idx === 1) form.periodMode = 'weekday'
    else form.periodMode = 'custom'
  }

  function onTimeChange(which: 'start' | 'end', e: unknown): void {
    const v = (e as { detail?: { value?: string } })?.detail?.value
    if (typeof v !== 'string') return
    if (which === 'start') form.startTime = v
    else form.endTime = v
  }

  /** 校验表单 */
  function validate(): boolean {
    if (!form.name.trim()) {
      uni.showToast({ title: '请填写套餐名称', icon: 'none' })
      return false
    }
    if (compareAmount(form.price, '0') <= 0) {
      uni.showToast({ title: '套餐价必须大于 0', icon: 'none' })
      return false
    }
    if (form.items.length === 0) {
      uni.showToast({ title: '至少添加 1 个子商品', icon: 'none' })
      return false
    }
    for (const it of form.items) {
      if (!it.productId) {
        uni.showToast({ title: '请选择子商品', icon: 'none' })
        return false
      }
      if (!Number.isInteger(it.qty) || it.qty <= 0) {
        uni.showToast({ title: `${it.productName} 数量无效`, icon: 'none' })
        return false
      }
    }
    if (form.periodMode === 'custom' && form.startTime >= form.endTime) {
      uni.showToast({ title: '可售时段无效', icon: 'none' })
      return false
    }
    return true
  }

  /** 当前可售时段拼成可读字符串（追加到 description；后端补字段后切换） */
  function buildPeriodTag(): string {
    if (form.periodMode === 'all-day') return '[全天可售]'
    if (form.periodMode === 'weekday') return '[工作日可售]'
    return `[可售时段 ${form.startTime}~${form.endTime}]`
  }

  async function onSave(): Promise<void> {
    if (!validate()) return
    submitting.value = true
    try {
      /* 套餐沿用 createProduct / updateProduct（isCombo=1）；时段配置追加在 description 末尾 */
      const periodTag = buildPeriodTag()
      const description = form.description ? `${form.description} ${periodTag}` : periodTag
      const comboItems: ComboItem[] = form.items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        qty: it.qty
      }))

      if (editId.value) {
        await updateProduct(editId.value, {
          name: form.name,
          description,
          images: [],
          price: form.price,
          stockQty: form.stockQty,
          isCombo: 1,
          hasSku: 0,
          comboItems
        } as Partial<ProductCreateParams>)
      } else {
        /* 新建套餐：复用第一个子商品的分类作为默认套餐分类（避免后端 categoryId 必填校验失败）
         * TODO P10：后端 categoryService 支持「套餐」专属分类后切换 */
        const firstItemProduct = candidateProducts.value.find(
          (p) => p.id === form.items[0]?.productId
        )
        const params: ProductCreateParams = {
          shopId: shopStore.currentShopId,
          categoryId: firstItemProduct?.categoryId ?? '',
          name: form.name,
          description,
          images: [],
          price: form.price,
          hasSku: 0,
          isCombo: 1,
          stockQty: form.stockQty,
          comboItems
        }
        await createProduct(params)
      }
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('combo.save.fail', { e: String(e) })
      uni.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-combo {
    min-height: 100vh;
    padding-bottom: 200rpx;
    background: $uni-bg-color-grey;
  }

  .form-section {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;

    &__title {
      display: block;
      margin-bottom: 16rpx;
      font-size: 28rpx;
      font-weight: 500;
      color: $uni-text-color;
    }
  }

  .form-field {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  .form-label {
    margin-right: 16rpx;
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .form-input {
    flex: 1;
    padding: 8rpx 16rpx;
    font-size: 26rpx;
    color: $uni-text-color;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &--small {
      flex: 0 0 200rpx;
    }

    &--picker {
      flex: 1;
      min-height: 48rpx;
    }
  }

  .form-textarea {
    width: 100%;
    min-height: 120rpx;
    padding: 16rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
    box-sizing: border-box;
  }

  .form-actions {
    padding: 24rpx;
  }

  .row-between {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .combo {
    &__add {
      font-size: 24rpx;
      color: $uni-color-primary;
    }

    &__item {
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 16rpx 0;
      border-bottom: 1rpx solid $uni-border-color;

      &-picker {
        flex: 1;
        min-width: 0;
      }

      &-qty {
        flex: 0 0 140rpx;
      }

      &-remove {
        flex-shrink: 0;
        font-size: 36rpx;
        color: $uni-color-error;
      }
    }

    &__period {
      padding-top: 16rpx;
    }

    &__period-row {
      display: flex;
      gap: 16rpx;
      align-items: center;
    }

    &__period-sep {
      color: $uni-text-color-grey;
    }
  }
</style>
