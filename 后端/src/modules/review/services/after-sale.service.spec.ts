/**
 * @file after-sale.service.spec.ts
 * @stage P4-REVIEW-01 / I-01 R1
 * @desc 售后状态机修复验证：APPLYING → [MERCHANT_HANDLING, AGREED, REJECTED, CLOSED] 4 个出口合法
 * @author 单 Agent V2.0（修复轮次 R1）
 *
 * 关键覆盖：
 *   ① APPLYING → AGREED 直接同意（actualAmount=10.00 → 走事务 + tryRefund）
 *   ② APPLYING → REJECTED 直接拒绝（merchantReply 必填）
 *   ③ APPLYING → CLOSED 关闭合法（assertTransit 不抛错）
 *   ④ 反向用例：REFUNDED → AGREED 抛 BIZ_STATE_INVALID（终态/非允许 from）
 */

import { HttpStatus } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { OrderAfterSale } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import {
  AFTER_SALE_TRANSITION_MAP,
  AfterSaleStatusEnum,
  REVIEW_DEP_ORDER_SERVICE,
  REVIEW_DEP_REFUND_SERVICE
} from '../types/review.types'
import { AfterSaleService } from './after-sale.service'
import { ArbitrationService } from './arbitration.service'

interface RepoMock {
  findOne: jest.Mock
  save: jest.Mock
  createQueryBuilder: jest.Mock
}

interface DataSourceMock {
  transaction: jest.Mock
  manager: { save: jest.Mock; findOne: jest.Mock }
}

describe('AfterSaleService — I-01 R1 状态机修复', () => {
  let service: AfterSaleService
  let afterSaleRepo: RepoMock
  let dataSource: DataSourceMock
  let opLog: { write: jest.Mock }

  beforeEach(async () => {
    afterSaleRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn()
    }
    opLog = { write: jest.fn().mockResolvedValue(undefined) }
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (mgr: unknown) => unknown) => {
        const mgr = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockImplementation((_: unknown, e: unknown) => Promise.resolve(e))
        }
        return cb(mgr)
      }),
      manager: { save: jest.fn(), findOne: jest.fn() }
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AfterSaleService,
        { provide: getRepositoryToken(OrderAfterSale), useValue: afterSaleRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: OperationLogService, useValue: opLog },
        {
          provide: ArbitrationService,
          useValue: {
            createFromAfterSale: jest.fn(),
            markByArbitration: jest.fn()
          }
        },
        { provide: REVIEW_DEP_ORDER_SERVICE, useValue: null },
        { provide: REVIEW_DEP_REFUND_SERVICE, useValue: null }
      ]
    }).compile()

    service = moduleRef.get(AfterSaleService)
  })

  /* ====================================================================
   * 1) Transition map 静态校验（I-01 修复关键证据）
   * ==================================================================== */

  it('AFTER_SALE_TRANSITION_MAP[APPLYING] 必须含 AGREED 与 REJECTED（I-01 R1 修复点）', () => {
    const applyingOuts = AFTER_SALE_TRANSITION_MAP[AfterSaleStatusEnum.APPLYING]
    expect(applyingOuts).toContain(AfterSaleStatusEnum.MERCHANT_HANDLING)
    expect(applyingOuts).toContain(AfterSaleStatusEnum.AGREED)
    expect(applyingOuts).toContain(AfterSaleStatusEnum.REJECTED)
    expect(applyingOuts).toContain(AfterSaleStatusEnum.CLOSED)
    expect(applyingOuts).toHaveLength(4)
  })

  /* ====================================================================
   * 2) APPLYING → AGREED 直接同意
   * ==================================================================== */

  it('APPLYING → AGREED 直接同意（merchantHandle action=agree）', async () => {
    const asEntity: Partial<OrderAfterSale> = {
      id: 'AS-1',
      afterSaleNo: 'AS20260419000001',
      orderNo: 'T202604190000001',
      orderType: 1,
      userId: 'U-1',
      shopId: 'SHOP-1',
      type: 1,
      status: AfterSaleStatusEnum.APPLYING,
      applyAmount: '50.00',
      actualAmount: null,
      merchantReply: null,
      merchantReplyAt: null,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    afterSaleRepo.findOne.mockResolvedValueOnce(asEntity)
    /* tryRefund 内部依赖 refundService=null，直接返回 false（不影响断言） */
    dataSource.transaction.mockImplementationOnce(async (cb: (mgr: unknown) => unknown) => {
      const mgr = {
        findOne: jest.fn().mockResolvedValue({ ...asEntity }),
        save: jest.fn().mockImplementation((_: unknown, e: { status: number }) => {
          expect(e.status).toBe(AfterSaleStatusEnum.AGREED)
          return Promise.resolve(e)
        })
      }
      return cb(mgr)
    })

    const result = await service.merchantHandle('AS-1', 'M-1', ['SHOP-1'], {
      action: 'agree',
      actualAmount: '10.00',
      merchantReply: '同意退款'
    })

    expect(result.status).toBe(AfterSaleStatusEnum.AGREED)
    expect(dataSource.transaction).toHaveBeenCalled()
  })

  /* ====================================================================
   * 3) APPLYING → REJECTED 直接拒绝
   * ==================================================================== */

  it('APPLYING → REJECTED 直接拒绝（merchantHandle action=reject）', async () => {
    const asEntity: Partial<OrderAfterSale> = {
      id: 'AS-2',
      afterSaleNo: 'AS20260419000002',
      orderNo: 'T202604190000002',
      orderType: 1,
      userId: 'U-2',
      shopId: 'SHOP-1',
      type: 1,
      status: AfterSaleStatusEnum.APPLYING,
      applyAmount: '20.00',
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    afterSaleRepo.findOne.mockResolvedValueOnce(asEntity)
    afterSaleRepo.save.mockImplementation((e: { status: number }) => {
      expect(e.status).toBe(AfterSaleStatusEnum.REJECTED)
      return Promise.resolve(e)
    })

    const result = await service.merchantHandle('AS-2', 'M-1', ['SHOP-1'], {
      action: 'reject',
      merchantReply: '商品已签收，不予退款'
    })

    expect(result.status).toBe(AfterSaleStatusEnum.REJECTED)
    expect(afterSaleRepo.save).toHaveBeenCalled()
  })

  /* ====================================================================
   * 4) APPLYING → CLOSED 合法（assertTransit 不抛错）
   * ==================================================================== */

  it('APPLYING → CLOSED 关闭依然合法（transition map 已含 CLOSED）', () => {
    const applyingOuts = AFTER_SALE_TRANSITION_MAP[AfterSaleStatusEnum.APPLYING]
    expect(applyingOuts).toContain(AfterSaleStatusEnum.CLOSED)
  })

  /* ====================================================================
   * 5) 反向用例：REFUNDED 状态不允许 merchantHandle（保留状态机约束）
   * ==================================================================== */

  it('REFUNDED → AGREED 抛 BIZ_STATE_INVALID（保留状态机反向约束）', async () => {
    const asEntity: Partial<OrderAfterSale> = {
      id: 'AS-3',
      afterSaleNo: 'AS20260419000003',
      orderNo: 'T202604190000003',
      orderType: 1,
      userId: 'U-3',
      shopId: 'SHOP-1',
      type: 1,
      status: AfterSaleStatusEnum.REFUNDED,
      applyAmount: '50.00',
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    afterSaleRepo.findOne.mockResolvedValueOnce(asEntity)

    await expect(
      service.merchantHandle('AS-3', 'M-1', ['SHOP-1'], {
        action: 'agree',
        actualAmount: '10.00',
        merchantReply: '同意'
      })
    ).rejects.toMatchObject({
      bizCode: BizErrorCode.BIZ_STATE_INVALID
    })
  })

  /* ====================================================================
   * 6) 越权：商户不持有 shop 时直接抛 AUTH_PERMISSION_DENIED
   * ==================================================================== */

  it('shopIds 不含 as.shop_id 抛 AUTH_PERMISSION_DENIED', async () => {
    const asEntity: Partial<OrderAfterSale> = {
      id: 'AS-4',
      afterSaleNo: 'AS20260419000004',
      orderNo: 'T202604190000004',
      orderType: 1,
      userId: 'U-4',
      shopId: 'SHOP-OTHER',
      type: 1,
      status: AfterSaleStatusEnum.APPLYING,
      applyAmount: '10.00',
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    /* 持续返回（mockResolvedValue 而非 once），避免后续 expect 调用拿到 undefined */
    afterSaleRepo.findOne.mockResolvedValue(asEntity)

    const callP = service.merchantHandle('AS-4', 'M-1', ['SHOP-1'], {
      action: 'agree',
      actualAmount: '5.00',
      merchantReply: '同意'
    })
    await expect(callP).rejects.toBeInstanceOf(BusinessException)
    await expect(
      service.merchantHandle('AS-4', 'M-1', ['SHOP-1'], {
        action: 'agree',
        actualAmount: '5.00',
        merchantReply: '同意'
      })
    ).rejects.toMatchObject({
      bizCode: BizErrorCode.AUTH_PERMISSION_DENIED,
      status: HttpStatus.FORBIDDEN
    })
  })
})
