/**
 * @file search.controller.spec.ts
 * @stage P9 Sprint 6 / W6.E.1
 * @desc SearchController + ShopService.searchProducts / searchErrandTemplates 单测
 * @author 单 Agent V2.0（Sprint 6 Agent E）
 *
 * 关键覆盖：
 *   1) searchProducts：keyword 为空 → 返回空 list
 *   2) searchProducts：构造 LIKE 查询 + INNER JOIN shop + product/audit 过滤
 *   3) searchProducts：cityCode 透传 / shop 信息批量回填
 *   4) searchErrandTemplates：内存匹配 name/description/tags
 *   5) searchErrandTemplates：keyword 为空 → list=[] / total=0
 *   6) Controller 透传 dto → service
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Product, Shop } from '@/entities'
import { SearchController } from './search.controller'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { ShopBusinessHourService } from '../services/shop-business-hour.service'
import { ShopService } from '../services/shop.service'

interface QueryBuilderMock {
  innerJoin: jest.Mock
  where: jest.Mock
  andWhere: jest.Mock
  orderBy: jest.Mock
  addOrderBy: jest.Mock
  skip: jest.Mock
  take: jest.Mock
  addSelect: jest.Mock
  getManyAndCount: jest.Mock
}

interface RepoMock {
  find: jest.Mock
  findOne: jest.Mock
  save: jest.Mock
  create: jest.Mock
  createQueryBuilder: jest.Mock
}

describe('SearchController + ShopService 搜索 (W6.E.1)', () => {
  let controller: SearchController
  let shopService: ShopService
  let productRepo: RepoMock
  let shopRepo: RepoMock
  let qb: QueryBuilderMock

  beforeEach(async () => {
    qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn()
    }
    productRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb)
    }
    shopRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn()
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        ShopService,
        { provide: getRepositoryToken(Shop), useValue: shopRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: REDIS_CLIENT, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
        {
          provide: ShopBusinessHourService,
          useValue: { listByShops: jest.fn().mockResolvedValue(new Map()), isOpenNow: jest.fn() }
        }
      ]
    }).compile()

    controller = moduleRef.get(SearchController)
    shopService = moduleRef.get(ShopService)
  })

  describe('searchProducts', () => {
    it('keyword 空白 → 直接返回空 list / total=0', async () => {
      const r = await shopService.searchProducts({ keyword: '   ' })
      expect(r.list).toHaveLength(0)
      expect(r.meta.total).toBe(0)
      expect(productRepo.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('正常 keyword → 拼装 LIKE + JOIN + 上架 + 审核过滤', async () => {
      qb.getManyAndCount.mockResolvedValueOnce([
        [
          {
            id: 'P1',
            shopId: 'S1',
            name: '红烧牛肉面',
            brief: null,
            mainImageUrl: null,
            price: '15.00',
            originalPrice: null,
            monthlySales: 12,
            score: 4.8,
            scoreCount: 3
          }
        ],
        1
      ])
      shopRepo.find.mockResolvedValueOnce([
        {
          id: 'S1',
          name: '老王面馆',
          shortName: null,
          logoUrl: 'http://x',
          businessStatus: 1
        }
      ])
      const r = await shopService.searchProducts({ keyword: '牛肉', page: 1, pageSize: 10 })
      expect(r.list).toHaveLength(1)
      expect(r.list[0].id).toBe('P1')
      expect(r.list[0].shopName).toBe('老王面馆')
      expect(r.list[0].shopBusinessStatus).toBe(1)
      /* 校验关键的 SQL 片段 */
      expect(qb.where).toHaveBeenCalledWith('p.is_deleted = 0')
      expect(qb.andWhere).toHaveBeenCalledWith('p.status = 1')
      expect(qb.andWhere).toHaveBeenCalledWith('p.audit_status = 1')
      expect(qb.skip).toHaveBeenCalledWith(0)
      expect(qb.take).toHaveBeenCalledWith(10)
    })

    it('cityCode 传入 → 透传到 SQL 条件', async () => {
      qb.getManyAndCount.mockResolvedValueOnce([[], 0])
      await shopService.searchProducts({ keyword: '面', cityCode: '510100' })
      const cityCalls = qb.andWhere.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('s.city_code')
      )
      expect(cityCalls).toHaveLength(1)
      expect(cityCalls[0][1]).toEqual({ cc: '510100' })
    })

    it('返回为空时不再批量查 shop', async () => {
      qb.getManyAndCount.mockResolvedValueOnce([[], 0])
      const r = await shopService.searchProducts({ keyword: '不存在' })
      expect(r.list).toHaveLength(0)
      expect(shopRepo.find).not.toHaveBeenCalled()
    })
  })

  describe('searchErrandTemplates', () => {
    it('keyword 空白 → 返回 list=[] / total=0', async () => {
      const r = await shopService.searchErrandTemplates({ keyword: '  ' })
      expect(r.list).toHaveLength(0)
      expect(r.total).toBe(0)
    })

    it('"送" 命中 帮送 / 帮排队（描述含送达点）', async () => {
      const r = await shopService.searchErrandTemplates({ keyword: '送' })
      expect(r.total).toBeGreaterThan(0)
      const types = r.list.map((t) => t.serviceType)
      expect(types).toContain(1)
    })

    it('keyword 命中 tags（如 "排队"）', async () => {
      const r = await shopService.searchErrandTemplates({ keyword: '排队' })
      const types = r.list.map((t) => t.serviceType)
      expect(types).toContain(4)
    })

    it('未命中 → 返回 0 项', async () => {
      const r = await shopService.searchErrandTemplates({ keyword: '太空旅行' })
      expect(r.total).toBe(0)
    })
  })

  describe('Controller', () => {
    it('searchProducts 透传 dto 字段', async () => {
      qb.getManyAndCount.mockResolvedValueOnce([[], 0])
      const spy = jest.spyOn(shopService, 'searchProducts')
      await controller.searchProducts({
        keyword: '面',
        cityCode: '510100',
        page: 2,
        pageSize: 30
      })
      expect(spy).toHaveBeenCalledWith({
        keyword: '面',
        cityCode: '510100',
        page: 2,
        pageSize: 30
      })
    })

    it('searchErrandTemplates 透传 dto 字段', async () => {
      const spy = jest.spyOn(shopService, 'searchErrandTemplates')
      await controller.searchErrandTemplates({ keyword: '帮买' })
      expect(spy).toHaveBeenCalledWith({ keyword: '帮买' })
    })
  })
})
