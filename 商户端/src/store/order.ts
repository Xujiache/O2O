/**
 * @file store/order.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc 订单 Store：新订单队列（NewOrderModal 驱动）、待处理计数、各 Tab 计数
 *
 * 新订单弹层逻辑：
 *   - WS / 极光推送收到 merchant:order:new → 调 push() 入队
 *   - NewOrderModal 监听 newOrderQueue 变化 → 弹层
 *   - 用户点击「立即接单」/「忽略」/ 倒计时自动接单 → shift() 出队
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MerchantOrder, MerchantOrderTab } from '@/types/biz'
import { logger } from '@/utils/logger'

/** 订单 Store */
export const useOrderStore = defineStore('order', () => {
  /** 新订单弹层队列（FIFO） */
  const newOrderQueue = ref<MerchantOrder[]>([])
  /** 各 Tab 计数 */
  const tabCounts = ref<Record<MerchantOrderTab, number>>({
    pending: 0,
    cooking: 0,
    delivering: 0,
    finished: 0,
    canceled: 0,
    aftersale: 0,
    abnormal: 0
  })
  /** 总待处理（pending + cooking） */
  const pendingCount = computed<number>(
    () => tabCounts.value.pending + tabCounts.value.cooking + tabCounts.value.abnormal
  )
  /** 当前查看订单 */
  const currentOrder = ref<MerchantOrder | null>(null)

  /** 入队新订单 */
  function pushNewOrder(order: MerchantOrder) {
    /* 去重 */
    if (newOrderQueue.value.find((o) => o.orderNo === order.orderNo)) {
      logger.debug('order.push.duplicate', { orderNo: order.orderNo })
      return
    }
    newOrderQueue.value.push(order)
    tabCounts.value.pending += 1
    logger.info('order.push', {
      orderNo: order.orderNo,
      queueLen: newOrderQueue.value.length
    })
  }

  /** 出队（弹层处理完后） */
  function shiftNewOrder(): MerchantOrder | undefined {
    return newOrderQueue.value.shift()
  }

  /** 移除指定订单（被取消等场景） */
  function removeNewOrder(orderNo: string) {
    const idx = newOrderQueue.value.findIndex((o) => o.orderNo === orderNo)
    if (idx >= 0) {
      newOrderQueue.value.splice(idx, 1)
    }
  }

  /** 清空队列 */
  function clearNewOrderQueue() {
    newOrderQueue.value = []
  }

  /** 更新 Tab 计数 */
  function setTabCounts(counts: Partial<Record<MerchantOrderTab, number>>) {
    tabCounts.value = { ...tabCounts.value, ...counts }
  }

  /** 设置当前查看订单 */
  function setCurrentOrder(o: MerchantOrder | null) {
    currentOrder.value = o
  }

  return {
    newOrderQueue,
    tabCounts,
    pendingCount,
    currentOrder,
    pushNewOrder,
    shiftNewOrder,
    removeNewOrder,
    clearNewOrderQueue,
    setTabCounts,
    setCurrentOrder
  }
})
