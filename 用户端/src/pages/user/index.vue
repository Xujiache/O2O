<template>
  <view class="page user-home">
    <view class="user-home__header">
      <view class="user-home__profile" @tap="onProfile">
        <image
          class="user-home__avatar"
          :src="profile?.avatar || 'https://cdn.uviewui.com/uview/album/1.jpg'"
          mode="aspectFill"
        />
        <view class="user-home__name-wrap">
          <text class="user-home__name">{{ profile?.nickname || '点击登录' }}</text>
          <text v-if="profile?.mobile" class="user-home__mobile">{{
            maskMobile(profile.mobile)
          }}</text>
          <text v-if="profile" class="user-home__realname">
            {{ profile.isRealname ? '已实名' : '未实名' }}
          </text>
        </view>
        <text class="user-home__arrow">›</text>
      </view>

      <view class="user-home__assets">
        <view class="user-home__asset" @tap="goAsset('wallet')">
          <text class="user-home__asset-num">{{ wallet ?? '-' }}</text>
          <text class="user-home__asset-label">钱包</text>
        </view>
        <view class="user-home__asset" @tap="goAsset('coupons')">
          <text class="user-home__asset-num">{{ coupons }}</text>
          <text class="user-home__asset-label">优惠券</text>
        </view>
        <view class="user-home__asset" @tap="goAsset('points')">
          <text class="user-home__asset-num">{{ points }}</text>
          <text class="user-home__asset-label">积分</text>
        </view>
        <view class="user-home__asset" @tap="goAsset('invite')">
          <text class="user-home__asset-num">邀请</text>
          <text class="user-home__asset-label">有礼</text>
        </view>
      </view>
    </view>

    <view class="user-home__group">
      <view class="user-home__group-title">订单</view>
      <view class="user-home__grid">
        <view
          v-for="o in orderEntries"
          :key="o.code"
          class="user-home__grid-item"
          @tap="goOrder(o.code)"
        >
          <text class="user-home__grid-icon">{{ o.icon }}</text>
          <text class="user-home__grid-label">{{ o.name }}</text>
        </view>
      </view>
    </view>

    <view class="user-home__group">
      <view class="user-home__group-title">服务</view>
      <view class="user-home__grid">
        <view v-for="m in menus" :key="m.path" class="user-home__grid-item" @tap="goMenu(m.path)">
          <text class="user-home__grid-icon">{{ m.icon }}</text>
          <text class="user-home__grid-label">{{ m.name }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/user/index.vue
   * @stage P5/T5.32 (Sprint 6)
   * @desc 个人中心首页：头像 / 资产 / 订单入口 / 功能九宫格
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { useUserStore } from '@/store/user'
  import { useMsgStore } from '@/store/msg'
  import { maskMobile, formatAmount } from '@/utils/format'
  import { getWallet } from '@/api/wallet'
  import { listMyCoupons } from '@/api/coupon'
  import { getPoints } from '@/api/user'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const user = useUserStore()
  const profile = computed(() => user.profile)
  const wallet = ref<string | null>(null)
  const coupons = ref<number>(0)
  const points = ref<number>(0)

  const orderEntries = [
    { code: 'pending_pay', name: '待支付', icon: '💰' },
    { code: 'pending_accept', name: '待接单', icon: '⏳' },
    { code: 'in_delivery', name: '配送中', icon: '🛵' },
    { code: 'review', name: '待评价', icon: '⭐' },
    { code: 'after_sale', name: '退款/售后', icon: '↩️' }
  ] as const

  const menus = [
    { name: '收货地址', icon: '📍', path: '/pages-user/address-list' },
    { name: '我的钱包', icon: '💳', path: '/pages-user/wallet' },
    { name: '优惠券', icon: '🎟️', path: '/pages-user/coupons' },
    { name: '积分', icon: '🏆', path: '/pages-user/points' },
    { name: '邀请有礼', icon: '🎁', path: '/pages-user/invite' },
    { name: '我的收藏', icon: '❤️', path: '/pages-user/favorites' },
    { name: '我的发票', icon: '📑', path: '/pages-user/invoice-list' },
    { name: '实名认证', icon: '🆔', path: '/pages-user/realname' },
    { name: '在线客服', icon: '💬', path: '/pages-user/cs' },
    { name: '常见问题', icon: '❓', path: '/pages-user/faq' },
    { name: '意见反馈', icon: '✉️', path: '/pages-user/feedback' },
    { name: '设置', icon: '⚙️', path: '/pages-user/settings' }
  ]

  onShow(() => {
    track(TRACK.VIEW_USER_HOME)
    void loadAssets()
  })

  async function loadAssets() {
    if (!user.isLogin) return
    try {
      const [w, c, p] = await Promise.all([
        getWallet().catch(() => null),
        listMyCoupons({ status: 1 }).catch(() => null),
        getPoints().catch(() => null)
      ])
      if (w) wallet.value = formatAmount(w.balance, '¥')
      if (c) coupons.value = c.meta.total
      if (p) points.value = p.available
      const msg = useMsgStore()
      void msg
    } catch (e) {
      logger.warn('user.home.loadAssets.fail', { e: String(e) })
    }
  }

  function onProfile() {
    if (!user.isLogin) {
      uni.navigateTo({ url: '/pages/login/index' })
      return
    }
    uni.navigateTo({ url: '/pages-user/profile' })
  }

  function goAsset(code: string) {
    if (!user.isLogin) {
      uni.navigateTo({ url: '/pages/login/index' })
      return
    }
    uni.navigateTo({ url: `/pages-user/${code}` })
  }

  function goMenu(path: string) {
    if (!user.isLogin) {
      uni.navigateTo({ url: '/pages/login/index' })
      return
    }
    uni.navigateTo({ url: path })
  }

  function goOrder(code: string) {
    if (!user.isLogin) {
      uni.navigateTo({ url: '/pages/login/index' })
      return
    }
    if (code === 'after_sale') {
      uni.switchTab({ url: '/pages/order/index' })
      return
    }
    uni.switchTab({ url: '/pages/order/index' })
  }
</script>

<style lang="scss" scoped>
  .user-home {
    min-height: 100vh;
    padding-bottom: 32rpx;

    &__header {
      padding: 64rpx 32rpx 32rpx;
      background: linear-gradient(135deg, #ff6a1a 0%, #ff8e53 100%);
    }

    &__profile {
      display: flex;
      gap: 24rpx;
      align-items: center;
    }

    &__avatar {
      width: 120rpx;
      height: 120rpx;
      border: 4rpx solid #fff;
      border-radius: 50%;
    }

    &__name-wrap {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 36rpx;
      font-weight: 600;
      color: #fff;
    }

    &__mobile {
      display: block;
      margin-top: 8rpx;
      font-size: 24rpx;
      color: rgba(255, 255, 255, 0.8);
    }

    &__realname {
      display: inline-block;
      padding: 4rpx 12rpx;
      margin-top: 8rpx;
      font-size: 20rpx;
      color: #fff;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 8rpx;
    }

    &__arrow {
      font-size: 40rpx;
      color: rgba(255, 255, 255, 0.7);
    }

    &__assets {
      display: flex;
      padding: 32rpx 16rpx;
      margin-top: 24rpx;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 16rpx;
    }

    &__asset {
      flex: 1;
      text-align: center;
    }

    &__asset-num {
      display: block;
      font-size: 32rpx;
      font-weight: 600;
      color: #fff;
    }

    &__asset-label {
      display: block;
      margin-top: 8rpx;
      font-size: 22rpx;
      color: rgba(255, 255, 255, 0.85);
    }

    &__group {
      padding: 16rpx;
      margin: 16rpx;
      background: #fff;
      border-radius: 16rpx;
    }

    &__group-title {
      padding: 16rpx;
      font-size: 28rpx;
      font-weight: 500;
      color: #333;
    }

    &__grid {
      display: flex;
      flex-wrap: wrap;
    }

    &__grid-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 25%;
      padding: 24rpx 0;
    }

    &__grid-icon {
      font-size: 48rpx;
    }

    &__grid-label {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: #666;
    }
  }
</style>
