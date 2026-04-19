/**
 * @file navigator.ts
 * @stage P7/T7.24 (Sprint 3)
 * @desc 外跳第三方地图导航 schema 构造
 *
 * 高德/百度 schema：
 *   amap:    androidamap://route?sourceApplication=O2O&sname=骑手位置&dlat=&dlon=&dname=&dev=0&t=0
 *   baidu:   baidumap://map/direction?origin=lat,lng&destination=lat,lng&mode=riding&src=O2O
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'
import { getStorage, setStorage, STORAGE_KEYS } from './storage'

/** 支持的导航 vendor */
export type NavVendor = 'amap' | 'baidu'

/** 导航参数 */
export interface NavParams {
  /** 起点（不传则用"我的位置"） */
  fromLat?: number
  fromLng?: number
  fromName?: string
  /** 终点 */
  toLat: number
  toLng: number
  toName: string
  /** 出行方式：drive / ride / walk */
  mode?: 'drive' | 'ride' | 'walk'
}

/** 默认 vendor 偏好 */
export function getDefaultVendor(): NavVendor {
  return getStorage<NavVendor>(STORAGE_KEYS.NAV_VENDOR) ?? 'amap'
}

/** 设置默认 vendor 偏好 */
export function setDefaultVendor(v: NavVendor): void {
  setStorage(STORAGE_KEYS.NAV_VENDOR, v)
}

/** 高德 schema */
function buildAmapUrl(params: NavParams): string {
  const t = params.mode === 'walk' ? 4 : params.mode === 'ride' ? 3 : 0
  const dest = `dlat=${params.toLat}&dlon=${params.toLng}&dname=${encodeURIComponent(params.toName)}`
  return `androidamap://route?sourceApplication=O2O-Rider&${dest}&dev=0&t=${t}`
}

/** 百度 schema（坐标系 gcj02 → bd09 简化忽略，实际可用 gcj02） */
function buildBaiduUrl(params: NavParams): string {
  const mode = params.mode === 'walk' ? 'walking' : params.mode === 'ride' ? 'riding' : 'driving'
  const origin =
    params.fromLat && params.fromLng ? `${params.fromLat},${params.fromLng}` : '我的位置'
  const dest = `${params.toLat},${params.toLng}`
  return `baidumap://map/direction?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&mode=${mode}&coord_type=gcj02&src=O2O-Rider`
}

/**
 * 调起外部地图 APP
 * @returns 'opened' / 'no-app' / 'error'
 */
export function openExternalNav(
  vendor: NavVendor,
  params: NavParams
): Promise<'opened' | 'no-app' | 'error'> {
  return new Promise((resolve) => {
    try {
      const url = vendor === 'amap' ? buildAmapUrl(params) : buildBaiduUrl(params)
      const p = (
        globalThis as {
          plus?: { runtime?: { openURL?: (url: string, error?: () => void) => void } }
        }
      ).plus
      if (!p?.runtime?.openURL) {
        logger.warn('navigator.openURL.unavailable', { vendor })
        resolve('no-app')
        return
      }
      p.runtime.openURL(url, () => resolve('no-app'))
      resolve('opened')
    } catch (e) {
      logger.warn('navigator.open.fail', { e: String(e) })
      resolve('error')
    }
  })
}

/**
 * 弹出导航选择 ActionSheet（高德 / 百度 / 内置地图）
 */
export function showNavChoose(params: NavParams): Promise<NavVendor | 'inner' | null> {
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: ['高德地图', '百度地图', '内置地图'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          setDefaultVendor('amap')
          void openExternalNav('amap', params)
          resolve('amap')
        } else if (tapIndex === 1) {
          setDefaultVendor('baidu')
          void openExternalNav('baidu', params)
          resolve('baidu')
        } else {
          resolve('inner')
        }
      },
      fail: () => resolve(null)
    })
  })
}
