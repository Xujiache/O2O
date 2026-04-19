/**
 * @file location.ts
 * @stage P5/T5.9 (Sprint 1)
 * @desc 定位授权 + 获取当前位置 + 反查城市；包装 uni.getLocation
 * @author 单 Agent V2.0
 */
import { logger } from './logger'
import { useLocationStore } from '@/store/location'
import { regeocode, getOpenedCities } from '@/api/map'

/**
 * 请求位置授权（首次进入触发）
 * @returns 是否已授权
 */
export async function ensureLocationAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.getSetting({
      success: (res) => {
        const auth = res.authSetting['scope.userLocation']
        if (auth) {
          resolve(true)
          return
        }
        if (auth === false) {
          uni.showModal({
            title: '位置授权',
            content: '需要您的位置以展示附近店铺与配送范围。请前往设置开启。',
            confirmText: '去设置',
            success: (m) => {
              if (m.confirm) {
                uni.openSetting({ success: () => resolve(false), fail: () => resolve(false) })
              } else {
                resolve(false)
              }
            }
          })
          return
        }
        uni.authorize({
          scope: 'scope.userLocation',
          success: () => resolve(true),
          fail: () => resolve(false)
        })
      },
      fail: () => resolve(false)
    })
  })
}

/**
 * 获取一次当前位置（已授权前提下）
 */
export function getCurrentLocation(): Promise<{ lng: number; lat: number } | null> {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      success: (res) => resolve({ lng: res.longitude, lat: res.latitude }),
      fail: (err) => {
        logger.warn('location.getLocation.fail', { err: String(err.errMsg ?? '') })
        resolve(null)
      }
    })
  })
}

/**
 * 选择地址（地图选择器）
 */
export function chooseLocation(): Promise<{
  name: string
  address: string
  lng: number
  lat: number
} | null> {
  return new Promise((resolve) => {
    uni.chooseLocation({
      success: (res) => {
        resolve({
          name: res.name,
          address: res.address,
          lng: res.longitude,
          lat: res.latitude
        })
      },
      fail: (err) => {
        logger.warn('location.chooseLocation.fail', { err: String(err.errMsg ?? '') })
        resolve(null)
      }
    })
  })
}

/**
 * 自动定位并匹配城市
 * 1. 请求授权
 * 2. uni.getLocation
 * 3. 调后端 /map/regeocode 拿城市
 * 4. 写 location store；返回结果
 */
export async function autoLocate(): Promise<{
  coord: { lng: number; lat: number } | null
  cityCode: string | null
  cityName: string | null
}> {
  const store = useLocationStore()
  const ok = await ensureLocationAuth()
  store.markRequested()
  if (!ok) {
    logger.info('location.unauthorized')
    return { coord: null, cityCode: null, cityName: null }
  }
  const coord = await getCurrentLocation()
  if (!coord) return { coord: null, cityCode: null, cityName: null }
  store.setCoord(coord.lng, coord.lat)
  try {
    const r = await regeocode({ lng: coord.lng, lat: coord.lat })
    store.setCity({
      cityCode: r.cityCode,
      cityName: r.city,
      pinyin: '',
      letter: ''
    })
    return { coord, cityCode: r.cityCode, cityName: r.city }
  } catch (e) {
    logger.warn('location.regeocode.fail', { e: String(e) })
    return { coord, cityCode: null, cityName: null }
  }
}

/** 拉取已开通城市列表（用于切换） */
export async function loadOpenedCities() {
  try {
    return await getOpenedCities()
  } catch (e) {
    logger.warn('location.openedCities.fail', { e: String(e) })
    return []
  }
}
