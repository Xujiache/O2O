<template>
  <view class="page page-sl">
    <scroll-view scroll-y class="sl-list" @scrolltolower="loadMore">
      <view v-for="s in staff" :key="s.id" class="sl-item" @click="goEdit(s.id)">
        <view class="sl-avatar">{{ s.realName.charAt(0) }}</view>
        <view class="sl-info">
          <view class="row">
            <text class="sl-info__name">{{ s.realName }}</text>
            <text class="sl-info__role" :class="`sl-info__role--${s.role}`">{{
              roleText(s.role)
            }}</text>
          </view>
          <text class="sl-info__mobile">{{ s.mobile }}</text>
          <text class="sl-info__shops">{{ s.shopNames?.join('、') ?? '' }}</text>
        </view>
        <view class="sl-status" :class="{ 'sl-status--off': s.status === 0 }">
          {{ s.status === 1 ? '启用中' : '已禁用' }}
        </view>
      </view>
      <BizEmpty v-if="!loading && staff.length === 0" title="暂无子账号">
        <template #action>
          <BizBtn type="primary" text="添加子账号" perm="staff:edit" @click="goCreate" />
        </template>
      </BizEmpty>
      <BizLoading v-if="loading" />
    </scroll-view>

    <view v-if="staff.length > 0" class="sl-fab" @click="goCreate">+</view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import type { SubAccount } from '@/types/biz'
  import { listStaff } from '@/api/staff'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'

  /**
   * 子账号列表（T6.37）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const staff = ref<SubAccount[]>([])
  const page = ref<number>(1)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  function roleText(r: string): string {
    return r === 'manager' ? '店长' : r === 'cashier' ? '收银' : '店员'
  }

  onMounted(() => {
    void refresh()
  })

  onShow(() => {
    void refresh()
  })

  async function refresh() {
    page.value = 1
    hasMore.value = true
    staff.value = []
    await loadMore()
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      if (mockEnabled()) {
        staff.value = await delay([
          {
            id: 'sa-1',
            username: 'cashier01',
            realName: '王收银',
            mobile: '13900139001',
            role: 'cashier',
            shopIds: ['sp-1001'],
            shopNames: ['示例外卖店（南京路店）'],
            status: 1,
            createdAt: '2026-04-01T10:00:00.000Z'
          }
        ] as SubAccount[])
        hasMore.value = false
      } else {
        const r = await listStaff({ page: page.value, pageSize: 20 })
        staff.value.push(...r.list)
        hasMore.value = page.value * 20 < r.meta.total
        page.value += 1
      }
    } catch (e) {
      logger.warn('sl.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function goCreate() {
    uni.navigateTo({ url: '/pages-setting/staff-edit' })
  }
  function goEdit(id: string) {
    uni.navigateTo({ url: `/pages-setting/staff-edit?id=${id}` })
  }
</script>

<style lang="scss" scoped>
  .page-sl {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .sl-list {
    flex: 1;
    padding: 16rpx;
  }

  .sl-item {
    display: flex;
    align-items: center;
    padding: 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-radius: 12rpx;
  }

  .sl-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80rpx;
    height: 80rpx;
    margin-right: 16rpx;
    font-size: 32rpx;
    color: #fff;
    background: $uni-color-primary;
    border-radius: 50%;
  }

  .sl-info {
    flex: 1;

    &__name {
      margin-right: 16rpx;
      font-size: 28rpx;
      font-weight: 500;
    }

    &__role {
      padding: 2rpx 12rpx;
      font-size: 20rpx;
      border-radius: 999rpx;

      &--manager {
        color: #fff;
        background: $uni-color-primary;
      }

      &--cashier {
        color: $uni-color-warning;
        background: rgb(250 140 22 / 12%);
      }

      &--staff {
        color: $uni-text-color-grey;
        background: $uni-bg-color-grey;
      }
    }

    &__mobile {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__shops {
      display: block;
      font-size: 20rpx;
      color: $uni-text-color-placeholder;
    }
  }

  .sl-status {
    padding: 4rpx 12rpx;
    font-size: 20rpx;
    color: $uni-color-success;
    background: rgb(82 196 26 / 12%);
    border-radius: 999rpx;

    &--off {
      color: $uni-color-error;
      background: rgb(255 77 79 / 12%);
    }
  }

  .sl-fab {
    position: fixed;
    right: 32rpx;
    bottom: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 96rpx;
    height: 96rpx;
    font-size: 48rpx;
    color: #fff;
    background: $uni-color-primary;
    border-radius: 50%;
    box-shadow: 0 4rpx 16rpx rgb(47 128 237 / 30%);
  }
</style>
