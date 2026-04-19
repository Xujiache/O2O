<template>
  <view class="track">
    <!-- 顶部状态栏 -->
    <view class="track__head">
      <view class="track__head-status">
        <text class="track__head-status-text">{{ statusText }}</text>
        <text v-if="countdownText" class="track__head-countdown">{{ countdownText }}</text>
      </view>
      <view v-if="rider.mobile" class="track__head-call" @tap="onCallRider">
        <text class="track__head-call-text">联系骑手</text>
      </view>
    </view>

    <!-- 地图 -->
    <view class="track__map-wrap">
      <map
        v-if="mapReady"
        id="track-map"
        class="track__map"
        :latitude="mapCenter.latitude"
        :longitude="mapCenter.longitude"
        :scale="mapScale"
        :markers="markers"
        :polyline="polyline"
        :show-location="false"
        :enable-3D="false"
        :enable-zoom="true"
        :enable-scroll="true"
        :enable-rotate="false"
      />
      <view v-else class="track__map-loading">
        <BizLoading text="正在加载地图..." />
      </view>
    </view>

    <!-- 骑手 + 取件码 -->
    <view class="track__panel">
      <view v-if="rider.id" class="track__rider">
        <image class="track__rider-avatar" :src="riderAvatar" mode="aspectFill" />
        <view class="track__rider-info">
          <text class="track__rider-name">{{ rider.name || '配送中骑手' }}</text>
          <text class="track__rider-meta">{{ riderMetaText }}</text>
        </view>
        <view class="track__rider-actions">
          <view class="track__rider-btn" @tap="onCallRider">
            <text>电话</text>
          </view>
        </view>
      </view>
      <view v-else class="track__rider track__rider--empty">
        <text class="track__rider-empty-text">骑手匹配中，请稍候...</text>
      </view>

      <PickupCode v-if="showPickupCode && pickupCode" :code="pickupCode" :proofs="proofImages" />
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-errand/track.vue
   * @stage P5/T5.25 (Sprint 4)
   * @desc 跑腿订单实时跟踪：地图 + WS 骑手位置（10 步插值平滑）+ 状态栏 + 取件码 + 凭证；3s 轮询兜底
   * @author 单 Agent V2.0
   */
  import { computed, reactive, ref } from 'vue'
  import { onLoad, onUnload, onShow, onHide } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import PickupCode from '@/components/biz/PickupCode.vue'
  import { getOrderDetail } from '@/api/order'
  import { getRiderTrack, routing } from '@/api/map'
  import { ws, startWs } from '@/utils/ws'
  import { useUserStore } from '@/store/user'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { ORDER_STATUS_TEXT, type OrderErrand, type OrderStatus } from '@/types/biz'

  /** 骑手位置插值步数（每 100ms 一步，共 1s） */
  const INTERPOLATION_STEPS = 10
  /** 插值步间隔（ms） */
  const INTERPOLATION_INTERVAL_MS = 100
  /** 兜底轮询间隔（ms，PRD 与 Design §5.5 对齐） */
  const POLL_INTERVAL_MS = 3000
  /** 默认地图缩放等级 */
  const DEFAULT_MAP_SCALE = 15
  /** 默认骑手头像（CDN 占位，未匹配前不渲染骑手卡） */
  const DEFAULT_AVATAR = 'https://cdn.uviewui.com/uview/common/logo.png'
  /** marker 图标（uviewui CDN 占位；P9 替换为业务图标） */
  const MARKER_PICKUP = 'https://cdn.uviewui.com/uview/empty/list.png'
  const MARKER_DELIVERY = 'https://cdn.uviewui.com/uview/empty/list.png'
  const MARKER_RIDER = 'https://cdn.uviewui.com/uview/empty/data.png'
  /** 帮送 / 帮买（serviceType 1/3）显示取件码 */
  const SERVICE_TYPES_WITH_PICKUP_CODE: number[] = [1, 3]

  /** 地图坐标点（uniapp <map> 命名规范） */
  interface MapPoint {
    latitude: number
    longitude: number
  }

  /** uniapp Marker（仅枚举常用属性，避免依赖 UniHelper 类型） */
  interface UniMarker {
    id: number
    latitude: number
    longitude: number
    iconPath: string
    width: number
    height: number
    callout?: {
      content: string
      color: string
      fontSize: number
      bgColor: string
      padding: number
      borderRadius: number
      display: 'BYCLICK' | 'ALWAYS'
    }
  }

  /** uniapp Polyline */
  interface UniPolyline {
    points: MapPoint[]
    color: string
    width: number
    arrowLine?: boolean
    dottedLine?: boolean
  }

  /** WS 推送：rider:location:updated 数据体（按 P4 §10.2 推断） */
  interface WsRiderLocation {
    riderId: string
    orderNo?: string
    lng: number
    lat: number
    ts?: number
  }

  /** WS 推送：order:status:changed 数据体 */
  interface WsOrderStatus {
    orderNo: string
    status: OrderStatus
    estimatedArrivalAt?: string | null
  }

  const orderNo = ref<string>('')
  const orderDetail = ref<OrderErrand | null>(null)
  const mapReady = ref<boolean>(false)
  const mapCenter = reactive<MapPoint>({ latitude: 39.908, longitude: 116.397 })
  const mapScale = ref<number>(DEFAULT_MAP_SCALE)

  /** 取件 / 送达点（来自 order detail） */
  const pickupPoint = ref<MapPoint | null>(null)
  const deliveryPoint = ref<MapPoint | null>(null)
  /** 骑手当前位置（插值后） */
  const riderPoint = ref<MapPoint | null>(null)
  /** 路径规划 polyline 点集 */
  const routePoints = ref<MapPoint[]>([])
  /** 骑手历史轨迹 polyline 点集 */
  const trackPoints = ref<MapPoint[]>([])

  /** 骑手信息 */
  const rider = reactive<{ id: string; name: string; mobile: string }>({
    id: '',
    name: '',
    mobile: ''
  })
  const riderAvatar = ref<string>(DEFAULT_AVATAR)

  /** 取件码 / 凭证图 */
  const pickupCode = ref<string>('')
  const proofImages = ref<string[]>([])

  /** 倒计时秒数（基于 estimatedArrivalAt 计算） */
  const remainingSec = ref<number>(0)

  /** 内部计时器引用（必须在 onUnload 清理） */
  let interpolationTimer: ReturnType<typeof setInterval> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  /** WS 取消订阅函数（onUnload 调用） */
  let unsubLocation: (() => void) | null = null
  let unsubStatus: (() => void) | null = null

  /* ========== computed ========== */

  /** 状态文案 */
  const statusText = computed<string>(() => {
    const s = orderDetail.value?.status
    if (s === undefined || s === null) return '加载中...'
    return ORDER_STATUS_TEXT[s] ?? '未知状态'
  })

  /** 倒计时文案 */
  const countdownText = computed<string>(() => {
    if (remainingSec.value <= 0) return ''
    const min = Math.ceil(remainingSec.value / 60)
    return `预计 ${min} 分钟到达`
  })

  /** 骑手信息行 */
  const riderMetaText = computed<string>(() => {
    if (!rider.mobile) return '准备出发'
    return `电话 ${rider.mobile}`
  })

  /** 是否显示取件码（仅帮送/帮买，且 status >= 20） */
  const showPickupCode = computed<boolean>(() => {
    const d = orderDetail.value
    if (!d) return false
    if (!SERVICE_TYPES_WITH_PICKUP_CODE.includes(d.serviceType)) return false
    return d.status >= 20
  })

  /** 地图 markers（取件 / 送达 / 骑手） */
  const markers = computed<UniMarker[]>(() => {
    const list: UniMarker[] = []
    if (pickupPoint.value) {
      list.push({
        id: 1,
        latitude: pickupPoint.value.latitude,
        longitude: pickupPoint.value.longitude,
        iconPath: MARKER_PICKUP,
        width: 32,
        height: 32,
        callout: {
          content: '取件点',
          color: '#FFFFFF',
          fontSize: 12,
          bgColor: '#FF6A1A',
          padding: 6,
          borderRadius: 8,
          display: 'ALWAYS'
        }
      })
    }
    if (deliveryPoint.value) {
      list.push({
        id: 2,
        latitude: deliveryPoint.value.latitude,
        longitude: deliveryPoint.value.longitude,
        iconPath: MARKER_DELIVERY,
        width: 32,
        height: 32,
        callout: {
          content: '送达点',
          color: '#FFFFFF',
          fontSize: 12,
          bgColor: '#67C23A',
          padding: 6,
          borderRadius: 8,
          display: 'ALWAYS'
        }
      })
    }
    if (riderPoint.value) {
      list.push({
        id: 3,
        latitude: riderPoint.value.latitude,
        longitude: riderPoint.value.longitude,
        iconPath: MARKER_RIDER,
        width: 36,
        height: 36,
        callout: {
          content: '骑手',
          color: '#FFFFFF',
          fontSize: 12,
          bgColor: '#333333',
          padding: 6,
          borderRadius: 8,
          display: 'ALWAYS'
        }
      })
    }
    return list
  })

  /** 地图 polyline（路径 + 历史轨迹） */
  const polyline = computed<UniPolyline[]>(() => {
    const list: UniPolyline[] = []
    if (routePoints.value.length >= 2) {
      list.push({
        points: routePoints.value,
        color: '#FF6A1A',
        width: 6,
        arrowLine: true
      })
    }
    if (trackPoints.value.length >= 2) {
      list.push({
        points: trackPoints.value,
        color: '#5A99F2',
        width: 4,
        dottedLine: true
      })
    }
    return list
  })

  /* ========== 生命周期 ========== */

  onLoad((options) => {
    const opts = (options ?? {}) as Record<string, string | undefined>
    if (opts.orderNo) orderNo.value = decodeURIComponent(opts.orderNo)
    track(TRACK.CLICK_TRACK_MAP, { orderNo: orderNo.value })
    if (!orderNo.value) {
      uni.showToast({ title: '订单号缺失', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    void initialize()
  })

  onShow(() => {
    /* 从后台返回时补齐一次最新状态 */
    if (orderNo.value && orderDetail.value) {
      void refreshOrder()
    }
  })

  onHide(() => {
    /* 后台时停止插值与倒计时，节省资源；onShow 时由 refreshOrder 重新触发 */
    stopInterpolation()
    stopCountdown()
  })

  onUnload(() => {
    cleanup()
  })

  /* ========== 初始化 ========== */

  async function initialize() {
    mapReady.value = false
    try {
      await refreshOrder()
      const d = orderDetail.value
      if (!d) return
      mapReady.value = true
      await Promise.all([loadRoute(), loadRiderTrack()])
      setupWsSubscriptions()
      startCountdown()
      startPolling()
    } catch (e) {
      logger.warn('errand.track.init.fail', { e: String(e) })
    }
  }

  /** 拉取订单详情 + 同步本地状态 */
  async function refreshOrder() {
    try {
      const d = (await getOrderDetail(orderNo.value)) as OrderErrand
      orderDetail.value = d

      if (typeof d.pickupAddress?.lng === 'number' && typeof d.pickupAddress?.lat === 'number') {
        pickupPoint.value = { latitude: d.pickupAddress.lat, longitude: d.pickupAddress.lng }
      }
      if (
        typeof d.deliveryAddress?.lng === 'number' &&
        typeof d.deliveryAddress?.lat === 'number'
      ) {
        deliveryPoint.value = { latitude: d.deliveryAddress.lat, longitude: d.deliveryAddress.lng }
      }

      if (d.riderId) rider.id = d.riderId
      if (d.riderName) rider.name = d.riderName
      if (d.riderMobile) rider.mobile = d.riderMobile
      if (d.pickupCode) pickupCode.value = d.pickupCode

      /**
       * P5-REVIEW-01 R1 / I-07：从订单详情读取凭证图（proofs 字段）
       * 后端 OrderErrand 返回值含 proofs?: OrderProof[]（取件 / 送达 / 异常）
       * 当前 P5 阶段后端可能未返回该字段（待 P9 确认）→ 兼容 undefined / 空数组
       */
      if (Array.isArray(d.proofs)) {
        proofImages.value = d.proofs
          .map((p) => p.imageUrl)
          .filter((url): url is string => Boolean(url))
      } else {
        proofImages.value = []
      }

      computeRemainingSec(d.estimatedArrivalAt ?? null)
      centerMap()
    } catch (e) {
      logger.warn('errand.track.refreshOrder.fail', { e: String(e) })
    }
  }

  /** 加载路径规划（取件 → 送达） */
  async function loadRoute() {
    if (!pickupPoint.value || !deliveryPoint.value) return
    try {
      const r = await routing({
        fromLng: pickupPoint.value.longitude,
        fromLat: pickupPoint.value.latitude,
        toLng: deliveryPoint.value.longitude,
        toLat: deliveryPoint.value.latitude,
        routeType: 'electrobike'
      })
      routePoints.value = (r.path ?? []).map((p) => ({ longitude: p[0], latitude: p[1] }))
    } catch (e) {
      logger.warn('errand.track.routing.fail', { e: String(e) })
    }
  }

  /** 加载骑手历史轨迹 */
  async function loadRiderTrack() {
    if (!rider.id) return
    try {
      const t = await getRiderTrack(rider.id, orderNo.value)
      const coords = t.geometry?.coordinates ?? []
      trackPoints.value = coords.map((p) => ({ longitude: p[0], latitude: p[1] }))
      if (coords.length > 0) {
        const last = coords[coords.length - 1]
        /* 历史轨迹最后一点作为骑手当前位置初值（后续 WS 增量插值） */
        riderPoint.value = { longitude: last[0], latitude: last[1] }
        centerMap()
      }
    } catch (e) {
      logger.warn('errand.track.riderTrack.fail', { e: String(e) })
    }
  }

  /** 订阅 WS：骑手位置 + 订单状态变更 */
  function setupWsSubscriptions() {
    const user = useUserStore()
    if (user.profile?.id) {
      startWs(user.profile.id)
    } else {
      startWs()
    }

    if (unsubLocation) unsubLocation()
    if (unsubStatus) unsubStatus()

    unsubLocation = ws.subscribe<WsRiderLocation>('rider:location:updated', (event) => {
      const data = event.data
      if (!data) return
      if (data.orderNo && data.orderNo !== orderNo.value) return
      if (data.riderId && rider.id && data.riderId !== rider.id) return
      if (typeof data.lng !== 'number' || typeof data.lat !== 'number') return
      animateRiderTo(data.lat, data.lng)
    })

    unsubStatus = ws.subscribe<WsOrderStatus>('order:status:changed', (event) => {
      const data = event.data
      if (!data || data.orderNo !== orderNo.value) return
      if (orderDetail.value) {
        orderDetail.value.status = data.status
        if (data.estimatedArrivalAt !== undefined) {
          orderDetail.value.estimatedArrivalAt = data.estimatedArrivalAt
          computeRemainingSec(data.estimatedArrivalAt ?? null)
        }
      }
      /* 状态变更触发一次详情刷新（拿可能新增的 riderId / pickupCode） */
      void refreshOrder()
    })
  }

  /* ========== 位置插值 ========== */

  /** 平滑过渡到新坐标：10 步 / 1s */
  function animateRiderTo(targetLat: number, targetLng: number) {
    stopInterpolation()
    const start = riderPoint.value ?? { latitude: targetLat, longitude: targetLng }
    const dLat = (targetLat - start.latitude) / INTERPOLATION_STEPS
    const dLng = (targetLng - start.longitude) / INTERPOLATION_STEPS

    /* 距离极小直接落点（避免微抖动） */
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) {
      riderPoint.value = { latitude: targetLat, longitude: targetLng }
      return
    }

    let step = 0
    interpolationTimer = setInterval(() => {
      step += 1
      if (step >= INTERPOLATION_STEPS) {
        riderPoint.value = { latitude: targetLat, longitude: targetLng }
        appendTrackPoint(targetLat, targetLng)
        stopInterpolation()
        return
      }
      riderPoint.value = {
        latitude: start.latitude + dLat * step,
        longitude: start.longitude + dLng * step
      }
    }, INTERPOLATION_INTERVAL_MS)
  }

  function stopInterpolation() {
    if (interpolationTimer) {
      clearInterval(interpolationTimer)
      interpolationTimer = null
    }
  }

  /** 追加历史轨迹点（仅 polyline 使用，不影响 marker） */
  function appendTrackPoint(lat: number, lng: number) {
    const last = trackPoints.value[trackPoints.value.length - 1]
    if (last && Math.abs(last.latitude - lat) < 1e-6 && Math.abs(last.longitude - lng) < 1e-6) {
      return
    }
    trackPoints.value = [...trackPoints.value, { latitude: lat, longitude: lng }]
  }

  /* ========== 倒计时 ========== */

  function computeRemainingSec(eta: string | null | undefined) {
    if (!eta) {
      remainingSec.value = 0
      return
    }
    const t = new Date(eta).getTime()
    if (Number.isNaN(t)) {
      remainingSec.value = 0
      return
    }
    remainingSec.value = Math.max(0, Math.floor((t - Date.now()) / 1000))
  }

  function startCountdown() {
    stopCountdown()
    countdownTimer = setInterval(() => {
      if (remainingSec.value > 0) {
        remainingSec.value -= 1
      }
    }, 1000)
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  /* ========== 兜底轮询 ========== */

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(() => {
      if (!ws.isOpen()) {
        track(TRACK.WS_RECONNECT, { orderNo: orderNo.value })
      }
      /* WS 通畅与否，都拉一次详情（保底状态/取件码同步） */
      void refreshOrder()
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /* ========== 地图居中 ========== */

  /** 取 pickup / delivery / rider 中心作为初始 center */
  function centerMap() {
    const candidates: MapPoint[] = []
    if (riderPoint.value) candidates.push(riderPoint.value)
    if (pickupPoint.value) candidates.push(pickupPoint.value)
    if (deliveryPoint.value) candidates.push(deliveryPoint.value)
    if (candidates.length === 0) return
    /* 优先以骑手为中心；否则取所有点平均 */
    if (riderPoint.value) {
      mapCenter.latitude = riderPoint.value.latitude
      mapCenter.longitude = riderPoint.value.longitude
      return
    }
    const avgLat = candidates.reduce((s, c) => s + c.latitude, 0) / candidates.length
    const avgLng = candidates.reduce((s, c) => s + c.longitude, 0) / candidates.length
    mapCenter.latitude = avgLat
    mapCenter.longitude = avgLng
  }

  /* ========== 行为 ========== */

  function onCallRider() {
    if (!rider.mobile) {
      uni.showToast({ title: '骑手电话尚未分配', icon: 'none' })
      return
    }
    track(TRACK.CLICK_CONTACT_RIDER, { orderNo: orderNo.value })
    uni.makePhoneCall({
      phoneNumber: rider.mobile,
      fail: (err) => {
        logger.warn('errand.track.call.fail', { err: String(err.errMsg ?? '') })
      }
    })
  }

  /* ========== 清理 ========== */

  function cleanup() {
    stopInterpolation()
    stopCountdown()
    stopPolling()
    if (unsubLocation) {
      unsubLocation()
      unsubLocation = null
    }
    if (unsubStatus) {
      unsubStatus()
      unsubStatus = null
    }
  }
</script>

<style lang="scss" scoped>
  .track {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
    background: $color-bg-page;

    &__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24rpx 28rpx;
      background: linear-gradient(180deg, #ff6a1a, #ff8e53);
    }

    &__head-status {
      display: flex;
      flex-direction: column;
      gap: 8rpx;
    }

    &__head-status-text {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-inverse;
    }

    &__head-countdown {
      font-size: $font-size-sm;
      color: rgba(255, 255, 255, 0.85);
    }

    &__head-call {
      padding: 12rpx 28rpx;
      background: rgba(255, 255, 255, 0.18);
      border: 1rpx solid rgba(255, 255, 255, 0.4);
      border-radius: $radius-lg;
    }

    &__head-call-text {
      font-size: $font-size-sm;
      color: $color-text-inverse;
    }

    &__map-wrap {
      position: relative;
      flex: 1;
      width: 100%;
      min-height: 600rpx;
    }

    &__map {
      width: 100%;
      height: 100%;
    }

    &__map-loading {
      @include flex-center;

      width: 100%;
      height: 100%;
      background: $color-bg-page;
    }

    &__panel {
      flex-shrink: 0;
      max-height: 50vh;
      overflow-y: auto;
      background: $color-bg-page;
      border-top-left-radius: $radius-lg;
      border-top-right-radius: $radius-lg;
    }

    &__rider {
      display: flex;
      gap: 24rpx;
      align-items: center;
      margin: 24rpx;
      padding: 24rpx;
      background: $color-bg-white;
      border-radius: $radius-lg;
      box-shadow: $shadow-sm;

      &--empty {
        @include flex-center;

        flex-direction: column;
        padding: 48rpx 24rpx;
      }
    }

    &__rider-empty-text {
      font-size: $font-size-base;
      color: $color-text-secondary;
    }

    &__rider-avatar {
      flex-shrink: 0;
      width: 96rpx;
      height: 96rpx;
      background: $color-bg-page;
      border-radius: $radius-circle;
    }

    &__rider-info {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 8rpx;
    }

    &__rider-name {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__rider-meta {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__rider-actions {
      display: flex;
      gap: 16rpx;
    }

    &__rider-btn {
      padding: 12rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-lg;
    }
  }
</style>
