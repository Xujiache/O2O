<template>
  <view class="page addr-list">
    <BizLoading v-if="loading && list.length === 0" />
    <BizEmpty
      v-else-if="!loading && list.length === 0"
      text="还没有收货地址"
      action-text="新增地址"
      @action="goAdd"
    />

    <scroll-view v-else scroll-y class="addr-list__scroll">
      <view v-for="item in list" :key="item.id" class="addr-list__item" @tap="onPick(item)">
        <view class="addr-list__content">
          <view class="addr-list__row">
            <text class="addr-list__name">{{ item.name }}</text>
            <text class="addr-list__mobile">{{ maskMobile(item.mobile) }}</text>
            <view v-if="item.isDefault" class="addr-list__tag addr-list__tag--default">
              <text>默认</text>
            </view>
            <view v-if="item.tag" class="addr-list__tag">
              <text>{{ item.tag }}</text>
            </view>
          </view>
          <view class="addr-list__detail">
            <text>{{ item.province }}{{ item.city }}{{ item.district }}{{ item.detail }}</text>
          </view>
        </view>

        <view class="addr-list__actions">
          <view v-if="!item.isDefault" class="addr-list__btn" @tap.stop="onSetDefault(item)">
            <text>设默认</text>
          </view>
          <view class="addr-list__btn" @tap.stop="onEdit(item)">
            <text>编辑</text>
          </view>
          <view class="addr-list__btn addr-list__btn--danger" @tap.stop="onAskDelete(item)">
            <text>删除</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="addr-list__footer safe-bottom">
      <button class="addr-list__add" @tap="goAdd">+ 新增地址</button>
    </view>

    <BizDialog
      v-model:visible="confirmDel"
      title="删除地址"
      :content="`确定要删除「${pendingDel?.name ?? ''}」的地址吗？`"
      confirm-text="删除"
      @confirm="onDoDelete"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/address-list.vue
   * @stage P5/T5.34 (Sprint 6)
   * @desc 收货地址列表：CRUD + 设默认；支持 eventChannel 回传选中地址
   * @author 单 Agent V2.0
   */
  import { ref } from 'vue'
  import { onShow, onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import { listAddresses, deleteAddress, setDefaultAddress } from '@/api/user'
  import type { UserAddress } from '@/types/biz'
  import { maskMobile } from '@/utils/format'
  import { logger } from '@/utils/logger'

  interface PageEventChannel {
    emit(eventName: string, payload: unknown): void
  }
  interface PageInstanceWithChannel {
    getOpenerEventChannel?: () => PageEventChannel
  }

  const list = ref<UserAddress[]>([])
  const loading = ref<boolean>(false)
  const confirmDel = ref<boolean>(false)
  const pendingDel = ref<UserAddress | null>(null)
  /** 当为 true 时点击列表项回传给上一页（如 checkout） */
  const pickMode = ref<boolean>(false)

  onLoad((options) => {
    if (options?.from === 'checkout' || options?.pick === '1') {
      pickMode.value = true
    }
  })

  onShow(() => {
    void load()
  })

  async function load() {
    loading.value = true
    try {
      list.value = await listAddresses()
    } catch (e) {
      logger.warn('addr.list.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onPick(item: UserAddress) {
    if (!pickMode.value) return
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1] as unknown as PageInstanceWithChannel
    const channel = cur.getOpenerEventChannel?.()
    channel?.emit('selectAddress', item)
    uni.navigateBack()
  }

  function onEdit(item: UserAddress) {
    uni.navigateTo({ url: `/pages-user/address-edit?id=${item.id}` })
  }

  function goAdd() {
    uni.navigateTo({ url: '/pages-user/address-edit' })
  }

  async function onSetDefault(item: UserAddress) {
    try {
      await setDefaultAddress(item.id)
      list.value = list.value.map((x) => ({ ...x, isDefault: x.id === item.id ? 1 : 0 }))
      uni.showToast({ title: '已设为默认', icon: 'success' })
    } catch (e) {
      logger.warn('addr.setDefault.fail', { e: String(e) })
    }
  }

  function onAskDelete(item: UserAddress) {
    pendingDel.value = item
    confirmDel.value = true
  }

  async function onDoDelete() {
    if (!pendingDel.value) return
    const id = pendingDel.value.id
    try {
      await deleteAddress(id)
      list.value = list.value.filter((x) => x.id !== id)
      uni.showToast({ title: '已删除', icon: 'success' })
    } catch (e) {
      logger.warn('addr.del.fail', { e: String(e) })
    } finally {
      pendingDel.value = null
    }
  }
</script>

<style lang="scss" scoped>
  .addr-list {
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

    &__content {
      padding-bottom: 16rpx;
      border-bottom: 1rpx solid $color-divider;
    }

    &__row {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
      align-items: center;
    }

    &__name {
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__mobile {
      font-size: $font-size-base;
      color: $color-text-secondary;
    }

    &__tag {
      padding: 2rpx 12rpx;
      font-size: $font-size-xs;
      color: $color-info;
      background: $color-divider;
      border-radius: $radius-xs;

      &--default {
        color: $color-text-inverse;
        background: $color-primary;
      }
    }

    &__detail {
      margin-top: 12rpx;
      font-size: $font-size-base;
      line-height: 1.5;
      color: $color-text-regular;
    }

    &__actions {
      display: flex;
      gap: 16rpx;
      justify-content: flex-end;
      padding-top: 16rpx;
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
  }
</style>
