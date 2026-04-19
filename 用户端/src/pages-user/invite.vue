<template>
  <view class="page invite">
    <BizLoading v-if="loading && !info" />
    <template v-else-if="info">
      <view class="invite__poster">
        <text class="invite__poster-title">邀请好友 双方有礼</text>
        <text class="invite__poster-sub">好友首单完成立返奖励到账户</text>

        <view class="invite__code-block">
          <text class="invite__code-label">我的邀请码</text>
          <text class="invite__code">{{ info.inviteCode }}</text>
          <view class="invite__copy" @tap="onCopy">
            <text>复制</text>
          </view>
        </view>

        <view class="invite__qr">
          <view class="invite__qr-placeholder">
            <text class="invite__qr-text">分享二维码</text>
            <text class="invite__qr-tip">扫码下载 / 注册</text>
          </view>
        </view>
      </view>

      <view class="invite__stats card">
        <view class="invite__stats-item">
          <text class="invite__stats-num">{{ formatNumber(info.totalInvited) }}</text>
          <text class="invite__stats-label">累计邀请</text>
        </view>
        <view class="invite__stats-divider" />
        <view class="invite__stats-item">
          <text class="invite__stats-num">{{ formatAmount(info.totalReward, '') }}</text>
          <text class="invite__stats-label">累计奖励 (元)</text>
        </view>
      </view>

      <view class="invite__sec-title">邀请记录</view>
      <view v-if="info.recentList.length === 0" class="invite__empty">
        <text>还没有邀请记录，赶紧分享给好友吧</text>
      </view>
      <view v-else class="invite__records card">
        <view v-for="(r, i) in info.recentList" :key="i" class="invite__record">
          <image class="invite__record-avatar" :src="r.avatar || defaultAvatar" mode="aspectFill" />
          <view class="invite__record-mid">
            <text class="invite__record-name">{{ r.nickname }}</text>
            <text class="invite__record-time">{{ formatTime(r.createdAt) }}</text>
          </view>
          <text class="invite__record-reward">+{{ formatAmount(r.rewardAmount, '¥') }}</text>
        </view>
      </view>
    </template>

    <view class="invite__footer safe-bottom">
      <button class="invite__share" open-type="share" @tap="onShare"> 立即分享 </button>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/invite.vue
   * @stage P5/T5.36 (Sprint 6)
   * @desc 邀请有礼：海报 + 邀请码复制 + 战绩 + 邀请记录 + 立即分享（mp 仅）
   * @author 单 Agent V2.0
   */
  import { ref } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import { getInviteInfo } from '@/api/user'
  import { formatAmount, formatTime, formatNumber } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  interface InviteInfo {
    inviteCode: string
    inviteUrl: string
    totalInvited: number
    totalReward: string
    recentList: Array<{ nickname: string; avatar: string; rewardAmount: string; createdAt: string }>
  }

  const defaultAvatar = 'https://cdn.uviewui.com/uview/album/1.jpg'
  const loading = ref<boolean>(false)
  const info = ref<InviteInfo | null>(null)

  onShow(() => {
    track(TRACK.CLICK_INVITE)
    void load()
  })

  async function load() {
    loading.value = true
    try {
      info.value = await getInviteInfo()
    } catch (e) {
      logger.warn('invite.info.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onCopy() {
    if (!info.value) return
    uni.setClipboardData({
      data: info.value.inviteCode,
      success: () => {
        uni.showToast({ title: '邀请码已复制', icon: 'success' })
      },
      fail: (err) => {
        logger.warn('invite.copy.fail', { e: String(err.errMsg ?? '') })
      }
    })
  }

  function onShare() {
    /* mp-weixin 由 button open-type="share" 拉起，本回调仅做埋点 */
    track(TRACK.CLICK_INVITE, { action: 'share' })
  }
</script>

<style lang="scss" scoped>
  .invite {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding-bottom: 160rpx;

    &__poster {
      padding: 64rpx 32rpx 48rpx;
      color: $color-text-inverse;
      background: linear-gradient(135deg, #ff6a1a 0%, #ff8e53 100%);
    }

    &__poster-title {
      display: block;
      font-size: 48rpx;
      font-weight: $font-weight-bold;
      text-align: center;
    }

    &__poster-sub {
      display: block;
      margin-top: 16rpx;
      font-size: $font-size-sm;
      color: rgba(255, 255, 255, 0.85);
      text-align: center;
    }

    &__code-block {
      @include flex-between;

      padding: 24rpx 32rpx;
      margin-top: 48rpx;
      background: rgba(255, 255, 255, 0.18);
      border-radius: $radius-lg;
    }

    &__code-label {
      font-size: $font-size-sm;
      color: rgba(255, 255, 255, 0.85);
    }

    &__code {
      flex: 1;
      margin: 0 16rpx;
      font-size: 56rpx;
      font-weight: $font-weight-bold;
      letter-spacing: 8rpx;
      text-align: center;
    }

    &__copy {
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__qr {
      @include flex-center;

      margin-top: 32rpx;
    }

    &__qr-placeholder {
      @include flex-center;

      flex-direction: column;
      width: 320rpx;
      height: 320rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__qr-text {
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__qr-tip {
      margin-top: 8rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__stats {
      display: flex;
      align-items: center;
      padding: 32rpx 0;
      margin: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__stats-item {
      flex: 1;
      text-align: center;
    }

    &__stats-num {
      display: block;
      font-size: 40rpx;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__stats-label {
      display: block;
      margin-top: 8rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__stats-divider {
      width: 1rpx;
      height: 64rpx;
      background: $color-divider;
    }

    &__sec-title {
      padding: 24rpx 32rpx 16rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__empty {
      padding: 48rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__records {
      padding: 0 24rpx;
      margin: 0 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__record {
      display: flex;
      align-items: center;
      padding: 24rpx 0;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }
    }

    &__record-avatar {
      width: 80rpx;
      height: 80rpx;
      border-radius: $radius-circle;
    }

    &__record-mid {
      flex: 1;
      margin-left: 16rpx;
    }

    &__record-name {
      display: block;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__record-time {
      display: block;
      margin-top: 4rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__record-reward {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-success;
    }

    &__footer {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__share {
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
