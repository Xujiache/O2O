/**
 * @file store/wallet.ts
 * @stage P7/T7.32~T7.35 (Sprint 5)
 * @desc 钱包 Store：余额概览、账单、提现、银行卡
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { WalletOverview, BillItem, BankCard, WithdrawApply } from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'
import { logger } from '@/utils/logger'
import { compareAmount } from '@/utils/format'

const PAGE_SIZE = 20

export const useWalletStore = defineStore('wallet', () => {
  const overview = ref<WalletOverview>({
    available: '0.00',
    frozen: '0.00',
    todayIncome: '0.00',
    todayOrderCount: 0,
    monthIncome: '0.00',
    totalWithdraw: '0.00'
  })

  const billList = ref<BillItem[]>([])
  const billCursor = ref<string | null>(null)
  const billHasMore = ref(true)
  const billLoading = ref(false)

  const bankCards = ref<BankCard[]>([])
  const withdrawHistory = ref<WithdrawApply[]>([])

  /** 拉取概览 */
  async function refresh(): Promise<void> {
    try {
      const data = await get<WalletOverview>(
        '/rider/wallet/overview',
        {},
        { silent: true, retry: 1 }
      )
      if (data) overview.value = { ...overview.value, ...data }
    } catch (e) {
      logger.warn('wallet.overview.fail', { e: String(e) })
    }
  }

  /** 拉取账单 */
  async function loadBills(refresh = false): Promise<void> {
    if (billLoading.value) return
    if (!refresh && !billHasMore.value) return
    billLoading.value = true
    try {
      const data = await get<{
        list: BillItem[]
        nextCursor: string | null
        hasMore: boolean
      }>(
        '/rider/wallet/bills',
        { cursor: refresh ? null : billCursor.value, limit: PAGE_SIZE },
        { silent: true, retry: 1 }
      )
      const list = Array.isArray(data?.list) ? data.list : []
      if (refresh) billList.value = list
      else billList.value.push(...list)
      billCursor.value = data?.nextCursor ?? null
      billHasMore.value = Boolean(data?.hasMore)
    } catch (e) {
      logger.warn('wallet.bills.fail', { e: String(e) })
    } finally {
      billLoading.value = false
    }
  }

  /** 银行卡列表 */
  async function loadBankCards(): Promise<void> {
    try {
      const data = await get<BankCard[]>('/rider/wallet/cards', {}, { silent: true, retry: 1 })
      bankCards.value = Array.isArray(data) ? data : []
    } catch (e) {
      logger.warn('wallet.cards.fail', { e: String(e) })
    }
  }

  /** 添加银行卡 */
  async function addBankCard(payload: Omit<BankCard, 'id' | 'isDefault'>): Promise<boolean> {
    try {
      await post('/rider/wallet/cards', payload, { idemKey: genIdemKey(), retry: 1 })
      await loadBankCards()
      return true
    } catch (e) {
      logger.warn('wallet.cards.add.fail', { e: String(e) })
      return false
    }
  }

  /** 删除银行卡 */
  async function removeBankCard(cardId: string): Promise<boolean> {
    try {
      await post(`/rider/wallet/cards/${cardId}/remove`, {}, { idemKey: genIdemKey(), retry: 1 })
      await loadBankCards()
      return true
    } catch (e) {
      logger.warn('wallet.cards.remove.fail', { e: String(e) })
      return false
    }
  }

  /** 提现申请：金额必须 ≤ available（compareAmount 大数比较） */
  async function applyWithdraw(payload: { amount: string; cardId: string }): Promise<boolean> {
    if (compareAmount(payload.amount, overview.value.available) > 0) {
      uni.showToast({ title: '提现金额超过余额', icon: 'none' })
      return false
    }
    if (compareAmount(payload.amount, '0') <= 0) {
      uni.showToast({ title: '提现金额必须大于 0', icon: 'none' })
      return false
    }
    try {
      await post('/rider/wallet/withdraw', payload, { idemKey: genIdemKey(), retry: 1 })
      await refresh()
      await loadWithdrawHistory(true)
      return true
    } catch (e) {
      logger.warn('wallet.withdraw.fail', { e: String(e) })
      return false
    }
  }

  /** 提现历史 */
  async function loadWithdrawHistory(reload = false): Promise<void> {
    try {
      const data = await get<WithdrawApply[]>(
        '/rider/wallet/withdraw/history',
        { limit: PAGE_SIZE },
        { silent: true, retry: 1 }
      )
      if (reload) withdrawHistory.value = Array.isArray(data) ? data : []
      else withdrawHistory.value.push(...(Array.isArray(data) ? data : []))
    } catch (e) {
      logger.warn('wallet.withdraw.history.fail', { e: String(e) })
    }
  }

  /** 重置（登出时） */
  function reset(): void {
    overview.value = {
      available: '0.00',
      frozen: '0.00',
      todayIncome: '0.00',
      todayOrderCount: 0,
      monthIncome: '0.00',
      totalWithdraw: '0.00'
    }
    billList.value = []
    billCursor.value = null
    billHasMore.value = true
    bankCards.value = []
    withdrawHistory.value = []
  }

  return {
    overview,
    billList,
    billCursor,
    billHasMore,
    billLoading,
    bankCards,
    withdrawHistory,
    refresh,
    loadBills,
    loadBankCards,
    addBankCard,
    removeBankCard,
    applyWithdraw,
    loadWithdrawHistory,
    reset
  }
})
