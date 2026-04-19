<template>
  <view>
    <!-- 触发按钮 -->
    <view class="ss-trigger" @click="visible = true">
      <text class="ss-trigger__name">{{ shopStore.currentShop?.name || '请选择店铺' }}</text>
      <text class="ss-trigger__arrow">▼</text>
    </view>

    <!-- 弹层 -->
    <view v-if="visible" class="ss-mask" @click.self="visible = false">
      <view class="ss-panel">
        <view class="ss-header">
          <text class="ss-title">切换店铺</text>
          <text class="ss-close" @click="visible = false">×</text>
        </view>
        <scroll-view scroll-y class="ss-list">
          <view
            v-for="s in shopStore.shopList"
            :key="s.id"
            class="ss-item"
            :class="{ 'ss-item--active': s.id === shopStore.currentShopId }"
            @click="onSwitch(s.id)"
          >
            <view class="col">
              <text class="ss-item__name">{{ s.name }}</text>
              <view class="row">
                <text
                  class="ss-item__status"
                  :class="s.isOpen === 1 ? 'ss-item__status--open' : 'ss-item__status--close'"
                >
                  {{ s.isOpen === 1 ? '营业中' : '已歇业' }}
                </text>
                <text class="ss-item__sales">月售 {{ s.monthSales }}</text>
              </view>
            </view>
            <text v-if="s.id === shopStore.currentShopId" class="ss-item__check">✓</text>
          </view>

          <view v-if="!shopStore.shopList.length" class="ss-empty">
            <text>暂无店铺，请前往「商户入驻」申请</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useShopStore } from '@/store'

  /**
   * 店铺切换器（用于工作台顶部 / 订单 Tab 顶部）
   * @author 单 Agent V2.0 (P6 商户端 / T6.10)
   */
  const shopStore = useShopStore()
  const visible = ref<boolean>(false)

  function onSwitch(shopId: string) {
    if (shopId !== shopStore.currentShopId) {
      shopStore.switchShop(shopId)
      uni.showToast({ title: '已切换店铺', icon: 'success' })
    }
    visible.value = false
  }
</script>

<style lang="scss" scoped>
  .ss-trigger {
    display: inline-flex;
    align-items: center;
    padding: 6rpx 16rpx;
    background: rgb(255 255 255 / 22%);
    border-radius: 999rpx;

    &__name {
      max-width: 360rpx;
      overflow: hidden;
      font-size: 26rpx;
      color: #fff;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__arrow {
      margin-left: 8rpx;
      font-size: 18rpx;
      color: #fff;
    }
  }

  .ss-mask {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: $uni-bg-color-mask;
  }

  .ss-panel {
    width: 100%;
    max-height: 70vh;
    overflow: hidden;
    background: #fff;
    border-radius: 24rpx 24rpx 0 0;
  }

  .ss-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 32rpx;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .ss-title {
    font-size: 30rpx;
    font-weight: 600;
  }

  .ss-close {
    font-size: 48rpx;
    line-height: 1;
    color: $uni-text-color-grey;
  }

  .ss-list {
    max-height: 60vh;
  }

  .ss-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 32rpx;
    border-bottom: 1rpx solid $uni-border-color;

    &--active {
      background: $uni-color-primary-light;
    }

    &__name {
      font-size: 28rpx;
      font-weight: 500;
      color: $uni-text-color;
    }

    &__status {
      padding: 2rpx 12rpx;
      margin-top: 4rpx;
      margin-right: 16rpx;
      font-size: 20rpx;
      border-radius: 999rpx;

      &--open {
        color: $uni-color-success;
        background: rgb(82 196 26 / 12%);
      }

      &--close {
        color: $uni-text-color-grey;
        background: $uni-bg-color-grey;
      }
    }

    &__sales {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__check {
      font-size: 36rpx;
      color: $uni-color-primary;
    }
  }

  .ss-empty {
    padding: 80rpx 32rpx;
    font-size: 26rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }
</style>
