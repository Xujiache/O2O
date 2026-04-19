<template>
  <view class="page page-white profile">
    <view class="profile__avatar-block" @tap="onChangeAvatar">
      <image class="profile__avatar" :src="form.avatar || defaultAvatar" mode="aspectFill" />
      <text class="profile__avatar-tip">点击更换头像</text>
    </view>

    <view class="profile__form">
      <view class="profile__row">
        <text class="profile__label">昵称</text>
        <input
          v-model="form.nickname"
          class="profile__input"
          placeholder="请输入昵称"
          maxlength="20"
        />
      </view>

      <view class="profile__row">
        <text class="profile__label">手机号</text>
        <text class="profile__value profile__value--muted">
          {{ profile?.mobile ? maskMobile(profile.mobile) : '未绑定' }}
        </text>
      </view>

      <picker mode="selector" :range="genderRange" :value="genderIdx" @change="onGenderChange">
        <view class="profile__row">
          <text class="profile__label">性别</text>
          <text class="profile__value">{{ genderText }}</text>
          <text class="profile__arrow">›</text>
        </view>
      </picker>

      <picker
        mode="date"
        :value="form.birthday || '2000-01-01'"
        end="2099-12-31"
        @change="onBirthdayChange"
      >
        <view class="profile__row">
          <text class="profile__label">生日</text>
          <text class="profile__value" :class="{ 'profile__value--muted': !form.birthday }">
            {{ form.birthday || '请选择' }}
          </text>
          <text class="profile__arrow">›</text>
        </view>
      </picker>

      <view class="profile__row" @tap="goRealname">
        <text class="profile__label">实名认证</text>
        <text class="profile__value" :class="{ 'profile__value--muted': !profile?.isRealname }">
          {{ profile?.isRealname ? '已实名' : '未实名' }}
        </text>
        <text class="profile__arrow">›</text>
      </view>

      <view class="profile__row">
        <text class="profile__label">邀请码</text>
        <text class="profile__value">{{ profile?.inviteCode || '-' }}</text>
      </view>
    </view>

    <view class="profile__actions">
      <button class="profile__save" :loading="saving" :disabled="saving" @tap="onSave">
        保存
      </button>
    </view>

    <BizLoading v-if="uploading" fullscreen text="上传中..." />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/profile.vue
   * @stage P5/T5.32 (Sprint 6)
   * @desc 资料编辑：头像 / 昵称 / 性别 / 生日；保存调 updateProfile，刷新 store
   * @author 单 Agent V2.0
   */
  import { ref, reactive, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import { useUserStore } from '@/store/user'
  import { updateProfile } from '@/api/user'
  import { uploadFile } from '@/api/file'
  import { maskMobile } from '@/utils/format'
  import { logger } from '@/utils/logger'

  interface ProfileForm {
    avatar: string
    nickname: string
    gender: 0 | 1 | 2
    birthday: string
  }

  const defaultAvatar = 'https://cdn.uviewui.com/uview/album/1.jpg'
  const genderRange = ['男', '女', '保密']

  const user = useUserStore()
  const profile = computed(() => user.profile)
  const uploading = ref<boolean>(false)
  const saving = ref<boolean>(false)

  const form = reactive<ProfileForm>({
    avatar: '',
    nickname: '',
    gender: 0,
    birthday: ''
  })

  const genderIdx = computed<number>(() => {
    if (form.gender === 1) return 0
    if (form.gender === 2) return 1
    return 2
  })

  const genderText = computed<string>(() => {
    if (form.gender === 1) return '男'
    if (form.gender === 2) return '女'
    return '保密'
  })

  onShow(() => {
    syncFromStore()
  })

  function syncFromStore() {
    const p = profile.value
    if (!p) return
    form.avatar = p.avatar ?? ''
    form.nickname = p.nickname ?? ''
    form.gender = p.gender
    form.birthday = p.birthday ?? ''
  }

  function onChangeAvatar() {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFilePaths[0]
        if (!path) return
        void doUpload(path)
      },
      fail: (err) => {
        logger.warn('profile.avatar.choose.fail', { e: String(err.errMsg ?? '') })
      }
    })
  }

  async function doUpload(path: string) {
    uploading.value = true
    try {
      const r = await uploadFile(path, 'avatar', true)
      form.avatar = r.url
      uni.showToast({ title: '上传成功', icon: 'success' })
    } catch (e) {
      logger.warn('profile.avatar.upload.fail', { e: String(e) })
      uni.showToast({ title: '上传失败', icon: 'none' })
    } finally {
      uploading.value = false
    }
  }

  function onGenderChange(e: { detail: { value: string | number } }) {
    const idx = Number(e.detail.value)
    if (idx === 0) form.gender = 1
    else if (idx === 1) form.gender = 2
    else form.gender = 0
  }

  function onBirthdayChange(e: { detail: { value: string } }) {
    form.birthday = e.detail.value
  }

  async function onSave() {
    if (!form.nickname.trim()) {
      uni.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    saving.value = true
    try {
      const updated = await updateProfile({
        avatar: form.avatar || null,
        nickname: form.nickname.trim(),
        gender: form.gender,
        birthday: form.birthday || null
      })
      user.setProfile(updated)
      uni.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('profile.save.fail', { e: String(e) })
    } finally {
      saving.value = false
    }
  }

  function goRealname() {
    uni.navigateTo({ url: '/pages-user/realname' })
  }
</script>

<style lang="scss" scoped>
  .profile {
    padding-bottom: 64rpx;

    &__avatar-block {
      @include flex-center;

      flex-direction: column;
      padding: 48rpx 0;
      background: $color-bg-white;
    }

    &__avatar {
      width: 160rpx;
      height: 160rpx;
      border: 4rpx solid $color-divider;
      border-radius: $radius-circle;
    }

    &__avatar-tip {
      margin-top: 16rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__form {
      margin-top: 16rpx;
      background: $color-bg-white;
    }

    &__row {
      @include flex-between;

      padding: 28rpx 32rpx;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }
    }

    &__label {
      width: 160rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__input {
      flex: 1;
      height: 48rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      text-align: right;
    }

    &__value {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-regular;
      text-align: right;

      &--muted {
        color: $color-text-secondary;
      }
    }

    &__arrow {
      margin-left: 12rpx;
      font-size: $font-size-md;
      color: $color-text-placeholder;
    }

    &__actions {
      padding: 48rpx 32rpx 0;
    }

    &__save {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      line-height: 88rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;

      &[disabled] {
        background: #ffc6a8;
      }
    }
  }
</style>
