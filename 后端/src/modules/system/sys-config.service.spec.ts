import { Test, TestingModule } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { SysConfigService } from './sys-config.service'
import { REDIS_CLIENT } from '../../health/redis.provider'

describe('SysConfigService', () => {
  let service: SysConfigService
  let mockRedis: Record<string, jest.Mock>
  let mockDataSource: { query: jest.Mock }

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    }
    mockDataSource = {
      query: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SysConfigService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: DataSource, useValue: mockDataSource }
      ]
    }).compile()

    service = module.get<SysConfigService>(SysConfigService)
  })

  it('get() 命中 Redis 缓存时直接返回，不查 DB', async () => {
    mockRedis.get.mockResolvedValue('"cached_value"')

    const result = await service.get('test_key', 'fallback')

    expect(result).toBe('cached_value')
    expect(mockRedis.get).toHaveBeenCalledWith('sys_config:test_key')
    expect(mockDataSource.query).not.toHaveBeenCalled()
  })

  it('get() 未命中缓存时查 DB 并写入 Redis 缓存', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockDataSource.query.mockResolvedValue([{ config_value: '"db_value"' }])

    const result = await service.get('db_key', 'fallback')

    expect(result).toBe('db_value')
    expect(mockDataSource.query).toHaveBeenCalledWith(
      'SELECT config_value FROM sys_config WHERE config_key = ? AND is_deleted = 0 LIMIT 1',
      ['db_key']
    )
    expect(mockRedis.set).toHaveBeenCalledWith('sys_config:db_key', '"db_value"', 'EX', 300)
  })

  it('invalidate() 清除指定 key 的 Redis 缓存', async () => {
    await service.invalidate('clear_key')

    expect(mockRedis.del).toHaveBeenCalledWith('sys_config:clear_key')
  })

  /* ====================================================================
   * P9 Sprint 3 / W3.A.2 增补：补 functions / branches 覆盖
   * 目标：functions 60% → ≥ 70%
   * ==================================================================== */

  it('get() Redis 抛错 → 回退 DB 路径，DB 命中即返回', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('redis down'))
    mockDataSource.query.mockResolvedValueOnce([{ config_value: '"db_after_redis_down"' }])

    const result = await service.get('redis_err_key', 'fallback')

    expect(result).toBe('db_after_redis_down')
    expect(mockDataSource.query).toHaveBeenCalled()
  })

  it('get() Redis miss + DB miss → 返回 fallback', async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    mockDataSource.query.mockResolvedValueOnce([])

    const result = await service.get('absent_key', 'fb')

    expect(result).toBe('fb')
  })

  it('get() Redis miss + DB 抛错 → 返回 fallback + logger 不抛', async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    mockDataSource.query.mockRejectedValueOnce(new Error('mysql gone away'))

    const result = await service.get('db_err_key', { default: true })

    expect(result).toEqual({ default: true })
  })

  it('get() Redis set 写回时抛错也不影响业务（fire-and-forget catch）', async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    mockRedis.set.mockRejectedValueOnce(new Error('redis full'))
    mockDataSource.query.mockResolvedValueOnce([{ config_value: '"abc"' }])

    const result = await service.get('write_err_key', 'fb')

    expect(result).toBe('abc')
  })

  it('getMany() 批量查询：每个 key 各调一次 get', async () => {
    mockRedis.get
      .mockResolvedValueOnce('"v1"')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockDataSource.query
      .mockResolvedValueOnce([{ config_value: '"v2_db"' }])
      .mockResolvedValueOnce([])

    const result = await service.getMany(['k1', 'k2', 'k3'])

    expect(result).toEqual({ k1: 'v1', k2: 'v2_db', k3: null })
  })

  it('getMany() 空数组 → 空对象', async () => {
    const result = await service.getMany([])
    expect(result).toEqual({})
  })

  it('get() 数字类型反序列化', async () => {
    mockRedis.get.mockResolvedValueOnce('42')
    const result = await service.get<number>('num_key', 0)
    expect(result).toBe(42)
  })

  it('get() 数组类型反序列化', async () => {
    mockRedis.get.mockResolvedValueOnce('[{"couponId":"C1","qty":3}]')
    const result = await service.get<Array<{ couponId: string; qty: number }>>('arr_key', [])
    expect(result).toEqual([{ couponId: 'C1', qty: 3 }])
  })
})
