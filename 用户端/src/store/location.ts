/**
 * @file store/location.ts
 * @stage P5/T5.5 (Sprint 1)
 * @desc 定位与地址 Store：当前坐标、当前城市、当前收货地址
 * @author 单 Agent V2.0
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { City, UserAddress, LngLat } from '@/types/biz'
import { getStorage, setStorage, STORAGE_KEYS } from '@/utils/storage'

export const useLocationStore = defineStore(
  'location',
  () => {
    /** 当前定位坐标 */
    const coord = ref<LngLat | null>(null)
    /** 当前城市（用户手动选择 / 定位） */
    const city = ref<City | null>(null)
    /** 当前收货地址（外卖 / 跑腿默认地址） */
    const currentAddress = ref<UserAddress | null>(null)
    /** 是否已请求过定位授权 */
    const hasRequestedLocation = ref<boolean>(false)

    /** 设置当前定位坐标 */
    function setCoord(lng: number, lat: number) {
      coord.value = { lng, lat }
    }

    /** 设置当前城市 */
    function setCity(c: City) {
      city.value = c
      setStorage(STORAGE_KEYS.CITY, c)
    }

    /** 设置当前收货地址 */
    function setCurrentAddress(addr: UserAddress | null) {
      currentAddress.value = addr
      if (addr) setStorage(STORAGE_KEYS.ADDRESS, addr)
    }

    /** 启动时恢复 */
    function restore() {
      const c = getStorage<City>(STORAGE_KEYS.CITY)
      if (c) city.value = c
      const a = getStorage<UserAddress>(STORAGE_KEYS.ADDRESS)
      if (a) currentAddress.value = a
    }

    /** 标记已请求过授权（避免反复弹窗） */
    function markRequested() {
      hasRequestedLocation.value = true
    }

    return {
      coord,
      city,
      currentAddress,
      hasRequestedLocation,
      setCoord,
      setCity,
      setCurrentAddress,
      restore,
      markRequested
    }
  },
  {
    persist: {
      key: 'o2o-location',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['city', 'currentAddress']
    }
  }
)
