<template>
  <view class="page order-detail">
    <BizLoading v-if="loading && !order" fullscreen text="加载中..." />
    <BizError v-else-if="loadError && !order" :title="loadError" @retry="onRetry" />

    <template v-if="order">
      <view class="order-detail__status" :class="`order-detail__status--s${order.status}`">
        <view class="order-detail__status-name">
          <text>{{ statusText(order.status) }}</text>
        </view>
        <text class="order-detail__status-desc">{{ statusDesc }}</text>
        <view v-if="showCountdown" class="order-detail__status-countdown">
          <text>剩余 {{ countdownText }}</text>
        </view>
        <view v-if="riderInfo" class="order-detail__rider">
          <view class="order-detail__rider-info">
            <text class="order-detail__rider-name">骑手 {{ riderInfo.riderName }}</text>
            <text class="order-detail__rider-mobile">{{ maskMobile(riderInfo.riderMobile) }}</text>
          </view>
          <view v-if="riderInfo.riderMobile" class="order-detail__rider-call" @tap="onContactRider">
            <text>联系骑手</text>
          </view>
        </view>
      </view>

      <template v-if="isTakeout(order)">
        <view class="card order-detail__shop">
          <image class="order-detail__shop-logo" :src="order.shopLogo" mode="aspectFill" />
          <view class="order-detail__shop-info">
            <text class="order-detail__shop-name">{{ order.shopName }}</text>
            <text v-if="order.deliveryTime" class="order-detail__shop-eta">
              送达时间：{{ deliveryTimeText(order.deliveryTime) }}
            </text>
          </view>
          <view class="order-detail__shop-call" @tap="onContactMerchant">
            <text>联系</text>
          </view>
        </view>

        <view class="card order-detail__items">
          <view v-for="it in order.items" :key="it.skuId + it.productId" class="order-detail__item">
            <image class="order-detail__item-img" :src="it.image ?? ''" mode="aspectFill" />
            <view class="order-detail__item-info">
              <text class="order-detail__item-name">{{ it.productName }}</text>
              <text v-if="it.skuName" class="order-detail__item-sku">{{ it.skuName }}</text>
            </view>
            <view class="order-detail__item-price">
              <text class="order-detail__item-amt">{{ formatAmount(it.subtotal) }}</text>
              <text class="order-detail__item-qty">x{{ it.qty }}</text>
            </view>
          </view>
        </view>

        <view class="card order-detail__address">
          <view class="order-detail__addr-head">
            <text class="order-detail__addr-label">收货地址</text>
          </view>
          <view class="order-detail__addr-body">
            <view class="order-detail__addr-row">
              <text class="order-detail__addr-name">{{ order.address.name }}</text>
              <text class="order-detail__addr-mobile">
                {{ maskMobile(order.address.mobile) }}
              </text>
            </view>
            <text class="order-detail__addr-detail">{{ fullAddress(order.address) }}</text>
          </view>
        </view>

        <view v-if="order.remark" class="card order-detail__remark">
          <text class="order-detail__remark-label">备注：</text>
          <text class="order-detail__remark-text">{{ order.remark }}</text>
        </view>

        <view class="card order-detail__amount">
          <view class="order-detail__amt-row">
            <text>商品金额</text>
            <text>{{ formatAmount(order.itemsAmount) }}</text>
          </view>
          <view class="order-detail__amt-row">
            <text>配送费</text>
            <text>{{ formatAmount(order.deliveryFee) }}</text>
          </view>
          <view v-if="hasDiscount(order.discountAmount)" class="order-detail__amt-row">
            <text>优惠</text>
            <text class="order-detail__amt-discount">
              -{{ formatAmount(order.discountAmount) }}
            </text>
          </view>
          <view class="order-detail__amt-row order-detail__amt-row--total">
            <text>实付款</text>
            <text class="order-detail__amt-total">{{ formatAmount(order.payAmount) }}</text>
          </view>
        </view>
      </template>

      <template v-else-if="isErrand(order)">
        <view class="card order-detail__service">
          <text class="order-detail__service-label">服务类型</text>
          <text class="order-detail__service-name">
            {{ errandTypeText(order.serviceType) }}
          </text>
        </view>

        <view class="card order-detail__address">
          <view class="order-detail__addr-head">
            <text class="order-detail__addr-label">取件地址</text>
          </view>
          <view class="order-detail__addr-body">
            <view class="order-detail__addr-row">
              <text class="order-detail__addr-name">{{ order.pickupAddress.name }}</text>
              <text class="order-detail__addr-mobile">
                {{ maskMobile(order.pickupAddress.mobile) }}
              </text>
            </view>
            <text class="order-detail__addr-detail">{{ order.pickupAddress.detail }}</text>
          </view>
        </view>

        <view v-if="order.deliveryAddress" class="card order-detail__address">
          <view class="order-detail__addr-head">
            <text class="order-detail__addr-label">送达地址</text>
          </view>
          <view class="order-detail__addr-body">
            <view class="order-detail__addr-row">
              <text class="order-detail__addr-name">{{ order.deliveryAddress.name }}</text>
              <text class="order-detail__addr-mobile">
                {{ maskMobile(order.deliveryAddress.mobile) }}
              </text>
            </view>
            <text class="order-detail__addr-detail">{{ order.deliveryAddress.detail }}</text>
          </view>
        </view>

        <view v-if="order.itemDescription" class="card order-detail__item-desc">
          <text class="order-detail__item-desc-label">物品描述：</text>
          <text class="order-detail__item-desc-text">{{ order.itemDescription }}</text>
        </view>

        <view v-if="order.pickupCode" class="card order-detail__code">
          <text class="order-detail__code-label">取件码</text>
          <text class="order-detail__code-value">{{ order.pickupCode }}</text>
        </view>

        <view v-if="order.remark" class="card order-detail__remark">
          <text class="order-detail__remark-label">备注：</text>
          <text class="order-detail__remark-text">{{ order.remark }}</text>
        </view>

        <view class="card order-detail__amount">
          <view class="order-detail__amt-row">
            <text>起步价</text>
            <text>{{ formatAmount(order.baseFee) }}</text>
          </view>
          <view v-if="parseFloat(order.distanceFee) > 0" class="order-detail__amt-row">
            <text>距离费</text>
            <text>{{ formatAmount(order.distanceFee) }}</text>
          </view>
          <view v-if="parseFloat(order.weightFee) > 0" class="order-detail__amt-row">
            <text>重量费</text>
            <text>{{ formatAmount(order.weightFee) }}</text>
          </view>
          <view v-if="parseFloat(order.serviceFee) > 0" class="order-detail__amt-row">
            <text>服务费</text>
            <text>{{ formatAmount(order.serviceFee) }}</text>
          </view>
          <view
            v-if="order.insuranceFee && parseFloat(order.insuranceFee) > 0"
            class="order-detail__amt-row"
          >
            <text>保价费</text>
            <text>{{ formatAmount(order.insuranceFee) }}</text>
          </view>
          <view class="order-detail__amt-row order-detail__amt-row--total">
            <text>实付款</text>
            <text class="order-detail__amt-total">{{ formatAmount(order.payAmount) }}</text>
          </view>
        </view>
      </template>

      <view class="card order-detail__meta">
        <view class="order-detail__meta-row">
          <text class="order-detail__meta-label">订单编号</text>
          <text class="order-detail__meta-value">{{ order.orderNo }}</text>
        </view>
        <view class="order-detail__meta-row">
          <text class="order-detail__meta-label">下单时间</text>
          <text class="order-detail__meta-value">{{ formatTime(order.createdAt) }}</text>
        </view>
        <view v-if="order.finishedAt" class="order-detail__meta-row">
          <text class="order-detail__meta-label">完成时间</text>
          <text class="order-detail__meta-value">{{ formatTime(order.finishedAt) }}</text>
        </view>
      </view>

      <view class="order-detail__bottom-spacer" />

      <view v-if="actionButtons.length > 0" class="order-detail__bottom safe-bottom">
        <view
          v-for="btn in actionButtons"
          :key="btn.code"
          class="order-detail__bottom-btn"
          :class="{ 'order-detail__bottom-btn--primary': btn.primary }"
          @tap="onAction(btn.code)"
        >
          <text>{{ btn.label }}</text>
        </view>
      </view>
    </template>

    <BizDialog
      v-model:visible="cancelDialog.visible"
      title="取消订单"
      :show-cancel="true"
      confirm-text="确认取消"
      cancel-text="再想想"
      @confirm="confirmCancel"
    >
      <view class="order-detail__cancel-form">
        <text class="order-detail__cancel-tip">请填写取消原因</text>
        <textarea
          v-model="cancelDialog.reason"
          class="order-detail__cancel-input"
          placeholder="请输入取消原因"
          maxlength="100"
          :auto-height="true"
        />
      </view>
    </BizDialog>

    <BizDialog
      v-model:visible="confirmDialog.visible"
      title="确认收货"
      content="确认已收到商品/服务？确认后无法撤回。"
      confirm-text="确认收货"
      @confirm="doConfirmReceive"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-order/detail.vue
   * @stage P5/T5.28 (Sprint 5)
   * @desc 订单详情：状态卡 + 内容（外卖/跑腿）+ 金额明细 + 状态机驱动底部按钮
   *   功能：去支付/取消/催单/确认/再来一单/去评价/申请售后/投诉/联系骑手/查看配送
   *   实时刷新：ws.subscribe('order:status:changed') + 5s 轮询兜底
   * @author 单 Agent V2.0
   */
  import { ref, computed, onUnmounted } from 'vue'
  import { onLoad, onShow, onPullDownRefresh, onHide } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizError from '@/components/biz/BizError.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import { getOrderDetail, cancelOrder, confirmOrder, urgeOrder, reorder } from '@/api/order'
  import { useOrderStore } from '@/store/order'
  import { useCartStore } from '@/store/cart'
  import { ws } from '@/utils/ws'
  import { ORDER_STATUS_TEXT } from '@/types/biz'
  import type { OrderTakeout, OrderErrand, OrderStatus, ErrandServiceType } from '@/types/biz'
  import { formatAmount, formatTime, maskMobile } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /** 取消按钮 throttle 间隔（防止重复点击） */
  const ACTION_THROTTLE_MS = 500
  /** 兜底轮询间隔 */
  const POLL_INTERVAL_MS = 5000

  const order = ref<OrderTakeout | OrderErrand | null>(null)
  const orderNo = ref<string>('')
  const loading = ref<boolean>(false)
  const loadError = ref<string>('')
  const lastActionAt = ref<number>(0)
  const now = ref<number>(Date.now())

  const cancelDialog = ref<{ visible: boolean; reason: string }>({
    visible: false,
    reason: ''
  })
  const confirmDialog = ref<{ visible: boolean }>({ visible: false })

  let unsub: (() => void) | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  onLoad((options?: Record<string, string>) => {
    orderNo.value = String(options?.orderNo ?? '')
    if (!orderNo.value) {
      uni.showToast({ title: '缺少订单编号', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    track(TRACK.VIEW_ORDER_DETAIL, { orderNo: orderNo.value })
    void onLoad_()
    subscribeWs()
    startPolling()
    startCountdown()
  })

  /**
   * 从其他页返回时（onHide 已停过 polling/countdown），按需重新启动
   * P5-REVIEW-01 R1 / I-06：仅在订单进行中（status ∈ [0,10,20,30,40,50]）才轮询
   * 已完成 / 已取消 / 售后中订单不轮询，节省请求
   */
  onShow(() => {
    if (!orderNo.value || !order.value) return
    void fetchDetail(false)
    const inProgress = [0, 10, 20, 30, 40, 50].includes(order.value.status)
    if (inProgress) {
      startPolling()
      startCountdown()
    }
  })

  onHide(() => {
    teardownPolling()
    teardownCountdown()
  })

  onUnmounted(() => {
    if (unsub) unsub()
    teardownPolling()
    teardownCountdown()
  })

  onPullDownRefresh(() => {
    void fetchDetail(true).finally(() => uni.stopPullDownRefresh())
  })

  /** 首屏加载（与 onLoad 钩子同名冲突，故使用别名） */
  async function onLoad_() {
    await fetchDetail(true)
  }

  /** BizError 重试回调 */
  function onRetry() {
    void fetchDetail(true)
  }

  function subscribeWs() {
    unsub = ws.subscribe<{ orderNo: string; status?: OrderStatus }>(
      'order:status:changed',
      (event) => {
        if (event.data?.orderNo === orderNo.value) {
          void fetchDetail(false)
        }
      }
    )
  }

  function startPolling() {
    teardownPolling()
    pollTimer = setInterval(() => {
      if (!order.value) return
      const inProgress = [0, 10, 20, 30, 40, 50].includes(order.value.status)
      if (inProgress) void fetchDetail(false)
    }, POLL_INTERVAL_MS)
  }

  function teardownPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function startCountdown() {
    teardownCountdown()
    countdownTimer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }

  function teardownCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  async function fetchDetail(showLoading: boolean) {
    if (!orderNo.value) return
    if (showLoading) loading.value = true
    try {
      const r = await getOrderDetail(orderNo.value)
      order.value = r
      loadError.value = ''
      const orderStore = useOrderStore()
      orderStore.setLastViewedOrderNo(orderNo.value)
      orderStore.setLastDetail(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('order.detail.fail', { orderNo: orderNo.value, e: msg })
      if (showLoading) loadError.value = msg || '加载失败'
    } finally {
      if (showLoading) loading.value = false
    }
  }

  function isTakeout(o: OrderTakeout | OrderErrand): o is OrderTakeout {
    return o.orderType === 1
  }

  function isErrand(o: OrderTakeout | OrderErrand): o is OrderErrand {
    return o.orderType === 2
  }

  function statusText(s: OrderStatus): string {
    return ORDER_STATUS_TEXT[s] ?? '未知'
  }

  function errandTypeText(t: ErrandServiceType): string {
    return ['', '帮送', '帮取', '帮买', '帮排队'][t] ?? ''
  }

  function deliveryTimeText(t: string | null): string {
    if (!t) return '立即送达'
    if (t === 'immediate') return '立即送达'
    return formatTime(t, 'MM-DD HH:mm')
  }

  function fullAddress(addr: {
    province: string
    city: string
    district: string
    detail: string
  }): string {
    return `${addr.province ?? ''}${addr.city ?? ''}${addr.district ?? ''}${addr.detail ?? ''}`
  }

  function hasDiscount(amount: string | null | undefined): boolean {
    return !!amount && parseFloat(amount) > 0
  }

  /** 状态描述 */
  const statusDesc = computed<string>(() => {
    if (!order.value) return ''
    switch (order.value.status) {
      case 0:
        return '请尽快支付，超时订单将自动关闭'
      case 5:
        return '订单已关闭'
      case 10:
        return '已支付，等待商家接单'
      case 20:
        return '商家已接单，正在准备'
      case 30:
        return '商家已出餐，等待骑手取货'
      case 40:
        return '骑手配送中，请保持电话畅通'
      case 50:
        return '商品已送达，请确认收货'
      case 55:
        return '订单已完成，欢迎再次光临'
      case 60:
        return order.value.cancelReason ? `已取消：${order.value.cancelReason}` : '订单已取消'
      case 70:
        return '售后处理中'
      default:
        return ''
    }
  })

  /** 是否显示倒计时 */
  const showCountdown = computed<boolean>(() => order.value?.status === 0)

  /** 待支付倒计时（默认 15 分钟） */
  const PAY_TIMEOUT_MS = 15 * 60 * 1000
  const countdownText = computed<string>(() => {
    if (!order.value || order.value.status !== 0) return ''
    const created = new Date(order.value.createdAt).getTime()
    const left = created + PAY_TIMEOUT_MS - now.value
    if (left <= 0) return '00:00'
    const m = Math.floor(left / 60000)
    const s = Math.floor((left % 60000) / 1000)
    return `${pad(m)}:${pad(s)}`
  })

  function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n)
  }

  /** 骑手信息（外卖/跑腿统一） */
  const riderInfo = computed<{ riderName: string; riderMobile: string } | null>(() => {
    if (!order.value) return null
    const inDelivery = [20, 30, 40, 50].includes(order.value.status)
    if (!inDelivery) return null
    const rn = order.value.riderName
    const rm = order.value.riderMobile
    if (!rn || !rm) return null
    return { riderName: rn, riderMobile: rm }
  })

  interface ActionBtn {
    code:
      | 'pay'
      | 'cancel'
      | 'urge'
      | 'contact_merchant'
      | 'contact_rider'
      | 'view_track'
      | 'confirm'
      | 'reorder'
      | 'review'
      | 'after_sale'
      | 'complaint'
      | 'view_after_sale'
      | 'apply_arbitrate'
    label: string
    primary?: boolean
  }

  /** 状态机映射底部按钮 */
  const actionButtons = computed<ActionBtn[]>(() => {
    const o = order.value
    if (!o) return []
    switch (o.status) {
      case 0:
        return [
          { code: 'cancel', label: '取消订单' },
          { code: 'pay', label: '去支付', primary: true }
        ]
      case 10:
        return [
          { code: 'cancel', label: '取消订单' },
          { code: 'urge', label: '催单', primary: true }
        ]
      case 20:
      case 30:
      case 40: {
        const btns: ActionBtn[] = []
        if (isTakeout(o)) {
          btns.push({ code: 'contact_merchant', label: '联系商家' })
        }
        btns.push({ code: 'contact_rider', label: '联系骑手' })
        btns.push({ code: 'view_track', label: '查看配送', primary: true })
        return btns
      }
      case 50:
        return [
          { code: 'contact_rider', label: '联系骑手' },
          { code: 'confirm', label: '确认收货', primary: true }
        ]
      case 55: {
        const btns: ActionBtn[] = [
          { code: 'complaint', label: '投诉' },
          { code: 'after_sale', label: '申请售后' },
          { code: 'review', label: '去评价' }
        ]
        if (isTakeout(o)) {
          btns.push({ code: 'reorder', label: '再来一单', primary: true })
        }
        return btns
      }
      case 60:
        return isTakeout(o) ? [{ code: 'reorder', label: '再来一单', primary: true }] : []
      case 70:
        return [
          { code: 'apply_arbitrate', label: '申请仲裁' },
          { code: 'view_after_sale', label: '查看进度', primary: true }
        ]
      default:
        return []
    }
  })

  /** 通用 throttle */
  function throttled(): boolean {
    const t = Date.now()
    if (t - lastActionAt.value < ACTION_THROTTLE_MS) return true
    lastActionAt.value = t
    return false
  }

  function onAction(code: ActionBtn['code']) {
    if (throttled()) return
    const o = order.value
    if (!o) return
    switch (code) {
      case 'pay':
        track(TRACK.CLICK_PAY, { orderNo: o.orderNo })
        uni.navigateTo({ url: `/pages/pay/index?orderNo=${o.orderNo}` })
        break
      case 'cancel':
        cancelDialog.value = { visible: true, reason: '' }
        break
      case 'urge':
        void doUrge()
        break
      case 'contact_merchant':
        onContactMerchant()
        break
      case 'contact_rider':
        onContactRider()
        break
      case 'view_track':
        viewTrack()
        break
      case 'confirm':
        confirmDialog.value = { visible: true }
        break
      case 'reorder':
        void doReorder()
        break
      case 'review':
        track(TRACK.CLICK_REVIEW, { orderNo: o.orderNo })
        uni.navigateTo({ url: `/pages-order/review-submit?orderNo=${o.orderNo}` })
        break
      case 'after_sale':
        track(TRACK.CLICK_AFTER_SALE, { orderNo: o.orderNo })
        uni.navigateTo({ url: `/pages-order/after-sale?orderNo=${o.orderNo}` })
        break
      case 'complaint':
        track(TRACK.CLICK_COMPLAINT, { orderNo: o.orderNo })
        uni.navigateTo({ url: `/pages-order/complaint?orderNo=${o.orderNo}` })
        break
      case 'view_after_sale':
        uni.navigateTo({ url: `/pages-order/after-sale?orderNo=${o.orderNo}&from=detail` })
        break
      case 'apply_arbitrate':
        uni.navigateTo({
          url: `/pages-order/arbitrate?relatedNo=${o.orderNo}&relatedType=1`
        })
        break
    }
  }

  function onContactMerchant() {
    const o = order.value
    if (!o || !isTakeout(o)) return
    const mobile = o.address?.mobile
    if (!mobile) {
      uni.showToast({ title: '商家未提供电话', icon: 'none' })
      return
    }
    uni.makePhoneCall({ phoneNumber: mobile })
  }

  function onContactRider() {
    const o = order.value
    if (!o) return
    const mobile = o.riderMobile
    if (!mobile) {
      uni.showToast({ title: '骑手未上线', icon: 'none' })
      return
    }
    track(TRACK.CLICK_CONTACT_RIDER, { orderNo: o.orderNo })
    uni.makePhoneCall({ phoneNumber: mobile })
  }

  function viewTrack() {
    const o = order.value
    if (!o) return
    track(TRACK.CLICK_TRACK_MAP, { orderNo: o.orderNo })
    uni.navigateTo({ url: `/pages-errand/track?orderNo=${o.orderNo}` })
  }

  async function confirmCancel() {
    const o = order.value
    if (!o) return
    const reason = cancelDialog.value.reason.trim()
    if (!reason) {
      uni.showToast({ title: '请填写取消原因', icon: 'none' })
      return
    }
    try {
      await cancelOrder(o.orderNo, reason)
      uni.showToast({ title: '已取消', icon: 'success' })
      await fetchDetail(false)
    } catch (e) {
      logger.warn('order.cancel.fail', { orderNo: o.orderNo, e: String(e) })
    }
  }

  async function doUrge() {
    const o = order.value
    if (!o) return
    try {
      await urgeOrder(o.orderNo)
      uni.showToast({ title: '已通知商家', icon: 'success' })
    } catch (e) {
      logger.warn('order.urge.fail', { orderNo: o.orderNo, e: String(e) })
    }
  }

  async function doConfirmReceive() {
    const o = order.value
    if (!o) return
    try {
      await confirmOrder(o.orderNo)
      uni.showToast({ title: '已确认收货', icon: 'success' })
      await fetchDetail(false)
    } catch (e) {
      logger.warn('order.confirm.fail', { orderNo: o.orderNo, e: String(e) })
    }
  }

  async function doReorder() {
    const o = order.value
    if (!o) return
    if (!isTakeout(o)) {
      uni.showToast({ title: '请重新填写跑腿表单', icon: 'none' })
      setTimeout(() => uni.switchTab({ url: '/pages/index/index' }), 600)
      return
    }
    try {
      const r = await reorder(o.orderNo)
      const cart = useCartStore()
      cart.clearShopCart(r.shopId)
      for (const it of r.items) {
        cart.addItem(
          {
            shopId: r.shopId,
            shopName: o.shopName,
            shopLogo: o.shopLogo,
            minAmount: '0.00',
            deliveryFee: o.deliveryFee
          },
          {
            productId: it.productId,
            skuId: it.skuId,
            productName: '',
            skuName: '',
            unitPrice: '0.00',
            count: it.qty,
            image: '',
            addedAt: Date.now()
          }
        )
      }
      uni.navigateTo({ url: `/pages-takeout/checkout?shopId=${r.shopId}` })
    } catch (e) {
      logger.warn('order.reorder.fail', { orderNo: o.orderNo, e: String(e) })
    }
  }
</script>

<style lang="scss" scoped>
  .order-detail {
    min-height: 100vh;
    padding-bottom: 24rpx;
    background: $color-bg-page;

    &__status {
      padding: 48rpx 32rpx 32rpx;
      color: $color-text-inverse;
      background: linear-gradient(135deg, $color-primary 0%, $color-primary-light 100%);

      &--s0,
      &--s10,
      &--s20,
      &--s30,
      &--s40,
      &--s50 {
        background: linear-gradient(135deg, $color-primary 0%, $color-primary-light 100%);
      }

      &--s55 {
        background: linear-gradient(135deg, #6dbf67 0%, #9ad77a 100%);
      }

      &--s60,
      &--s5 {
        background: linear-gradient(135deg, #999 0%, #c0c4cc 100%);
      }

      &--s70 {
        background: linear-gradient(135deg, #e6a23c 0%, #f5b665 100%);
      }
    }

    &__status-name {
      font-size: 40rpx;
      font-weight: $font-weight-bold;
    }

    &__status-desc {
      display: block;
      margin-top: 12rpx;
      font-size: $font-size-sm;
      opacity: 0.9;
    }

    &__status-countdown {
      margin-top: 16rpx;
      font-size: $font-size-sm;
      opacity: 0.95;
    }

    &__rider {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20rpx 24rpx;
      margin-top: 24rpx;
      background: rgba(255, 255, 255, 0.18);
      border-radius: $radius-md;
    }

    &__rider-info {
      display: flex;
      flex-direction: column;
    }

    &__rider-name {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
    }

    &__rider-mobile {
      margin-top: 4rpx;
      font-size: $font-size-xs;
      opacity: 0.85;
    }

    &__rider-call {
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      background: $color-bg-white;
      border-radius: $radius-lg;
    }

    &__shop {
      display: flex;
      align-items: center;
      padding: 24rpx;
      margin: 24rpx 24rpx 0;
    }

    &__shop-logo {
      width: 80rpx;
      height: 80rpx;
      margin-right: 16rpx;
      border-radius: $radius-sm;
      background-color: $color-divider;
    }

    &__shop-info {
      display: flex;
      flex: 1;
      flex-direction: column;
    }

    &__shop-name {
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__shop-eta {
      margin-top: 8rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__shop-call {
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-lg;
    }

    &__items {
      padding: 24rpx;
      margin: 24rpx 24rpx 0;
    }

    &__item {
      display: flex;
      align-items: center;
      padding: 16rpx 0;

      & + & {
        border-top: 1rpx solid $color-divider;
      }
    }

    &__item-img {
      width: 96rpx;
      height: 96rpx;
      margin-right: 16rpx;
      border-radius: $radius-sm;
      background-color: $color-divider;
    }

    &__item-info {
      display: flex;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
    }

    &__item-name {
      @include ellipsis(1);

      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__item-sku {
      margin-top: 8rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__item-price {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    &__item-amt {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__item-qty {
      margin-top: 6rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__address,
    &__remark,
    &__amount,
    &__service,
    &__item-desc,
    &__code,
    &__meta {
      padding: 24rpx;
      margin: 24rpx 24rpx 0;
    }

    &__addr-head {
      margin-bottom: 12rpx;
    }

    &__addr-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__addr-row {
      display: flex;
      align-items: center;
      gap: 16rpx;
      margin-bottom: 8rpx;
    }

    &__addr-name {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__addr-mobile {
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__addr-detail {
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__remark-label,
    &__item-desc-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__remark-text,
    &__item-desc-text {
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__service {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__service-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__service-name {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__code {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__code-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__code-value {
      font-size: 40rpx;
      font-weight: $font-weight-bold;
      color: $color-primary;
      letter-spacing: 8rpx;
    }

    &__amt-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8rpx 0;
      font-size: $font-size-sm;
      color: $color-text-regular;

      &--total {
        margin-top: 12rpx;
        padding-top: 16rpx;
        border-top: 1rpx solid $color-divider;
      }
    }

    &__amt-discount {
      color: $color-danger;
    }

    &__amt-total {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__meta-row {
      display: flex;
      justify-content: space-between;
      padding: 8rpx 0;
      font-size: $font-size-sm;
    }

    &__meta-label {
      color: $color-text-secondary;
    }

    &__meta-value {
      color: $color-text-regular;
    }

    &__bottom-spacer {
      height: 160rpx;
    }

    &__bottom {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      gap: 16rpx;
      justify-content: flex-end;
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__bottom-btn {
      padding: 16rpx 32rpx;
      font-size: $font-size-base;
      color: $color-text-regular;
      background: $color-bg-white;
      border: 1rpx solid $color-border;
      border-radius: $radius-lg;

      &--primary {
        color: $color-text-inverse;
        background: $color-primary;
        border-color: $color-primary;
      }
    }

    &__cancel-form {
      width: 100%;
    }

    &__cancel-tip {
      display: block;
      margin-bottom: 12rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      text-align: left;
    }

    &__cancel-input {
      width: 100%;
      min-height: 144rpx;
      padding: 16rpx;
      font-size: $font-size-sm;
      color: $color-text-primary;
      background: $color-bg-page;
      border: 1rpx solid $color-border;
      border-radius: $radius-sm;
    }
  }
</style>
