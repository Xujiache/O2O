<template>
  <view class="page page-cat">
    <view class="cat-tip">长按拖拽调整顺序，左滑删除</view>

    <view class="cat-list">
      <view v-for="(c, idx) in categories" :key="c.id" class="cat-item">
        <text class="cat-item__num">{{ idx + 1 }}</text>
        <input v-model="c.name" class="cat-item__input" maxlength="20" />
        <view class="cat-item__actions">
          <text class="cat-item__btn" @click="moveUp(idx)" v-if="idx > 0">↑</text>
          <text class="cat-item__btn" @click="moveDown(idx)" v-if="idx < categories.length - 1"
            >↓</text
          >
          <text class="cat-item__btn cat-item__btn--del" @click="onDelete(c, idx)">删</text>
        </view>
      </view>
    </view>

    <view class="cat-actions">
      <BizBtn type="default" block text="新增分类" @click="onAddCategory" />
      <BizBtn type="primary" block :disabled="submitting" @click="onSave">
        {{ submitting ? '保存中...' : '保存排序' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import type { ProductCategory } from '@/types/biz'
  import {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories
  } from '@/api/product'
  import { mockEnabled, mockCategories, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'

  /**
   * 商品分类管理（T6.25）
   *
   * 简化拖拽排序：用 ↑↓ 按钮代替手势拖拽（uni-app 跨端拖拽兼容差，S5 可升级）
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()
  const categories = ref<ProductCategory[]>([])
  const submitting = ref<boolean>(false)

  onMounted(async () => {
    if (!shopStore.currentShopId) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    await load()
  })

  async function load() {
    try {
      categories.value = mockEnabled()
        ? await delay([...mockCategories])
        : await listCategories(shopStore.currentShopId)
    } catch (e) {
      logger.warn('cat.load.fail', { e: String(e) })
    }
  }

  function moveUp(idx: number) {
    if (idx <= 0) return
    const tmp = categories.value[idx]
    categories.value[idx] = categories.value[idx - 1]
    categories.value[idx - 1] = tmp
  }

  function moveDown(idx: number) {
    if (idx >= categories.value.length - 1) return
    const tmp = categories.value[idx]
    categories.value[idx] = categories.value[idx + 1]
    categories.value[idx + 1] = tmp
  }

  function onAddCategory() {
    uni.showModal({
      title: '新增分类',
      editable: true,
      placeholderText: '请输入分类名',
      success: async (res) => {
        if (!res.confirm || !res.content?.trim()) return
        try {
          if (mockEnabled()) {
            categories.value.push({
              id: 'cat-' + Date.now(),
              shopId: shopStore.currentShopId,
              name: res.content.trim(),
              sortOrder: categories.value.length + 1,
              productCount: 0,
              createdAt: new Date().toISOString()
            })
          } else {
            const c = await createCategory(shopStore.currentShopId, { name: res.content.trim() })
            categories.value.push(c)
          }
          uni.showToast({ title: '已新增', icon: 'success' })
        } catch (e) {
          logger.warn('cat.create.fail', { e: String(e) })
        }
      }
    })
  }

  function onDelete(c: ProductCategory, idx: number) {
    if ((c.productCount ?? 0) > 0) {
      uni.showToast({ title: '该分类下有商品，不可删除', icon: 'none' })
      return
    }
    uni.showModal({
      title: '删除分类',
      content: `确认删除「${c.name}」？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (!mockEnabled()) await deleteCategory(c.id)
          categories.value.splice(idx, 1)
          uni.showToast({ title: '已删除', icon: 'success' })
        } catch (e) {
          logger.warn('cat.del.fail', { e: String(e) })
        }
      }
    })
  }

  async function onSave() {
    submitting.value = true
    try {
      const list = categories.value.map((c, idx) => ({ id: c.id, sortOrder: idx + 1 }))
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        /* 排序持久化 */
        await reorderCategories(shopStore.currentShopId, list)
        /* 名称变更持久化（逐项 update） */
        for (const c of categories.value) {
          await updateCategory(c.id, { name: c.name })
        }
      }
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('cat.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-cat {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .cat-tip {
    padding: 16rpx;
    margin-bottom: 16rpx;
    font-size: 22rpx;
    color: $uni-color-primary;
    background: $uni-color-primary-light;
    border-radius: $uni-border-radius-base;
  }

  .cat-list {
    background: #fff;
    border-radius: 16rpx;
  }

  .cat-item {
    display: flex;
    align-items: center;
    padding: 24rpx;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }

    &__num {
      width: 48rpx;
      margin-right: 16rpx;
      font-size: 24rpx;
      color: $uni-color-primary;
      text-align: center;
    }

    &__input {
      flex: 1;
      height: 64rpx;
      padding: 0 16rpx;
      font-size: 26rpx;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }

    &__actions {
      display: flex;
      gap: 12rpx;
      margin-left: 16rpx;
    }

    &__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56rpx;
      height: 56rpx;
      font-size: 24rpx;
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-radius: 8rpx;

      &--del {
        color: $uni-color-error;
        background: rgb(255 77 79 / 12%);
      }
    }
  }

  .cat-actions {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 24rpx 0;
  }
</style>
