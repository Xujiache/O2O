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
})
