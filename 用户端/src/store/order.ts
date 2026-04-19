/**
 * @file store/order.ts
 * @stage P5/T5.5 (Sprint 1)
 * @desc 订单 Store：进行中订单（首页/Tab 红点）、当前查看订单
 * @author 单 Agent V2.0
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { OrderTakeout, OrderErrand } from '@/types/biz'

export const useOrderStore = defineStore('order', () => {
  /** 进行中订单数 */
  const inProgressCount = ref<number>(0)
  /** 最近查看的订单 */
  const lastViewedOrderNo = ref<string>('')
  /** 最近查看订单详情快照（详情页 -> 评价页 时复用） */
  const lastDetail = ref<OrderTakeout | OrderErrand | null>(null)

  function setInProgressCount(n: number) {
    inProgressCount.value = Math.max(0, n)
  }
  function setLastViewedOrderNo(orderNo: string) {
    lastViewedOrderNo.value = orderNo
  }
  function setLastDetail(d: OrderTakeout | OrderErrand | null) {
    lastDetail.value = d
  }

  return {
    inProgressCount,
    lastViewedOrderNo,
    lastDetail,
    setInProgressCount,
    setLastViewedOrderNo,
    setLastDetail
  }
})
