/**
 * @file admin-pubkey.controller.spec.ts
 * @stage P9 / W5.C.1 — Controller 单元测试
 * @desc 覆盖 happy path：拿到 PEM + TTL=86400
 *
 * @author Agent C (P9 Sprint 5)
 */

import { AdminPubkeyController } from './admin-pubkey.controller'
import { RsaKeyService } from '../services/rsa-key.service'

describe('AdminPubkeyController', () => {
  it('GET /admin/pubkey 返回 { pubkey, ttl=86400 }', async () => {
    const fakeRsa = {
      getPublicKeyPem: jest.fn(
        async () => '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----'
      )
    } as unknown as RsaKeyService
    const ctrl = new AdminPubkeyController(fakeRsa)
    const result = await ctrl.getPubkey()
    expect(result.pubkey).toMatch(/^-----BEGIN PUBLIC KEY-----/)
    expect(result.ttl).toBe(86400)
  })
})
