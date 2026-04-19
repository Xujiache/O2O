/**
 * @file store/order.ts
 * @stage P7/T7.17~T7.25 (Sprint 3)
 * @desc 订单 Store：列表 / 详情 / 配送动作（取件、送达、转单、异常）
 *
 * P5 教训：订单 Tab 必须 status + 子条件唯一区分（避免 statusIn:[55] 重复）
 *   骑手端 6 Tab：pending(20) / picking(30) / delivering(40) / finished(50) / canceled(60) / abnormal(isException=1)
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  RiderOrder,
  RiderOrderTab,
  RiderOrderListParams,
  RiderAbnormalReport,
  RiderTransferApply
} from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'
import { logger } from '@/utils/logger'
import { track, TRACK } from '@/utils/track'

const PAGE_SIZE = 20

/** 单 Tab 缓存（含分页 cursor） */
interface TabState {
  list: RiderOrder[]
  cursor: string | null
  hasMore: boolean
  loading: boolean
  loaded: boolean
  /** 上次刷新时间戳（onShow 节流） */
  lastRefreshTs: number
}

function emptyTab(): TabState {
  return {
    list: [],
    cursor: null,
    hasMore: true,
    loading: false,
    loaded: false,
    lastRefreshTs: 0
  }
}

/** 订单 Store */
export const useOrderStore = defineStore('order', () => {
  const currentTab = ref<RiderOrderTab>('pending')
  const tabs = ref<Record<RiderOrderTab, TabState>>({
    pending: emptyTab(),
    picking: emptyTab(),
    delivering: emptyTab(),
    finished: emptyTab(),
    canceled: emptyTab(),
    abnormal: emptyTab()
  })
  /** 各 Tab 计数（badge 用） */
  const tabCounts = ref<Record<RiderOrderTab, number>>({
    pending: 0,
    picking: 0,
    delivering: 0,
    finished: 0,
    canceled: 0,
    abnormal: 0
  })
  /** 当前查看的订单详情缓存 */
  const detailCache = ref<Record<string, RiderOrder>>({})
  /** 进行中订单聚合（工作台用） */
  const inProgress = ref<RiderOrder[]>([])

  /**
   * 加载某 Tab 列表
   * @param tab Tab 名
   * @param refresh 是否重置游标
   */
  async function loadTab(tab: RiderOrderTab, refresh = false): Promise<void> {
    const state = tabs.value[tab]
    if (state.loading) return
    if (!refresh && !state.hasMore) return
    state.loading = true
    try {
      const params = buildListParams(tab, refresh ? null : state.cursor)
      const data = await get<{
        list: RiderOrder[]
        nextCursor: string | null
        hasMore: boolean
      }>('/rider/orders', params as Record<string, unknown>, { silent: true, retry: 1 })
      const list = Array.isArray(data?.list) ? data.list : []
      if (refresh) {
        state.list = list
      } else {
        state.list.push(...list)
      }
      state.cursor = data?.nextCursor ?? null
      state.hasMore = Boolean(data?.hasMore)
      state.loaded = true
      state.lastRefreshTs = Date.now()
    } catch (e) {
      logger.warn('order.list.load.fail', { tab, e: String(e) })
    } finally {
      state.loading = false
    }
  }

  /**
   * onShow 节流刷新（P6-R1 / I-07 教训：5min 节流）
   */
  async function refreshIfStale(tab: RiderOrderTab, throttleMs = 5 * 60 * 1000): Promise<void> {
    const state = tabs.value[tab]
    if (Date.now() - state.lastRefreshTs < throttleMs) return
    await loadTab(tab, true)
  }

  /** 各 Tab 计数 */
  async function loadTabCounts(): Promise<void> {
    try {
      const counts = await get<Record<RiderOrderTab, number>>(
        '/rider/orders/tab-counts',
        {},
        { silent: true, retry: 1 }
      )
      tabCounts.value = { ...tabCounts.value, ...counts }
    } catch (e) {
      logger.warn('order.tab-counts.fail', { e: String(e) })
    }
  }

  /** 拉取进行中订单（聚合 pending+picking+delivering） */
  async function loadInProgress(): Promise<void> {
    try {
      const data = await get<RiderOrder[]>(
        '/rider/orders/in-progress',
        {},
        { silent: true, retry: 1 }
      )
      inProgress.value = Array.isArray(data) ? data : []
    } catch (e) {
      logger.warn('order.in-progress.fail', { e: String(e) })
    }
  }

  /** 构造 Tab 查询参数 */
  function buildListParams(tab: RiderOrderTab, cursor: string | null): RiderOrderListParams {
    const params: RiderOrderListParams = { tab, cursor, limit: PAGE_SIZE }
    if (tab === 'abnormal') params.isException = 1
    return params
  }

  /** 加载详情（命中缓存即返回，强刷可加 force 参数） */
  async function loadDetail(orderNo: string, force = false): Promise<RiderOrder | null> {
    if (!force && detailCache.value[orderNo]) return detailCache.value[orderNo]
    try {
      const data = await get<RiderOrder>(`/rider/orders/${orderNo}`, {}, { silent: true, retry: 1 })
      if (data?.orderNo) {
        detailCache.value[orderNo] = data
        return data
      }
    } catch (e) {
      logger.warn('order.detail.load.fail', { orderNo, e: String(e) })
    }
    return null
  }

  /** WS topic rider:order:status:changed 处理 */
  function handleStatusChanged(payload: Partial<RiderOrder>): void {
    if (!payload?.orderNo) return
    const cached = detailCache.value[payload.orderNo]
    if (cached) {
      detailCache.value[payload.orderNo] = { ...cached, ...payload } as RiderOrder
    }
    /* 同步刷新进行中聚合（轻量），列表强制 refresh 留给页面 */
    void loadInProgress()
    void loadTabCounts()
  }

  /* ========== 配送动作 ========== */

  /** 取件确认（扫码 / 手动输入） */
  async function pickup(orderNo: string, code: string): Promise<boolean> {
    try {
      await post(
        `/rider/orders/${orderNo}/pickup`,
        { pickupCode: code },
        { idemKey: genIdemKey(), retry: 1 }
      )
      track(TRACK.PICKUP_INPUT_SUCCESS, { orderNo })
      return true
    } catch (e) {
      logger.warn('order.pickup.fail', { orderNo, e: String(e) })
      track(TRACK.PICKUP_FAIL, { orderNo })
      return false
    }
  }

  /** 上传取件凭证 */
  async function uploadPickupProof(orderNo: string, proofUrl: string): Promise<boolean> {
    try {
      await post(
        `/rider/orders/${orderNo}/proof/pickup`,
        { proofUrl },
        { idemKey: genIdemKey(), retry: 1 }
      )
      return true
    } catch (e) {
      logger.warn('order.pickup.proof.fail', { orderNo, e: String(e) })
      return false
    }
  }

  /** 送达确认 + 凭证 */
  async function deliver(orderNo: string, proofUrl: string): Promise<boolean> {
    try {
      await post(
        `/rider/orders/${orderNo}/deliver`,
        { proofUrl },
        { idemKey: genIdemKey(), retry: 1 }
      )
      track(TRACK.CLICK_DELIVER_DONE, { orderNo })
      return true
    } catch (e) {
      logger.warn('order.deliver.fail', { orderNo, e: String(e) })
      return false
    }
  }

  /** 异常上报 */
  async function reportAbnormal(payload: RiderAbnormalReport): Promise<boolean> {
    try {
      await post('/rider/orders/abnormal', payload, {
        idemKey: genIdemKey(),
        retry: 1
      })
      track(TRACK.CLICK_REPORT_ABNORMAL, { orderNo: payload.orderNo, type: payload.abnormalType })
      return true
    } catch (e) {
      logger.warn('order.abnormal.fail', { e: String(e) })
      return false
    }
  }

  /** 转单申请 */
  async function transfer(payload: RiderTransferApply): Promise<boolean> {
    try {
      await post('/rider/orders/transfer', payload, {
        idemKey: genIdemKey(),
        retry: 1
      })
      track(TRACK.CLICK_TRANSFER_ORDER, { orderNo: payload.orderNo })
      return true
    } catch (e) {
      logger.warn('order.transfer.fail', { e: String(e) })
      return false
    }
  }

  /** 重置（登出时） */
  function reset(): void {
    for (const k of Object.keys(tabs.value) as RiderOrderTab[]) {
      tabs.value[k] = emptyTab()
    }
    detailCache.value = {}
    inProgress.value = []
  }

  return {
    currentTab,
    tabs,
    tabCounts,
    detailCache,
    inProgress,
    loadTab,
    refreshIfStale,
    loadTabCounts,
    loadInProgress,
    loadDetail,
    handleStatusChanged,
    pickup,
    uploadPickupProof,
    deliver,
    reportAbnormal,
    transfer,
    reset
  }
})
