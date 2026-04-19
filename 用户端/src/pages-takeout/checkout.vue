<template>
  <view class="page co">
    <BizLoading v-if="loading && !shopCart" fullscreen text="加载结算..." />
    <BizError
      v-else-if="errMsg && !shopCart"
      :title="errMsg"
      desc="请检查购物车后重试"
      @retry="initData"
    />

    <template v-else-if="shopCart">
      <view class="co__card co__addr" @tap="onPickAddress">
        <template v-if="address">
          <view class="co__addr-head">
            <text class="co__addr-name">{{ address.name }}</text>
            <text class="co__addr-mobile">{{ maskMobile(address.mobile) }}</text>
            <text v-if="address.tag" class="co__addr-tag">{{ address.tag }}</text>
          </view>
          <text class="co__addr-detail">
            {{ address.province }}{{ address.city }}{{ address.district }}{{ address.detail }}
          </text>
        </template>
        <template v-else>
          <view class="co__addr-empty">
            <text>请选择收货地址</text>
            <text class="co__addr-arrow">›</text>
          </view>
        </template>
      </view>

      <view class="co__card co__shop">
        <view class="co__shop-head">
          <image class="co__shop-logo" :src="shopCart.shopLogo" mode="aspectFill" />
          <text class="co__shop-name">{{ shopCart.shopName }}</text>
        </view>

        <view v-for="(it, i) in shopCart.items" :key="`${it.skuId}_${i}`" class="co__item">
          <image class="co__item-img" :src="it.image" mode="aspectFill" />
          <view class="co__item-info">
            <text class="co__item-name">{{ it.productName }}</text>
            <text v-if="showSku(it)" class="co__item-sku">{{ it.skuName }}</text>
            <view class="co__item-row">
              <text class="co__item-price">{{ formatAmount(it.unitPrice) }}</text>
              <text class="co__item-count">×{{ it.count }}</text>
            </view>
          </view>
        </view>

        <view class="co__line">
          <text class="co__line-label">配送费</text>
          <text class="co__line-val">{{ formatAmount(shopCart.deliveryFee) }}</text>
        </view>
      </view>

      <view class="co__card">
        <view class="co__row" @tap="onPickDeliveryTime">
          <text class="co__row-label">配送时间</text>
          <view class="co__row-right">
            <text>{{ deliveryTimeText }}</text>
            <text class="co__row-arrow">›</text>
          </view>
        </view>
        <view class="co__row">
          <text class="co__row-label">餐具数量</text>
          <view class="co__qty">
            <view class="co__qty-btn" @tap="onUtensilDec">
              <text>-</text>
            </view>
            <text class="co__qty-val">{{ utensilCount }}</text>
            <view class="co__qty-btn" @tap="onUtensilInc">
              <text>+</text>
            </view>
          </view>
        </view>
        <view class="co__row co__row--remark">
          <text class="co__row-label">备注</text>
          <textarea
            v-model="remark"
            class="co__remark"
            placeholder="请输入备注（最多 100 字）"
            maxlength="100"
            auto-height
          />
        </view>
      </view>

      <view class="co__card">
        <view class="co__row" @tap="onPickCoupon">
          <text class="co__row-label">优惠券</text>
          <view class="co__row-right">
            <text :class="{ 'co__row-coupon': hasCoupon }">{{ couponText }}</text>
            <text class="co__row-arrow">›</text>
          </view>
        </view>
        <view class="co__row">
          <text class="co__row-label">开发票</text>
          <switch
            :checked="invoiceEnabled"
            color="#FF6A1A"
            class="co__switch"
            @change="onInvoiceSwitch"
          />
        </view>
        <view v-if="invoiceEnabled" class="co__row" @tap="onPickInvoice">
          <text class="co__row-label">抬头</text>
          <view class="co__row-right">
            <text>{{ invoiceText }}</text>
            <text class="co__row-arrow">›</text>
          </view>
        </view>
      </view>

      <view class="co__card">
        <view class="co__pay" :class="{ 'co__pay--active': payMethod === 1 }" @tap="payMethod = 1">
          <text>微信支付</text>
          <text class="co__pay-mark">{{ payMethod === 1 ? '●' : '○' }}</text>
        </view>
        <view class="co__pay" :class="{ 'co__pay--active': payMethod === 3 }" @tap="payMethod = 3">
          <text>余额支付</text>
          <text class="co__pay-mark">{{ payMethod === 3 ? '●' : '○' }}</text>
        </view>
      </view>

      <view class="co__card co__detail">
        <view class="co__detail-row">
          <text>商品金额</text>
          <text>{{ formatAmount(preview.itemsAmount) }}</text>
        </view>
        <view class="co__detail-row">
          <text>配送费</text>
          <text>{{ formatAmount(preview.deliveryFee) }}</text>
        </view>
        <view v-if="hasDiscount" class="co__detail-row co__detail-row--cut">
          <text>优惠</text>
          <text>-{{ formatAmount(preview.discountAmount) }}</text>
        </view>
        <view class="co__detail-row co__detail-row--total">
          <text>合计</text>
          <text>{{ formatAmount(preview.payAmount) }}</text>
        </view>
      </view>

      <view class="co__bar">
        <view class="co__bar-amount">
          <text class="co__bar-label">合计</text>
          <text class="co__bar-val">{{ formatAmount(preview.payAmount) }}</text>
        </view>
        <view
          class="co__bar-submit"
          :class="{ 'co__bar-submit--disabled': !canSubmit }"
          @tap="onSubmit"
        >
          <text>{{ submitting ? '提交中...' : '提交订单' }}</text>
        </view>
      </view>
    </template>

    <BizDialog
      v-model:visible="timePickerVisible"
      title="选择配送时间"
      :show-cancel="false"
      confirm-text="关闭"
    >
      <view class="co__time-list">
        <view
          class="co__time-opt"
          :class="{ 'co__time-opt--active': deliveryTime === 'immediate' }"
          @tap="onSelectTime('immediate')"
        >
          <text>立即送达</text>
        </view>
        <view
          v-for="opt in scheduleOptions"
          :key="opt.value"
          class="co__time-opt"
          :class="{ 'co__time-opt--active': deliveryTime === opt.value }"
          @tap="onSelectTime(opt.value)"
        >
          <text>{{ opt.label }}</text>
        </view>
      </view>
    </BizDialog>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-takeout/checkout.vue
   * @stage P5/T5.18 (Sprint 3)
   * @desc 外卖下单结算：地址 / 时间 / 餐具 / 备注 / 券 / 发票 / 支付 / 提交
   * @author 单 Agent V2.0
   */
  import { ref, computed, reactive } from 'vue'
  import { onLoad, onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizError from '@/components/biz/BizError.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import { createTakeoutOrder, previewDiscount } from '@/api/order'
  import { bestMatchCoupon } from '@/api/coupon'
  import { listInvoiceHeaders } from '@/api/invoice'
  import { getSubscribeTemplates } from '@/api/msg'
  import { useCartStore } from '@/store/cart'
  import { useLocationStore } from '@/store/location'
  import type { ShopCart, CartItem, UserAddress, InvoiceHeader } from '@/types/biz'
  import { formatAmount, maskMobile, formatTime, addAmount, compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { requestSubscribe } from '@/utils/subscribe'

  const cart = useCartStore()
  const location = useLocationStore()

  const shopId = ref<string>('')
  const loading = ref<boolean>(false)
  const errMsg = ref<string>('')
  const submitting = ref<boolean>(false)
  let lastSubmitAt = 0

  const shopCart = computed<ShopCart | null>(() =>
    shopId.value ? cart.getShopCart(shopId.value) : null
  )

  const address = computed<UserAddress | null>(() => location.currentAddress)

  const utensilCount = ref<number>(1)
  const remark = ref<string>('')
  const deliveryTime = ref<string>('immediate')
  const timePickerVisible = ref<boolean>(false)

  const userCouponId = ref<string>('')
  const couponName = ref<string>('')
  const couponReduce = ref<string>('')
  const couponDefaulted = ref<boolean>(false)

  const invoiceEnabled = ref<boolean>(false)
  const invoiceHeaders = ref<InvoiceHeader[]>([])
  const invoiceHeaderId = ref<string>('')

  const payMethod = ref<1 | 3>(1)

  const preview = reactive({
    itemsAmount: '0.00',
    deliveryFee: '0.00',
    discountAmount: '0.00',
    payAmount: '0.00'
  })

  const scheduleOptions = computed<Array<{ value: string; label: string }>>(() => {
    const out: Array<{ value: string; label: string }> = []
    const now = Date.now()
    /* 30 分钟为步长，预生成接下来 6 个时段 */
    for (let i = 1; i <= 6; i++) {
      const t = new Date(now + i * 30 * 60 * 1000)
      const iso = t.toISOString()
      out.push({ value: iso, label: formatTime(iso, 'MM-DD HH:mm') })
    }
    return out
  })

  const deliveryTimeText = computed<string>(() => {
    if (deliveryTime.value === 'immediate') return '立即送达'
    return formatTime(deliveryTime.value, 'MM-DD HH:mm')
  })

  const hasCoupon = computed<boolean>(() => Boolean(userCouponId.value))

  const couponText = computed<string>(() => {
    if (!userCouponId.value) return '不使用优惠券'
    if (couponName.value && couponReduce.value) {
      return `${couponName.value} 减 ${formatAmount(couponReduce.value)}`
    }
    return couponName.value || '已选择'
  })

  const invoiceText = computed<string>(() => {
    if (!invoiceHeaderId.value) return '请选择'
    const h = invoiceHeaders.value.find((x) => x.id === invoiceHeaderId.value)
    return h?.title ?? '请选择'
  })

  const canSubmit = computed<boolean>(() => {
    if (submitting.value) return false
    if (!address.value) return false
    if (!shopCart.value || shopCart.value.items.length === 0) return false
    return true
  })

  /** 优惠是否大于 0（用 currency.js 比较，避免 number 浮点；P5-REVIEW-01 R1 / I-03） */
  const hasDiscount = computed<boolean>(() => {
    return compareAmount(preview.discountAmount, '0') > 0
  })

  onLoad((options) => {
    const sid = (options?.shopId as string) ?? ''
    if (!sid) {
      uni.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    shopId.value = sid
  })

  onShow(() => {
    void initData()
  })

  async function initData() {
    if (!shopId.value) return
    if (!shopCart.value) {
      errMsg.value = '购物车为空'
      uni.showToast({ title: '购物车为空', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    loading.value = true
    errMsg.value = ''
    try {
      /* 拉取发票抬头列表（失败静默） */
      try {
        invoiceHeaders.value = await listInvoiceHeaders()
        const def = invoiceHeaders.value.find((h) => h.isDefault === 1)
        if (def && !invoiceHeaderId.value) invoiceHeaderId.value = def.id
      } catch (e) {
        logger.warn('checkout.invoice.list.fail', { e: String(e) })
      }
      /* 取消选择 / 用户未操作时，自动推荐最优券（仅一次） */
      if (!couponDefaulted.value) {
        couponDefaulted.value = true
        try {
          const total = cart.subtotal(shopId.value)
          const r = await bestMatchCoupon({
            orderType: 1,
            shopId: shopId.value,
            totalAmount: total
          })
          if (r.userCouponId) {
            userCouponId.value = r.userCouponId
            couponName.value = r.couponName ?? ''
            couponReduce.value = r.reduce ?? ''
          }
        } catch (e) {
          logger.warn('checkout.coupon.match.fail', { e: String(e) })
        }
      }
      await refreshPreview()
    } catch (e) {
      errMsg.value = '初始化失败'
      logger.warn('checkout.init.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  async function refreshPreview() {
    if (!shopCart.value) return
    const itemsAmount = cart.subtotal(shopId.value)
    try {
      const r = await previewDiscount({
        orderType: 1,
        shopId: shopId.value,
        itemsAmount,
        deliveryFee: shopCart.value.deliveryFee,
        userCouponIds: userCouponId.value ? [userCouponId.value] : undefined
      })
      preview.itemsAmount = r.itemsAmount
      preview.deliveryFee = r.deliveryFee
      preview.discountAmount = r.discountAmount
      preview.payAmount = r.payAmount
    } catch (e) {
      /* 失败时回退到本地计算（P5-REVIEW-01 R1 / I-03：用 currency.js 大数加法避免浮点） */
      preview.itemsAmount = itemsAmount
      preview.deliveryFee = shopCart.value.deliveryFee
      preview.discountAmount = '0.00'
      preview.payAmount = addAmount(itemsAmount, shopCart.value.deliveryFee)
      logger.warn('checkout.preview.fail', { e: String(e) })
    }
  }

  function showSku(it: CartItem): boolean {
    return Boolean(it.skuName) && it.skuName !== '默认'
  }

  function onPickAddress() {
    uni.navigateTo({ url: '/pages-user/address-list?selectMode=1' })
  }

  function onPickDeliveryTime() {
    timePickerVisible.value = true
  }

  function onSelectTime(v: string) {
    deliveryTime.value = v
    timePickerVisible.value = false
  }

  function onUtensilInc() {
    if (utensilCount.value < 20) utensilCount.value += 1
  }

  function onUtensilDec() {
    if (utensilCount.value > 0) utensilCount.value -= 1
  }

  function onPickCoupon() {
    if (!shopCart.value) return
    track(TRACK.CLICK_COUPON, { shopId: shopId.value })
    const total = cart.subtotal(shopId.value)
    uni.navigateTo({
      url: `/pages-takeout/coupons-select?shopId=${shopId.value}&total=${total}`,
      events: {
        couponSelected: (data: { userCouponId: string; couponName?: string; reduce?: string }) => {
          userCouponId.value = data.userCouponId ?? ''
          couponName.value = data.couponName ?? ''
          couponReduce.value = data.reduce ?? ''
          void refreshPreview()
        }
      }
    })
  }

  function onInvoiceSwitch(e: { detail: { value: boolean } }) {
    invoiceEnabled.value = e.detail.value
    if (invoiceEnabled.value && !invoiceHeaderId.value && invoiceHeaders.value.length === 0) {
      uni.showToast({ title: '请先添加发票抬头', icon: 'none' })
    }
  }

  function onPickInvoice() {
    uni.navigateTo({ url: '/pages-user/invoice-header?selectMode=1' })
  }

  async function onSubmit() {
    if (!canSubmit.value) {
      if (!address.value) uni.showToast({ title: '请选择收货地址', icon: 'none' })
      return
    }
    /* 防重复提交 throttle 500ms */
    const now = Date.now()
    if (now - lastSubmitAt < 500) return
    lastSubmitAt = now

    if (invoiceEnabled.value && !invoiceHeaderId.value) {
      uni.showToast({ title: '请选择发票抬头', icon: 'none' })
      return
    }

    track(TRACK.CLICK_PLACE_ORDER, { shopId: shopId.value, total: preview.payAmount })

    /* 下单前请求订阅消息授权 */
    try {
      const tmpl = await getSubscribeTemplates()
      if (tmpl?.tmplIds && tmpl.tmplIds.length > 0) {
        await requestSubscribe(tmpl.tmplIds)
      }
    } catch (e) {
      logger.warn('checkout.subscribe.fail', { e: String(e) })
    }

    submitting.value = true
    try {
      const items = (shopCart.value?.items ?? []).map((it) => ({
        productId: it.productId,
        skuId: it.skuId,
        qty: it.count,
        spec: it.spec
      }))
      const order = await createTakeoutOrder({
        shopId: shopId.value,
        addressId: address.value!.id,
        items,
        userCouponId: userCouponId.value || undefined,
        remark: remark.value || undefined,
        deliveryTime: deliveryTime.value === 'immediate' ? 'immediate' : deliveryTime.value,
        utensilCount: utensilCount.value,
        invoiceHeaderId: invoiceEnabled.value ? invoiceHeaderId.value : undefined,
        useBalance: payMethod.value === 3 ? 1 : 0
      })
      track(TRACK.PLACE_ORDER_SUCCESS, { orderNo: order.orderNo, shopId: shopId.value })
      cart.clearShopCart(shopId.value)
      uni.redirectTo({ url: `/pages/pay/index?orderNo=${order.orderNo}` })
    } catch (e) {
      track(TRACK.PLACE_ORDER_FAIL, { reason: String(e) })
      logger.warn('checkout.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .co {
    min-height: 100vh;
    padding: 16rpx 16rpx 200rpx;
    background: $color-bg-page;

    &__card {
      padding: 24rpx 32rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__addr {
      display: flex;
      flex-direction: column;
      gap: 12rpx;
    }

    &__addr-head {
      display: flex;
      gap: 16rpx;
      align-items: center;
    }

    &__addr-name {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__addr-mobile {
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__addr-tag {
      padding: 2rpx 12rpx;
      font-size: $font-size-xs;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-sm;
    }

    &__addr-detail {
      font-size: $font-size-base;
      line-height: 1.4;
      color: $color-text-regular;
    }

    &__addr-empty {
      @include flex-between;

      padding: 16rpx 0;
      font-size: $font-size-base;
      color: $color-text-secondary;
    }

    &__addr-arrow {
      font-size: $font-size-md;
      color: $color-text-secondary;
    }

    &__shop-head {
      display: flex;
      gap: 12rpx;
      align-items: center;
      padding-bottom: 16rpx;
      border-bottom: 1rpx solid $color-divider;
    }

    &__shop-logo {
      width: 56rpx;
      height: 56rpx;
      border-radius: $radius-sm;
    }

    &__shop-name {
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__item {
      display: flex;
      gap: 16rpx;
      padding: 16rpx 0;
      border-bottom: 1rpx solid $color-divider;
    }

    &__item-img {
      flex-shrink: 0;
      width: 100rpx;
      height: 100rpx;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__item-info {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
    }

    &__item-name {
      @include ellipsis(1);

      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__item-sku {
      @include ellipsis(1);

      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__item-row {
      @include flex-between;
    }

    &__item-price {
      font-size: $font-size-base;
      color: $color-primary;
    }

    &__item-count {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__line {
      @include flex-between;

      padding: 16rpx 0 0;
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__line-val {
      color: $color-text-primary;
    }

    &__row {
      @include flex-between;

      min-height: 80rpx;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }

      &--remark {
        flex-direction: column;
        align-items: flex-start;
        padding: 16rpx 0;
      }
    }

    &__row-label {
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__row-right {
      display: flex;
      gap: 8rpx;
      align-items: center;
      max-width: 60%;
      font-size: $font-size-base;
      color: $color-text-regular;
    }

    &__row-coupon {
      color: $color-primary;
    }

    &__row-arrow {
      font-size: $font-size-md;
      color: $color-text-secondary;
    }

    &__remark {
      width: 100%;
      min-height: 120rpx;
      margin-top: 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-sm;
      padding: 16rpx;
      box-sizing: border-box;
    }

    &__qty {
      display: flex;
      gap: 16rpx;
      align-items: center;
    }

    &__qty-btn {
      @include flex-center;

      width: 48rpx;
      height: 48rpx;
      font-size: $font-size-md;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-circle;
    }

    &__qty-val {
      min-width: 48rpx;
      font-size: $font-size-base;
      text-align: center;
    }

    &__switch {
      transform: scale(0.85);
    }

    &__pay {
      @include flex-between;

      min-height: 80rpx;
      font-size: $font-size-base;
      color: $color-text-regular;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }

      &--active {
        color: $color-text-primary;
      }
    }

    &__pay-mark {
      font-size: $font-size-md;
      color: $color-primary;
    }

    &__detail-row {
      @include flex-between;

      padding: 12rpx 0;
      font-size: $font-size-base;
      color: $color-text-regular;

      &--cut {
        color: $color-warning;
      }

      &--total {
        margin-top: 8rpx;
        font-size: $font-size-md;
        font-weight: $font-weight-bold;
        color: $color-text-primary;
        border-top: 1rpx solid $color-divider;
        padding-top: 16rpx;
      }
    }

    &__bar {
      @include flex-between;

      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: $z-index-fixed;
      gap: 16rpx;
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.08);

      @include safe-area-bottom;
    }

    &__bar-amount {
      display: flex;
      gap: 8rpx;
      align-items: baseline;
    }

    &__bar-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__bar-val {
      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__bar-submit {
      @include flex-center;

      min-width: 240rpx;
      height: 80rpx;
      padding: 0 32rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-xl;

      &--disabled {
        background: $color-text-disabled;
      }
    }

    &__time-list {
      display: flex;
      flex-direction: column;
      gap: 12rpx;
      padding: 16rpx 0;
    }

    &__time-opt {
      @include flex-center;

      padding: 16rpx 0;
      font-size: $font-size-base;
      color: $color-text-regular;
      background: $color-bg-page;
      border-radius: $radius-md;

      &--active {
        color: $color-primary;
        background: rgba(255, 106, 26, 0.08);
      }
    }
  }
</style>
