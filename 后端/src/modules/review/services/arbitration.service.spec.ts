/**
 * @file arbitration.service.spec.ts
 * @stage P4-REVIEW-01 / I-03 R1
 * @desc 仲裁裁决资金一致性修复验证：willRefund=true 但 RefundService 未注入 →
 *       仲裁本身保留 JUDGED，但 source（after_sale/complaint）状态不推进
 * @author 单 Agent V2.0（修复轮次 R1）
 *
 * 关键覆盖：
 *   ① willRefund=true + RefundService=null → toVo 返回 JUDGED + syncSource 未调 + 写补偿日志
 *   ② willRefund=false（如 decision=2 被申请方胜）→ syncSource 正常调
 *   ③ willRefund=true + RefundService 已注入 + refund 成功 → syncSource 正常调
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { Arbitration } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import {
  ArbitrationDecisionEnum,
  ArbitrationPartyTypeEnum,
  ArbitrationSourceTypeEnum,
  ArbitrationStatusEnum,
  REVIEW_DEP_ORDER_SERVICE,
  REVIEW_DEP_REFUND_SERVICE
} from '../types/review.types'
import { AfterSaleService } from './after-sale.service'
import { ArbitrationService } from './arbitration.service'
import { ComplaintService } from './complaint.service'

describe('ArbitrationService.judge — I-03 R1 资金一致性修复', () => {
  let service: ArbitrationService
  let arbRepo: { findOne: jest.Mock }
  let dataSource: { transaction: jest.Mock }
  let opLog: { write: jest.Mock }
  let afterSale: { markByArbitration: jest.Mock }
  let complaint: { closeByArbitration: jest.Mock }
  let orderService: { findOrderCoreByNo: jest.Mock } | null
  let refundService: { createRefund: jest.Mock } | null

  /** 构造一个 PENDING 状态的仲裁实体（来源 after_sale）  */
  function buildArb(): Partial<Arbitration> {
    return {
      id: 'ARB-1',
      arbitrationNo: 'AB20260419000001',
      sourceType: ArbitrationSourceTypeEnum.AFTER_SALE,
      sourceId: 'AS-1',
      orderNo: 'T202604190000001',
      orderType: 1,
      applicantType: ArbitrationPartyTypeEnum.USER,
      applicantId: 'U-1',
      respondentType: ArbitrationPartyTypeEnum.MERCHANT,
      respondentId: 'M-1',
      disputeAmount: '50.00',
      disputeContent: '商品质量问题',
      status: ArbitrationStatusEnum.PENDING,
      decision: null,
      decisionAmount: null,
      decisionDetail: null,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  async function buildModule(opts: {
    refundService: { createRefund: jest.Mock } | null
    orderService: { findOrderCoreByNo: jest.Mock } | null
  }) {
    arbRepo = { findOne: jest.fn() }
    opLog = { write: jest.fn().mockResolvedValue(undefined) }
    afterSale = { markByArbitration: jest.fn().mockResolvedValue(undefined) }
    complaint = { closeByArbitration: jest.fn().mockResolvedValue(undefined) }
    orderService = opts.orderService
    refundService = opts.refundService
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (mgr: unknown) => unknown) => {
        const arb = buildArb()
        const mgr = {
          findOne: jest.fn().mockResolvedValue(arb),
          save: jest
            .fn()
            .mockImplementation(
              (_: unknown, e: { status: number; decision: number; decisionAmount: string }) => {
                return Promise.resolve({ ...arb, ...e })
              }
            )
        }
        return cb(mgr)
      })
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ArbitrationService,
        { provide: getRepositoryToken(Arbitration), useValue: arbRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: OperationLogService, useValue: opLog },
        { provide: AfterSaleService, useValue: afterSale },
        { provide: ComplaintService, useValue: complaint },
        { provide: REVIEW_DEP_ORDER_SERVICE, useValue: orderService },
        { provide: REVIEW_DEP_REFUND_SERVICE, useValue: refundService }
      ]
    }).compile()

    service = moduleRef.get(ArbitrationService)
  }

  /* ====================================================================
   * 1) willRefund=true + RefundService=null → 不推进 source（I-03 R1 修复关键）
   * ==================================================================== */

  it('judge willRefund=true 但 RefundService 未注入 → 仲裁标 JUDGED 但 source 状态不推进', async () => {
    await buildModule({
      refundService: null,
      orderService: {
        findOrderCoreByNo: jest.fn().mockResolvedValue({ payNo: 'PAY-001', payAmount: '50.00' })
      }
    })
    arbRepo.findOne.mockResolvedValueOnce(buildArb())

    const vo = await service.judge('ARB-1', 'ADMIN-1', {
      decision: ArbitrationDecisionEnum.APPLICANT_WIN,
      decisionAmount: '30.00',
      decisionDetail: '部分支持申请方'
    })

    /* 仲裁本身落库为 JUDGED */
    expect(vo.status).toBe(ArbitrationStatusEnum.JUDGED)

    /* 关键修复证据：source 同步未被调用 */
    expect(afterSale.markByArbitration).not.toHaveBeenCalled()
    expect(complaint.closeByArbitration).not.toHaveBeenCalled()

    /* 写了 arbitration-judge-refund-pending OperationLog */
    expect(opLog.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'arbitration-judge-refund-pending'
      })
    )
  })

  /* ====================================================================
   * 2) willRefund=false（被申请方胜） → syncSource 正常调
   * ==================================================================== */

  it('judge willRefund=false（decision=2 被申请方胜）→ syncSource 正常推进', async () => {
    await buildModule({
      refundService: null,
      orderService: null
    })
    arbRepo.findOne.mockResolvedValueOnce(buildArb())

    const vo = await service.judge('ARB-1', 'ADMIN-1', {
      decision: ArbitrationDecisionEnum.RESPONDENT_WIN,
      decisionDetail: '商户责任不成立'
    })

    expect(vo.status).toBe(ArbitrationStatusEnum.JUDGED)
    /* 来源是 after_sale → 应调 markByArbitration */
    expect(afterSale.markByArbitration).toHaveBeenCalled()
    /* 写正常的 arbitration-judge OperationLog */
    expect(opLog.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'arbitration-judge'
      })
    )
  })

  /* ====================================================================
   * 3) willRefund=true + RefundService 注入 + refund 成功 → syncSource 正常
   * ==================================================================== */

  it('judge willRefund=true + RefundService 已注入 + refund 成功 → syncSource 正常调', async () => {
    await buildModule({
      refundService: {
        createRefund: jest.fn().mockResolvedValue({ refundNo: 'RF-001', status: 1 })
      },
      orderService: {
        findOrderCoreByNo: jest.fn().mockResolvedValue({ payNo: 'PAY-001', payAmount: '50.00' })
      }
    })
    arbRepo.findOne.mockResolvedValueOnce(buildArb())

    const vo = await service.judge('ARB-1', 'ADMIN-1', {
      decision: ArbitrationDecisionEnum.APPLICANT_WIN,
      decisionAmount: '30.00',
      decisionDetail: '支持申请方'
    })

    expect(vo.status).toBe(ArbitrationStatusEnum.JUDGED)
    expect(refundService?.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payNo: 'PAY-001',
        amount: '30.00',
        reason: 'arbitration'
      })
    )
    expect(afterSale.markByArbitration).toHaveBeenCalled()
    expect(opLog.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'arbitration-judge'
      })
    )
  })
})
