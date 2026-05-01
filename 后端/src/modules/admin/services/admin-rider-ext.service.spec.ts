/**
 * @file admin-rider-ext.service.spec.ts
 * @stage P9 Sprint 4 / W4.C.1 + W4.C.2
 * @desc AdminRiderExtService 单测：track（happy / 无数据 / 异常）+ reward / level CRUD
 * @author Sprint4-Agent C
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { BusinessException } from '@/common'
import { MapService } from '@/modules/map/map.service'
import { SysConfigService } from '@/modules/system/sys-config.service'
import { AdminRiderExtService } from './admin-rider-ext.service'

describe('AdminRiderExtService', () => {
  let service: AdminRiderExtService
  let mapService: { queryTrack: jest.Mock }
  let sysConfig: { get: jest.Mock; invalidate: jest.Mock }
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    mapService = { queryTrack: jest.fn() }
    sysConfig = {
      get: jest.fn(),
      invalidate: jest.fn().mockResolvedValue(undefined)
    }
    dataSource = { query: jest.fn().mockResolvedValue([]) }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRiderExtService,
        { provide: DataSource, useValue: dataSource },
        { provide: MapService, useValue: mapService },
        { provide: SysConfigService, useValue: sysConfig }
      ]
    }).compile()

    service = moduleRef.get(AdminRiderExtService)
  })

  /* ============================================================================
   * 一、queryTrack
   * ============================================================================ */

  describe('queryTrack', () => {
    const buildResp = (
      pointCount: number
    ): {
      riderId: string
      orderNo: string
      pointCount: number
      geometry: { type: 'LineString'; coordinates: number[][] }
      timestamps: number[]
      properties: {
        startMs: number
        endMs: number
        totalDistanceM: number
        avgSpeedKmh: number
      }
    } => ({
      riderId: 'R1',
      orderNo: 'T20260501001',
      pointCount,
      geometry: {
        type: 'LineString',
        coordinates:
          pointCount === 0
            ? []
            : [
                [120, 30],
                [120.001, 30.001]
              ]
      },
      timestamps: pointCount === 0 ? [] : [1714521600000, 1714521610000],
      properties: {
        startMs: pointCount === 0 ? 0 : 1714521600000,
        endMs: pointCount === 0 ? 0 : 1714521610000,
        totalDistanceM: pointCount === 0 ? 0 : 142,
        avgSpeedKmh: pointCount === 0 ? 0 : 51.1
      }
    })

    it('happy：调 MapService.queryTrack 并透传 GeoJSON', async () => {
      mapService.queryTrack.mockResolvedValueOnce(buildResp(2))
      const ret = await service.queryTrack('R1', 'T20260501001', 1714521600000, 1714521610000)
      expect(mapService.queryTrack).toHaveBeenCalledWith(
        'R1',
        'T20260501001',
        new Date(1714521600000).toISOString(),
        new Date(1714521610000).toISOString()
      )
      expect(ret.pointCount).toBe(2)
      expect(ret.geometry.type).toBe('LineString')
      expect(ret.geometry.coordinates).toHaveLength(2)
      expect(ret.properties.totalDistanceM).toBe(142)
    })

    it('无数据：透传 pointCount=0 + 空坐标', async () => {
      mapService.queryTrack.mockResolvedValueOnce(buildResp(0))
      const ret = await service.queryTrack('R1', 'T20260501001')
      expect(ret.pointCount).toBe(0)
      expect(ret.geometry.coordinates).toEqual([])
      expect(ret.timestamps).toEqual([])
    })

    it('参数缺失：riderId 空 → PARAM_INVALID', async () => {
      await expect(service.queryTrack('', 'T1')).rejects.toBeInstanceOf(BusinessException)
      expect(mapService.queryTrack).not.toHaveBeenCalled()
    })

    it('参数缺失：orderNo 空 → PARAM_INVALID', async () => {
      await expect(service.queryTrack('R1', '')).rejects.toBeInstanceOf(BusinessException)
      expect(mapService.queryTrack).not.toHaveBeenCalled()
    })

    it('MapService 抛错 → 透传异常（不吞）', async () => {
      mapService.queryTrack.mockRejectedValueOnce(new Error('TimescaleDB down'))
      await expect(service.queryTrack('R1', 'T1')).rejects.toThrow('TimescaleDB down')
    })

    it('未传时间戳：传 undefined ISO 给 MapService', async () => {
      mapService.queryTrack.mockResolvedValueOnce(buildResp(0))
      await service.queryTrack('R1', 'T1')
      expect(mapService.queryTrack).toHaveBeenCalledWith('R1', 'T1', undefined, undefined)
    })
  })

  /* ============================================================================
   * 二、Reward CRUD
   * ============================================================================ */

  describe('reward CRUD', () => {
    it('listReward：从 sys_config 读数组', async () => {
      sysConfig.get.mockResolvedValueOnce([
        { id: 'r1', type: 'reward', name: '准点奖', threshold: 30, amount: '5.00', enabled: true }
      ])
      const list = await service.listReward()
      expect(sysConfig.get).toHaveBeenCalledWith('dispatch.reward_rules', [])
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('准点奖')
    })

    it('listReward：sys_config 返回非数组 → 兜底空数组', async () => {
      sysConfig.get.mockResolvedValueOnce(null)
      const list = await service.listReward()
      expect(list).toEqual([])
    })

    it('saveReward：新增（无 id）→ 数组 push + 写 sys_config', async () => {
      sysConfig.get.mockResolvedValueOnce([])
      const list = await service.saveReward({
        type: 'reward',
        name: '高峰奖',
        threshold: 5,
        amount: '8',
        enabled: true
      })
      expect(list).toHaveLength(1)
      expect(list[0].id).toBeTruthy()
      expect(list[0].amount).toBe('8.00')
      expect(dataSource.query).toHaveBeenCalledTimes(1)
      expect(dataSource.query.mock.calls[0][0]).toContain('INSERT INTO sys_config')
      expect(dataSource.query.mock.calls[0][1][0]).toBe('dispatch.reward_rules')
      expect(sysConfig.invalidate).toHaveBeenCalledWith('dispatch.reward_rules')
    })

    it('saveReward：更新（有 id）→ 同 id 替换', async () => {
      sysConfig.get.mockResolvedValueOnce([
        { id: 'r1', type: 'reward', name: 'Old', threshold: 1, amount: '1.00', enabled: true }
      ])
      const list = await service.saveReward({
        id: 'r1',
        type: 'punish',
        name: 'New',
        threshold: 2,
        amount: '3.5'
      })
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('New')
      expect(list[0].type).toBe('punish')
      expect(list[0].amount).toBe('3.50')
    })

    it('saveReward：缺 type → PARAM_INVALID', async () => {
      await expect(
        service.saveReward({ name: 'x', amount: '1' } as Partial<{
          id: string
          type: 'reward'
          name: string
          amount: string
        }>)
      ).rejects.toBeInstanceOf(BusinessException)
      expect(dataSource.query).not.toHaveBeenCalled()
    })

    it('saveReward：amount 非法 → PARAM_INVALID', async () => {
      await expect(
        service.saveReward({ type: 'reward', name: 'x', amount: 'abc' })
      ).rejects.toBeInstanceOf(BusinessException)
    })

    it('saveReward：dataSource.query 抛错 → SYSTEM_DB_ERROR', async () => {
      sysConfig.get.mockResolvedValueOnce([])
      dataSource.query.mockRejectedValueOnce(new Error('DB down'))
      await expect(
        service.saveReward({ type: 'reward', name: 'x', amount: '1' })
      ).rejects.toBeInstanceOf(BusinessException)
    })

    it('deleteReward：从数组移除 + 写回', async () => {
      sysConfig.get.mockResolvedValueOnce([
        { id: 'a', type: 'reward', name: 'x', threshold: 1, amount: '1.00', enabled: true },
        { id: 'b', type: 'reward', name: 'y', threshold: 1, amount: '2.00', enabled: true }
      ])
      const list = await service.deleteReward('a')
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('b')
      expect(dataSource.query).toHaveBeenCalledTimes(1)
    })

    it('deleteReward：id 空 → PARAM_INVALID', async () => {
      await expect(service.deleteReward('')).rejects.toBeInstanceOf(BusinessException)
    })
  })

  /* ============================================================================
   * 三、Level CRUD
   * ============================================================================ */

  describe('level CRUD', () => {
    it('listLevel：读数组 + 兜底', async () => {
      sysConfig.get.mockResolvedValueOnce([
        { level: 1, name: '铜牌', condition: { minOrders: 0 }, weight: 1 }
      ])
      const list = await service.listLevel()
      expect(sysConfig.get).toHaveBeenCalledWith('dispatch.level_config', [])
      expect(list[0].name).toBe('铜牌')
    })

    it('saveLevel：新增 + 按 level 升序', async () => {
      sysConfig.get.mockResolvedValueOnce([{ level: 2, name: 'silver', condition: {}, weight: 2 }])
      const list = await service.saveLevel({ level: 1, name: 'bronze' })
      expect(list.map((r) => r.level)).toEqual([1, 2])
      expect(list[0].weight).toBe(1)
      expect(list[0].condition).toEqual({})
    })

    it('saveLevel：覆盖（同 level）', async () => {
      sysConfig.get.mockResolvedValueOnce([{ level: 1, name: 'old', condition: {}, weight: 1 }])
      const list = await service.saveLevel({ level: 1, name: 'new', weight: 5 })
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('new')
      expect(list[0].weight).toBe(5)
    })

    it('saveLevel：level 缺 → PARAM_INVALID', async () => {
      await expect(
        service.saveLevel({ name: 'x' } as Partial<{ level: number; name: string }>)
      ).rejects.toBeInstanceOf(BusinessException)
    })

    it('deleteLevel：从数组移除', async () => {
      sysConfig.get.mockResolvedValueOnce([
        { level: 1, name: 'a', condition: {}, weight: 1 },
        { level: 2, name: 'b', condition: {}, weight: 2 }
      ])
      const list = await service.deleteLevel(1)
      expect(list).toHaveLength(1)
      expect(list[0].level).toBe(2)
    })

    it('deleteLevel：非数字 → PARAM_INVALID', async () => {
      await expect(service.deleteLevel(Number.NaN as unknown as number)).rejects.toBeInstanceOf(
        BusinessException
      )
    })
  })
})
