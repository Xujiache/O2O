/**
 * @file api/wallet.ts
 * @stage P6/T6.31 (Sprint 4)
 * @desc 钱包/提现/银行卡 API
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post, put, del, genIdemKey } from '@/utils/request'
import type { BankCard, WithdrawApply, KeysetPageResult } from '@/types/biz'

/** 银行卡列表 */
export function listBankCards(): Promise<BankCard[]> {
  return get('/merchant/wallet/bank-cards')
}

/** 添加银行卡 */
export function addBankCard(payload: {
  holderName: string
  cardNo: string
  bankName: string
  cardType: 1 | 2
  /** 短信验证码（重要操作） */
  smsCode: string
}): Promise<BankCard> {
  return post('/merchant/wallet/bank-cards', payload, { idemKey: genIdemKey() })
}

/** 设为默认 */
export function setDefaultBankCard(cardId: string): Promise<{ ok: boolean }> {
  return put(`/merchant/wallet/bank-cards/${cardId}/default`, {})
}

/** 删除 */
export function deleteBankCard(cardId: string): Promise<{ ok: boolean }> {
  return del(`/merchant/wallet/bank-cards/${cardId}`)
}

/** 提现申请 */
export function applyWithdraw(payload: {
  amount: string
  cardId: string
  /** 二次验证 */
  smsCode: string
}): Promise<WithdrawApply> {
  return post('/merchant/wallet/withdraw', payload, { idemKey: genIdemKey() })
}

/** 提现记录 */
export function listWithdraws(params?: {
  status?: 1 | 2 | 3 | 4 | 5
  cursor?: string | null
  limit?: number
}): Promise<KeysetPageResult<WithdrawApply>> {
  return get('/merchant/wallet/withdraws', params as unknown as Record<string, unknown>)
}
