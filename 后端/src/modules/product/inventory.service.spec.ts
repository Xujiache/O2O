/**
 * @file inventory.service.spec.ts
 * @stage P4/T4.6（Sprint 1）
 * @desc InventoryService 单测：mock ioredis + ProductSku Repository + DataSource，
 *       覆盖 preloadStock / deduct / restore / commit 全部路径
 * @author 单 Agent V2.0
 *
 * 关键覆盖：
 *   1) preloadStock：DB → Redis SET NX
 *   2) deduct：单 SKU 充足 / 多 SKU 中第 2 个失败回滚 / 库存不足抛错 / 无限库存跳过
 *   3) restore：正常恢复 + Lua -2 时 preload 重试
 *   4) commit：DB CAS 成功 / affectedRows 不匹配抛错
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { BizErrorCode } from '@/common'
import { ProductSku } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { InventoryService, type StockItem } from './inventory.service'

/**
 * Redis mock：覆盖 InventoryService 实际使用到的 4 个方法
 */
interface RedisMock {
  eval: jest.Mock
  set: jest.Mock
  get: jest.Mock
}

/**
 * QueryRunner mock：commit 路径用
 */
interface QueryRunnerMock {
  connect: jest.Mock
  startTransaction: jest.Mock
  commitTransaction: jest.Mock
  rollbackTransaction: jest.Mock
  release: jest.Mock
  manager: { query: jest.Mock }
}

describe('InventoryService', () => {
  let service: InventoryService
  let redis: RedisMock
  let queryRunner: QueryRunnerMock
  let skuFindOne: jest.Mock

  beforeEach(async () => {
    redis = {
      eval: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null)
    }
    skuFindOne = jest.fn()

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: { query: jest.fn() }
    }

    const fakeSkuRepo = { findOne: skuFindOne }
    const fakeDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner)
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getRepositoryToken(ProductSku), useValue: fakeSkuRepo },
        { provide: getDataSourceToken(), useValue: fakeDataSource }
      ]
    }).compile()

    service = moduleRef.get(InventoryService)
  })

  /* ====================================================================
   * 1) preloadStock
   * ==================================================================== */

  describe('preloadStock', () => {
    it('从 DB 读到 50 后 SET NX 到 Redis', async () => {
      skuFindOne.mockResolvedValueOnce({ id: 'SKU1', stockQty: 50, isDeleted: 0 })
      const value = await service.preloadStock('SKU1')
      expect(value).toBe(50)
      expect(skuFindOne).toHaveBeenCalledWith({ where: { id: 'SKU1', isDeleted: 0 } })
      expect(redis.set).toHaveBeenCalledWith('stock:sku:SKU1', '50', 'NX')
    })

    it('SET NX 失败（已有值）则读取当前 Redis 值', async () => {
      skuFindOne.mockResolvedValueOnce({ id: 'SKU1', stockQty: 50, isDeleted: 0 })
      redis.set.mockResolvedValueOnce(null)
      redis.get.mockResolvedValueOnce('30')
      const value = await service.preloadStock('SKU1')
      expect(value).toBe(30)
    })

    it('DB 中无 SKU 时抛 BIZ_RESOURCE_NOT_FOUND', async () => {
      skuFindOne.mockResolvedValueOnce(null)
      await expect(service.preloadStock('NX')).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_RESOURCE_NOT_FOUND
      })
    })
  })

  /* ====================================================================
   * 2) deduct
   * ==================================================================== */

  describe('deduct', () => {
    it('单 SKU 库存充足：Lua 返回剩余值，无回滚', async () => {
      redis.eval.mockResolvedValueOnce(49) /* 50 - 1 = 49 */
      await expect(service.deduct([{ skuId: 'SKU1', qty: 1 }])).resolves.toBeUndefined()
      expect(redis.eval).toHaveBeenCalledTimes(1)
      const evalArgs = redis.eval.mock.calls[0]!
      /* eval(script, numKeys, key, qty) */
      expect(evalArgs[1]).toBe(1)
      expect(evalArgs[2]).toBe('stock:sku:SKU1')
      expect(evalArgs[3]).toBe('1')
    })

    it('多 SKU 中第 2 个失败时回滚第 1 个（再调一次 restore lua）', async () => {
      const items: StockItem[] = [
        { skuId: 'SKU1', qty: 2 },
        { skuId: 'SKU2', qty: 3 }
      ]
      redis.eval
        .mockResolvedValueOnce(8) /* 第 1 个 deduct 成功，剩 8 */
        .mockResolvedValueOnce(-3) /* 第 2 个 deduct 库存不足 */
        .mockResolvedValueOnce(10) /* 第 1 个 restore 成功，恢复后 10 */

      await expect(service.deduct(items)).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_OPERATION_FORBIDDEN
      })
      expect(redis.eval).toHaveBeenCalledTimes(3)
      /* 第 3 次 eval 应是 restore SKU1 qty=2 */
      const rollbackCall = redis.eval.mock.calls[2]!
      expect(rollbackCall[2]).toBe('stock:sku:SKU1')
      expect(rollbackCall[3]).toBe('2')
    })

    it('库存不足时抛 BIZ_OPERATION_FORBIDDEN（10012，message=库存不足）', async () => {
      redis.eval.mockResolvedValueOnce(-3)
      await expect(service.deduct([{ skuId: 'SKU1', qty: 100 }])).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        message: expect.stringContaining('库存不足') as unknown
      })
    })

    it('Lua 返回 -1（无限库存）→ 跳过，不抛错且不计入回滚', async () => {
      redis.eval
        .mockResolvedValueOnce(-1) /* SKU1 无限库存 */
        .mockResolvedValueOnce(9) /* SKU2 正常扣减剩 9 */
      await expect(
        service.deduct([
          { skuId: 'SKU1', qty: 5 },
          { skuId: 'SKU2', qty: 1 }
        ])
      ).resolves.toBeUndefined()
      /* 仅 2 次 eval（无回滚） */
      expect(redis.eval).toHaveBeenCalledTimes(2)
    })

    it('Lua 返回 -2 → 自动 preload 后重试一次成功', async () => {
      skuFindOne.mockResolvedValueOnce({ id: 'SKU1', stockQty: 50, isDeleted: 0 })
      redis.eval
        .mockResolvedValueOnce(-2) /* 首次 deduct：key 未初始化 */
        .mockResolvedValueOnce(49) /* preload 后重试成功 */
      await service.deduct([{ skuId: 'SKU1', qty: 1 }])
      expect(skuFindOne).toHaveBeenCalledTimes(1)
      expect(redis.set).toHaveBeenCalledWith('stock:sku:SKU1', '50', 'NX')
      expect(redis.eval).toHaveBeenCalledTimes(2)
    })

    it('preload 后仍 -2 → 抛 BIZ_RESOURCE_NOT_FOUND', async () => {
      skuFindOne.mockResolvedValueOnce({ id: 'SKU1', stockQty: 50, isDeleted: 0 })
      redis.eval.mockResolvedValueOnce(-2).mockResolvedValueOnce(-2) /* 重试仍 -2 */
      await expect(service.deduct([{ skuId: 'SKU1', qty: 1 }])).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_RESOURCE_NOT_FOUND
      })
    })
  })

  /* ====================================================================
   * 3) restore
   * ==================================================================== */

  describe('restore', () => {
    it('正常恢复：Lua 返回新余量', async () => {
      redis.eval.mockResolvedValueOnce(11)
      await expect(service.restore([{ skuId: 'SKU1', qty: 1 }])).resolves.toBeUndefined()
      expect(redis.eval).toHaveBeenCalledTimes(1)
      const evalArgs = redis.eval.mock.calls[0]!
      expect(evalArgs[2]).toBe('stock:sku:SKU1')
      expect(evalArgs[3]).toBe('1')
    })

    it('Lua 返回 -2 → 先 preload 再重试一次', async () => {
      skuFindOne.mockResolvedValueOnce({ id: 'SKU1', stockQty: 100, isDeleted: 0 })
      redis.eval
        .mockResolvedValueOnce(-2) /* 首次 restore：key 未初始化 */
        .mockResolvedValueOnce(101) /* preload 后重试成功 */
      await service.restore([{ skuId: 'SKU1', qty: 1 }])
      expect(skuFindOne).toHaveBeenCalledTimes(1)
      expect(redis.eval).toHaveBeenCalledTimes(2)
    })

    it('Lua 返回 -1（无限库存）→ 忽略，不抛错', async () => {
      redis.eval.mockResolvedValueOnce(-1)
      await expect(service.restore([{ skuId: 'SKU1', qty: 5 }])).resolves.toBeUndefined()
    })
  })

  /* ====================================================================
   * 4) commit（DB CAS）
   * ==================================================================== */

  describe('commit', () => {
    it('DB CAS 成功：affectedRows 累加 = items.length，事务提交', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })
      await service.commit([
        { skuId: 'SKU1', qty: 2 },
        { skuId: 'SKU2', qty: 3 }
      ])
      expect(queryRunner.connect).toHaveBeenCalled()
      expect(queryRunner.startTransaction).toHaveBeenCalled()
      expect(queryRunner.manager.query).toHaveBeenCalledTimes(2)
      /* 校验 SQL 含 CAS 关键字 */
      const sql = queryRunner.manager.query.mock.calls[0]![0] as string
      expect(sql).toContain('UPDATE product_sku')
      expect(sql).toContain('stock_qty - ?')
      expect(sql).toContain('stock_qty >= ?')
      expect(sql).toContain('stock_qty = -1')
      expect(queryRunner.manager.query.mock.calls[0]![1]).toEqual([2, 'SKU1', 2])
      expect(queryRunner.commitTransaction).toHaveBeenCalled()
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled()
      expect(queryRunner.release).toHaveBeenCalled()
    })

    it('受影响行数 != items.length 抛 SYSTEM_DB_ERROR 并回滚', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 0 }) /* CAS 失败：库存被并发抢光 */
      await expect(
        service.commit([
          { skuId: 'SKU1', qty: 2 },
          { skuId: 'SKU2', qty: 3 }
        ])
      ).rejects.toMatchObject({ bizCode: BizErrorCode.SYSTEM_DB_ERROR })
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled()
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled()
      expect(queryRunner.release).toHaveBeenCalled()
    })

    it('items 为空时直接返回，不开启事务', async () => {
      await service.commit([])
      expect(queryRunner.connect).not.toHaveBeenCalled()
      expect(queryRunner.manager.query).not.toHaveBeenCalled()
    })
  })

  /* ====================================================================
   * 5) getCachedStock
   * ==================================================================== */

  describe('getCachedStock', () => {
    it('Redis 有值：返回 number', async () => {
      redis.get.mockResolvedValueOnce('42')
      await expect(service.getCachedStock('SKU1')).resolves.toBe(42)
      expect(redis.get).toHaveBeenCalledWith('stock:sku:SKU1')
    })

    it('Redis 无 key：返回 null', async () => {
      redis.get.mockResolvedValueOnce(null)
      await expect(service.getCachedStock('SKU1')).resolves.toBeNull()
    })
  })

  /* ====================================================================
   * 6) V4.5 验收：100 并发 deduct，stock=50 → 50 成功 50 失败 + Redis 余 0
   *    （P4-REVIEW-01 / I-04 修复）
   *
   * 关键：Lua 原子语义模拟
   *   ① 用 in-memory Map 维护 stock counter（顺序执行模拟单线程 Redis）
   *   ② redis.eval mockImplementation 同步读 + 同步减 + 返回 Promise.resolve
   *      ↑ Node.js 单线程 + microtask 队列保证 100 个 Promise.allSettled 顺序解析
   *   ③ 不依赖 ioredis-mock（避免新增 dev 依赖）；本地 in-memory 模拟器与
   *      stock_deduct.lua 行为一致：GET → 比较 → DECRBY 单步
   * ==================================================================== */

  describe('V4.5 并发验收（100 并发，stock=50）', () => {
    /** 模拟 Redis stock 数据：key → number */
    let stockMap: Map<string, number>

    beforeEach(() => {
      stockMap = new Map()
      /**
       * 用 mockImplementation 替换 redis.eval 行为；
       * 严格按 stock_deduct.lua 语义：
       *   - 不存在 → -2
       *   - = -1 无限库存 → -1（跳过）
       *   - < qty 库存不足 → -3
       *   - 否则 DECRBY → 返回剩余
       *
       * 同步执行 + Promise.resolve 包裹保证 microtask 队列内顺序，
       * Promise.allSettled 中所有任务依次解析（等价 Redis 单线程）。
       */
      redis.eval.mockImplementation(
        (_script: string, _numKeys: number, key: string, qty: string) => {
          const cur = stockMap.get(key)
          if (cur === undefined) return Promise.resolve(-2)
          if (cur === -1) return Promise.resolve(-1)
          const need = Number.parseInt(qty, 10)
          if (cur < need) return Promise.resolve(-3)
          stockMap.set(key, cur - need)
          return Promise.resolve(cur - need)
        }
      )
    })

    it('100 并发 deduct(qty=1)，stock=50 → 50 成功 50 失败 + Redis 余 0', async () => {
      const skuId = 'sku-concurrent-test'
      const key = `stock:sku:${skuId}`
      stockMap.set(key, 50)

      const results = await Promise.allSettled(
        Array.from({ length: 100 }, () => service.deduct([{ skuId, qty: 1 }]))
      )

      const succeed = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      expect(succeed).toBe(50)
      expect(failed).toBe(50)

      /* 失败原因必须是 BIZ_OPERATION_FORBIDDEN '库存不足' */
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      failures.forEach((f) => {
        expect((f.reason as Error).message).toContain('库存不足')
        expect(f.reason).toMatchObject({
          bizCode: BizErrorCode.BIZ_OPERATION_FORBIDDEN
        })
      })

      /* in-memory 模拟器内 stock 余 0（与"Redis 余 0"等价） */
      expect(stockMap.get(key)).toBe(0)

      /* eval 调用 100 次（每次 1 个 SKU 单 deduct，无回滚因为 succeeded 列表为空） */
      expect(redis.eval).toHaveBeenCalledTimes(100)
    }, 15_000)
  })
})
