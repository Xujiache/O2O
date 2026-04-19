/**
 * @file api/wallet.ts
 * @stage P5/T5.35 (Sprint 6)
 * @desc 钱包 API：余额查询 / 流水
 * @author 单 Agent V2.0
 */
import { get } from '@/utils/request'
import type { Wallet, AccountFlow, KeysetPageResult } from '@/types/biz'

export function getWallet(): Promise<Wallet> {
  return get('/me/wallet')
}

export function listWalletFlows(params?: {
  /** 1 收入 / 2 支出 */
  flowDirection?: 1 | 2
  cursor?: string
  pageSize?: number
}): Promise<KeysetPageResult<AccountFlow>> {
  return get('/me/wallet/flows', params as Record<string, unknown>)
}
