<template>
  <view class="page">
    <view class="head">
      <view class="head__icon">🆘</view>
      <view class="head__title">紧急求助</view>
      <view class="head__desc">
        系统将同时上传：当前位置 + 当前订单 + 紧急联系人，并拨打所选号码
      </view>
    </view>

    <view class="card">
      <view class="card__title">求助原因（可选）</view>
      <textarea
        v-model="reason"
        class="textarea"
        placeholder="如：发生交通事故 / 物品被抢 / 受伤"
        maxlength="200"
      />
    </view>

    <view class="card">
      <view class="card__title">选择联系方式</view>
      <view class="opts">
        <view class="opt opt--police" @click="onTrigger(1)">
          <text class="opt__icon">🚓</text>
          <text class="opt__name">报警 110</text>
          <text class="opt__desc">紧急情况首选</text>
        </view>
        <view class="opt opt--service" @click="onTrigger(2)">
          <text class="opt__icon">📞</text>
          <text class="opt__name">平台客服</text>
          <text class="opt__desc">7*24 小时热线</text>
        </view>
        <view class="opt opt--family" @click="onTrigger(3)">
          <text class="opt__icon">❤️</text>
          <text class="opt__name">紧急联系人</text>
          <text class="opt__desc">{{ emergencyMobile || '未设置' }}</text>
        </view>
      </view>
    </view>

    <view class="tips">
      <text>* 系统会同时记录您的位置和订单到平台</text>
      <text>* 请保持手机畅通，平台 1 分钟内联系您</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useLocationStore, useOrderStore } from '@/store'
  import { reportEmergency } from '@/api/work'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 紧急求助：拨号 + 位置 + 订单同时上报（V7.36）
   *   T7.45
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const location = useLocationStore()
  const orderStore = useOrderStore()
  const reason = ref('')
  const emergencyMobile = ref('110')

  /**
   * 防误触 + 二次确认
   * @param channel 1 报警 / 2 客服 / 3 家人
   */
  async function onTrigger(channel: 1 | 2 | 3) {
    const phoneMap: Record<1 | 2 | 3, string> = {
      1: '110',
      2: '4000000000',
      3: emergencyMobile.value
    }
    const phone = phoneMap[channel]
    if (!phone) {
      uni.showToast({ title: '紧急联系人未设置', icon: 'none' })
      return
    }
    uni.showModal({
      title: '确认求助？',
      content: `将立即拨打 ${phone}\n并同步上报位置 + 订单到平台`,
      confirmText: '立即求助',
      confirmColor: '#FF4D4F',
      success: async ({ confirm }) => {
        if (!confirm) return
        await doReport(channel)
        uni.makePhoneCall({ phoneNumber: phone })
      }
    })
  }

  async function doReport(channel: 1 | 2 | 3) {
    const loc = (await location.pickOnce()) ?? { lng: 0, lat: 0 }
    const inProgress = orderStore.inProgress[0]
    try {
      const r = await reportEmergency({
        channel,
        reason: reason.value.trim() || undefined,
        lng: loc.lng,
        lat: loc.lat,
        orderNo: inProgress?.orderNo,
        emergencyMobile: channel === 3 ? emergencyMobile.value : undefined
      })
      track(TRACK.EMERGENCY_TRIGGER, { channel, ackNo: r.ackNo })
      logger.info('emergency.report.ok', { ackNo: r.ackNo })
    } catch (e) {
      logger.warn('emergency.report.fail', { e: String(e) })
      track(TRACK.EMERGENCY_TRIGGER, { channel, fallback: 'no-network' })
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .head {
    padding: 32rpx 24rpx;
    margin-bottom: 16rpx;
    text-align: center;
    background: $uni-color-error;
    border-radius: 16rpx;

    &__icon {
      font-size: 80rpx;
    }

    &__title {
      margin: 16rpx 0 8rpx;
      font-size: 32rpx;
      font-weight: 700;
      color: #fff;
    }

    &__desc {
      font-size: 22rpx;
      color: rgb(255 255 255 / 90%);
    }
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 16rpx;
      font-size: 26rpx;
      font-weight: 600;
    }
  }

  .textarea {
    width: 100%;
    min-height: 160rpx;
    padding: 16rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .opts {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }

  .opt {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24rpx;
    color: #fff;
    text-align: center;
    border-radius: 16rpx;

    &--police {
      background: linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%);
    }

    &--service {
      background: linear-gradient(135deg, $uni-color-primary 0%, $uni-color-primary-dark 100%);
    }

    &--family {
      background: linear-gradient(135deg, #fa8c16 0%, #d96c00 100%);
    }

    &__icon {
      font-size: 48rpx;
    }

    &__name {
      margin: 8rpx 0 4rpx;
      font-size: 30rpx;
      font-weight: 700;
    }

    &__desc {
      font-size: 22rpx;
      opacity: 0.9;
    }
  }

  .tips {
    margin-top: 24rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;

    text {
      display: block;
      line-height: 1.6;
    }
  }
</style>
