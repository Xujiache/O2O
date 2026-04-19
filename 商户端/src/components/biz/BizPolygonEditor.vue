<template>
  <view class="pe">
    <!-- 提示条 -->
    <view class="pe-tip">
      <text>{{ tipText }}</text>
    </view>

    <!-- 地图 -->
    <view class="pe-map-wrap">
      <map
        id="polygonMap"
        class="pe-map"
        :latitude="center.lat"
        :longitude="center.lng"
        :scale="14"
        :markers="mapMarkers"
        :polygons="mapPolygons"
        :polyline="mapPolyline"
        :show-location="true"
        @tap="onMapTap"
        @markertap="onMarkerTap"
      />
    </view>

    <!-- 控制栏 -->
    <view class="pe-controls">
      <view class="pe-stats">
        <text>顶点数：{{ polygon.length }} / {{ MAX_VERTEX }}</text>
        <text v-if="polygon.length >= 3">面积：{{ areaText }}</text>
        <text v-if="errorMsg" class="pe-stats__err">{{ errorMsg }}</text>
      </view>
      <view class="pe-btns">
        <BizBtn type="default" text="撤销" :disabled="polygon.length === 0" @click="onUndo" />
        <BizBtn type="default" text="清空" :disabled="polygon.length === 0" @click="onClear" />
        <BizBtn type="primary" text="保存" :disabled="!canSave" @click="onSave" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import type { LngLat } from '@/types/biz'
  import { logger } from '@/utils/logger'

  /**
   * Polygon 配送范围编辑器（S2 重难点 / T6.14）
   *
   * 交互：
   *   - 点击地图新增顶点（按顺序连成多边形）
   *   - 点击 marker 删除该顶点
   *   - 撤销 / 清空 / 保存
   *
   * 约束：
   *   - 顶点 3-30 个
   *   - 多边形不能自交（射线法判定）
   *   - 面积 > 0
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.14)
   */

  interface Props {
    /** 初始 polygon */
    initial?: LngLat[]
    /** 中心点（默认上海） */
    center?: LngLat
  }

  const props = withDefaults(defineProps<Props>(), {
    initial: () => [],
    center: () => ({ lng: 121.4737, lat: 31.2304 })
  })

  const emit = defineEmits<{
    (e: 'save', polygon: LngLat[]): void
  }>()

  const MAX_VERTEX = 30
  const MIN_VERTEX = 3

  const polygon = ref<LngLat[]>([...props.initial])
  const center = ref<LngLat>(props.center)
  const errorMsg = ref<string>('')

  watch(
    () => props.initial,
    (v) => {
      polygon.value = [...v]
    }
  )

  /** 地图 markers（显示顶点） */
  const mapMarkers = computed(() =>
    polygon.value.map((p, idx) => ({
      id: idx,
      latitude: p.lat,
      longitude: p.lng,
      width: 24,
      height: 24,
      iconPath: '/static/marker-dot.png',
      anchor: { x: 0.5, y: 0.5 }
    }))
  )

  /** 地图 polygons（已闭合的多边形） */
  const mapPolygons = computed(() => {
    if (polygon.value.length < 3) return []
    return [
      {
        points: polygon.value.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        strokeWidth: 2,
        strokeColor: '#2F80ED',
        fillColor: '#2F80ED33'
      }
    ]
  })

  /** 地图 polyline（未闭合时显示折线连接） */
  const mapPolyline = computed(() => {
    if (polygon.value.length < 2 || polygon.value.length >= 3) return []
    return [
      {
        points: polygon.value.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        color: '#2F80ED',
        width: 2
      }
    ]
  })

  /** 面积近似计算（球面投影 -> Shoelace）单位 m² */
  const areaSqMeter = computed<number>(() => {
    if (polygon.value.length < 3) return 0
    /* 简化：用平面 Shoelace + 经纬度 → 米 转换 */
    const RAD = Math.PI / 180
    const R = 6378137
    let sum = 0
    for (let i = 0; i < polygon.value.length; i++) {
      const a = polygon.value[i]
      const b = polygon.value[(i + 1) % polygon.value.length]
      sum += (b.lng - a.lng) * RAD * (2 + Math.sin(a.lat * RAD) + Math.sin(b.lat * RAD))
    }
    return Math.abs((sum * R * R) / 2)
  })

  const areaText = computed<string>(() => {
    const a = areaSqMeter.value
    if (a < 1000_000) return `${(a / 10000).toFixed(2)} 公顷`
    return `${(a / 1_000_000).toFixed(2)} km²`
  })

  /** 顶点连线是否自交（O(n²)） */
  function isSelfIntersecting(poly: LngLat[]): boolean {
    if (poly.length < 4) return false
    const segs: [LngLat, LngLat][] = []
    for (let i = 0; i < poly.length; i++) {
      segs.push([poly[i], poly[(i + 1) % poly.length]])
    }
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 2; j < segs.length; j++) {
        if (i === 0 && j === segs.length - 1) continue /* 首尾相邻 */
        if (intersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) return true
      }
    }
    return false
  }

  /** 线段相交判定 */
  function intersect(p1: LngLat, p2: LngLat, p3: LngLat, p4: LngLat): boolean {
    const d1 = direction(p3, p4, p1)
    const d2 = direction(p3, p4, p2)
    const d3 = direction(p1, p2, p3)
    const d4 = direction(p1, p2, p4)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true
    }
    return false
  }

  function direction(a: LngLat, b: LngLat, c: LngLat): number {
    return (c.lng - a.lng) * (b.lat - a.lat) - (b.lng - a.lng) * (c.lat - a.lat)
  }

  const tipText = computed<string>(() => {
    if (polygon.value.length === 0) return '点击地图新增顶点（至少 3 个）'
    if (polygon.value.length < MIN_VERTEX) return `还需 ${MIN_VERTEX - polygon.value.length} 个顶点`
    return '点击新增顶点 / 点击 marker 删除该顶点 / 长按地图编辑'
  })

  const canSave = computed<boolean>(
    () =>
      polygon.value.length >= MIN_VERTEX &&
      polygon.value.length <= MAX_VERTEX &&
      areaSqMeter.value > 0 &&
      !isSelfIntersecting(polygon.value)
  )

  function onMapTap(e: unknown) {
    const evt = e as { detail?: { latitude?: number; longitude?: number } }
    const lat = evt?.detail?.latitude
    const lng = evt?.detail?.longitude
    if (typeof lat !== 'number' || typeof lng !== 'number') return
    if (polygon.value.length >= MAX_VERTEX) {
      uni.showToast({ title: `最多 ${MAX_VERTEX} 个顶点`, icon: 'none' })
      return
    }
    polygon.value.push({ lat, lng })
    validatePolygon()
  }

  function onMarkerTap(e: unknown) {
    const evt = e as { detail?: { markerId?: number } }
    const idx = evt?.detail?.markerId
    if (typeof idx !== 'number') return
    uni.showActionSheet({
      itemList: ['删除该顶点'],
      success: (res) => {
        if (res.tapIndex === 0) {
          polygon.value.splice(idx, 1)
          validatePolygon()
        }
      }
    })
  }

  function validatePolygon() {
    if (polygon.value.length >= MIN_VERTEX) {
      if (isSelfIntersecting(polygon.value)) {
        errorMsg.value = '多边形自交，请调整顶点'
      } else if (areaSqMeter.value === 0) {
        errorMsg.value = '面积为 0'
      } else {
        errorMsg.value = ''
      }
    } else {
      errorMsg.value = ''
    }
  }

  function onUndo() {
    polygon.value.pop()
    validatePolygon()
  }

  function onClear() {
    uni.showModal({
      title: '清空',
      content: '确认清空所有顶点？',
      success: (res) => {
        if (res.confirm) {
          polygon.value = []
          errorMsg.value = ''
        }
      }
    })
  }

  function onSave() {
    if (!canSave.value) {
      uni.showToast({ title: errorMsg.value || '请检查多边形', icon: 'none' })
      return
    }
    logger.info('polygon.save', { vertexCount: polygon.value.length })
    emit('save', [...polygon.value])
  }
</script>

<style lang="scss" scoped>
  .pe {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .pe-tip {
    padding: 16rpx 24rpx;
    font-size: 24rpx;
    color: $uni-color-primary;
    background: $uni-color-primary-light;
  }

  .pe-map-wrap {
    flex: 1;
  }

  .pe-map {
    width: 100%;
    height: 100%;
    min-height: 600rpx;
  }

  .pe-controls {
    padding: 16rpx 24rpx 32rpx;
    background: #fff;
    border-top: 1rpx solid $uni-border-color;
  }

  .pe-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 24rpx;
    margin-bottom: 16rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;

    &__err {
      color: $uni-color-error;
    }
  }

  .pe-btns {
    display: flex;
    gap: 16rpx;
  }
</style>
