/**
 * @file review.service.spec.ts
 * @stage P9 Sprint 6 / W6.E.2
 * @desc ReviewService.listTags 单测（覆盖词频聚合 + 默认兜底 + 异常降级）
 * @author 单 Agent V2.0（Sprint 6 Agent E）
 *
 * 关键覆盖：
 *   1) 用户无历史评价 → 8 个默认标签
 *   2) 用户有部分历史评价 → 历史 Top + DEFAULT 兜底拼接
 *   3) 用户已有 ≥ 8 个高频标签 → 全为历史
 *   4) DB 异常 → 全部 DEFAULT
 *   5) tags 字段非数组 / 含非字符串 → 安全过滤
 *   6) 词频排序：先按 count desc，count 相等时按字符串 asc
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { Product, Review, Shop } from '@/entities'
import { REVIEW_DEP_ORDER_SERVICE } from '../types/review.types'
import { ReviewService } from './review.service'

interface RepoMock {
  find: jest.Mock
  findOne: jest.Mock
  save: jest.Mock
  create: jest.Mock
  createQueryBuilder: jest.Mock
}

describe('ReviewService.listTags（W6.E.2）', () => {
  let service: ReviewService
  let reviewRepo: RepoMock

  beforeEach(async () => {
    reviewRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn()
    }
    const shopRepo: RepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn()
    }
    const productRepo: RepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn()
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: getRepositoryToken(Review), useValue: reviewRepo },
        { provide: getRepositoryToken(Shop), useValue: shopRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: OperationLogService, useValue: { write: jest.fn() } },
        { provide: REVIEW_DEP_ORDER_SERVICE, useValue: null }
      ]
    }).compile()

    service = moduleRef.get(ReviewService)
  })

  it('用户无历史评价 → 返回 8 个默认标签', async () => {
    reviewRepo.find.mockResolvedValueOnce([])
    const tags = await service.listTags('U001')
    expect(tags).toHaveLength(8)
    expect(tags).toContain('味道很赞')
    expect(tags).toContain('送达较慢')
  })

  it('用户有部分历史评价 → 词频 Top 排前，DEFAULT 兜底拼接，去重', async () => {
    /* 「分量足」3 次，「味道很赞」2 次，「特色酱料」1 次 */
    reviewRepo.find.mockResolvedValueOnce([
      { tags: ['分量足', '味道很赞'] },
      { tags: ['分量足', '味道很赞', '特色酱料'] },
      { tags: ['分量足'] }
    ])
    const tags = await service.listTags('U002')
    expect(tags).toHaveLength(8)
    expect(tags[0]).toBe('分量足')
    expect(tags[1]).toBe('味道很赞')
    expect(tags[2]).toBe('特色酱料')
    /* 后续应从 DEFAULT 中补齐去重 */
    expect(tags.filter((t) => t === '分量足')).toHaveLength(1)
  })

  it('用户高频标签 ≥ 8 → 全为历史；不再补 DEFAULT', async () => {
    /* 8 个不同 tag 的历史评价 */
    const userTags = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    reviewRepo.find.mockResolvedValueOnce(userTags.map((t) => ({ tags: [t] })))
    const tags = await service.listTags('U003')
    expect(tags).toHaveLength(8)
    /* 全部来自历史 tags（首字母排序，因 count 全相等 → 字符串 asc） */
    expect(tags).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  })

  it('DB 异常 → 全部使用 DEFAULT 标签', async () => {
    reviewRepo.find.mockRejectedValueOnce(new Error('DB conn lost'))
    const tags = await service.listTags('U004')
    expect(tags).toHaveLength(8)
    expect(tags).toContain('味道很赞')
  })

  it('tags 字段非数组 / 含非字符串 → 安全过滤', async () => {
    reviewRepo.find.mockResolvedValueOnce([
      { tags: null },
      { tags: 'not-an-array' as unknown as string[] },
      { tags: ['有效标签', 123 as unknown as string, ''] },
      { tags: ['有效标签'] }
    ])
    const tags = await service.listTags('U005')
    expect(tags[0]).toBe('有效标签')
    expect(tags).toHaveLength(8)
  })

  it('词频排序：count 相等 → 字符串字典序 asc', async () => {
    reviewRepo.find.mockResolvedValueOnce([{ tags: ['B', 'A'] }, { tags: ['B', 'A'] }])
    const tags = await service.listTags('U006')
    expect(tags[0]).toBe('A')
    expect(tags[1]).toBe('B')
  })

  it('handleCron find 入参校验 userId / order DESC / take 200', async () => {
    reviewRepo.find.mockResolvedValueOnce([])
    await service.listTags('U007')
    const args = reviewRepo.find.mock.calls[0][0]
    expect(args.where.userId).toBe('U007')
    expect(args.where.isDeleted).toBe(0)
    expect(args.order.createdAt).toBe('DESC')
    expect(args.take).toBe(200)
    expect(args.select).toEqual(['tags'])
  })
})
