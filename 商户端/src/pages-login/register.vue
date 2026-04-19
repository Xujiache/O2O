<template>
  <view class="page page-register">
    <view class="register-header">
      <text class="register-title">商户入驻</text>
      <text class="register-subtitle">3 步完成入驻，最快 24 小时审核通过</text>
    </view>

    <!-- 步骤指示 -->
    <view class="register-steps">
      <view
        v-for="(s, idx) in steps"
        :key="s"
        class="register-step"
        :class="{
          'register-step--active': step === idx + 1,
          'register-step--done': step > idx + 1
        }"
      >
        <view class="register-step__num">{{ idx + 1 }}</view>
        <text class="register-step__name">{{ s }}</text>
      </view>
    </view>

    <!-- Step 1：基本信息 -->
    <view v-if="step === 1" class="register-form">
      <view class="form-field">
        <text class="form-label">商户全称（与营业执照一致）</text>
        <input
          v-model="form.fullName"
          class="form-input"
          placeholder="请输入商户全称"
          maxlength="50"
        />
      </view>
      <view class="form-field">
        <text class="form-label">联系人</text>
        <input
          v-model="form.contactName"
          class="form-input"
          placeholder="请输入联系人"
          maxlength="20"
        />
      </view>
      <view class="form-field">
        <text class="form-label">联系手机</text>
        <input
          v-model="form.mobile"
          class="form-input"
          type="number"
          placeholder="11 位手机号"
          maxlength="11"
        />
      </view>
      <view class="form-field">
        <text class="form-label">短信验证码</text>
        <view class="form-row">
          <input
            v-model="form.smsCode"
            class="form-input form-input--flex"
            type="number"
            placeholder="6 位"
            maxlength="6"
          />
          <button class="form-sms-btn" :disabled="smsCountdown > 0" @click="onSendSms">
            {{ smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码' }}
          </button>
        </view>
      </view>
      <view class="form-field">
        <text class="form-label">经营类目</text>
        <picker :value="categoryIdx" :range="categoryOptions" @change="onCategoryChange">
          <view class="form-input form-input--picker">
            {{ form.category || '请选择' }}
          </view>
        </picker>
      </view>
      <view class="form-field">
        <text class="form-label">经营地址</text>
        <input
          v-model="form.businessAddress"
          class="form-input"
          placeholder="详细地址"
          maxlength="100"
        />
      </view>
      <button class="form-next" @click="onStep1Next">下一步：上传资质</button>
    </view>

    <!-- Step 2：资质上传 -->
    <view v-if="step === 2" class="register-form">
      <text class="form-tip">请上传清晰、完整的资质照片</text>

      <view class="form-field">
        <text class="form-label">营业执照</text>
        <view class="upload-card" @click="onUploadLicense">
          <image
            v-if="form.licenseUrl"
            class="upload-img"
            :src="form.licenseUrl"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">
            <text class="upload-placeholder__icon">+</text>
            <text class="upload-placeholder__text">点击上传</text>
          </view>
        </view>
        <input
          v-model="form.licenseNo"
          class="form-input"
          placeholder="营业执照编号"
          maxlength="32"
          style="margin-top: 16rpx"
        />
      </view>

      <view class="form-field">
        <text class="form-label">法人身份证</text>
        <view class="upload-row">
          <view class="upload-card upload-card--half" @click="onUploadIdFront">
            <image
              v-if="form.idCardFrontUrl"
              class="upload-img"
              :src="form.idCardFrontUrl"
              mode="aspectFill"
            />
            <view v-else class="upload-placeholder">
              <text class="upload-placeholder__text">人像面</text>
            </view>
          </view>
          <view class="upload-card upload-card--half" @click="onUploadIdBack">
            <image
              v-if="form.idCardBackUrl"
              class="upload-img"
              :src="form.idCardBackUrl"
              mode="aspectFill"
            />
            <view v-else class="upload-placeholder">
              <text class="upload-placeholder__text">国徽面</text>
            </view>
          </view>
        </view>
        <input
          v-model="form.legalPersonName"
          class="form-input"
          placeholder="法人姓名"
          maxlength="20"
          style="margin-top: 16rpx"
        />
        <input
          v-model="form.legalPersonIdCard"
          class="form-input"
          placeholder="法人身份证号"
          maxlength="18"
          style="margin-top: 16rpx"
        />
      </view>

      <view class="form-field">
        <text class="form-label">食品经营许可证（餐饮类必填，其他选填）</text>
        <view class="upload-card" @click="onUploadFoodLicense">
          <image
            v-if="form.foodLicenseUrl"
            class="upload-img"
            :src="form.foodLicenseUrl"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">
            <text class="upload-placeholder__icon">+</text>
            <text class="upload-placeholder__text">点击上传</text>
          </view>
        </view>
      </view>

      <view class="form-row">
        <button class="form-prev" @click="step = 1">上一步</button>
        <button class="form-next" @click="onStep2Next">下一步：核对提交</button>
      </view>
    </view>

    <!-- Step 3：核对提交 -->
    <view v-if="step === 3" class="register-form">
      <view class="confirm-card">
        <view class="confirm-row"
          ><text class="confirm-label">商户全称</text><text>{{ form.fullName }}</text></view
        >
        <view class="confirm-row"
          ><text class="confirm-label">联系人</text><text>{{ form.contactName }}</text></view
        >
        <view class="confirm-row"
          ><text class="confirm-label">联系手机</text><text>{{ form.mobile }}</text></view
        >
        <view class="confirm-row"
          ><text class="confirm-label">经营类目</text><text>{{ form.category }}</text></view
        >
        <view class="confirm-row"
          ><text class="confirm-label">法人姓名</text><text>{{ form.legalPersonName }}</text></view
        >
        <view class="confirm-row"
          ><text class="confirm-label">营业执照编号</text><text>{{ form.licenseNo }}</text></view
        >
      </view>
      <view class="form-row">
        <button class="form-prev" @click="step = 2">上一步</button>
        <button class="form-next" :disabled="submitting" @click="onSubmit">
          {{ submitting ? '提交中...' : '提交申请' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { applyMerchant, sendSmsCode } from '@/api/auth'
  import { chooseAndUpload } from '@/api/file'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 商户入驻申请页（3 步表单）
   *
   * 步骤：
   *   1. 基本信息：全称 / 联系人 / 手机+短信 / 类目 / 地址
   *   2. 资质上传：营业执照 + 身份证（双面）+ 食品经营许可证
   *   3. 核对提交
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.8)
   */

  const steps = ['基本信息', '资质上传', '核对提交']
  const step = ref<1 | 2 | 3>(1)
  const submitting = ref<boolean>(false)
  const smsCountdown = ref<number>(0)
  let smsTimer: ReturnType<typeof setInterval> | null = null

  const form = reactive({
    fullName: '',
    contactName: '',
    mobile: '',
    smsCode: '',
    category: '',
    businessAddress: '',
    licenseUrl: '',
    licenseNo: '',
    idCardFrontUrl: '',
    idCardBackUrl: '',
    legalPersonName: '',
    legalPersonIdCard: '',
    foodLicenseUrl: '',
    remark: ''
  })

  /* 经营类目选项（mock；正式版从 /merchant/dict/categories 拉） */
  const categoryOptions = ['中餐', '快餐', '西餐', '烧烤', '甜品', '饮品', '生鲜', '便利店', '其他']
  const categoryIdx = ref<number>(-1)

  onLoad(() => {
    /* 入驻是非登录页埋点 */
    track('view_register')
  })

  function onCategoryChange(e: { detail: { value: number } }) {
    categoryIdx.value = e.detail.value
    form.category = categoryOptions[e.detail.value]
  }

  function startCountdown() {
    smsCountdown.value = 60
    smsTimer = setInterval(() => {
      smsCountdown.value -= 1
      if (smsCountdown.value <= 0 && smsTimer) {
        clearInterval(smsTimer)
        smsTimer = null
      }
    }, 1000)
  }

  async function onSendSms() {
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await sendSmsCode({ mobile: form.mobile, scene: 'register' })
      }
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      startCountdown()
    } catch (e) {
      logger.warn('register.sms.fail', { e: String(e) })
    }
  }

  function onStep1Next() {
    if (!form.fullName.trim()) {
      uni.showToast({ title: '请输入商户全称', icon: 'none' })
      return
    }
    if (!form.contactName.trim()) {
      uni.showToast({ title: '请输入联系人', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(form.smsCode)) {
      uni.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    if (!form.category) {
      uni.showToast({ title: '请选择经营类目', icon: 'none' })
      return
    }
    if (!form.businessAddress.trim()) {
      uni.showToast({ title: '请输入经营地址', icon: 'none' })
      return
    }
    step.value = 2
  }

  async function uploadFor(field: keyof typeof form) {
    try {
      const urls = await chooseAndUpload(1, 'merchant_qualification', false)
      if (urls.length > 0) {
        form[field] = urls[0]
      }
    } catch (e) {
      logger.warn('register.upload.fail', { field, e: String(e) })
      uni.showToast({ title: '上传失败', icon: 'none' })
    }
  }

  function onUploadLicense() {
    void uploadFor('licenseUrl')
  }
  function onUploadIdFront() {
    void uploadFor('idCardFrontUrl')
  }
  function onUploadIdBack() {
    void uploadFor('idCardBackUrl')
  }
  function onUploadFoodLicense() {
    void uploadFor('foodLicenseUrl')
  }

  function onStep2Next() {
    if (!form.licenseUrl) {
      uni.showToast({ title: '请上传营业执照', icon: 'none' })
      return
    }
    if (!form.licenseNo.trim()) {
      uni.showToast({ title: '请输入营业执照编号', icon: 'none' })
      return
    }
    if (!form.idCardFrontUrl || !form.idCardBackUrl) {
      uni.showToast({ title: '请上传身份证双面', icon: 'none' })
      return
    }
    if (!form.legalPersonName.trim()) {
      uni.showToast({ title: '请输入法人姓名', icon: 'none' })
      return
    }
    if (!/^\d{17}[\dXx]$/.test(form.legalPersonIdCard)) {
      uni.showToast({ title: '身份证号格式不正确', icon: 'none' })
      return
    }
    step.value = 3
  }

  async function onSubmit() {
    if (submitting.value) return
    submitting.value = true
    try {
      const result = mockEnabled()
        ? await delay({ id: 'apply-' + Date.now(), status: 0 as const })
        : await applyMerchant({
            fullName: form.fullName,
            contactName: form.contactName,
            mobile: form.mobile,
            smsCode: form.smsCode,
            licenseUrl: form.licenseUrl,
            licenseNo: form.licenseNo,
            idCardFrontUrl: form.idCardFrontUrl,
            idCardBackUrl: form.idCardBackUrl,
            legalPersonName: form.legalPersonName,
            legalPersonIdCard: form.legalPersonIdCard,
            category: form.category,
            businessAddress: form.businessAddress,
            foodLicenseUrl: form.foodLicenseUrl || undefined,
            remark: form.remark || undefined
          })
      track(TRACK.SUBMIT_APPLY, { applyId: result.id })
      uni.reLaunch({ url: `/pages-login/audit-status?id=${result.id}` })
    } catch (e) {
      logger.warn('register.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-register {
    min-height: 100vh;
    padding: 32rpx 32rpx 80rpx;
  }

  .register-header {
    margin-bottom: 32rpx;
  }

  .register-title {
    display: block;
    font-size: 40rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .register-subtitle {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .register-steps {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx;
    margin-bottom: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .register-step {
    display: flex;
    flex-direction: column;
    align-items: center;

    &__num {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 60rpx;
      height: 60rpx;
      margin-bottom: 8rpx;
      font-size: 26rpx;
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
      border-radius: 50%;
    }

    &__name {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &--active {
      .register-step__num {
        color: #fff;
        background: $uni-color-primary;
      }

      .register-step__name {
        font-weight: 500;
        color: $uni-color-primary;
      }
    }

    &--done {
      .register-step__num {
        color: #fff;
        background: $uni-color-success;
      }

      .register-step__name {
        color: $uni-color-success;
      }
    }
  }

  .register-form {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .form-tip {
    display: block;
    padding: 16rpx 24rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-color-warning;
    background: rgb(250 140 22 / 8%);
    border-radius: $uni-border-radius-base;
  }

  .form-field {
    margin-bottom: 24rpx;
  }

  .form-label {
    display: block;
    margin-bottom: 12rpx;
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .form-input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &--flex {
      flex: 1;
      margin-right: 16rpx;
    }

    &--picker {
      display: flex;
      align-items: center;
      line-height: 80rpx;
    }
  }

  .form-row {
    display: flex;
    align-items: center;
    margin-top: 24rpx;
  }

  .form-sms-btn {
    width: 200rpx;
    height: 80rpx;
    padding: 0;
    font-size: 24rpx;
    line-height: 80rpx;
    color: $uni-color-primary;
    background: #fff;
    border: 2rpx solid $uni-color-primary;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &[disabled] {
      color: $uni-text-color-disable;
      border-color: $uni-text-color-disable;
    }
  }

  .form-prev {
    flex: 1;
    height: 88rpx;
    margin-right: 24rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: $uni-text-color-grey;
    background: $uni-bg-color-grey;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }

  .form-next {
    flex: 1;
    height: 88rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &[disabled] {
      opacity: 0.6;
    }
  }

  .upload-card {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 320rpx;
    overflow: hidden;
    background: $uni-bg-color-grey;
    border: 2rpx dashed $uni-border-color;
    border-radius: $uni-border-radius-base;

    &--half {
      flex: 1;
    }
  }

  .upload-row {
    display: flex;
    gap: 16rpx;
  }

  .upload-img {
    width: 100%;
    height: 100%;
  }

  .upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: $uni-text-color-grey;

    &__icon {
      font-size: 60rpx;
      line-height: 1;
    }

    &__text {
      margin-top: 8rpx;
      font-size: 24rpx;
    }
  }

  .confirm-card {
    padding: 24rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .confirm-row {
    display: flex;
    justify-content: space-between;
    padding: 16rpx 0;
    font-size: 26rpx;
    color: $uni-text-color;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  .confirm-label {
    color: $uni-text-color-grey;
  }
</style>
