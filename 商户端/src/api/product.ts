/**
 * @file api/product.ts
 * @stage P6/T6.25-T6.28 (Sprint 4)
 * @desc 商品 API：分类 CRUD / 商品 CRUD / SKU / 套餐 / 上下架 / 限时折扣
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post, put, del, genIdemKey } from '@/utils/request'
import type {
  ProductCategory,
  Product,
  ProductSku,
  ComboItem,
  ProductDiscount,
  PageResult
} from '@/types/biz'

/* ===== 分类 ===== */
export function listCategories(shopId: string): Promise<ProductCategory[]> {
  return get(`/merchant/shops/${shopId}/categories`)
}

export function createCategory(
  shopId: string,
  payload: { name: string }
): Promise<ProductCategory> {
  return post(`/merchant/shops/${shopId}/categories`, payload, { idemKey: genIdemKey() })
}

export function updateCategory(
  categoryId: string,
  payload: { name?: string; sortOrder?: number }
): Promise<ProductCategory> {
  return put(`/merchant/categories/${categoryId}`, payload)
}

export function deleteCategory(categoryId: string): Promise<{ ok: boolean }> {
  return del(`/merchant/categories/${categoryId}`)
}

/** 拖拽排序后批量更新 */
export function reorderCategories(
  shopId: string,
  list: { id: string; sortOrder: number }[]
): Promise<{ ok: boolean }> {
  return post(`/merchant/shops/${shopId}/categories/reorder`, { list })
}

/* ===== 商品 ===== */
/** 商品列表 */
export function listProducts(params: {
  shopId: string
  categoryId?: string
  status?: 0 | 1 | 2
  keyword?: string
  page?: number
  pageSize?: number
}): Promise<PageResult<Product>> {
  return get('/merchant/products', params as unknown as Record<string, unknown>)
}

export function getProduct(productId: string): Promise<Product> {
  return get(`/merchant/products/${productId}`)
}

export interface ProductCreateParams {
  shopId: string
  categoryId: string
  name: string
  description?: string
  images: string[]
  price: string
  hasSku: 0 | 1
  isCombo: 0 | 1
  stockQty?: number
  skus?: Omit<ProductSku, 'id' | 'productId'>[]
  comboItems?: ComboItem[]
  tags?: string[]
}

export function createProduct(params: ProductCreateParams): Promise<Product> {
  return post('/merchant/products', params, { idemKey: genIdemKey() })
}

export function updateProduct(
  productId: string,
  patch: Partial<ProductCreateParams>
): Promise<Product> {
  return put(`/merchant/products/${productId}`, patch)
}

export function deleteProduct(productId: string): Promise<{ ok: boolean }> {
  return del(`/merchant/products/${productId}`)
}

/** 切换上下架 */
export function toggleProductStatus(productId: string, status: 1 | 2): Promise<{ ok: boolean }> {
  return post(`/merchant/products/${productId}/status`, { status }, { idemKey: genIdemKey() })
}

/** 批量上下架 */
export function batchToggleStatus(
  productIds: string[],
  status: 1 | 2
): Promise<{ ok: boolean; affected: number }> {
  return post('/merchant/products/batch-status', { productIds, status }, { idemKey: genIdemKey() })
}

/* ===== 限时折扣 ===== */
export function setProductDiscount(
  productId: string,
  discount: ProductDiscount
): Promise<{ ok: boolean }> {
  return put(`/merchant/products/${productId}/discount`, discount)
}

export function clearProductDiscount(productId: string): Promise<{ ok: boolean }> {
  return del(`/merchant/products/${productId}/discount`)
}
