<template>
  <view class="sc">
    <view v-if="loading" class="sc-loading">加载中...</view>
    <view v-else-if="!points.length" class="sc-empty">{{ emptyText }}</view>
    <view v-else class="sc-svg">
      <!-- 简易折线图（uni-app 跨端兼容；S5 可替换为 ucharts） -->
      <view class="sc-axis-y">
        <text v-for="v in yLabels" :key="v" class="sc-axis-y__label">{{ v }}</text>
      </view>
      <view class="sc-canvas">
        <view
          v-for="(p, idx) in pointsScaled"
          :key="idx"
          class="sc-dot"
          :style="{ left: `${p.x}%`, bottom: `${p.y}%` }"
        />
        <view
          v-for="(line, idx) in linesScaled"
          :key="`l${idx}`"
          class="sc-line"
          :style="{
            left: `${line.x1}%`,
            bottom: `${line.y1}%`,
            width: `${line.len}%`,
            transform: `rotate(${line.angle}deg)`,
            transformOrigin: '0 50%'
          }"
        />
      </view>
      <view class="sc-axis-x">
        <text v-for="(p, idx) in xLabels" :key="idx" class="sc-axis-x__label">{{ p }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  /**
   * 简易统计图表（折线 / 柱状）
   *
   * 接口：
   *   - data: 数据点数组
   *   - type: 'line' | 'bar'
   *
   * S5 阶段会替换为 ucharts 完整图表组件；S2 仅用于工作台评分曲线
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.11)
   */
  interface DataPoint {
    label: string
    value: number
  }

  interface Props {
    data: DataPoint[]
    loading?: boolean
    type?: 'line' | 'bar'
    emptyText?: string
    /** y 轴最小/最大值（不传则自动计算） */
    yMin?: number
    yMax?: number
  }

  const props = withDefaults(defineProps<Props>(), {
    data: () => [],
    loading: false,
    type: 'line',
    emptyText: '暂无数据',
    yMin: undefined,
    yMax: undefined
  })

  const points = computed<DataPoint[]>(() => props.data)

  const yMin = computed<number>(() => {
    if (props.yMin !== undefined) return props.yMin
    if (!points.value.length) return 0
    return Math.min(...points.value.map((p) => p.value))
  })

  const yMax = computed<number>(() => {
    if (props.yMax !== undefined) return props.yMax
    if (!points.value.length) return 100
    return Math.max(...points.value.map((p) => p.value))
  })

  const yRange = computed<number>(() => yMax.value - yMin.value || 1)

  const yLabels = computed<string[]>(() => {
    const max = yMax.value
    const min = yMin.value
    return [max.toFixed(1), ((max + min) / 2).toFixed(1), min.toFixed(1)]
  })

  const xLabels = computed<string[]>(() =>
    points.value
      .filter((_, idx) => idx % Math.ceil(points.value.length / 6) === 0)
      .map((p) => p.label)
  )

  /** 把 data 投影到 0-100 百分比 */
  const pointsScaled = computed(() =>
    points.value.map((p, idx) => ({
      x: (idx / (points.value.length - 1 || 1)) * 100,
      y: ((p.value - yMin.value) / yRange.value) * 100
    }))
  )

  /** 折线段 */
  const linesScaled = computed(() => {
    const r: { x1: number; y1: number; len: number; angle: number }[] = []
    for (let i = 0; i < pointsScaled.value.length - 1; i++) {
      const a = pointsScaled.value[i]
      const b = pointsScaled.value[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.sqrt(dx * dx + dy * dy)
      const angle = -Math.atan2(dy, dx) * (180 / Math.PI)
      r.push({ x1: a.x, y1: a.y, len, angle })
    }
    return r
  })
</script>

<style lang="scss" scoped>
  .sc {
    position: relative;
    width: 100%;
    height: 280rpx;
  }

  .sc-loading,
  .sc-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .sc-svg {
    position: relative;
    height: 100%;
    padding: 0 24rpx 32rpx 80rpx;
  }

  .sc-axis-y {
    position: absolute;
    top: 0;
    bottom: 32rpx;
    left: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 80rpx;

    &__label {
      font-size: 20rpx;
      color: $uni-text-color-grey;
      text-align: right;
    }
  }

  .sc-canvas {
    position: relative;
    height: 100%;
    border-bottom: 1rpx solid $uni-border-color;
    border-left: 1rpx solid $uni-border-color;
  }

  .sc-dot {
    position: absolute;
    width: 8rpx;
    height: 8rpx;
    background: $uni-color-primary;
    border-radius: 50%;
    transform: translate(-50%, 50%);
  }

  .sc-line {
    position: absolute;
    height: 2rpx;
    background: $uni-color-primary;
  }

  .sc-axis-x {
    position: absolute;
    right: 24rpx;
    bottom: 0;
    left: 80rpx;
    display: flex;
    justify-content: space-between;

    &__label {
      font-size: 20rpx;
      color: $uni-text-color-grey;
    }
  }
</style>
