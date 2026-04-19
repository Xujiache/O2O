/**
 * @file api/shop.ts
 * @stage P5/T5.13 (Sprint 2)
 * @desc 店铺 / 商品 API：列表（GEO 排序）、详情、商品、SKU、评价
 * @author 单 Agent V2.0
 */
import { get } from '@/utils/request'
import type {
  Shop,
  Product,
  ProductCategory,
  Review,
  PageResult,
  KeysetPageResult,
  Banner,
  Notice,
  QuickEntry
} from '@/types/biz'

/* ========== 首页运营位 ========== */
export function getBanners(params?: { position?: string; cityCode?: string }): Promise<Banner[]> {
  return get('/banners', params as Record<string, unknown>)
}

export function getNotices(params?: { cityCode?: string; top?: number }): Promise<Notice[]> {
  return get('/notices', params as Record<string, unknown>)
}

export function getQuickEntries(params?: { cityCode?: string }): Promise<QuickEntry[]> {
  return get('/quick-entries', params as Record<string, unknown>)
}

export function getHotSearches(params?: { cityCode?: string }): Promise<string[]> {
  return get('/hot-searches', params as Record<string, unknown>)
}

/* ========== 店铺 ========== */
export interface ShopListParams {
  cityCode?: string
  lng?: number
  lat?: number
  /** 排序：distance/sales/score/price */
  sort?: 'distance' | 'sales' | 'score' | 'price'
  /** 关键词 */
  q?: string
  category?: string
  page?: number
  pageSize?: number
  cursor?: string
}

export function listShops(
  params: ShopListParams
): Promise<PageResult<Shop> | KeysetPageResult<Shop>> {
  return get('/user/shops', params as Record<string, unknown>)
}

export function getShopDetail(shopId: string): Promise<Shop> {
  return get(`/user/shops/${shopId}`)
}

export function getShopProductCategories(shopId: string): Promise<ProductCategory[]> {
  return get(`/user/shops/${shopId}/product-categories`)
}

/* ========== 商品 ========== */
export function getShopProducts(
  shopId: string,
  params?: { categoryId?: string; page?: number; pageSize?: number }
): Promise<PageResult<Product>> {
  return get(`/user/shops/${shopId}/products`, params as Record<string, unknown>)
}

export function getProductDetail(productId: string): Promise<Product> {
  return get(`/user/products/${productId}`)
}

/* ========== 评价 ========== */
export interface ReviewListParams {
  shopId: string
  /** 0 全部 / 1 好评 / 2 中评 / 3 差评 */
  rating?: 0 | 1 | 2 | 3
  hasImage?: 0 | 1
  page?: number
  pageSize?: number
  cursor?: string
}

export function listReviews(params: ReviewListParams): Promise<KeysetPageResult<Review>> {
  return get('/user/reviews', params as Record<string, unknown>)
}

export function getReviewStat(shopId: string): Promise<{
  total: number
  scoreAvg: string
  goodCount: number
  midCount: number
  badCount: number
  tags: Array<{ name: string; count: number; type: 'good' | 'bad' }>
}> {
  return get(`/user/shops/${shopId}/reviews/stat`)
}
