/**
 * @file store/dispatch.ts
 * @stage P7/T7.13~T7.16 (Sprint 2)
 * @desc 派单 Store：DispatchModal 全屏弹层状态、抢单大厅列表
 *
 * 触发链路（DESIGN_P7 §3.3 / 提示词 §5.1）：
 *   WS topic 'rider:dispatch:new' / JPush 透传 → handleNewDispatch
 *   → currentDispatch 入队 → DispatchModal 自动弹（v-if 监听）
 *   → 接单/拒单/超时（V7.7 明确 15s）
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DispatchOrder } from '@/types/biz'
import { post, get, genIdemKey } from '@/utils/request'
import { logger } from '@/utils/logger'
import { track, TRACK } from '@/utils/track'

/** 派单状态 */
export const useDispatchStore = defineStore('dispatch', () => {
  /** 派单弹层队列（按到达顺序，head 即当前显示） */
  const queue = ref<DispatchOrder[]>([])
  /** 抢单大厅列表 */
  const hallList = ref<DispatchOrder[]>([])
  const hallLoading = ref(false)
  /** 上次大厅刷新时间（节流） */
  const hallLastRefreshTs = ref(0)

  /** 当前应展示的派单（队首） */
  const currentDispatch = computed<DispatchOrder | null>(() => queue.value[0] ?? null)
  /** 是否有派单待响应 */
  const hasPending = computed(() => queue.value.length > 0)

  /** 处理新派单（WS / JPush 透传统一入口） */
  function handleNewDispatch(order: DispatchOrder | null | undefined): void {
    if (!order || !order.orderNo) return
    /* 去重：同 orderNo 不重复入队 */
    if (queue.value.find((q) => q.orderNo === order.orderNo)) return
    /* 默认 15s 倒计时（V7.7 明确） */
    const enriched: DispatchOrder = {
      ...order,
      countdownSec: order.countdownSec ?? 15
    }
    queue.value.push(enriched)
    track(TRACK.RECEIVE_DISPATCH, {
      orderNo: order.orderNo,
      mode: order.dispatchMode,
      biz: order.businessType
    })
    logger.info('dispatch.new', { orderNo: order.orderNo, mode: order.dispatchMode })
  }

  /** 接单 */
  async function acceptDispatch(orderNo: string): Promise<boolean> {
    try {
      await post(`/rider/dispatch/${orderNo}/accept`, {}, { idemKey: genIdemKey(), retry: 1 })
      removeFromQueue(orderNo)
      track(TRACK.CLICK_ACCEPT_DISPATCH, { orderNo })
      return true
    } catch (e) {
      logger.warn('dispatch.accept.fail', { orderNo, e: String(e) })
      return false
    }
  }

  /** 拒单 */
  async function rejectDispatch(orderNo: string, reason?: string): Promise<boolean> {
    try {
      await post(
        `/rider/dispatch/${orderNo}/reject`,
        { reason: reason ?? '' },
        { idemKey: genIdemKey(), retry: 1, silent: true }
      )
      removeFromQueue(orderNo)
      track(TRACK.CLICK_REJECT_DISPATCH, { orderNo, reason })
      return true
    } catch (e) {
      logger.warn('dispatch.reject.fail', { orderNo, e: String(e) })
      removeFromQueue(orderNo)
      return false
    }
  }

  /** 超时（前端倒计时归零自动调用） */
  async function timeoutDispatch(orderNo: string): Promise<void> {
    try {
      await post(
        `/rider/dispatch/${orderNo}/timeout`,
        {},
        { idemKey: genIdemKey(), retry: 1, silent: true }
      )
    } catch (e) {
      logger.warn('dispatch.timeout.report.fail', { orderNo, e: String(e) })
    } finally {
      removeFromQueue(orderNo)
      track(TRACK.DISPATCH_TIMEOUT, { orderNo })
    }
  }

  /** 抢单（来自接单大厅卡片） */
  async function grabOrder(orderNo: string): Promise<boolean> {
    try {
      await post(`/rider/dispatch/${orderNo}/grab`, {}, { idemKey: genIdemKey(), retry: 0 })
      hallList.value = hallList.value.filter((it) => it.orderNo !== orderNo)
      track(TRACK.GRAB_SUCCESS, { orderNo })
      return true
    } catch (e) {
      track(TRACK.GRAB_FAIL, { orderNo, e: String(e) })
      return false
    }
  }

  /** 拉取接单大厅列表（节流 5s） */
  async function refreshHall(force = false): Promise<void> {
    const now = Date.now()
    if (!force && now - hallLastRefreshTs.value < 5_000) return
    hallLoading.value = true
    try {
      const data = await get<DispatchOrder[]>(
        '/rider/dispatch/hall',
        {},
        { silent: true, retry: 1 }
      )
      hallList.value = Array.isArray(data) ? data : []
      hallLastRefreshTs.value = now
    } catch (e) {
      logger.warn('dispatch.hall.load.fail', { e: String(e) })
    } finally {
      hallLoading.value = false
    }
  }

  /** 从队列移除一项 */
  function removeFromQueue(orderNo: string): void {
    queue.value = queue.value.filter((q) => q.orderNo !== orderNo)
  }

  /** 清空队列（应用重启 / 登出时） */
  function clearQueue(): void {
    queue.value = []
  }

  return {
    queue,
    hallList,
    hallLoading,
    hallLastRefreshTs,
    currentDispatch,
    hasPending,
    handleNewDispatch,
    acceptDispatch,
    rejectDispatch,
    timeoutDispatch,
    grabOrder,
    refreshHall,
    removeFromQueue,
    clearQueue
  }
})
