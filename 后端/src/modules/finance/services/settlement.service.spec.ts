/**
 * @file settlement.service.spec.ts
 * @stage P4/T4.52（Sprint 8）
 * @desc SettlementService 单测：computeForOrder + execute + clamp 算法 + 跳过策略
 * @author 单 Agent V2.0（Subagent 7）
 *
 * 关键覆盖：
 *   1) 外卖订单：3 角色都命中规则 → 创建 3 条 settlement_record
 *   2) 跑腿订单：merchant 跳过（无 merchantId），rider/platform 创建
 *   3) clamp 算法：rate*base + fixed_fee；超过 max_fee 取 max；低于 min_fee 取 min
 *   4) 已存在 (PENDING/EXECUTED) 记录 → 跳过对应 target
 *   5) execute 成功 → status=1 + flow_no 回填
 *   6) execute earn 抛错 → status=2 + error_msg 回填（不二次抛）
 *   7) settle_amount<=0 → 跳过
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { SettlementRecord } from '@/entities'
import { OrderTypeEnum } from '@/modules/order/types/order.types'
import {
  SettlementRecordStatusEnum,
  SettlementSceneEnum,
  SettlementTargetTypeEnum
} from '../types/finance.types'
import { AccountService } from './account.service'
import { SettlementRuleService } from './settlement-rule.service'
import { SettlementService, type SettlementInput } from './settlement.service'

describe('SettlementService', () => {
  let service: SettlementService
  let recordRepoFind: jest.Mock
  let recordRepoSave: jest.Mock
  let recordRepoCreate: jest.Mock
  let matchRulesForOrder: jest.Mock
  let accountServiceEarn: jest.Mock

  const buildRule = (over: Record<string, unknown> = {}) => ({
    id: 'R1',
    ruleCode: 'RULE',
    rate: '0.10',
    fixedFee: '0.00',
    minFee: '0.00',
    maxFee: '100.00',
    ...over
  })

  beforeEach(async () => {
    recordRepoFind = jest.fn().mockResolvedValue([])
    recordRepoSave = jest.fn().mockImplementation(async (records: unknown) => records)
    recordRepoCreate = jest.fn((data: unknown) => data)
    matchRulesForOrder = jest.fn()
    accountServiceEarn = jest.fn().mockResolvedValue({
      account: { balance: '100.00' },
      flow: { flowNo: 'F0001' }
    })

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        {
          provide: getRepositoryToken(SettlementRecord),
          useValue: {
            find: recordRepoFind,
            save: recordRepoSave,
            create: recordRepoCreate,
            createQueryBuilder: jest.fn()
          }
        },
        {
          provide: getDataSourceToken(),
          useValue: { query: jest.fn() }
        },
        {
          provide: SettlementRuleService,
          useValue: { matchRulesForOrder }
        },
        {
          provide: AccountService,
          useValue: { earn: accountServiceEarn }
        }
      ]
    }).compile()

    service = moduleRef.get(SettlementService)
  })

  describe('computeForOrder - takeout', () => {
    it('all 3 roles hit rules -> creates 3 records', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ id: 'RM', rate: '0.10' }),
        rider: buildRule({ id: 'RR', rate: '0.05' }),
        platform: buildRule({ id: 'RP', rate: '0.02' })
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000001234',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: 'R1',
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      expect(result.records).toHaveLength(3)
      expect(result.skippedReasons).toHaveLength(0)
      const targets = result.records.map((r) => r.targetType)
      expect(targets).toEqual(
        expect.arrayContaining([
          SettlementTargetTypeEnum.MERCHANT,
          SettlementTargetTypeEnum.RIDER,
          SettlementTargetTypeEnum.PLATFORM
        ])
      )
    })

    it('merchant rule missing -> skip merchant', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: null,
        rider: buildRule({ id: 'RR' }),
        platform: buildRule({ id: 'RP' })
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000001234',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: 'R1',
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      expect(result.records).toHaveLength(2)
      expect(result.skippedReasons.some((r) => r.includes('merchant'))).toBe(true)
    })

    it('clamp upper bound: rate*base > maxFee -> capped at maxFee', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ rate: '0.50', fixedFee: '0.00', minFee: '0.00', maxFee: '20.00' }),
        rider: null,
        platform: null
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000001234',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: null,
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      /* 100 * 0.5 = 50, capped at 20 */
      expect(result.records[0]?.settleAmount).toBe('20.00')
    })

    it('clamp lower bound: rate*base < minFee -> raised to minFee', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ rate: '0.01', fixedFee: '0.00', minFee: '5.00', maxFee: '100.00' }),
        rider: null,
        platform: null
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000001234',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: null,
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      /* 100 * 0.01 = 1, raised to 5 */
      expect(result.records[0]?.settleAmount).toBe('5.00')
    })

    it('settleAmount = 0 -> skip', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ rate: '0.00', fixedFee: '0.00', minFee: '0.00', maxFee: '0.00' }),
        rider: null,
        platform: null
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000001234',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: null,
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      expect(result.records).toHaveLength(0)
      expect(result.skippedReasons.some((r) => r.includes('≤0'))).toBe(true)
    })

    it('existing PENDING record -> skip same target', async () => {
      recordRepoFind.mockResolvedValue([
        {
          targetType: SettlementTargetTypeEnum.MERCHANT,
          status: SettlementRecordStatusEnum.PENDING
        }
      ])
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ id: 'RM' }),
        rider: buildRule({ id: 'RR' }),
        platform: buildRule({ id: 'RP' })
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000001234',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: 'R1',
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      /* merchant skipped (existing) -> rider + platform = 2 */
      expect(result.records).toHaveLength(2)
    })
  })

  describe('computeForOrder - errand', () => {
    it('errand: rider + platform only, no merchant', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ id: 'RM' }),
        rider: buildRule({ id: 'RR' }),
        platform: buildRule({ id: 'RP' })
      })

      const input: SettlementInput = {
        orderNo: 'E20260419000001234',
        orderType: OrderTypeEnum.ERRAND,
        merchantId: null,
        riderId: 'R1',
        shopId: null,
        cityCode: '110000',
        payAmount: '50.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      /* errand 不创建 merchant 分账 */
      const targets = result.records.map((r) => r.targetType)
      expect(targets).not.toContain(SettlementTargetTypeEnum.MERCHANT)
      expect(targets).toEqual(
        expect.arrayContaining([SettlementTargetTypeEnum.RIDER, SettlementTargetTypeEnum.PLATFORM])
      )
    })
  })

  describe('execute', () => {
    it('successful execute -> status=EXECUTED + flowNo', async () => {
      const record = {
        id: 'SR1',
        settlementNo: 'S0001',
        orderNo: 'T20260419000001234',
        targetType: SettlementTargetTypeEnum.MERCHANT,
        targetId: 'M1',
        settleAmount: '10.00',
        status: SettlementRecordStatusEnum.PENDING,
        errorMsg: null,
        settleAt: null,
        flowNo: null,
        updatedAt: new Date()
      } as unknown as SettlementRecord

      const saved = await service.execute(record)
      expect(saved.status).toBe(SettlementRecordStatusEnum.EXECUTED)
      expect(saved.flowNo).toBe('F0001')
      expect(accountServiceEarn).toHaveBeenCalledTimes(1)
    })

    it('non-PENDING status -> skip', async () => {
      const record = {
        id: 'SR1',
        settlementNo: 'S0001',
        status: SettlementRecordStatusEnum.EXECUTED
      } as unknown as SettlementRecord

      const out = await service.execute(record)
      expect(out).toBe(record)
      expect(accountServiceEarn).not.toHaveBeenCalled()
    })

    it('earn throws -> status=FAILED + errorMsg', async () => {
      accountServiceEarn.mockRejectedValueOnce(new Error('account locked'))
      const record = {
        id: 'SR1',
        settlementNo: 'S0001',
        orderNo: 'T20260419000001234',
        targetType: SettlementTargetTypeEnum.MERCHANT,
        targetId: 'M1',
        settleAmount: '10.00',
        status: SettlementRecordStatusEnum.PENDING,
        errorMsg: null,
        settleAt: null,
        flowNo: null,
        updatedAt: new Date()
      } as unknown as SettlementRecord

      const saved = await service.execute(record)
      expect(saved.status).toBe(SettlementRecordStatusEnum.FAILED)
      expect(saved.errorMsg).toContain('account locked')
    })

    /**
     * P9/Sprint1 W1.C.2 增补：MERCHANT/RIDER targetId 缺失 → status=FAILED + errorMsg
     * 走 resolveOwnerForTarget 返回 null 分支（lines 274-280）
     */
    it('MERCHANT target with null targetId -> FAILED with targetId 缺失', async () => {
      const record = {
        id: 'SR2',
        settlementNo: 'S0002',
        orderNo: 'T20260419000005678',
        targetType: SettlementTargetTypeEnum.MERCHANT,
        targetId: null,
        settleAmount: '10.00',
        status: SettlementRecordStatusEnum.PENDING,
        errorMsg: null,
        settleAt: null,
        flowNo: null,
        updatedAt: new Date()
      } as unknown as SettlementRecord

      const saved = await service.execute(record)
      expect(saved.status).toBe(SettlementRecordStatusEnum.FAILED)
      expect(saved.errorMsg).toContain('targetId')
      /* 不应调用 accountService.earn */
      expect(accountServiceEarn).not.toHaveBeenCalled()
    })

    it('RIDER target with null targetId -> FAILED with targetId 缺失', async () => {
      const record = {
        id: 'SR3',
        settlementNo: 'S0003',
        orderNo: 'T20260419000006789',
        targetType: SettlementTargetTypeEnum.RIDER,
        targetId: null,
        settleAmount: '5.00',
        status: SettlementRecordStatusEnum.PENDING,
        errorMsg: null,
        settleAt: null,
        flowNo: null,
        updatedAt: new Date()
      } as unknown as SettlementRecord

      const saved = await service.execute(record)
      expect(saved.status).toBe(SettlementRecordStatusEnum.FAILED)
      expect(saved.errorMsg).toContain('targetId')
    })

    it('PLATFORM target works without targetId (uses PLATFORM_OWNER_ID)', async () => {
      const record = {
        id: 'SR4',
        settlementNo: 'S0004',
        orderNo: 'T20260419000007890',
        targetType: SettlementTargetTypeEnum.PLATFORM,
        targetId: null,
        settleAmount: '2.00',
        status: SettlementRecordStatusEnum.PENDING,
        errorMsg: null,
        settleAt: null,
        flowNo: null,
        updatedAt: new Date()
      } as unknown as SettlementRecord

      const saved = await service.execute(record)
      expect(saved.status).toBe(SettlementRecordStatusEnum.EXECUTED)
      expect(accountServiceEarn).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * P9/Sprint1 W1.C.2 增补：runForOrder 完整闭环（lines 325-341）
   */
  describe('runForOrder', () => {
    it('compute + execute 全部成功 -> created/executed 一致', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ id: 'RM', rate: '0.10' }),
        rider: buildRule({ id: 'RR', rate: '0.05' }),
        platform: buildRule({ id: 'RP', rate: '0.02' })
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000004321',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: 'R1',
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.runForOrder(input)
      expect(result.created).toBe(3)
      expect(result.executed).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('execute 部分失败时计入 failed', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ id: 'RM' }),
        rider: null,
        platform: null
      })
      /* 第一条 execute 抛错 */
      accountServiceEarn.mockRejectedValueOnce(new Error('balance frozen'))

      const input: SettlementInput = {
        orderNo: 'T20260419000005432',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: null,
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.runForOrder(input)
      expect(result.created).toBe(1)
      expect(result.executed).toBe(0)
      expect(result.failed).toBe(1)
    })
  })

  /**
   * P9/Sprint1 W1.C.2 增补：list / toVo（lines 513-555）
   */
  describe('list / toVo', () => {
    it('list with all filters builds full QueryBuilder chain', async () => {
      const qbWhere = jest.fn().mockReturnThis()
      const qbAndWhere = jest.fn().mockReturnThis()
      const qbOrderBy = jest.fn().mockReturnThis()
      const qbAddOrderBy = jest.fn().mockReturnThis()
      const qbSkip = jest.fn().mockReturnThis()
      const qbTake = jest.fn().mockReturnThis()
      const qbGetManyAndCount = jest.fn().mockResolvedValue([
        [
          {
            id: 'X1',
            settlementNo: 'S001',
            orderNo: 'T1',
            orderType: 1,
            targetType: SettlementTargetTypeEnum.MERCHANT,
            targetId: 'M1',
            ruleId: 'R1',
            baseAmount: '100.00',
            rate: '0.10',
            fixedFee: '0.00',
            settleAmount: '10.00',
            status: SettlementRecordStatusEnum.EXECUTED,
            settleAt: new Date('2026-01-01'),
            flowNo: 'F001',
            errorMsg: null,
            createdAt: new Date('2026-01-01')
          }
        ],
        1
      ])
      const fakeQb = {
        where: qbWhere,
        andWhere: qbAndWhere,
        orderBy: qbOrderBy,
        addOrderBy: qbAddOrderBy,
        skip: qbSkip,
        take: qbTake,
        getManyAndCount: qbGetManyAndCount
      }
      ;(
        service as unknown as { recordRepo: { createQueryBuilder: jest.Mock } }
      ).recordRepo.createQueryBuilder = jest.fn().mockReturnValue(fakeQb)

      const result = await service.list({
        orderNo: 'T1',
        orderType: 1,
        targetType: SettlementTargetTypeEnum.MERCHANT,
        targetId: 'M1',
        status: SettlementRecordStatusEnum.EXECUTED,
        page: 1,
        pageSize: 20,
        skip: () => 0,
        take: () => 20
      } as unknown as Parameters<typeof service.list>[0])

      expect(result.meta.total).toBe(1)
      expect(result.list).toHaveLength(1)
      expect(qbAndWhere).toHaveBeenCalledTimes(5)
    })

    it('toVo maps entity to plain VO', () => {
      const entity = {
        id: 'V1',
        settlementNo: 'S100',
        orderNo: 'T100',
        orderType: 1,
        targetType: SettlementTargetTypeEnum.PLATFORM,
        targetId: null,
        ruleId: 'RP',
        baseAmount: '50.00',
        rate: '0.02',
        fixedFee: '0.00',
        settleAmount: '1.00',
        status: SettlementRecordStatusEnum.EXECUTED,
        settleAt: new Date('2026-02-01'),
        flowNo: 'F100',
        errorMsg: null,
        createdAt: new Date('2026-02-01')
      } as unknown as SettlementRecord

      const vo = service.toVo(entity)
      expect(vo.id).toBe('V1')
      expect(vo.settlementNo).toBe('S100')
      expect(vo.targetType).toBe(SettlementTargetTypeEnum.PLATFORM)
      expect(vo.flowNo).toBe('F100')
    })
  })

  /**
   * P9/Sprint2 W2.A.2 增补：scan / listFinishedOrdersOf 主路径覆盖
   * 目标：把 settlement.service.ts 的 lines 从 67.26% 推到 ≥ 70%
   */
  describe('listFinishedOrdersOf', () => {
    let dataSourceQuery: jest.Mock
    beforeEach(() => {
      dataSourceQuery = jest.fn()
      ;(service as unknown as { dataSource: { query: jest.Mock } }).dataSource.query =
        dataSourceQuery
    })

    it('返回外卖 + 跑腿订单合并', async () => {
      /* 先 information_schema.TABLES 返回所有候选表存在；最简：每次都返回输入表全部 */
      dataSourceQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('information_schema.TABLES')) {
          return (params as string[]).map((t) => ({ TABLE_NAME: t }))
        }
        if (sql.includes('order_takeout')) {
          return [
            {
              order_no: 'T20260419000000001',
              shop_id: 'S1',
              merchant_id: 'M1',
              rider_id: 'R1',
              pay_amount: '100.00',
              finished_at: new Date(),
              shop_snapshot: { cityCode: '110000' }
            }
          ]
        }
        if (sql.includes('order_errand')) {
          return [
            {
              order_no: 'E20260419000000001',
              rider_id: 'R2',
              pay_amount: '50.00',
              finished_at: new Date(),
              pickup_snapshot: { cityCode: '310000' },
              delivery_snapshot: null
            }
          ]
        }
        return []
      })

      const inputs = await service.listFinishedOrdersOf(new Date(), 0)
      expect(inputs.length).toBeGreaterThanOrEqual(2)
      const types = inputs.map((i) => i.orderType)
      expect(types).toEqual(expect.arrayContaining([OrderTypeEnum.TAKEOUT, OrderTypeEnum.ERRAND]))
    })

    it('information_schema 返回 0 表 -> 跳过 union 查询', async () => {
      dataSourceQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('information_schema.TABLES')) {
          return [] /* 无表存在 */
        }
        throw new Error('SQL 不应被调用')
      })
      const inputs = await service.listFinishedOrdersOf(new Date(), 0)
      expect(inputs).toEqual([])
    })

    it('shop_snapshot 是 string -> parseJson 反序列化', async () => {
      dataSourceQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('information_schema.TABLES')) {
          return (params as string[]).map((t) => ({ TABLE_NAME: t }))
        }
        if (sql.includes('order_takeout')) {
          return [
            {
              order_no: 'T20260419000000002',
              shop_id: 'S2',
              merchant_id: 'M2',
              rider_id: null,
              pay_amount: '88.00',
              finished_at: new Date(),
              shop_snapshot: '{"cityCode":"440100"}' /* string 形态 */
            }
          ]
        }
        return []
      })

      const inputs = await service.listFinishedOrdersOf(new Date(), 0)
      const takeout = inputs.find((i) => i.orderType === OrderTypeEnum.TAKEOUT)
      expect(takeout?.cityCode).toBe('440100')
    })

    it('shop_snapshot 是 invalid JSON string -> parseJson 返回 null + cityCode 为 null', async () => {
      dataSourceQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('information_schema.TABLES')) {
          return (params as string[]).map((t) => ({ TABLE_NAME: t }))
        }
        if (sql.includes('order_takeout')) {
          return [
            {
              order_no: 'T20260419000000003',
              shop_id: 'S3',
              merchant_id: 'M3',
              rider_id: null,
              pay_amount: '20.00',
              finished_at: new Date(),
              shop_snapshot: 'not-valid-json'
            }
          ]
        }
        return []
      })

      const inputs = await service.listFinishedOrdersOf(new Date(), 0)
      const takeout = inputs.find((i) => i.orderType === OrderTypeEnum.TAKEOUT)
      expect(takeout?.cityCode).toBeNull()
    })

    it('errand pickup_snapshot null + delivery_snapshot 命中 cityCode', async () => {
      dataSourceQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('information_schema.TABLES')) {
          return (params as string[]).map((t) => ({ TABLE_NAME: t }))
        }
        if (sql.includes('order_errand')) {
          return [
            {
              order_no: 'E20260419000000099',
              rider_id: 'R9',
              pay_amount: '30.00',
              finished_at: new Date(),
              pickup_snapshot: null,
              delivery_snapshot: { cityCode: '320100' }
            }
          ]
        }
        return []
      })

      const inputs = await service.listFinishedOrdersOf(new Date(), 0)
      const errand = inputs.find((i) => i.orderType === OrderTypeEnum.ERRAND)
      expect(errand?.cityCode).toBe('320100')
    })
  })

  /**
   * P9/Sprint2 W2.A.2 增补：computeForOrder 跳过分支补充
   * 覆盖 line 192/196/221 等已存在记录跳过路径
   */
  describe('computeForOrder skip branches', () => {
    it('已存在 PENDING rider 记录 -> 跳过 rider', async () => {
      recordRepoFind.mockResolvedValue([
        { targetType: SettlementTargetTypeEnum.RIDER, status: SettlementRecordStatusEnum.PENDING }
      ])
      matchRulesForOrder.mockResolvedValue({
        merchant: buildRule({ id: 'RM' }),
        rider: buildRule({ id: 'RR' }),
        platform: buildRule({ id: 'RP' })
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000010001',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: 'M1',
        riderId: 'R1',
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      /* rider 跳过 -> merchant + platform = 2 */
      expect(result.records).toHaveLength(2)
      const targets = result.records.map((r) => r.targetType)
      expect(targets).not.toContain(SettlementTargetTypeEnum.RIDER)
    })

    it('已存在 EXECUTED platform 记录 -> 跳过 platform', async () => {
      recordRepoFind.mockResolvedValue([
        {
          targetType: SettlementTargetTypeEnum.PLATFORM,
          status: SettlementRecordStatusEnum.EXECUTED
        }
      ])
      matchRulesForOrder.mockResolvedValue({
        merchant: null,
        rider: buildRule({ id: 'RR' }),
        platform: buildRule({ id: 'RP' })
      })

      const input: SettlementInput = {
        orderNo: 'E20260419000010002',
        orderType: OrderTypeEnum.ERRAND,
        merchantId: null,
        riderId: 'R1',
        shopId: null,
        cityCode: '110000',
        payAmount: '50.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      /* platform 跳过 -> 仅 rider = 1 */
      expect(result.records).toHaveLength(1)
    })

    it('platform 计算金额=0 -> 跳过 platform（skippedReasons 含 ≤0）', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: null,
        rider: null,
        platform: buildRule({ rate: '0.00', fixedFee: '0.00', minFee: '0.00', maxFee: '0.00' })
      })

      const input: SettlementInput = {
        orderNo: 'T20260419000010003',
        orderType: OrderTypeEnum.TAKEOUT,
        merchantId: null,
        riderId: null,
        shopId: 'S1',
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      expect(result.records).toHaveLength(0)
      expect(result.skippedReasons.some((r) => r.includes('platform') && r.includes('≤0'))).toBe(
        true
      )
    })

    it('rider 计算金额=0 -> 跳过 rider', async () => {
      matchRulesForOrder.mockResolvedValue({
        merchant: null,
        rider: buildRule({ rate: '0.00', fixedFee: '0.00', minFee: '0.00', maxFee: '0.00' }),
        platform: null
      })

      const input: SettlementInput = {
        orderNo: 'E20260419000010004',
        orderType: OrderTypeEnum.ERRAND,
        merchantId: null,
        riderId: 'R1',
        shopId: null,
        cityCode: '110000',
        payAmount: '100.00',
        finishedAt: new Date()
      }

      const result = await service.computeForOrder(input)
      expect(result.records).toHaveLength(0)
      expect(result.skippedReasons.some((r) => r.includes('rider') && r.includes('≤0'))).toBe(true)
    })
  })
})
