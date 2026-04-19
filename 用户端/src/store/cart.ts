/**
 * @file store/cart.ts
 * @stage P5/T5.5 (Sprint 1)
 * @desc 多店购物车 Store：按 shopId 维护多个购物车，本地持久化
 * @author 单 Agent V2.0
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CartItem, ShopCart } from '@/types/biz'
import { addAmount, mulAmount } from '@/utils/format'
import { getStorage, setStorage, STORAGE_KEYS } from '@/utils/storage'
import { logger } from '@/utils/logger'

/** 购物车过期清理（7 天） */
const CART_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000

export const useCartStore = defineStore('cart', () => {
  /** 多店购物车：shopId -> ShopCart */
  const carts = ref<Record<string, ShopCart>>({})

  /** 启动时恢复 */
  function restore() {
    const stored = getStorage<Record<string, ShopCart>>(STORAGE_KEYS.CART)
    if (!stored) return
    const now = Date.now()
    const fresh: Record<string, ShopCart> = {}
    for (const [shopId, c] of Object.entries(stored)) {
      if (now - c.updatedAt < CART_EXPIRE_MS) fresh[shopId] = c
    }
    carts.value = fresh
    persist()
  }

  function persist() {
    setStorage(STORAGE_KEYS.CART, carts.value)
  }

  /** 获取单店购物车（不存在返回 null） */
  function getShopCart(shopId: string): ShopCart | null {
    return carts.value[shopId] ?? null
  }

  /** 加入或更新一条 SKU */
  function addItem(
    shopMeta: {
      shopId: string
      shopName: string
      shopLogo: string
      minAmount: string
      deliveryFee: string
    },
    item: CartItem
  ) {
    const cur = carts.value[shopMeta.shopId] ?? {
      shopId: shopMeta.shopId,
      shopName: shopMeta.shopName,
      shopLogo: shopMeta.shopLogo,
      minAmount: shopMeta.minAmount,
      deliveryFee: shopMeta.deliveryFee,
      items: [] as CartItem[],
      updatedAt: Date.now()
    }
    const idx = cur.items.findIndex(
      (x) =>
        x.skuId === item.skuId && JSON.stringify(x.spec ?? {}) === JSON.stringify(item.spec ?? {})
    )
    if (idx >= 0) {
      cur.items[idx].count += item.count
    } else {
      cur.items.push(item)
    }
    cur.updatedAt = Date.now()
    carts.value = { ...carts.value, [shopMeta.shopId]: cur }
    persist()
  }

  /** 减少一条 SKU 数量；为 0 自动移除 */
  function decItem(shopId: string, skuId: string, spec?: Record<string, string>) {
    const cur = carts.value[shopId]
    if (!cur) return
    const idx = cur.items.findIndex(
      (x) => x.skuId === skuId && JSON.stringify(x.spec ?? {}) === JSON.stringify(spec ?? {})
    )
    if (idx < 0) return
    cur.items[idx].count -= 1
    if (cur.items[idx].count <= 0) cur.items.splice(idx, 1)
    cur.updatedAt = Date.now()
    if (cur.items.length === 0) {
      delete carts.value[shopId]
    } else {
      carts.value = { ...carts.value, [shopId]: cur }
    }
    persist()
  }

  /** 直接设置某条数量 */
  function setItemCount(
    shopId: string,
    skuId: string,
    count: number,
    spec?: Record<string, string>
  ) {
    const cur = carts.value[shopId]
    if (!cur) return
    const idx = cur.items.findIndex(
      (x) => x.skuId === skuId && JSON.stringify(x.spec ?? {}) === JSON.stringify(spec ?? {})
    )
    if (idx < 0) return
    if (count <= 0) cur.items.splice(idx, 1)
    else cur.items[idx].count = count
    cur.updatedAt = Date.now()
    if (cur.items.length === 0) delete carts.value[shopId]
    persist()
  }

  /** 清空指定店铺购物车 */
  function clearShopCart(shopId: string) {
    delete carts.value[shopId]
    persist()
  }

  /** 清空全部 */
  function clearAll() {
    carts.value = {}
    persist()
    logger.info('cart.clearAll')
  }

  /** 单店购物车小计（仅商品总价，不含配送费/优惠） */
  function subtotal(shopId: string): string {
    const cur = carts.value[shopId]
    if (!cur) return '0.00'
    let total = '0'
    for (const it of cur.items) {
      total = addAmount(total, mulAmount(it.unitPrice, it.count))
    }
    return total
  }

  /** 单店总数量 */
  function totalCount(shopId: string): number {
    const cur = carts.value[shopId]
    if (!cur) return 0
    return cur.items.reduce((sum, it) => sum + it.count, 0)
  }

  /** 全局购物车数量（顶部红点） */
  const totalAllCount = computed<number>(() => {
    return Object.values(carts.value).reduce(
      (sum, c) => sum + c.items.reduce((s, i) => s + i.count, 0),
      0
    )
  })

  return {
    carts,
    totalAllCount,
    restore,
    getShopCart,
    addItem,
    decItem,
    setItemCount,
    clearShopCart,
    clearAll,
    subtotal,
    totalCount
  }
})
