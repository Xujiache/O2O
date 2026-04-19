<template>
  <view class="page page-qualification">
    <view class="hint">请上传以下 4 类资质材料，审核通过后即可上岗接单（约 1 工作日）</view>

    <!-- 实名信息 -->
    <view class="card">
      <view class="card__title">实名信息</view>
      <view class="field">
        <text class="field__label">真实姓名</text>
        <input v-model="form.realName" class="field__input" maxlength="20" />
      </view>
      <view class="field">
        <text class="field__label">身份证号</text>
        <input v-model="form.idCardNo" class="field__input" maxlength="18" />
      </view>
      <view class="upload-row">
        <view class="upload-cell" @click="onUploadIdFront">
          <image
            v-if="form.idCardFrontUrl"
            :src="form.idCardFrontUrl"
            class="upload-img"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">+ 身份证正面</view>
        </view>
        <view class="upload-cell" @click="onUploadIdBack">
          <image
            v-if="form.idCardBackUrl"
            :src="form.idCardBackUrl"
            class="upload-img"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">+ 身份证反面</view>
        </view>
      </view>
    </view>

    <!-- 健康证 -->
    <view class="card">
      <view class="card__title">健康证</view>
      <view class="field">
        <text class="field__label">有效期截止</text>
        <picker mode="date" :value="form.healthCertExpireAt" @change="onPickExpire">
          <view class="field__picker">{{ form.healthCertExpireAt || '请选择日期' }}</view>
        </picker>
      </view>
      <view class="upload-row">
        <view class="upload-cell" @click="onUploadHealth">
          <image
            v-if="form.healthCertUrl"
            :src="form.healthCertUrl"
            class="upload-img"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">+ 健康证照片</view>
        </view>
      </view>
    </view>

    <!-- 车辆 -->
    <view class="card">
      <view class="card__title">车辆信息</view>
      <view class="field">
        <text class="field__label">车辆类型</text>
        <view class="vehicle-row">
          <view
            v-for="v in vehicleOptions"
            :key="v.value"
            class="vehicle-item"
            :class="{ 'vehicle-item--active': form.vehicleType === v.value }"
            @click="form.vehicleType = v.value"
          >
            {{ v.label }}
          </view>
        </view>
      </view>
      <view v-if="form.vehicleType === 'electric'" class="field">
        <text class="field__label">车牌号</text>
        <input
          v-model="form.vehicleNo"
          class="field__input"
          placeholder="电动车车牌号"
          maxlength="10"
        />
      </view>
      <view class="upload-row">
        <view class="upload-cell" @click="onUploadVehicle">
          <image
            v-if="form.vehicleUrl"
            :src="form.vehicleUrl"
            class="upload-img"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">+ 车辆照片</view>
        </view>
      </view>
    </view>

    <!-- 从业资格证 -->
    <view v-if="form.vehicleType === 'electric'" class="card">
      <view class="card__title">从业资格证</view>
      <view class="upload-row">
        <view class="upload-cell" @click="onUploadCert">
          <image
            v-if="form.certificateUrl"
            :src="form.certificateUrl"
            class="upload-img"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">+ 从业资格证</view>
        </view>
      </view>
    </view>

    <!-- 紧急联系人 -->
    <view class="card">
      <view class="card__title">紧急联系人（建议填写）</view>
      <view class="field">
        <text class="field__label">姓名</text>
        <input v-model="form.emergencyContact" class="field__input" maxlength="20" />
      </view>
      <view class="field">
        <text class="field__label">手机号</text>
        <input v-model="form.emergencyMobile" class="field__input" type="number" maxlength="11" />
      </view>
    </view>

    <button class="submit" :disabled="submitting" @click="onSubmit">
      {{ submitting ? '提交中...' : '提交审核' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { submitQualification } from '@/api/auth'
  import { chooseAndUploadImage } from '@/api/file'
  import { useAuthStore } from '@/store'
  import type { VehicleType, RiderQualification } from '@/types/biz'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 资质上传：实名 + 身份证正反 + 健康证 + 车辆 + 车牌 + 从业资格证（电动车必填）
   *   保证金缴纳页接续在 deposit.vue
   * @author 单 Agent V2.0 (P7 骑手端 / T7.7)
   */
  const authStore = useAuthStore()
  const submitting = ref(false)

  const vehicleOptions: { value: VehicleType; label: string }[] = [
    { value: 'electric', label: '电动车' },
    { value: 'bike', label: '自行车' },
    { value: 'walk', label: '步行' }
  ]

  const form = reactive<RiderQualification>({
    realName: authStore.user?.realName ?? '',
    idCardNo: '',
    idCardFrontUrl: '',
    idCardBackUrl: '',
    healthCertUrl: '',
    healthCertExpireAt: '',
    vehicleUrl: '',
    vehicleNo: '',
    vehicleType: 'electric',
    certificateUrl: '',
    serviceCityCode: authStore.user?.serviceCityCode ?? '',
    emergencyContact: '',
    emergencyMobile: ''
  })

  function onPickExpire(e: Event) {
    const detail = (e as Event & { detail: { value: string } }).detail
    form.healthCertExpireAt = detail.value
  }

  async function uploadOne(target: keyof RiderQualification): Promise<void> {
    try {
      const res = await chooseAndUploadImage({
        bizModule: 'rider-id-card',
        count: 1,
        sourceType: ['album', 'camera']
      })
      if (res.length > 0) {
        ;(form[target] as string) = res[0].url
      }
    } catch (e) {
      logger.warn('qual.upload.fail', { target: String(target), e: String(e) })
      uni.showToast({ title: '上传失败，请稍后重试', icon: 'none' })
    }
  }

  function onUploadIdFront() {
    void uploadOne('idCardFrontUrl')
  }
  function onUploadIdBack() {
    void uploadOne('idCardBackUrl')
  }
  function onUploadHealth() {
    void uploadOne('healthCertUrl')
  }
  function onUploadVehicle() {
    void uploadOne('vehicleUrl')
  }
  function onUploadCert() {
    void uploadOne('certificateUrl')
  }

  function validate(): boolean {
    if (!form.realName.trim()) return toast('请填写真实姓名')
    if (!/^\d{15,18}[Xx]?$/.test(form.idCardNo)) return toast('身份证号格式错误')
    if (!form.idCardFrontUrl) return toast('请上传身份证正面')
    if (!form.idCardBackUrl) return toast('请上传身份证反面')
    if (!form.healthCertUrl) return toast('请上传健康证照片')
    if (!form.healthCertExpireAt) return toast('请选择健康证有效期')
    if (!form.vehicleUrl) return toast('请上传车辆照片')
    if (form.vehicleType === 'electric' && !form.vehicleNo) return toast('请填写电动车车牌号')
    if (form.vehicleType === 'electric' && !form.certificateUrl) return toast('请上传从业资格证')
    return true
  }

  function toast(title: string): false {
    uni.showToast({ title, icon: 'none' })
    return false
  }

  async function onSubmit() {
    if (!validate()) return
    submitting.value = true
    try {
      const status = await submitQualification(form)
      authStore.setHealthCertExpireAt(form.healthCertExpireAt)
      track(TRACK.SUBMIT_QUALIFICATION, { vehicle: form.vehicleType })
      uni.showToast({
        title: status.status === 'approved' ? '审核已通过' : '已提交，等待审核',
        icon: 'success'
      })
      setTimeout(() => uni.reLaunch({ url: '/pages-login/deposit' }), 600)
    } catch (e) {
      logger.warn('qualification.submit.fail', { e: String(e) })
      uni.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-qualification {
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }

  .hint {
    padding: 16rpx 24rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-color-primary-dark;
    background: $uni-color-primary-light;
    border-radius: $uni-border-radius-base;
  }

  .card {
    padding: 32rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 24rpx;
      font-size: 30rpx;
      font-weight: 600;
      color: $uni-text-color;
    }
  }

  .field {
    margin-bottom: 24rpx;

    &__label {
      display: block;
      margin-bottom: 12rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__input {
      width: 100%;
      height: 72rpx;
      padding: 0 24rpx;
      font-size: 28rpx;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }

    &__picker {
      display: flex;
      align-items: center;
      width: 100%;
      height: 72rpx;
      padding: 0 24rpx;
      font-size: 28rpx;
      color: $uni-text-color;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }
  }

  .vehicle-row {
    display: flex;
    gap: 16rpx;
  }

  .vehicle-item {
    flex: 1;
    height: 72rpx;
    font-size: 26rpx;
    line-height: 72rpx;
    color: $uni-text-color;
    text-align: center;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: $uni-border-radius-base;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }

  .upload-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  .upload-cell {
    width: 220rpx;
    height: 160rpx;
    overflow: hidden;
    background: $uni-bg-color-grey;
    border: 2rpx dashed $uni-border-color;
    border-radius: $uni-border-radius-base;
  }

  .upload-img {
    width: 100%;
    height: 100%;
  }

  .upload-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .submit {
    width: 100%;
    height: 88rpx;
    margin-top: 32rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }
</style>
