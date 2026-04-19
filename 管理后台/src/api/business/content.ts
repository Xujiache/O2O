/**
 * 内容（Banner / 公告 / 快捷入口 / 热搜）API
 * @module api/business/content
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizBanner, BizNotice, BizId } from '@/types/business'

export const contentApi = {
  /** Banner */
  bannerList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizBanner>>('/content/banner/list', params as Record<string, unknown>),
  bannerSave: (data: Partial<BizBanner>) =>
    bizApi.post<{ id: BizId }>('/content/banner', data, { needSign: true }),
  bannerUpdate: (id: BizId, data: Partial<BizBanner>) =>
    bizApi.put<void>(`/content/banner/${id}`, data, { needSign: true }),
  bannerDelete: (id: BizId) => bizApi.del<void>(`/content/banner/${id}`),
  bannerReorder: (orderedIds: BizId[]) =>
    bizApi.post<void>('/content/banner/reorder', { orderedIds }),

  /** 快捷入口 */
  quickEntryList: () =>
    bizApi.get<Array<{ id: BizId; name: string; icon: string; sort: number }>>(
      '/content/quick-entry/list'
    ),
  quickEntrySave: (data: { id?: BizId; name: string; icon: string; sort: number }) =>
    bizApi.post<{ id: BizId }>('/content/quick-entry', data, { needSign: true }),
  quickEntryDelete: (id: BizId) => bizApi.del<void>(`/content/quick-entry/${id}`),

  /** 热搜 */
  hotSearchList: () =>
    bizApi.get<Array<{ id: BizId; keyword: string; sort: number }>>('/content/hot-search/list'),
  hotSearchSave: (data: { id?: BizId; keyword: string; sort: number }) =>
    bizApi.post<{ id: BizId }>('/content/hot-search', data),
  hotSearchDelete: (id: BizId) => bizApi.del<void>(`/content/hot-search/${id}`),

  /** 公告 */
  noticeList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizNotice>>('/content/notice/list', params as Record<string, unknown>),
  noticeSave: (data: Partial<BizNotice>) =>
    bizApi.post<{ id: BizId }>('/content/notice', data, { needSign: true }),
  noticeUpdate: (id: BizId, data: Partial<BizNotice>) =>
    bizApi.put<void>(`/content/notice/${id}`, data, { needSign: true }),
  noticeDelete: (id: BizId) => bizApi.del<void>(`/content/notice/${id}`)
}
