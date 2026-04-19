<template>
  <view class="page settings">
    <view class="settings__group">
      <view class="settings__group-title">通知</view>
      <view class="settings__row">
        <text class="settings__label">订单通知</text>
        <switch
          :checked="cfg.notifyOrder"
          color="#ff6a1a"
          :disabled="updating"
          @change="onChange('notifyOrder', $event)"
        />
      </view>
      <view class="settings__row">
        <text class="settings__label">优惠通知</text>
        <switch
          :checked="cfg.notifyPromotion"
          color="#ff6a1a"
          :disabled="updating"
          @change="onChange('notifyPromotion', $event)"
        />
      </view>
      <view class="settings__row">
        <text class="settings__label">系统通知</text>
        <switch
          :checked="cfg.notifySystem"
          color="#ff6a1a"
          :disabled="updating"
          @change="onChange('notifySystem', $event)"
        />
      </view>
    </view>

    <view class="settings__group">
      <view class="settings__group-title">隐私</view>
      <view class="settings__row">
        <text class="settings__label">允许接收营销推荐</text>
        <switch
          :checked="cfg.privacyAllowMarketing"
          color="#ff6a1a"
          :disabled="updating"
          @change="onChange('privacyAllowMarketing', $event)"
        />
      </view>
    </view>

    <view class="settings__group">
      <view class="settings__group-title">账号安全</view>
      <view class="settings__row settings__row--link" @tap="goBindMobile">
        <text class="settings__label">绑定手机号</text>
        <view class="settings__value">
          <text class="settings__value-text">
            {{ profile?.mobile ? maskMobile(profile.mobile) : '未绑定' }}
          </text>
          <text class="settings__arrow">›</text>
        </view>
      </view>
    </view>

    <view class="settings__group">
      <view class="settings__group-title">通用</view>
      <view class="settings__row settings__row--link" @tap="onClearCache">
        <text class="settings__label">清理缓存</text>
        <view class="settings__value">
          <text class="settings__value-text">{{ cacheText }}</text>
          <text class="settings__arrow">›</text>
        </view>
      </view>
      <view class="settings__row settings__row--link" @tap="goAbout">
        <text class="settings__label">关于我们</text>
        <text class="settings__arrow">›</text>
      </view>
      <view class="settings__row settings__row--link" @tap="goAgreement('user')">
        <text class="settings__label">用户协议</text>
        <text class="settings__arrow">›</text>
      </view>
      <view class="settings__row settings__row--link" @tap="goAgreement('privacy')">
        <text class="settings__label">隐私政策</text>
        <text class="settings__arrow">›</text>
      </view>
    </view>

    <view v-if="user.isLogin" class="settings__logout" @tap="onAskLogout">
      <text>退出登录</text>
    </view>

    <BizDialog
      v-model:visible="confirmLogout"
      title="退出登录"
      content="确定要退出当前账号吗？"
      confirm-text="退出"
      @confirm="onDoLogout"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/settings.vue
   * @stage P5/T5.40 (Sprint 6)
   * @desc 设置：通知 / 隐私 / 账号安全 / 清理缓存 / 退出登录 / 协议入口
   * @author 单 Agent V2.0
   */
  import { ref, reactive, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import { useUserStore } from '@/store/user'
  import { useCartStore } from '@/store/cart'
  import { getSettings, updateSettings } from '@/api/user'
  import { logout as apiLogout } from '@/api/auth'
  import { maskMobile } from '@/utils/format'
  import { logger } from '@/utils/logger'

  type SettingKey = 'notifyOrder' | 'notifyPromotion' | 'notifySystem' | 'privacyAllowMarketing'

  interface SettingsCfg {
    notifyOrder: boolean
    notifyPromotion: boolean
    notifySystem: boolean
    privacyAllowMarketing: boolean
  }

  const user = useUserStore()
  const cart = useCartStore()
  const profile = computed(() => user.profile)

  const cfg = reactive<SettingsCfg>({
    notifyOrder: true,
    notifyPromotion: true,
    notifySystem: true,
    privacyAllowMarketing: true
  })
  const updating = ref<boolean>(false)
  const cacheText = ref<string>('-')
  const confirmLogout = ref<boolean>(false)

  onShow(() => {
    void loadSettings()
    refreshCache()
  })

  async function loadSettings() {
    if (!user.isLogin) return
    try {
      const s = await getSettings()
      cfg.notifyOrder = s.notifyOrder
      cfg.notifyPromotion = s.notifyPromotion
      cfg.notifySystem = s.notifySystem
      cfg.privacyAllowMarketing = s.privacyAllowMarketing
    } catch (e) {
      logger.warn('settings.get.fail', { e: String(e) })
    }
  }

  async function onChange(key: SettingKey, e: { detail: { value: boolean } }) {
    const v = e.detail.value
    const prev = cfg[key]
    cfg[key] = v
    updating.value = true
    try {
      await updateSettings({ [key]: v })
    } catch (err) {
      cfg[key] = prev
      logger.warn('settings.update.fail', { key, e: String(err) })
    } finally {
      updating.value = false
    }
  }

  function refreshCache() {
    try {
      const info = uni.getStorageInfoSync()
      const kb = (info.currentSize ?? 0).toFixed(0)
      cacheText.value = `${kb} KB`
    } catch (e) {
      cacheText.value = '-'
      logger.warn('settings.cache.info.fail', { e: String(e) })
    }
  }

  function onClearCache() {
    cart.clearAll()
    try {
      uni.removeStorageSync('o2o_search_history')
    } catch (e) {
      logger.warn('settings.clear.search.fail', { e: String(e) })
    }
    uni.showToast({ title: '缓存已清理', icon: 'success' })
    setTimeout(refreshCache, 200)
  }

  function goBindMobile() {
    uni.navigateTo({ url: '/pages/login/bind-mobile' })
  }

  function goAbout() {
    uni.navigateTo({ url: '/pages-user/about' })
  }

  function goAgreement(type: 'user' | 'privacy') {
    uni.showToast({
      title: type === 'user' ? '用户协议（占位，P9 接入）' : '隐私政策（占位，P9 接入）',
      icon: 'none'
    })
  }

  function onAskLogout() {
    confirmLogout.value = true
  }

  async function onDoLogout() {
    try {
      await apiLogout()
    } catch (e) {
      logger.warn('settings.logout.api.fail', { e: String(e) })
    }
    user.logout()
    uni.showToast({ title: '已退出登录', icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/login/index' }), 600)
  }
</script>

<style lang="scss" scoped>
  .settings {
    padding-bottom: 64rpx;

    &__group {
      margin-bottom: 16rpx;
      background: $color-bg-white;
    }

    &__group-title {
      padding: 24rpx 32rpx 12rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__row {
      @include flex-between;

      padding: 24rpx 32rpx;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }

      &--link {
        @include flex-between;
      }
    }

    &__label {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__value {
      display: flex;
      align-items: center;
    }

    &__value-text {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__arrow {
      margin-left: 12rpx;
      font-size: $font-size-md;
      color: $color-text-placeholder;
    }

    &__logout {
      @include flex-center;

      height: 88rpx;
      margin: 32rpx 16rpx 0;
      font-size: $font-size-md;
      color: $color-danger;
      background: $color-bg-white;
      border-radius: $radius-md;
    }
  }
</style>
