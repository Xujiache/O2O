<template>
  <view class="page">
    <view class="head">
      <view class="head__icon">📷</view>
      <view class="head__title">取件核验</view>
      <view class="head__desc">{{ headerDesc }}</view>
    </view>

    <view v-if="frozen" class="frozen">
      <text>错误次数过多，{{ countdown }}s 后可继续</text>
    </view>

    <view class="card">
      <view class="card__title">取件码</view>
      <view class="code-row">
        <input
          v-for="(_, i) in codeArr"
          :key="i"
          v-model="codeArr[i]"
          class="code-cell"
          :class="{ 'code-cell--filled': codeArr[i] }"
          type="number"
          maxlength="1"
          :disabled="frozen"
          :focus="i === focusIdx"
          @input="onInput($event as Event, i)"
        />
      </view>
      <view class="code-tip">{{
        codeLen === 4 ? '请输入 4 位外卖取件码' : '请输入 6 位跑腿取件码'
      }}</view>
    </view>

    <view class="actions">
      <button class="ghost" @click="onScan">扫码取件</button>
      <button class="primary" :disabled="!fullCode || submitting || frozen" @click="onConfirm">
        {{ submitting ? '核验中...' : '确认取件' }}
      </button>
    </view>

    <view class="error-tip">已错 {{ errorCount }} 次，连错 3 次将冻结 30s</view>
  </view>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useOrderStore } from '@/store'
  import { getStorage, setStorage, removeStorage, STORAGE_KEYS } from '@/utils/storage'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 取件核验页：扫码 / 输入（4 或 6 位）+ 错码 3 次冻结 30s（防爆破）
   *   外卖订单：4 位商户取件码
   *   跑腿订单：6 位寄件方取件码
   * @author 单 Agent V2.0 (P7 骑手端 / T7.19)
   */
  const orderStore = useOrderStore()
  const orderNo = ref('')
  const codeLen = ref<4 | 6>(4)
  const codeArr = ref<string[]>([])
  const focusIdx = ref(0)
  const submitting = ref(false)
  const errorCount = ref(0)
  const frozen = ref(false)
  const countdown = ref(0)
  let frozenTimer: ReturnType<typeof setInterval> | null = null

  const fullCode = computed(() => codeArr.value.every((c) => /\d/.test(c)))

  const headerDesc = computed(() =>
    codeLen.value === 4 ? '请向商家索取 4 位取件码' : '请向寄件方索取 6 位取件码或扫码取件'
  )

  onLoad(async (q) => {
    const params = q as Record<string, string | undefined>
    orderNo.value = params.orderNo ?? ''
    /* 拉详情判断业务类型，决定取件码长度 */
    const detail = await orderStore.loadDetail(orderNo.value)
    codeLen.value = detail?.businessType === 2 ? 6 : 4
    codeArr.value = Array(codeLen.value).fill('')
    /* 恢复错误计数（防爆破） */
    const cnt =
      getStorage<{ count: number; until: number }>(
        STORAGE_KEYS.PICKUP_ERROR_COUNT + ':' + orderNo.value
      ) ?? null
    if (cnt) {
      errorCount.value = cnt.count
      if (cnt.until > Date.now()) {
        startFrozen(Math.ceil((cnt.until - Date.now()) / 1000))
      }
    }
  })

  function onInput(e: Event, i: number) {
    const v = (e.target as HTMLInputElement).value
    if (v && /\d/.test(v)) {
      codeArr.value[i] = v.slice(-1)
      if (i < codeLen.value - 1) focusIdx.value = i + 1
    } else {
      codeArr.value[i] = ''
    }
  }

  async function onScan() {
    try {
      const res = await new Promise<string>((resolve, reject) => {
        uni.scanCode({
          scanType: ['qrCode', 'barCode'],
          onlyFromCamera: false,
          success: (r) => resolve(String(r.result ?? '')),
          fail: (err) => reject(new Error(err.errMsg ?? '扫码失败'))
        })
      })
      const code = res.replace(/\D/g, '').slice(0, codeLen.value)
      if (code.length === codeLen.value) {
        codeArr.value = code.split('')
        track(TRACK.PICKUP_SCAN_SUCCESS, { orderNo: orderNo.value })
        await onConfirm()
      } else {
        uni.showToast({ title: '二维码内容不是合法取件码', icon: 'none' })
      }
    } catch (e) {
      logger.warn('pickup.scan.fail', { e: String(e) })
    }
  }

  async function onConfirm() {
    if (frozen.value) return
    const code = codeArr.value.join('')
    if (code.length !== codeLen.value) {
      uni.showToast({ title: `请输入 ${codeLen.value} 位取件码`, icon: 'none' })
      return
    }
    submitting.value = true
    const ok = await orderStore.pickup(orderNo.value, code)
    submitting.value = false
    if (ok) {
      removeStorage(STORAGE_KEYS.PICKUP_ERROR_COUNT + ':' + orderNo.value)
      uni.showToast({ title: '取件成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    /* 失败：递增错误计数 */
    errorCount.value += 1
    setStorage(
      STORAGE_KEYS.PICKUP_ERROR_COUNT + ':' + orderNo.value,
      { count: errorCount.value, until: 0 },
      1000 * 60 * 30
    )
    if (errorCount.value >= 3) {
      const until = Date.now() + 30_000
      setStorage(
        STORAGE_KEYS.PICKUP_ERROR_COUNT + ':' + orderNo.value,
        { count: errorCount.value, until },
        1000 * 60 * 30
      )
      startFrozen(30)
    }
    uni.showToast({ title: '取件码错误', icon: 'none' })
    /* 清空重输 */
    codeArr.value = Array(codeLen.value).fill('')
    focusIdx.value = 0
  }

  function startFrozen(sec: number) {
    frozen.value = true
    countdown.value = sec
    if (frozenTimer) clearInterval(frozenTimer)
    frozenTimer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) {
        frozen.value = false
        errorCount.value = 0
        removeStorage(STORAGE_KEYS.PICKUP_ERROR_COUNT + ':' + orderNo.value)
        if (frozenTimer) {
          clearInterval(frozenTimer)
          frozenTimer = null
        }
      }
    }, 1000)
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }

  .head {
    margin-bottom: 24rpx;
    text-align: center;

    &__icon {
      margin-top: 16rpx;
      font-size: 64rpx;
    }

    &__title {
      margin: 16rpx 0 8rpx;
      font-size: 32rpx;
      font-weight: 600;
    }

    &__desc {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }
  }

  .frozen {
    padding: 16rpx;
    margin-bottom: 24rpx;
    font-size: 26rpx;
    color: $uni-color-error;
    text-align: center;
    background: rgb(255 77 79 / 8%);
    border-radius: 12rpx;
  }

  .card {
    padding: 32rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 24rpx;
      font-size: 26rpx;
      color: $uni-text-color-grey;
      text-align: center;
    }
  }

  .code-row {
    display: flex;
    gap: 16rpx;
    justify-content: center;
    margin-bottom: 16rpx;
  }

  .code-cell {
    width: 80rpx;
    height: 96rpx;
    font-size: 40rpx;
    font-weight: 700;
    color: $uni-text-color;
    text-align: center;
    background: $uni-bg-color-grey;
    border: 2rpx solid $uni-border-color;
    border-radius: $uni-border-radius-base;

    &--filled {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }

  .code-tip {
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-bottom: 16rpx;
  }

  .ghost,
  .primary {
    flex: 1;
    height: 88rpx;
    font-size: 28rpx;
    line-height: 88rpx;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }

  .ghost {
    color: $uni-color-primary;
    background: #fff;
    border: 2rpx solid $uni-color-primary;
  }

  .primary {
    flex: 1.4;
    color: #fff;
    background: $uni-color-primary;

    &[disabled] {
      opacity: 0.6;
    }
  }

  .error-tip {
    font-size: 22rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }
</style>
