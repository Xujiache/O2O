/**
 * @file account.service.spec.ts
 * @stage P4/T4.52（Sprint 8）
 * @desc AccountService 单测：CAS 重试 + earn / spend / freeze / unfreeze + 流水写入
 * @author 单 Agent V2.0（Subagent 7：Orchestration + 收尾）
 *
 * 关键覆盖：
 *   1) earn 正常入账 → balance += amount + total_income += amount + 写流水
 *   2) earn amount<=0 → 抛 PARAM_INVALID
 *   3) spend 余额不足 → 抛 BIZ_BALANCE_INSUFFICIENT 10402
 *   4) freeze 不足 → 抛 BIZ_BALANCE_INSUFFICIENT
 *   5) CAS miss 重试 3 次后抛 SYSTEM_DB_ERROR 50003
 *   6) getOrCreateAccount 已存在直接返回 / 不存在则 INSERT
 *   7) adjust 必须传 opAdminId + remark
 *
 * Mock 策略：
 *   - 直接 mock dataSource.transaction(cb) → 顺序调 cb(manager)
 *   - manager.findOne / save / createQueryBuilder().update().set().where().execute() 链式
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { BizErrorCode } from '@/common'
import { Account, AccountFlow } from '@/entities'
import { AccountOwnerTypeEnum, FlowBizTypeEnum, FlowDirectionEnum } from '../types/finance.types'
import { AccountService } from './account.service'

describe('AccountService', () => {
  let service: AccountService
  let accountRepoFindOne: jest.Mock
  let accountRepoSave: jest.Mock
  let dataSourceTransaction: jest.Mock
  let managerFindOne: jest.Mock
  let managerSave: jest.Mock
  let updateExecute: jest.Mock
  let managerCreate: jest.Mock

  /** Build a default Account row */
  const buildAccount = (over: Partial<Account> = {}): Account =>
    ({
      id: 'A1',
      tenantId: 1,
      ownerType: AccountOwnerTypeEnum.MERCHANT,
      ownerId: 'M1',
      balance: '100.00',
      frozen: '0.00',
      totalIncome: '500.00',
      totalExpense: '400.00',
      version: 5,
      status: 1,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...over
    }) as Account

  beforeEach(async () => {
    accountRepoFindOne = jest.fn()
    accountRepoSave = jest.fn()
    managerFindOne = jest.fn()
    managerSave = jest.fn()
    updateExecute = jest.fn().mockResolvedValue({ affected: 1 })
    managerCreate = jest.fn((_entity, data: unknown) => data)

    const fakeManager = {
      findOne: managerFindOne,
      save: managerSave,
      create: managerCreate,
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: updateExecute
      })
    }

    dataSourceTransaction = jest.fn(async (cb: (m: typeof fakeManager) => Promise<unknown>) =>
      cb(fakeManager)
    )

    const fakeDataSource = {
      transaction: dataSourceTransaction
    }
    const fakeFlowRepo = {}

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(Account),
          useValue: {
            findOne: accountRepoFindOne,
            save: accountRepoSave,
            create: jest.fn((data: unknown) => data),
            find: jest.fn().mockResolvedValue([])
          }
        },
        {
          provide: getRepositoryToken(AccountFlow),
          useValue: fakeFlowRepo
        },
        {
          provide: getDataSourceToken(),
          useValue: fakeDataSource
        }
      ]
    }).compile()

    service = moduleRef.get(AccountService)
  })

  describe('getOrCreateAccount', () => {
    it('returns existing account when found', async () => {
      const existing = buildAccount()
      accountRepoFindOne.mockResolvedValueOnce(existing)
      const got = await service.getOrCreateAccount(AccountOwnerTypeEnum.MERCHANT, 'M1')
      expect(got).toBe(existing)
      expect(accountRepoSave).not.toHaveBeenCalled()
    })

    it('creates new account when not found', async () => {
      accountRepoFindOne.mockResolvedValueOnce(null)
      accountRepoSave.mockImplementationOnce(async (entity: unknown) => entity)
      const got = await service.getOrCreateAccount(AccountOwnerTypeEnum.MERCHANT, 'M2')
      expect(got).toBeDefined()
      expect(accountRepoSave).toHaveBeenCalledTimes(1)
    })
  })

  describe('earn', () => {
    it('amount<=0 throws PARAM_INVALID', async () => {
      accountRepoFindOne.mockResolvedValueOnce(buildAccount())
      await expect(
        service.earn(AccountOwnerTypeEnum.MERCHANT, 'M1', '0', FlowBizTypeEnum.SETTLEMENT)
      ).rejects.toMatchObject({ bizCode: BizErrorCode.PARAM_INVALID })
    })

    it('successful earn updates balance + writes flow', async () => {
      const acc = buildAccount({ balance: '100.00', totalIncome: '500.00', version: 5 })
      accountRepoFindOne.mockResolvedValueOnce(acc)
      managerFindOne.mockResolvedValueOnce(acc)

      const result = await service.earn(
        AccountOwnerTypeEnum.MERCHANT,
        'M1',
        '50.00',
        FlowBizTypeEnum.SETTLEMENT
      )

      expect(result.account.balance).toBe('150.00')
      expect(result.account.totalIncome).toBe('550.00')
      expect(result.account.version).toBe(6)
      expect(result.flow).toBeDefined()
      expect(updateExecute).toHaveBeenCalledTimes(1)
      expect(managerSave).toHaveBeenCalled()
    })
  })

  describe('spend', () => {
    it('amount > balance throws BIZ_BALANCE_INSUFFICIENT', async () => {
      const acc = buildAccount({ balance: '10.00' })
      accountRepoFindOne.mockResolvedValueOnce(acc)
      managerFindOne.mockResolvedValueOnce(acc)

      await expect(
        service.spend(AccountOwnerTypeEnum.MERCHANT, 'M1', '50.00', FlowBizTypeEnum.WITHDRAW)
      ).rejects.toMatchObject({ bizCode: BizErrorCode.BIZ_BALANCE_INSUFFICIENT })
    })

    it('successful spend deducts balance', async () => {
      const acc = buildAccount({ balance: '100.00', totalExpense: '400.00', version: 5 })
      accountRepoFindOne.mockResolvedValueOnce(acc)
      managerFindOne.mockResolvedValueOnce(acc)

      const result = await service.spend(
        AccountOwnerTypeEnum.MERCHANT,
        'M1',
        '30.00',
        FlowBizTypeEnum.WITHDRAW
      )

      expect(result.account.balance).toBe('70.00')
      expect(result.account.totalExpense).toBe('430.00')
      expect(result.flow).toBeDefined()
    })
  })

  describe('freeze / unfreeze', () => {
    it('freeze deducts balance, increases frozen', async () => {
      const acc = buildAccount({ balance: '100.00', frozen: '0.00' })
      managerFindOne.mockResolvedValueOnce(acc)

      const result = await service.freeze('A1', '40.00')
      expect(result.account.balance).toBe('60.00')
      expect(result.account.frozen).toBe('40.00')
    })

    it('unfreeze restores balance, reduces frozen', async () => {
      const acc = buildAccount({ balance: '60.00', frozen: '40.00' })
      managerFindOne.mockResolvedValueOnce(acc)

      const result = await service.unfreeze('A1', '40.00')
      expect(result.account.balance).toBe('100.00')
      expect(result.account.frozen).toBe('0.00')
    })

    it('freeze on insufficient balance throws BIZ_BALANCE_INSUFFICIENT', async () => {
      const acc = buildAccount({ balance: '10.00' })
      managerFindOne.mockResolvedValueOnce(acc)

      await expect(service.freeze('A1', '20.00')).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_BALANCE_INSUFFICIENT
      })
    })
  })

  describe('CAS retry', () => {
    it('CAS miss 3 times -> throws SYSTEM_DB_ERROR 50003', async () => {
      const acc = buildAccount()
      accountRepoFindOne.mockResolvedValue(acc)
      managerFindOne.mockResolvedValue(acc)
      /* affected=0 → CAS miss → 重试；3 次后抛错 */
      updateExecute.mockResolvedValue({ affected: 0 })

      await expect(
        service.earn(AccountOwnerTypeEnum.MERCHANT, 'M1', '50.00', FlowBizTypeEnum.SETTLEMENT)
      ).rejects.toMatchObject({ bizCode: BizErrorCode.SYSTEM_DB_ERROR })
      /* dataSource.transaction 被调用 3 次（CAS_MAX_RETRY=3） */
      expect(dataSourceTransaction).toHaveBeenCalledTimes(3)
    })
  })

  describe('adjust', () => {
    it('missing opAdminId -> throws PARAM_INVALID', async () => {
      await expect(
        service.adjust('A1', FlowDirectionEnum.IN, '10.00', { remark: 'fix' })
      ).rejects.toMatchObject({ bizCode: BizErrorCode.PARAM_INVALID })
    })

    it('missing remark -> throws PARAM_INVALID', async () => {
      await expect(
        service.adjust('A1', FlowDirectionEnum.IN, '10.00', { opAdminId: 'admin1' })
      ).rejects.toMatchObject({ bizCode: BizErrorCode.PARAM_INVALID })
    })

    it('successful adjust IN', async () => {
      const acc = buildAccount({ balance: '100.00', totalIncome: '500.00' })
      managerFindOne.mockResolvedValueOnce(acc)

      const result = await service.adjust('A1', FlowDirectionEnum.IN, '20.00', {
        opAdminId: 'admin1',
        remark: 'bonus'
      })

      expect(result.account.balance).toBe('120.00')
      expect(result.account.totalIncome).toBe('520.00')
    })
  })

  /**
   * P9/Sprint1 W1.C.3 增补：findById / findByOwner / getOrCreatePlatformAccount
   */
  describe('lookups', () => {
    it('findById returns account when found', async () => {
      const acc = buildAccount({ id: 'A77' })
      accountRepoFindOne.mockResolvedValueOnce(acc)
      const got = await service.findById('A77')
      expect(got.id).toBe('A77')
    })

    it('findById throws BIZ_RESOURCE_NOT_FOUND when not found', async () => {
      accountRepoFindOne.mockResolvedValueOnce(null)
      await expect(service.findById('NOPE')).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_RESOURCE_NOT_FOUND
      })
    })

    it('findByOwner returns null when not found', async () => {
      accountRepoFindOne.mockResolvedValueOnce(null)
      const got = await service.findByOwner(AccountOwnerTypeEnum.MERCHANT, 'M_NOT_EXIST')
      expect(got).toBeNull()
    })

    it('findByOwner returns account when found', async () => {
      const acc = buildAccount({ ownerId: 'M2' })
      accountRepoFindOne.mockResolvedValueOnce(acc)
      const got = await service.findByOwner(AccountOwnerTypeEnum.MERCHANT, 'M2')
      expect(got?.ownerId).toBe('M2')
    })

    it('getOrCreatePlatformAccount delegates to getOrCreateAccount with PLATFORM_OWNER_ID', async () => {
      const acc = buildAccount({ ownerType: AccountOwnerTypeEnum.RIDER, ownerId: '0' })
      accountRepoFindOne.mockResolvedValueOnce(acc)
      const got = await service.getOrCreatePlatformAccount()
      expect(got.ownerType).toBe(AccountOwnerTypeEnum.RIDER)
      expect(got.ownerId).toBe('0')
    })
  })

  /**
   * P9/Sprint1 W1.C.3 增补：listFlows / listFlowsByOwner / findFlowsByRelatedNo
   */
  describe('flows queries', () => {
    let qbAndWhere: jest.Mock
    let qbGetManyAndCount: jest.Mock
    const buildQbStub = (rows: unknown[], total: number) => {
      qbAndWhere = jest.fn().mockReturnThis()
      qbGetManyAndCount = jest.fn().mockResolvedValue([rows, total])
      return {
        where: jest.fn().mockReturnThis(),
        andWhere: qbAndWhere,
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: qbGetManyAndCount
      }
    }

    it('listFlows applies bizType + direction filters', async () => {
      const flowRow = {
        id: 'F1',
        flowNo: 'F0001',
        accountId: 'A1',
        ownerType: AccountOwnerTypeEnum.MERCHANT,
        ownerId: 'M1',
        direction: FlowDirectionEnum.IN,
        bizType: FlowBizTypeEnum.SETTLEMENT,
        amount: '10.00',
        balanceAfter: '110.00',
        relatedNo: 'S0001',
        remark: 'test',
        opAdminId: null,
        createdAt: new Date('2026-03-01')
      }
      const qb = buildQbStub([flowRow], 1)
      ;(
        service as unknown as { flowRepo: { createQueryBuilder: jest.Mock } }
      ).flowRepo.createQueryBuilder = jest.fn().mockReturnValue(qb)

      const result = await service.listFlows('A1', {
        bizType: FlowBizTypeEnum.SETTLEMENT,
        direction: FlowDirectionEnum.IN,
        page: 1,
        pageSize: 10,
        skip: () => 0,
        take: () => 10
      } as unknown as Parameters<typeof service.listFlows>[1])

      expect(result.meta.total).toBe(1)
      expect(result.list[0]?.flowNo).toBe('F0001')
      expect(qbAndWhere).toHaveBeenCalledTimes(2)
    })

    it('listFlowsByOwner returns empty page when account missing', async () => {
      accountRepoFindOne.mockResolvedValueOnce(null)
      const result = await service.listFlowsByOwner(AccountOwnerTypeEnum.MERCHANT, 'NO_ACC', {
        page: 1,
        pageSize: 10,
        skip: () => 0,
        take: () => 10
      } as unknown as Parameters<typeof service.listFlowsByOwner>[2])
      expect(result.meta.total).toBe(0)
      expect(result.list).toHaveLength(0)
    })

    it('listFlowsByOwner delegates to listFlows when account exists', async () => {
      const acc = buildAccount({ id: 'A88' })
      accountRepoFindOne.mockResolvedValueOnce(acc)
      const qb = buildQbStub([], 0)
      ;(
        service as unknown as { flowRepo: { createQueryBuilder: jest.Mock } }
      ).flowRepo.createQueryBuilder = jest.fn().mockReturnValue(qb)

      const result = await service.listFlowsByOwner(AccountOwnerTypeEnum.MERCHANT, 'M88', {
        page: 1,
        pageSize: 10,
        skip: () => 0,
        take: () => 10
      } as unknown as Parameters<typeof service.listFlowsByOwner>[2])
      expect(result.meta.total).toBe(0)
    })

    it('findFlowsByRelatedNo calls flowRepo.find with correct where', async () => {
      const findMock = jest.fn().mockResolvedValue([{ id: 'F1' }])
      ;(service as unknown as { flowRepo: { find: jest.Mock } }).flowRepo.find = findMock
      const got = await service.findFlowsByRelatedNo('S0001')
      expect(got).toHaveLength(1)
      expect(findMock).toHaveBeenCalledWith({
        where: { relatedNo: 'S0001', isDeleted: 0 },
        order: { createdAt: 'DESC' }
      })
    })
  })

  /**
   * P9/Sprint1 W1.C.3 增补：toVo / flowToVo 纯映射
   */
  describe('VO mappers', () => {
    it('toVo maps Account fields', () => {
      const acc = buildAccount({ id: 'A123', balance: '88.88' })
      const vo = service.toVo(acc)
      expect(vo.id).toBe('A123')
      expect(vo.balance).toBe('88.88')
      expect(vo.ownerType).toBe(AccountOwnerTypeEnum.MERCHANT)
    })

    it('flowToVo maps AccountFlow fields', () => {
      const flow = {
        id: 'F2',
        flowNo: 'F0002',
        accountId: 'A1',
        ownerType: AccountOwnerTypeEnum.RIDER,
        ownerId: 'R1',
        direction: FlowDirectionEnum.OUT,
        bizType: FlowBizTypeEnum.WITHDRAW,
        amount: '20.00',
        balanceAfter: '80.00',
        relatedNo: 'W0001',
        remark: 'withdraw',
        opAdminId: null,
        createdAt: new Date('2026-03-02')
      }
      const vo = service.flowToVo(flow as never)
      expect(vo.flowNo).toBe('F0002')
      expect(vo.direction).toBe(FlowDirectionEnum.OUT)
      expect(vo.bizType).toBe(FlowBizTypeEnum.WITHDRAW)
    })
  })

  /**
   * P9/Sprint1 W1.C.3 增补：getOrCreateAccount 并发竞态（line 119-125）
   * race condition: save() 抛错（如唯一键冲突）→ findOne 重新拉取已存在记录
   */
  describe('getOrCreateAccount race', () => {
    it('save throws then refound returns existing', async () => {
      accountRepoFindOne
        .mockResolvedValueOnce(null) /* 第一次 findOne：不存在 */
        .mockResolvedValueOnce(buildAccount({ id: 'A_RACE' })) /* save 抛错后再查：拿到他人插入的 */
      accountRepoSave.mockRejectedValueOnce(new Error('Duplicate key'))
      const got = await service.getOrCreateAccount(AccountOwnerTypeEnum.MERCHANT, 'M_RACE')
      expect(got.id).toBe('A_RACE')
    })

    it('save throws and refound returns null -> rethrows original error', async () => {
      accountRepoFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      accountRepoSave.mockRejectedValueOnce(new Error('真实 DB 写入故障'))
      await expect(
        service.getOrCreateAccount(AccountOwnerTypeEnum.MERCHANT, 'M_FATAL')
      ).rejects.toThrow('真实 DB 写入故障')
    })
  })
})
