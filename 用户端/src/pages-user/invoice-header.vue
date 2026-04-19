<template>
  <view class="page invoice-header">
    <BizLoading v-if="loading && list.length === 0" />
    <BizEmpty
      v-else-if="!loading && list.length === 0"
      text="还没有发票抬头"
      action-text="新增抬头"
      @action="onAdd"
    />
    <scroll-view v-else scroll-y class="invoice-header__scroll">
      <view v-for="h in list" :key="h.id" class="invoice-header__item">
        <view class="invoice-header__row">
          <text class="invoice-header__title">{{ h.title }}</text>
          <view v-if="h.isDefault" class="invoice-header__default-tag">
            <text>默认</text>
          </view>
          <text class="invoice-header__type">{{ h.titleType === 2 ? '单位' : '个人' }}</text>
        </view>
        <view v-if="h.taxNo" class="invoice-header__meta">
          <text>税号：{{ h.taxNo }}</text>
        </view>
        <view v-if="h.email" class="invoice-header__meta">
          <text>邮箱：{{ h.email }}</text>
        </view>
        <view class="invoice-header__actions">
          <view class="invoice-header__btn" @tap="onEdit(h)">
            <text>编辑</text>
          </view>
          <view class="invoice-header__btn invoice-header__btn--danger" @tap="onAskDelete(h)">
            <text>删除</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="invoice-header__footer safe-bottom">
      <button class="invoice-header__add" @tap="onAdd">+ 新增抬头</button>
    </view>

    <BizDialog
      v-model:visible="formDialog"
      :title="editingId ? '编辑抬头' : '新增抬头'"
      :show-cancel="true"
      confirm-text="保存"
      @confirm="onSubmit"
    >
      <view class="invoice-header__form">
        <picker
          mode="selector"
          :range="typeRange"
          :value="form.titleType - 1"
          @change="onTypeChange"
        >
          <view class="invoice-header__form-row">
            <text class="invoice-header__form-label">类型</text>
            <text class="invoice-header__form-val">{{ typeRange[form.titleType - 1] }}</text>
          </view>
        </picker>
        <view class="invoice-header__form-row">
          <text class="invoice-header__form-label">名称</text>
          <input
            v-model="form.title"
            class="invoice-header__form-input"
            :placeholder="form.titleType === 2 ? '请输入单位全称' : '请输入个人姓名'"
            maxlength="50"
          />
        </view>
        <view v-if="form.titleType === 2" class="invoice-header__form-row">
          <text class="invoice-header__form-label">税号</text>
          <input
            v-model="form.taxNo"
            class="invoice-header__form-input"
            placeholder="请输入纳税人识别号"
            maxlength="30"
          />
        </view>
        <view class="invoice-header__form-row">
          <text class="invoice-header__form-label">邮箱</text>
          <input
            v-model="form.email"
            class="invoice-header__form-input"
            placeholder="接收发票的邮箱"
            maxlength="60"
          />
        </view>
        <view class="invoice-header__form-row">
          <text class="invoice-header__form-label">默认</text>
          <switch :checked="form.isDefault === 1" color="#ff6a1a" @change="onDefaultChange" />
        </view>
      </view>
    </BizDialog>

    <BizDialog
      v-model:visible="confirmDel"
      title="删除抬头"
      :content="`确定要删除「${pendingDel?.title ?? ''}」吗？`"
      confirm-text="删除"
      @confirm="onDoDelete"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/invoice-header.vue
   * @stage P5/T5.38 (Sprint 6)
   * @desc 发票抬头管理：列表 + BizDialog 表单（个人 / 单位）+ CRUD
   * @author 单 Agent V2.0
   */
  import { ref, reactive } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import {
    listInvoiceHeaders,
    createInvoiceHeader,
    updateInvoiceHeader,
    deleteInvoiceHeader
  } from '@/api/invoice'
  import type { InvoiceHeader } from '@/types/biz'
  import { logger } from '@/utils/logger'

  const typeRange = ['个人', '单位']

  const list = ref<InvoiceHeader[]>([])
  const loading = ref<boolean>(false)
  const formDialog = ref<boolean>(false)
  const editingId = ref<string>('')

  const form = reactive<{
    titleType: 1 | 2
    title: string
    taxNo: string
    email: string
    isDefault: 0 | 1
  }>({
    titleType: 1,
    title: '',
    taxNo: '',
    email: '',
    isDefault: 0
  })

  const confirmDel = ref<boolean>(false)
  const pendingDel = ref<InvoiceHeader | null>(null)

  onShow(() => {
    void load()
  })

  async function load() {
    loading.value = true
    try {
      list.value = await listInvoiceHeaders()
    } catch (e) {
      logger.warn('header.list.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function resetForm() {
    editingId.value = ''
    form.titleType = 1
    form.title = ''
    form.taxNo = ''
    form.email = ''
    form.isDefault = 0
  }

  function onAdd() {
    resetForm()
    formDialog.value = true
  }

  function onEdit(h: InvoiceHeader) {
    editingId.value = h.id
    form.titleType = h.titleType
    form.title = h.title
    form.taxNo = h.taxNo ?? ''
    form.email = h.email ?? ''
    form.isDefault = h.isDefault
    formDialog.value = true
  }

  function onTypeChange(e: { detail: { value: string | number } }) {
    const idx = Number(e.detail.value)
    form.titleType = idx === 0 ? 1 : 2
    if (form.titleType === 1) form.taxNo = ''
  }

  function onDefaultChange(e: { detail: { value: boolean } }) {
    form.isDefault = e.detail.value ? 1 : 0
  }

  async function onSubmit() {
    if (!form.title.trim()) {
      uni.showToast({ title: '请输入抬头名称', icon: 'none' })
      return
    }
    if (form.titleType === 2 && !form.taxNo.trim()) {
      uni.showToast({ title: '请输入税号', icon: 'none' })
      return
    }
    if (form.email && !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(form.email)) {
      uni.showToast({ title: '邮箱格式不正确', icon: 'none' })
      return
    }
    const payload: Omit<InvoiceHeader, 'id'> = {
      titleType: form.titleType,
      title: form.title.trim(),
      taxNo: form.taxNo.trim() || undefined,
      email: form.email.trim() || undefined,
      isDefault: form.isDefault
    }
    try {
      if (editingId.value) {
        await updateInvoiceHeader(editingId.value, payload)
      } else {
        await createInvoiceHeader(payload)
      }
      uni.showToast({ title: '保存成功', icon: 'success' })
      void load()
    } catch (e) {
      logger.warn('header.save.fail', { e: String(e) })
    }
  }

  function onAskDelete(h: InvoiceHeader) {
    pendingDel.value = h
    confirmDel.value = true
  }

  async function onDoDelete() {
    if (!pendingDel.value) return
    const id = pendingDel.value.id
    try {
      await deleteInvoiceHeader(id)
      list.value = list.value.filter((x) => x.id !== id)
      uni.showToast({ title: '已删除', icon: 'success' })
    } catch (e) {
      logger.warn('header.del.fail', { e: String(e) })
    } finally {
      pendingDel.value = null
    }
  }
</script>

<style lang="scss" scoped>
  .invoice-header {
    display: flex;
    flex-direction: column;
    height: 100vh;

    &__scroll {
      flex: 1;
      padding: 16rpx;
    }

    &__item {
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__row {
      display: flex;
      align-items: center;
      margin-bottom: 12rpx;
    }

    &__title {
      flex: 1;
      overflow: hidden;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__default-tag {
      flex-shrink: 0;
      padding: 2rpx 12rpx;
      margin-right: 12rpx;
      font-size: $font-size-xs;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-xs;
    }

    &__type {
      flex-shrink: 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__meta {
      margin-bottom: 8rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__actions {
      display: flex;
      gap: 16rpx;
      justify-content: flex-end;
      padding-top: 16rpx;
      border-top: 1rpx solid $color-divider;
    }

    &__btn {
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      background: $color-bg-page;
      border-radius: $radius-sm;

      &--danger {
        color: $color-danger;
        background: rgba(245, 108, 108, 0.08);
      }
    }

    &__footer {
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__add {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      line-height: 88rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;
    }

    &__form {
      padding: 0 0 16rpx;
    }

    &__form-row {
      @include flex-between;

      padding: 16rpx 0;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }
    }

    &__form-label {
      width: 120rpx;
      font-size: $font-size-base;
      color: $color-text-regular;
      text-align: left;
    }

    &__form-input {
      flex: 1;
      height: 48rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      text-align: right;
    }

    &__form-val {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-primary;
      text-align: right;
    }
  }
</style>
