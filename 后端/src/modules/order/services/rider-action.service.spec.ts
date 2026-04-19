/**
 * @file rider-action.service.spec.ts
 * @stage P4-REVIEW-01 / I-02 R1
 * @desc 转单状态校验修复验证：requestTransfer 改走 TransferService（含 status ∈ [20,30,40] 校验）
 * @author 单 Agent V2.0（修复轮次 R1）
 *
 * 关键覆盖：
 *   ① 订单 status=10 待接单 + rider_id 已分配（罕见数据） → TransferService 抛 BIZ_ORDER_STATE_NOT_ALLOWED
 *      上层 RiderActionService.requestTransfer 不吞错，直接透传
 *   ② 订单 status=20 已接单 → TransferService 返回 TransferVo，rider-action 转换为 TransferOrderVo
 *   ③ rider_id 与 currentUser.uid 不匹配 → assertRiderOwn 早抛 AUTH_PERMISSION_DENIED
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { AbnormalReport, OrderProof } from '@/entities'
import type { AuthUser } from '@/modules/auth/decorators'
import { TransferService } from '@/modules/dispatch/services/transfer.service'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { OrderStateMachine } from '../state-machine/order-state-machine'
import { RiderActionService } from './rider-action.service'
import { PickupCodeUtil } from './pickup-code.util'

describe('RiderActionService.requestTransfer — I-02 R1 修复', () => {
  let service: RiderActionService
  let dataSourceQuery: jest.Mock
  let transferService: { createTransfer: jest.Mock }
  let opLog: { write: jest.Mock }

  beforeEach(async () => {
    dataSourceQuery = jest.fn()
    transferService = { createTransfer: jest.fn() }
    opLog = { write: jest.fn().mockResolvedValue(undefined) }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RiderActionService,
        {
          provide: getDataSourceToken(),
          useValue: { query: dataSourceQuery }
        },
        { provide: getRepositoryToken(OrderProof), useValue: {} },
        { provide: getRepositoryToken(AbnormalReport), useValue: {} },
        { provide: OrderStateMachine, useValue: { transit: jest.fn() } },
        {
          provide: PickupCodeUtil,
          useValue: { verify: jest.fn(), invalidate: jest.fn() }
        },
        { provide: OperationLogService, useValue: opLog },
        { provide: TransferService, useValue: transferService }
      ]
    }).compile()

    service = moduleRef.get(RiderActionService)
  })

  const auth: AuthUser = {
    uid: 'RIDER-1',
    userType: 'rider',
    tenantId: 1,
    ver: 1
  }

  /* ====================================================================
   * 1) status=20 已接单 → 调 TransferService.createTransfer 成功
   * ==================================================================== */

  /** 18 位 orderNo helper（T + 17 位数字，满足 detectOrderType 长度校验） */
  const TAKEOUT_ORDER_OK = 'T20260419010000001'
  const TAKEOUT_ORDER_PENDING = 'T20260419010000002'
  const TAKEOUT_ORDER_OTHER_RIDER = 'T20260419010000003'
  const TAKEOUT_ORDER_NOT_FOUND = 'T20260419010000099'

  it('订单 status=20 已接单时可申请转单 → 调 TransferService.createTransfer 写 transfer_record', async () => {
    /* assertRiderOwn 内部 query：返回 rider_id=RIDER-1, status=20 */
    dataSourceQuery.mockResolvedValueOnce([{ rider_id: 'RIDER-1', status: 20 }])
    transferService.createTransfer.mockResolvedValueOnce({
      id: 'TR-1',
      orderNo: TAKEOUT_ORDER_OK,
      orderType: 1,
      fromRiderId: 'RIDER-1',
      toRiderId: null,
      reasonCode: 'PERSONAL_REASON',
      reasonDetail: '临时有事',
      status: 0,
      auditAdminId: null,
      auditAt: null,
      auditRemark: null,
      createdAt: new Date()
    })

    const result = await service.requestTransfer(auth, TAKEOUT_ORDER_OK, {
      reasonCode: 'PERSONAL_REASON',
      reasonDetail: '临时有事'
    })

    expect(transferService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNo: TAKEOUT_ORDER_OK,
        orderType: 1,
        reasonCode: 'PERSONAL_REASON',
        reasonDetail: '临时有事'
      }),
      'RIDER-1'
    )
    expect(result.id).toBe('TR-1')
    expect(result.status).toBe(0)
    expect(opLog.write).toHaveBeenCalled()
  })

  /* ====================================================================
   * 2) status=10 + rider_id 已分配（罕见但可能） → TransferService 抛
   *    BIZ_ORDER_STATE_NOT_ALLOWED，rider-action 透传
   * ==================================================================== */

  it('订单 status=10 待接单时申请转单 → TransferService 抛 BIZ_ORDER_STATE_NOT_ALLOWED 透传', async () => {
    /* assertRiderOwn：返回 rider_id=RIDER-1, status=10（理论上 10 时 rider_id 应 null，
       但若派单中间态导致 rider_id 已写但 status 未推进 → assertRiderOwn 通过；
       TransferService 内部会校验 status ∈ [20,30,40] 抛错） */
    dataSourceQuery.mockResolvedValueOnce([{ rider_id: 'RIDER-1', status: 10 }])
    transferService.createTransfer.mockRejectedValueOnce(
      new BusinessException(BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED, `订单状态 10 不允许转单`)
    )

    await expect(
      service.requestTransfer(auth, TAKEOUT_ORDER_PENDING, {
        reasonCode: 'PERSONAL_REASON'
      })
    ).rejects.toMatchObject({
      bizCode: BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED
    })
    expect(transferService.createTransfer).toHaveBeenCalled()
    /* 验证 rider-action 没有自己 INSERT 转单记录（旧实现的反向） */
    expect(opLog.write).not.toHaveBeenCalled()
  })

  /* ====================================================================
   * 3) rider_id 与 currentUser.uid 不匹配 → assertRiderOwn 早抛 AUTH_PERMISSION_DENIED
   * ==================================================================== */

  it('rider_id 不匹配 → assertRiderOwn 抛 AUTH_PERMISSION_DENIED 不调 TransferService', async () => {
    dataSourceQuery.mockResolvedValueOnce([{ rider_id: 'RIDER-OTHER', status: 20 }])

    await expect(
      service.requestTransfer(auth, TAKEOUT_ORDER_OTHER_RIDER, {
        reasonCode: 'PERSONAL_REASON'
      })
    ).rejects.toMatchObject({
      bizCode: BizErrorCode.AUTH_PERMISSION_DENIED
    })
    expect(transferService.createTransfer).not.toHaveBeenCalled()
  })

  /* ====================================================================
   * 4) 订单不存在 → assertRiderOwn 抛 BIZ_ORDER_NOT_FOUND
   * ==================================================================== */

  it('订单不存在 → 抛 BIZ_ORDER_NOT_FOUND', async () => {
    dataSourceQuery.mockResolvedValueOnce([])

    await expect(
      service.requestTransfer(auth, TAKEOUT_ORDER_NOT_FOUND, {
        reasonCode: 'PERSONAL_REASON'
      })
    ).rejects.toMatchObject({
      bizCode: BizErrorCode.BIZ_ORDER_NOT_FOUND
    })
    expect(transferService.createTransfer).not.toHaveBeenCalled()
  })
})
