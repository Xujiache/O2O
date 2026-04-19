<!--
  P8 骑手详情（V8.13 - 含轨迹回放）
  - 基础信息卡 + 评分 + 在线状态
  - 轨迹时间轴回放（SVG 模拟，真集成高德归 P9）
-->
<template>
  <div class="biz-rider-detail" v-loading="loading">
    <ElPageHeader @back="$router.back()">
      <template #content>
        <span style="font-size: 18px">骑手详情</span>
      </template>
    </ElPageHeader>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>基础信息</template>
      <ElDescriptions :column="3" border>
        <ElDescriptionsItem label="ID">{{ info.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="姓名">{{ info.realName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="手机">{{ maskMobile(info.mobile) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="城市">{{ info.cityName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="等级">Lv.{{ info.level }}</ElDescriptionsItem>
        <ElDescriptionsItem label="评分">{{ info.rating?.toFixed(1) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="在线状态">
          <BizStatus type="RIDER_ONLINE_STATUS" :code="info.onlineStatus" />
        </ElDescriptionsItem>
        <ElDescriptionsItem label="今日订单">{{ info.todayOrders }}</ElDescriptionsItem>
        <ElDescriptionsItem label="今日收入">{{
          formatAmount(info.todayIncome)
        }}</ElDescriptionsItem>
      </ElDescriptions>
    </ElCard>

    <ElCard shadow="hover" style="margin-top: 12px">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span>配送轨迹回放（{{ trackPoints.length }} 个点）</span>
          <div>
            <ElButton size="small" :type="playing ? 'warning' : 'primary'" @click="togglePlay">
              {{ playing ? '暂停' : '播放' }}
            </ElButton>
            <ElButton size="small" @click="reset">重置</ElButton>
          </div>
        </div>
      </template>
      <div class="track-canvas">
        <svg viewBox="0 0 800 480" class="track-svg">
          <polyline
            v-if="trackPoints.length > 1"
            :points="svgLineStr"
            fill="none"
            stroke="#409eff"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle
            v-for="(p, idx) in svgPoints"
            :key="idx"
            :cx="p.x"
            :cy="p.y"
            r="3"
            :fill="idx === playIdx ? '#f56c6c' : '#409eff'"
          />
          <circle
            v-if="currentPos"
            :cx="currentPos.x"
            :cy="currentPos.y"
            r="10"
            fill="rgba(245, 108, 108, 0.6)"
          />
        </svg>
      </div>
      <ElSlider
        v-model="playIdx"
        :max="Math.max(trackPoints.length - 1, 0)"
        :show-tooltip="false"
        :marks="sliderMarks"
        @input="onSlide"
      />
      <div v-if="currentPoint" class="track-info">
        <span>时间：{{ fmtDateTime(currentPoint.ts) }}</span>
        <span>速度：{{ currentPoint.speed?.toFixed(1) || 0 }} km/h</span>
        <span>状态：{{ currentPoint.bizStatus }}</span>
        <span>坐标：{{ currentPoint.lng.toFixed(5) }}, {{ currentPoint.lat.toFixed(5) }}</span>
      </div>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
  import { useRoute } from 'vue-router'
  import {
    ElCard,
    ElDescriptions,
    ElDescriptionsItem,
    ElButton,
    ElSlider,
    ElPageHeader,
    vLoading
  } from 'element-plus'
  import { riderApi } from '@/api/business'
  import type { BizRider, RiderTrackPoint } from '@/types/business'
  import { BizStatus } from '@/components/biz'
  import { maskMobile, formatAmount, fmtDateTime } from '@/utils/business/format'

  const route = useRoute()
  const info = ref<(BizRider & { recentOrders?: unknown[]; rewards?: unknown[] }) | null>(null)
  const loading = ref(false)
  const trackPoints = ref<RiderTrackPoint[]>([])
  const playIdx = ref(0)
  const playing = ref(false)
  let playTimer: ReturnType<typeof setInterval> | null = null

  const SVG_W = 800
  const SVG_H = 480

  const projection = computed(() => {
    if (trackPoints.value.length === 0) {
      return { minLng: 116, maxLng: 117, minLat: 39, maxLat: 40 }
    }
    const lngs = trackPoints.value.map((p) => p.lng)
    const lats = trackPoints.value.map((p) => p.lat)
    return {
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats)
    }
  })

  function toSvg(p: RiderTrackPoint): { x: number; y: number } {
    const { minLng, maxLng, minLat, maxLat } = projection.value
    const wRange = Math.max(maxLng - minLng, 1e-6)
    const hRange = Math.max(maxLat - minLat, 1e-6)
    return {
      x: 40 + ((p.lng - minLng) / wRange) * (SVG_W - 80),
      y: 40 + (1 - (p.lat - minLat) / hRange) * (SVG_H - 80)
    }
  }

  const svgPoints = computed(() => trackPoints.value.map(toSvg))
  const svgLineStr = computed(() => svgPoints.value.map((p) => `${p.x},${p.y}`).join(' '))
  const currentPos = computed(() => svgPoints.value[playIdx.value])
  const currentPoint = computed(() => trackPoints.value[playIdx.value])

  const sliderMarks = computed(() => {
    const total = trackPoints.value.length
    if (!total) return {}
    const out: Record<number, string> = { 0: '起点', [total - 1]: '终点' }
    return out
  })

  async function load() {
    loading.value = true
    try {
      const id = route.params.id as string
      info.value = (await riderApi.detail(id)) as typeof info.value
      trackPoints.value = await riderApi.track(id)
      playIdx.value = 0
    } catch (e) {
      console.warn('[RiderDetail] load failed', e)
    } finally {
      loading.value = false
    }
  }

  function togglePlay() {
    if (playing.value) {
      stopPlay()
    } else {
      startPlay()
    }
  }
  function startPlay() {
    if (!trackPoints.value.length) return
    playing.value = true
    playTimer = setInterval(() => {
      if (playIdx.value >= trackPoints.value.length - 1) {
        stopPlay()
        return
      }
      playIdx.value++
    }, 200)
  }
  function stopPlay() {
    playing.value = false
    if (playTimer) {
      clearInterval(playTimer)
      playTimer = null
    }
  }
  function reset() {
    stopPlay()
    playIdx.value = 0
  }
  function onSlide() {
    if (playing.value) stopPlay()
  }

  onMounted(load)
  onBeforeUnmount(() => stopPlay())
</script>

<style scoped lang="scss">
  .biz-rider-detail {
    padding: 12px;
  }

  .track-canvas {
    margin-bottom: 12px;
  }

  .track-svg {
    display: block;
    width: 100%;
    height: 480px;
    background:
      repeating-linear-gradient(
        0deg,
        transparent 39px,
        var(--el-border-color-lighter) 39px,
        var(--el-border-color-lighter) 40px
      ),
      repeating-linear-gradient(
        90deg,
        transparent 39px,
        var(--el-border-color-lighter) 39px,
        var(--el-border-color-lighter) 40px
      ),
      var(--el-bg-color-page);
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
  }

  .track-info {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 8px 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>
