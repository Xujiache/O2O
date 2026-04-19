<template>
  <view class="page realname">
    <BizLoading v-if="loadingStatus && !done" fullscreen text="加载中..." />

    <template v-else>
      <view v-if="done" class="realname__done card">
        <view class="realname__done-tag">已实名</view>
        <view class="realname__done-row">
          <text class="realname__done-label">姓名</text>
          <text class="realname__done-value">{{ doneInfo.realname }}</text>
        </view>
        <view class="realname__done-row">
          <text class="realname__done-label">证件号</text>
          <text class="realname__done-value">{{ maskIdCard(doneInfo.idCard) }}</text>
        </view>
        <view class="realname__done-tip"> 已通过实名认证，如需修改请联系客服 </view>
      </view>

      <template v-else>
        <view class="realname__hint">
          <text class="realname__hint-title">实名认证</text>
          <text class="realname__hint-desc">
            根据国家相关法规，使用平台部分服务（如跑腿/付费下单）需先完成实名认证，资料仅用于核身、不会泄露
          </text>
        </view>

        <view class="realname__form card">
          <view class="realname__row">
            <text class="realname__label">真实姓名</text>
            <input
              v-model="form.realname"
              class="realname__input"
              placeholder="请输入真实姓名（2-30 字）"
              maxlength="30"
            />
          </view>
          <view class="realname__row">
            <text class="realname__label">身份证号</text>
            <input
              v-model="form.idCard"
              class="realname__input"
              placeholder="请输入 18 位身份证号"
              maxlength="18"
            />
          </view>
          <view class="realname__upload-row">
            <view class="realname__upload" @tap="onChoose('front')">
              <image
                v-if="form.frontUrl"
                class="realname__upload-img"
                :src="form.frontUrl"
                mode="aspectFill"
              />
              <text v-else class="realname__upload-tip">+ 身份证人像面</text>
            </view>
            <view class="realname__upload" @tap="onChoose('back')">
              <image
                v-if="form.backUrl"
                class="realname__upload-img"
                :src="form.backUrl"
                mode="aspectFill"
              />
              <text v-else class="realname__upload-tip">+ 身份证国徽面</text>
            </view>
          </view>
        </view>

        <view v-if="failReason" class="realname__fail card">
          <text class="realname__fail-title">认证失败</text>
          <text class="realname__fail-desc">{{ failReason }}</text>
        </view>

        <view class="realname__actions">
          <button
            class="realname__btn"
            :loading="submitting"
            :disabled="!canSubmit"
            @tap="onSubmit"
          >
            提交认证
          </button>
        </view>
      </template>
    </template>

    <BizLoading v-if="uploading" fullscreen text="上传中..." />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/realname.vue
   * @stage P5/T5.33 (Sprint 6)
   * @desc 实名认证：未实名展示表单（姓名 + 身份证 + 双面照）；已实名展示脱敏信息
   * @author 单 Agent V2.0
   */
  import { ref, reactive, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import { useUserStore } from '@/store/user'
  import { submitRealname, getRealnameStatus } from '@/api/user'
  import { uploadFile } from '@/api/file'
  import { maskIdCard } from '@/utils/format'
  import { logger } from '@/utils/logger'

  interface RealnameForm {
    realname: string
    idCard: string
    frontUrl: string
    frontId: string
    backUrl: string
    backId: string
  }

  const user = useUserStore()
  const loadingStatus = ref<boolean>(true)
  const submitting = ref<boolean>(false)
  const uploading = ref<boolean>(false)
  const failReason = ref<string>('')
  const done = ref<boolean>(false)
  const doneInfo = reactive<{ realname: string; idCard: string }>({ realname: '', idCard: '' })

  const form = reactive<RealnameForm>({
    realname: '',
    idCard: '',
    frontUrl: '',
    frontId: '',
    backUrl: '',
    backId: ''
  })

  const idCardValid = computed<boolean>(() => /^\d{17}[\dXx]$/.test(form.idCard))

  const canSubmit = computed<boolean>(() => {
    if (submitting.value) return false
    if (form.realname.trim().length < 2 || form.realname.trim().length > 30) return false
    if (!idCardValid.value) return false
    return true
  })

  onShow(() => {
    void loadStatus()
  })

  async function loadStatus() {
    loadingStatus.value = true
    try {
      const r = await getRealnameStatus()
      if (r.status === 1 && user.profile) {
        done.value = true
        doneInfo.realname = user.profile.nickname || '已认证用户'
        doneInfo.idCard = ''
      } else {
        done.value = Boolean(user.profile?.isRealname)
        if (r.remark) failReason.value = r.remark
      }
    } catch (e) {
      logger.warn('realname.status.fail', { e: String(e) })
      done.value = Boolean(user.profile?.isRealname)
    } finally {
      loadingStatus.value = false
    }
  }

  function onChoose(side: 'front' | 'back') {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFilePaths[0]
        if (!path) return
        void doUpload(side, path)
      }
    })
  }

  async function doUpload(side: 'front' | 'back', path: string) {
    uploading.value = true
    try {
      const r = await uploadFile(path, 'qual', false)
      if (side === 'front') {
        form.frontUrl = r.url
        form.frontId = r.id
      } else {
        form.backUrl = r.url
        form.backId = r.id
      }
    } catch (e) {
      logger.warn('realname.upload.fail', { e: String(e) })
      uni.showToast({ title: '上传失败', icon: 'none' })
    } finally {
      uploading.value = false
    }
  }

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    failReason.value = ''
    try {
      const res = await submitRealname({
        realname: form.realname.trim(),
        idCard: form.idCard.trim().toUpperCase(),
        frontImageId: form.frontId || undefined,
        backImageId: form.backId || undefined
      })
      if (res.status === 1) {
        if (user.profile) {
          user.setProfile({ ...user.profile, isRealname: 1 })
        }
        done.value = true
        doneInfo.realname = form.realname.trim()
        doneInfo.idCard = form.idCard.trim()
        uni.showToast({ title: '认证成功', icon: 'success' })
      } else {
        failReason.value = res.remark || '认证失败，请检查信息后重试'
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failReason.value = msg
      logger.warn('realname.submit.fail', { e: msg })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .realname {
    padding: 16rpx;

    &__hint {
      padding: 32rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__hint-title {
      display: block;
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__hint-desc {
      display: block;
      margin-top: 16rpx;
      font-size: $font-size-sm;
      line-height: 1.6;
      color: $color-text-secondary;
    }

    &__form {
      padding: 0 32rpx 32rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__row {
      @include flex-between;

      padding: 28rpx 0;
      border-bottom: 1rpx solid $color-divider;
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

    &__upload-row {
      display: flex;
      gap: 24rpx;
      padding: 32rpx 0;
    }

    &__upload {
      @include flex-center;

      flex: 1;
      height: 200rpx;
      overflow: hidden;
      background: $color-bg-page;
      border: 1rpx dashed $color-border;
      border-radius: $radius-md;
    }

    &__upload-img {
      width: 100%;
      height: 100%;
    }

    &__upload-tip {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__fail {
      padding: 24rpx 32rpx;
      margin-bottom: 16rpx;
      background: rgba(245, 108, 108, 0.08);
      border-left: 6rpx solid $color-danger;
      border-radius: $radius-md;
    }

    &__fail-title {
      display: block;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-danger;
    }

    &__fail-desc {
      display: block;
      margin-top: 8rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__actions {
      padding: 32rpx 16rpx;
    }

    &__btn {
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

    &__done {
      padding: 48rpx 32rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__done-tag {
      display: inline-block;
      padding: 4rpx 24rpx;
      margin-bottom: 32rpx;
      font-size: $font-size-sm;
      color: $color-success;
      background: rgba(103, 194, 58, 0.1);
      border-radius: $radius-sm;
    }

    &__done-row {
      @include flex-between;

      padding: 24rpx 0;
      border-bottom: 1rpx solid $color-divider;

      &:last-of-type {
        border-bottom: none;
      }
    }

    &__done-label {
      font-size: $font-size-base;
      color: $color-text-secondary;
    }

    &__done-value {
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__done-tip {
      margin-top: 16rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }
  }
</style>
