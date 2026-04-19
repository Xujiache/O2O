/**
 * @file api/pay.ts
 * @stage P5/T5.41, T5.42 (Sprint 7)
 * @desc 支付 API：创建支付（拿 JSAPI 参数） / 状态查询
 * @author 单 Agent V2.0
 */
import { get, post } from '@/utils/request'
import type { PayParams, PayResult, PayStatus } from '@/types/biz'

export function createPayment(payload: PayParams): Promise<PayResult> {
  return post('/payment', payload)
}

export function getPayStatus(payNo: string): Promise<PayStatus> {
  return get(`/payment/${payNo}`)
}
