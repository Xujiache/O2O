/**
 * 商品 API
 * @module api/business/product
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizProduct, BizId } from '@/types/business'

export const productApi = {
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizProduct>>('/product/list', params as Record<string, unknown>),
  /** 违规商品列表 */
  violationList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizProduct>>(
      '/product/violation/list',
      params as Record<string, unknown>
    ),
  /** 强制下架 */
  forceOffline: (id: BizId, reason: string) =>
    bizApi.post<void>(`/product/${id}/force-offline`, { reason }, { needSign: true }),
  /** 商品分类 */
  categoryList: () => bizApi.get<Array<{ id: BizId; name: string }>>('/product/category/list'),
  categoryCreate: (name: string) => bizApi.post<{ id: BizId }>('/product/category', { name }),
  categoryUpdate: (id: BizId, name: string) =>
    bizApi.put<void>(`/product/category/${id}`, { name }),
  categoryDelete: (id: BizId) => bizApi.del<void>(`/product/category/${id}`)
}
