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
})
