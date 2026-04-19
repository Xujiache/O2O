<template>
  <view class="page page-da">
    <BizPolygonEditor :initial="initialPolygon" :center="center" @save="onSave" />
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import type { LngLat } from '@/types/biz'
  import { getDeliveryArea, setDeliveryArea } from '@/api/shop'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 配送范围编辑（T6.14 重难点）
   *
   * 复用 BizPolygonEditor 组件
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.14)
   */
  const shopStore = useShopStore()
  const initialPolygon = ref<LngLat[]>([])
  const center = ref<LngLat>({ lng: 121.4737, lat: 31.2304 })

  onMounted(async () => {
    if (!shopStore.currentShopId) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    track(TRACK.VIEW_DELIVERY_AREA)
    if (shopStore.currentShop) {
      center.value = { lng: shopStore.currentShop.lng, lat: shopStore.currentShop.lat }
    }
    try {
      const list = mockEnabled()
        ? await delay([] as LngLat[])
        : await getDeliveryArea(shopStore.currentShopId)
      initialPolygon.value = list ?? []
    } catch (e) {
      logger.warn('da.load.fail', { e: String(e) })
    }
  })

  async function onSave(polygon: LngLat[]) {
    try {
      if (!mockEnabled()) {
        await setDeliveryArea(shopStore.currentShopId, polygon)
      }
      track(TRACK.EDIT_DELIVERY_AREA, { vertexCount: polygon.length })
      uni.showToast({ title: '配送范围已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 1000)
    } catch (e) {
      logger.warn('da.save.fail', { e: String(e) })
    }
  }
</script>

<style lang="scss" scoped>
  .page-da {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }
</style>
