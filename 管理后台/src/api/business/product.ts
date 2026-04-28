/**
 * 商品 API
 *
 * 路径对齐后端 ProductAdminController（@Controller('admin/products')）
 *
 * @module api/business/product
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizProduct, BizId } from '@/types/business'

export const productApi = {
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizProduct>>('/products', params as Record<string, unknown>),
  /** 违规商品列表（复用 products + 违规状态筛选） */
  violationList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizProduct>>('/products', {
      ...params,
      violation: true
    } as Record<string, unknown>),
  /** 强制下架（P9 待后端补接口） */
  forceOffline: (id: BizId, reason: string) =>
    bizApi.post<void>(`/products/${id}/force-off`, { reason }, { needSign: true }),
  /** 商品分类（P9 待后端补 admin 级别分类接口） */
  categoryList: () => bizApi.get<Array<{ id: BizId; name: string }>>('/product/category/list'),
  categoryCreate: (name: string) => bizApi.post<{ id: BizId }>('/product/category', { name }),
  categoryUpdate: (id: BizId, name: string) =>
    bizApi.put<void>(`/product/category/${id}`, { name }),
  categoryDelete: (id: BizId) => bizApi.del<void>(`/product/category/${id}`)
}
