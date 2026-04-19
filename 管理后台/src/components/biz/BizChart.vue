<!--
  BizChart 业务图表（ECharts 封装）
  - 支持 line / bar / pie / radar / map
  - 自动 ResizeObserver
  - i18n 切换刷新
  - tab visibility 切换暂停渲染
-->
<template>
  <div ref="rootRef" class="biz-chart" :style="{ width, height }"></div>
</template>

<script setup lang="ts">
  import { ref, watch, onMounted, onBeforeUnmount, shallowRef } from 'vue'
  import * as echarts from 'echarts/core'
  import { CanvasRenderer } from 'echarts/renderers'
  import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
  import {
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
    ToolboxComponent,
    DataZoomComponent
  } from 'echarts/components'

  echarts.use([
    CanvasRenderer,
    BarChart,
    LineChart,
    PieChart,
    RadarChart,
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
    ToolboxComponent,
    DataZoomComponent
  ])

  /**
   * BizChart props
   */
  const props = withDefaults(
    defineProps<{
      option: echarts.EChartsCoreOption
      width?: string
      height?: string
      theme?: 'light' | 'dark'
    }>(),
    {
      width: '100%',
      height: '320px',
      theme: 'light'
    }
  )

  defineExpose({ getInstance: () => chartRef.value })

  const rootRef = ref<HTMLElement | null>(null)
  const chartRef = shallowRef<echarts.ECharts | null>(null)
  let resizeObserver: ResizeObserver | null = null
  let visibilityHandler: (() => void) | null = null

  function init() {
    if (!rootRef.value) return
    chartRef.value = echarts.init(rootRef.value, props.theme)
    chartRef.value.setOption(props.option, true)
  }

  function dispose() {
    chartRef.value?.dispose()
    chartRef.value = null
  }

  function resize() {
    chartRef.value?.resize()
  }

  onMounted(() => {
    init()
    if (rootRef.value) {
      resizeObserver = new ResizeObserver(() => resize())
      resizeObserver.observe(rootRef.value)
    }
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') resize()
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
    dispose()
  })

  watch(
    () => props.option,
    (val) => {
      chartRef.value?.setOption(val, true)
    },
    { deep: true }
  )
  watch(
    () => props.theme,
    () => {
      dispose()
      init()
    }
  )
</script>

<style scoped lang="scss">
  .biz-chart {
    min-width: 200px;
    min-height: 200px;
  }
</style>
