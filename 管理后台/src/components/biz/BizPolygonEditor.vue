<!--
  BizPolygonEditor 多边形编辑器（V8.9 店铺配送范围 / V8.26 城市区域 polygon）
  - 顶点数 3-30
  - 自交检测
  - 球面 Shoelace 面积计算（km²）
  - 双向绑定 [{lng, lat}]
  - 默认用 SVG 实现简易编辑（管理后台 Web 高德 SDK 真集成归 P9）
-->
<template>
  <div class="biz-polygon-editor">
    <div class="biz-polygon-editor__toolbar">
      <ElButton size="small" :type="mode === 'add' ? 'primary' : 'default'" @click="mode = 'add'">
        新增顶点
      </ElButton>
      <ElButton size="small" :type="mode === 'drag' ? 'primary' : 'default'" @click="mode = 'drag'">
        拖动顶点
      </ElButton>
      <ElButton size="small" type="danger" @click="reset">清空</ElButton>
      <span class="biz-polygon-editor__info">
        顶点：{{ points.length }} / 30 ｜ 面积：{{ areaKm2.toFixed(3) }} km²
      </span>
      <ElTag v-if="!isValid" type="danger" size="small">{{ errMsg }}</ElTag>
      <ElTag v-else type="success" size="small">合法</ElTag>
    </div>

    <svg
      ref="svgRef"
      class="biz-polygon-editor__svg"
      viewBox="0 0 800 500"
      @click="onClick"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
    >
      <polygon
        v-if="points.length >= 3"
        :points="svgPolygonStr"
        fill="rgba(64, 158, 255, 0.18)"
        stroke="#409eff"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <polyline
        v-else-if="points.length === 2"
        :points="svgPolygonStr"
        fill="none"
        stroke="#409eff"
        stroke-width="2"
      />
      <circle
        v-for="(p, idx) in points"
        :key="idx"
        :cx="toSvgX(p.lng)"
        :cy="toSvgY(p.lat)"
        r="6"
        :fill="idx === draggingIdx ? '#f56c6c' : '#409eff'"
        stroke="#fff"
        stroke-width="2"
        @mousedown.stop="onMouseDown(idx)"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ElButton, ElTag } from 'element-plus'

  interface Pt {
    lng: number
    lat: number
  }

  const props = withDefaults(
    defineProps<{
      modelValue: Pt[]
      /** 中心点 lng/lat（用于 SVG 投影） */
      center?: { lng: number; lat: number }
      /** 投影 km/单位 */
      kmPerSvgUnit?: number
    }>(),
    {
      modelValue: () => [],
      center: () => ({ lng: 116.397428, lat: 39.90923 }),
      kmPerSvgUnit: 0.01
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', val: Pt[]): void
    (e: 'change', val: Pt[]): void
  }>()

  const points = ref<Pt[]>([...props.modelValue])
  const mode = ref<'add' | 'drag'>('add')
  const draggingIdx = ref<number | null>(null)
  const svgRef = ref<SVGElement | null>(null)

  watch(
    () => props.modelValue,
    (val) => {
      points.value = [...val]
    },
    { deep: true }
  )

  const SVG_W = 800
  const SVG_H = 500

  function toSvgX(lng: number): number {
    return SVG_W / 2 + ((lng - props.center.lng) / props.kmPerSvgUnit) * 50
  }
  function toSvgY(lat: number): number {
    return SVG_H / 2 - ((lat - props.center.lat) / props.kmPerSvgUnit) * 50
  }
  function fromSvgX(x: number): number {
    return props.center.lng + ((x - SVG_W / 2) / 50) * props.kmPerSvgUnit
  }
  function fromSvgY(y: number): number {
    return props.center.lat - ((y - SVG_H / 2) / 50) * props.kmPerSvgUnit
  }

  const svgPolygonStr = computed(() =>
    points.value.map((p) => `${toSvgX(p.lng)},${toSvgY(p.lat)}`).join(' ')
  )

  function onClick(e: MouseEvent) {
    if (mode.value !== 'add') return
    if (points.value.length >= 30) return
    const rect = (svgRef.value as SVGElement).getBoundingClientRect()
    const sx = ((e.clientX - rect.left) / rect.width) * SVG_W
    const sy = ((e.clientY - rect.top) / rect.height) * SVG_H
    points.value.push({ lng: fromSvgX(sx), lat: fromSvgY(sy) })
    emitChange()
  }

  function onMouseDown(idx: number) {
    if (mode.value !== 'drag') return
    draggingIdx.value = idx
  }
  function onMouseUp() {
    draggingIdx.value = null
  }
  function onMouseMove(e: MouseEvent) {
    if (draggingIdx.value === null || !svgRef.value) return
    const rect = (svgRef.value as SVGElement).getBoundingClientRect()
    const sx = ((e.clientX - rect.left) / rect.width) * SVG_W
    const sy = ((e.clientY - rect.top) / rect.height) * SVG_H
    points.value[draggingIdx.value] = { lng: fromSvgX(sx), lat: fromSvgY(sy) }
    emitChange()
  }

  function reset() {
    points.value = []
    draggingIdx.value = null
    emitChange()
  }

  function emitChange() {
    emit('update:modelValue', [...points.value])
    emit('change', [...points.value])
  }

  /** 球面 Shoelace 面积（km²） */
  const areaKm2 = computed(() => {
    if (points.value.length < 3) return 0
    const R = 6378.137
    let area = 0
    for (let i = 0; i < points.value.length; i++) {
      const p1 = points.value[i]
      const p2 = points.value[(i + 1) % points.value.length]
      const lon1 = (p1.lng * Math.PI) / 180
      const lon2 = (p2.lng * Math.PI) / 180
      const lat1 = (p1.lat * Math.PI) / 180
      const lat2 = (p2.lat * Math.PI) / 180
      area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2))
    }
    return Math.abs((area * R * R) / 2)
  })

  /** 简单自交检测：相邻边不算自交 */
  function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const d1 = direction(c, d, a)
    const d2 = direction(c, d, b)
    const d3 = direction(a, b, c)
    const d4 = direction(a, b, d)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
      return true
    return false
  }
  function direction(a: Pt, b: Pt, c: Pt): number {
    return (c.lng - a.lng) * (b.lat - a.lat) - (b.lng - a.lng) * (c.lat - a.lat)
  }
  /** 计算合法性与错误消息，纯函数无副作用 */
  function validate(): { ok: boolean; msg: string } {
    if (points.value.length < 3) return { ok: false, msg: '至少 3 个顶点' }
    if (points.value.length > 30) return { ok: false, msg: '最多 30 个顶点' }
    const n = points.value.length
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue
        if (
          segmentsIntersect(
            points.value[i],
            points.value[(i + 1) % n],
            points.value[j],
            points.value[(j + 1) % n]
          )
        ) {
          return { ok: false, msg: '存在自交' }
        }
      }
    }
    return { ok: true, msg: '' }
  }
  const validation = computed(() => validate())
  const isValid = computed(() => validation.value.ok)
  const errMsg = computed(() => validation.value.msg)

  defineExpose({ areaKm2, isValid })
</script>

<style scoped lang="scss">
  .biz-polygon-editor {
    border: 1px solid var(--el-border-color);
    border-radius: 6px;

    &__toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--el-border-color);
    }

    &__info {
      margin-left: 8px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__svg {
      display: block;
      width: 100%;
      height: 480px;
      cursor: crosshair;
      user-select: none;
      background:
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 39px,
          var(--el-border-color-lighter) 39px,
          var(--el-border-color-lighter) 40px
        ),
        repeating-linear-gradient(
          90deg,
          transparent,
          transparent 39px,
          var(--el-border-color-lighter) 39px,
          var(--el-border-color-lighter) 40px
        ),
        var(--el-bg-color-page);
    }
  }
</style>
