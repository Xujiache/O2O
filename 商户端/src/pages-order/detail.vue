<template>
  <view class="page page-od">
    <BizLoading v-if="loading && !order" />
    <BizError v-else-if="!order" :desc="errMsg || '订单不存在'" @retry="loadOrder" />

    <template v-else>
      <!-- 顶部状态 -->
      <view class="od-status">
        <text class="od-status__title">{{ statusText }}</text>
        <text class="od-status__no">单号：{{ order.orderNo }}</text>
      </view>

      <!-- 收件信息 -->
      <view class="od-card">
        <view class="od-h2">收件信息</view>
        <view class="od-row"
          ><text class="od-row__label">收件人</text><text>{{ order.receiverName }}</text></view
        >
        <view class="od-row">
          <text class="od-row__label">联系电话</text>
          <text class="od-row__phone" @click="onCall">{{ order.receiverMobile }} 📞</text>
        </view>
        <view class="od-row"
          ><text class="od-row__label">收件地址</text><text>{{ order.receiverAddress }}</text></view
        >
        <view class="od-row"
          ><text class="od-row__label">距离</text
          ><text>{{ formatDistance(order.distance) }}</text></view
        >
      </view>

      <!-- 商品 -->
      <view class="od-card">
        <view class="od-h2">商品（{{ totalQty }} 件）</view>
        <view v-for="it in order.items" :key="`${it.productId}-${it.skuId}`" class="od-item">
          <text class="od-item__name"
            >{{ it.productName }} {{ it.skuName ? `(${it.skuName})` : '' }}</text
          >
          <text class="od-item__qty">×{{ it.qty }}</text>
          <text class="od-item__price">{{ formatAmount(it.subtotal) }}</text>
        </view>
        <view v-if="order.remark" class="od-remark">备注：{{ order.remark }}</view>
      </view>

      <!-- 金额 -->
      <view class="od-card">
        <view class="od-h2">金额明细</view>
        <view class="od-row"
          ><text class="od-row__label">商品小计</text
          ><text>{{ formatAmount(order.itemsAmount) }}</text></view
        >
        <view class="od-row"
          ><text class="od-row__label">配送费</text
          ><text>{{ formatAmount(order.deliveryFee) }}</text></view
        >
        <view class="od-row"
          ><text class="od-row__label">优惠</text
          ><text class="od-discount">-{{ formatAmount(order.discountAmount) }}</text></view
        >
        <view class="od-row"
          ><text class="od-row__label">用户实付</text
          ><text class="od-amount">{{ formatAmount(order.payAmount) }}</text></view
        >
        <view class="od-row od-row--sub"
          ><text class="od-row__label">平台服务费</text
          ><text>-{{ formatAmount(order.platformFee) }}</text></view
        >
        <view class="od-row od-row--income"
          ><text class="od-row__label">商户实收</text
          ><text>{{ formatAmount(order.merchantIncome) }}</text></view
        >
      </view>

      <!-- 骑手信息 -->
      <view v-if="order.riderId" class="od-card">
        <view class="od-h2">骑手信息</view>
        <view class="od-row"
          ><text class="od-row__label">姓名</text><text>{{ order.riderName }}</text></view
        >
        <view class="od-row">
          <text class="od-row__label">联系电话</text>
          <text class="od-row__phone" @click="onCallRider">{{ order.riderMobile }} 📞</text>
        </view>
      </view>

      <!-- 取餐码 -->
      <view v-if="order.pickupCode" class="od-card od-pickup">
        <text class="od-pickup__label">取餐码</text>
        <text class="od-pickup__code">{{ order.pickupCode }}</text>
      </view>

      <!-- 时间线 -->
      <view class="od-card">
        <view class="od-h2">订单时间</view>
        <view v-if="order.createdAt" class="od-row"
          ><text class="od-row__label">下单</text
          ><text>{{ formatTime(order.createdAt) }}</text></view
        >
        <view v-if="order.acceptedAt" class="od-row"
          ><text class="od-row__label">接单</text
          ><text>{{ formatTime(order.acceptedAt) }}</text></view
        >
        <view v-if="order.cookedAt" class="od-row"
          ><text class="od-row__label">出餐</text
          ><text>{{ formatTime(order.cookedAt) }}</text></view
        >
        <view v-if="order.finishedAt" class="od-row"
          ><text class="od-row__label">完成</text
          ><text>{{ formatTime(order.finishedAt) }}</text></view
        >
        <view v-if="order.canceledAt" class="od-row"
          ><text class="od-row__label">取消</text
          ><text>{{ formatTime(order.canceledAt) }} - {{ order.cancelReason }}</text></view
        >
      </view>

      <!-- 动态操作栏 -->
      <view class="od-actions">
        <BizBtn
          v-if="order.status === 10"
          type="default"
          text="拒单"
          perm="order:reject"
          block
          @click="onReject"
        />
        <BizBtn
          v-if="order.status === 10"
          type="primary"
          text="接单"
          perm="order:accept"
          block
          @click="onAccept"
        />
        <BizBtn
          v-if="order.status === 20"
          type="primary"
          text="出餐完成"
          perm="order:cook"
          block
          @click="onCooked"
        />
        <BizBtn
          v-if="canReprint"
          type="default"
          text="重新打印"
          perm="order:print"
          block
          @click="onReprint"
        />
        <BizBtn
          v-if="order.status === 70"
          type="warning"
          text="处理售后"
          perm="order:refund-audit"
          block
          @click="goRefundAudit"
        />
        <BizBtn
          v-if="order.status === 10 || order.status === 20"
          type="default"
          text="异常上报"
          block
          @click="goAbnormal"
        />
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { onLoad, onShow } from '@dcloudio/uni-app'
  import type { MerchantOrder } from '@/types/biz'
  import { ORDER_STATUS_TEXT } from '@/types/biz'
  import { getOrderDetail, acceptOrder, rejectOrder, markCooked, markPrinted } from '@/api/order'
  import { mockEnabled, mockOrders, delay } from '@/api/_mock'
  import { formatAmount, formatTime, formatDistance } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { printer, createPrintTask } from '@/utils/bluetooth-printer'

  /**
   * 订单详情（T6.19）
   *
   * 动态操作栏：根据订单状态显示对应按钮
   *   - status=10 待接单 → 接单 / 拒单 / 异常上报
   *   - status=20 待出餐 → 出餐完成 / 重打 / 异常上报
   *   - status in [30,40] → 重打
   *   - status=70 售后中 → 处理售后
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const order = ref<MerchantOrder | null>(null)
  const loading = ref<boolean>(false)
  const errMsg = ref<string>('')
  const orderNo = ref<string>('')

  onLoad((opt) => {
    const o = opt as { orderNo?: string } | undefined
    if (o?.orderNo) orderNo.value = o.orderNo
    void loadOrder()
  })

  onShow(() => {
    if (orderNo.value) void loadOrder()
  })

  const totalQty = computed<number>(() => order.value?.items.reduce((s, it) => s + it.qty, 0) ?? 0)

  const statusText = computed<string>(() => {
    if (!order.value) return '-'
    if (order.value.isException) return '异常订单'
    return ORDER_STATUS_TEXT[order.value.status] ?? '-'
  })

  const canReprint = computed<boolean>(() => {
    if (!order.value) return false
    return [20, 30, 40].includes(order.value.status)
  })

  async function loadOrder() {
    if (!orderNo.value) return
    loading.value = true
    errMsg.value = ''
    try {
      if (mockEnabled()) {
        const o = mockOrders.find((x) => x.orderNo === orderNo.value) ?? mockOrders[0]
        const r = await delay(o)
        order.value = r ?? null
      } else {
        order.value = await getOrderDetail(orderNo.value)
      }
      track(TRACK.VIEW_ORDER_DETAIL, { orderNo: orderNo.value })
    } catch (e) {
      errMsg.value = String(e)
      logger.warn('od.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onCall() {
    if (order.value?.receiverMobile) {
      uni.makePhoneCall({ phoneNumber: order.value.receiverMobile })
    }
  }
  function onCallRider() {
    if (order.value?.riderMobile) {
      uni.makePhoneCall({ phoneNumber: order.value.riderMobile })
    }
  }

  async function onAccept() {
    if (!order.value) return
    try {
      if (!mockEnabled()) await acceptOrder(order.value.orderNo)
      track(TRACK.CLICK_ACCEPT_ORDER, { orderNo: order.value.orderNo })
      uni.showToast({ title: '已接单', icon: 'success' })
      await loadOrder()
    } catch (e) {
      logger.warn('od.accept.fail', { e: String(e) })
    }
  }

  function onReject() {
    if (!order.value) return
    const orderNoVal = order.value.orderNo
    uni.showActionSheet({
      itemList: ['菜品已售完', '门店繁忙', '配送范围超出', '其他'],
      success: async (res) => {
        const reason = ['菜品已售完', '门店繁忙', '配送范围超出', '其他'][res.tapIndex]
        try {
          if (!mockEnabled()) await rejectOrder(orderNoVal, reason)
          track(TRACK.CLICK_REJECT_ORDER, { orderNo: orderNoVal, reason })
          uni.showToast({ title: '已拒单', icon: 'none' })
          setTimeout(() => uni.navigateBack(), 800)
        } catch (e) {
          logger.warn('od.reject.fail', { e: String(e) })
        }
      }
    })
  }

  async function onCooked() {
    if (!order.value) return
    try {
      if (!mockEnabled()) await markCooked(order.value.orderNo)
      track(TRACK.CLICK_COOK_ORDER, { orderNo: order.value.orderNo })
      uni.showToast({ title: '已出餐', icon: 'success' })
      await loadOrder()
    } catch (e) {
      logger.warn('od.cook.fail', { e: String(e) })
    }
  }

  async function onReprint() {
    if (!order.value) return
    try {
      printer.enqueue(createPrintTask(order.value, { copies: 1, copyType: 1 }))
      if (!mockEnabled()) await markPrinted(order.value.orderNo)
      track(TRACK.CLICK_REPRINT, { orderNo: order.value.orderNo })
      uni.showToast({ title: '已发送至打印机', icon: 'success' })
    } catch (e) {
      logger.warn('od.reprint.fail', { e: String(e) })
    }
  }

  function goRefundAudit() {
    if (!order.value) return
    uni.navigateTo({ url: `/pages-order/refund-audit?orderNo=${order.value.orderNo}` })
  }

  function goAbnormal() {
    if (!order.value) return
    uni.navigateTo({ url: `/pages-order/abnormal?orderNo=${order.value.orderNo}` })
  }
</script>

<style lang="scss" scoped>
  .page-od {
    min-height: 100vh;
    padding: 24rpx;
    padding-bottom: 200rpx;
    background: $uni-bg-color-grey;
  }

  .od-status {
    padding: 32rpx;
    margin-bottom: 16rpx;
    color: #fff;
    background: linear-gradient(135deg, $uni-color-primary 0%, #6db3ff 100%);
    border-radius: 16rpx;

    &__title {
      display: block;
      font-size: 36rpx;
      font-weight: 600;
    }

    &__no {
      display: block;
      margin-top: 8rpx;
      font-size: 22rpx;
      opacity: 0.85;
    }
  }

  .od-card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .od-h2 {
    margin-bottom: 16rpx;
    font-size: 26rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .od-row {
    display: flex;
    justify-content: space-between;
    padding: 8rpx 0;
    font-size: 26rpx;

    &__label {
      color: $uni-text-color-grey;
    }

    &__phone {
      color: $uni-color-primary;
    }

    &--sub {
      color: $uni-text-color-grey;
    }

    &--income {
      padding-top: 16rpx;
      margin-top: 8rpx;
      font-weight: 600;
      color: $uni-color-success;
      border-top: 1rpx dashed $uni-border-color;
    }
  }

  .od-discount {
    color: $uni-color-warning;
  }

  .od-amount {
    font-weight: 600;
    color: $uni-color-error;
  }

  .od-item {
    display: flex;
    align-items: center;
    padding: 8rpx 0;
    font-size: 26rpx;

    &__name {
      flex: 1;
    }

    &__qty {
      width: 80rpx;
      color: $uni-text-color-grey;
      text-align: center;
    }

    &__price {
      width: 120rpx;
      text-align: right;
    }
  }

  .od-remark {
    padding: 12rpx 16rpx;
    margin-top: 12rpx;
    font-size: 24rpx;
    color: $uni-color-warning;
    background: rgb(250 140 22 / 8%);
    border-radius: $uni-border-radius-base;
  }

  .od-pickup {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32rpx;
    background: $uni-color-primary-light;

    &__label {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__code {
      margin-top: 8rpx;
      font-size: 64rpx;
      font-weight: 700;
      color: $uni-color-primary;
      letter-spacing: 16rpx;
    }
  }

  .od-actions {
    position: fixed;
    right: 24rpx;
    bottom: 0;
    left: 24rpx;
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 24rpx;
    padding-bottom: calc(24rpx + constant(safe-area-inset-bottom));
    padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
    background: #fff;
    border-radius: 24rpx 24rpx 0 0;
    box-shadow: 0 -4rpx 16rpx rgb(0 0 0 / 6%);
  }
</style>
