/**
 * @file store/shop.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc 店铺 Store：当前 shopId、店铺信息列表、营业状态、自动接单开关
 *
 * 自动注入 X-Mchnt-Shop-Id 头：通过 setShopIdProvider 把 currentShopId 暴露给 request
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Shop } from '@/types/biz'
import { getStorage, setStorage, STORAGE_KEYS } from '@/utils/storage'
import { setShopIdProvider } from '@/utils/request'
import { logger } from '@/utils/logger'

/** 店铺 Store */
export const useShopStore = defineStore(
  'shop',
  () => {
    /** 当前店铺 ID */
    const currentShopId = ref<string>('')
    /** 用户的店铺列表 */
    const shopList = ref<Shop[]>([])
    /** 当前店铺详情 */
    const currentShop = ref<Shop | null>(null)

    /** 是否营业中 */
    const isOpen = computed<boolean>(() => currentShop.value?.isOpen === 1)
    /** 自动接单是否开启 */
    const autoAccept = computed<boolean>(() => currentShop.value?.autoAccept === 1)

    /** 启动时恢复 */
    function restore() {
      const sid = getStorage<string>(STORAGE_KEYS.CURRENT_SHOP_ID)
      if (sid) currentShopId.value = sid
    }

    /** 设置店铺列表 */
    function setShopList(list: Shop[]) {
      shopList.value = list
      /* 若当前 shopId 不在列表中，回退到第一个 */
      if (currentShopId.value && !list.find((s) => s.id === currentShopId.value)) {
        currentShopId.value = list[0]?.id ?? ''
      }
      if (!currentShopId.value && list.length > 0) {
        currentShopId.value = list[0].id
      }
      currentShop.value = list.find((s) => s.id === currentShopId.value) ?? null
    }

    /** 切换当前店铺 */
    function switchShop(shopId: string) {
      const s = shopList.value.find((x) => x.id === shopId)
      if (!s) {
        logger.warn('shop.switch.notfound', { shopId })
        return
      }
      currentShopId.value = shopId
      currentShop.value = s
      setStorage(STORAGE_KEYS.CURRENT_SHOP_ID, shopId)
      logger.info('shop.switch', { shopId, name: s.name })
    }

    /** 更新当前店铺信息（编辑后） */
    function updateCurrentShop(patch: Partial<Shop>) {
      if (!currentShop.value) return
      currentShop.value = { ...currentShop.value, ...patch }
      const idx = shopList.value.findIndex((s) => s.id === currentShopId.value)
      if (idx >= 0) {
        shopList.value[idx] = { ...shopList.value[idx], ...patch }
      }
    }

    /** 切换营业状态 */
    function toggleOpen(isOpenVal: 0 | 1 | 2 | 3) {
      updateCurrentShop({ isOpen: isOpenVal })
    }

    /** 切换自动接单 */
    function toggleAutoAccept(val: 0 | 1) {
      updateCurrentShop({ autoAccept: val })
    }

    /* 注入 currentShopId 到 request 模块（用于 X-Mchnt-Shop-Id 头） */
    setShopIdProvider(() => currentShopId.value || null)

    /* 监听 currentShopId 变化做日志 */
    watch(currentShopId, (v) => {
      logger.debug('shop.currentShopId.change', { v })
    })

    return {
      currentShopId,
      shopList,
      currentShop,
      isOpen,
      autoAccept,
      restore,
      setShopList,
      switchShop,
      updateCurrentShop,
      toggleOpen,
      toggleAutoAccept
    }
  },
  {
    persist: {
      key: 'o2o_mchnt_shop',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['currentShopId']
    }
  }
)
