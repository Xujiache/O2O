/**
 * @file rsa-key.service.spec.ts
 * @stage P9 / W5.C.1 (Sprint 5) — RsaKeyService 单元测试
 * @desc 覆盖：
 *   - 启动从 Redis 读取（缓存命中）
 *   - 启动 Redis 无值 → 生成 keypair 并写 Redis
 *   - decrypt happy（用 SubtleCrypto.encrypt 等价 RSA-OAEP/SHA-256 加密）
 *   - decrypt 非法 cipher → BIZ_DATA_CONFLICT
 *   - rotateKeypair 强制轮换 → 公钥变化
 *   - decrypt 空字符串 → PARAM_INVALID
 *
 * @author Agent C (P9 Sprint 5)
 */

import { ConfigService } from '@nestjs/config'
import {
  generateKeyPairSync,
  publicEncrypt,
  constants as cryptoConstants,
  createPublicKey
} from 'crypto'
import type Redis from 'ioredis'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { BizErrorCode } from '../../../common/error-codes'
import { RsaKeyService, RSA_ADMIN_KEYPAIR_KEY } from './rsa-key.service'

/* ============================================================================
 * Helpers
 * ============================================================================ */

interface FakeRedis {
  store: Map<string, string>
  get: jest.Mock
  set: jest.Mock
  del: jest.Mock
}

function makeFakeRedis(initial: Record<string, string> = {}): FakeRedis {
  const store = new Map<string, string>(Object.entries(initial))
  const fake: FakeRedis = {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v)
      return 'OK'
    }),
    del: jest.fn(async (k: string) => {
      const had = store.delete(k)
      return had ? 1 : 0
    })
  }
  return fake
}

function makeConfig(map: Record<string, unknown> = {}): ConfigService {
  return {
    get: <T>(key: string, def?: T): T =>
      map[key] !== undefined ? (map[key] as unknown as T) : (def as T)
  } as unknown as ConfigService
}

function genKeypairPem(): { publicPem: string; privatePem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  return { publicPem: publicKey, privatePem: privateKey }
}

/** 用公钥模拟前端 SubtleCrypto.encrypt(RSA-OAEP/SHA-256) → base64 */
function encryptForServer(publicPem: string, plain: string): string {
  const buf = publicEncrypt(
    {
      key: createPublicKey(publicPem),
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(plain, 'utf8')
  )
  return buf.toString('base64')
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('RsaKeyService', () => {
  /* ----------- 1) 启动：Redis 命中 ----------- */
  it('onModuleInit 命中 Redis 缓存 → 不再生成新 keypair', async () => {
    const { publicPem, privatePem } = genKeypairPem()
    const redis = makeFakeRedis({
      [RSA_ADMIN_KEYPAIR_KEY]: JSON.stringify({
        publicPem,
        privatePem,
        generatedAt: Date.now()
      })
    })
    const svc = new RsaKeyService(redis as unknown as Redis, makeConfig())
    await svc.onModuleInit()
    expect(redis.get).toHaveBeenCalledWith(RSA_ADMIN_KEYPAIR_KEY)
    /* 命中缓存 → 不写 Redis */
    expect(redis.set).not.toHaveBeenCalled()
    const pem = await svc.getPublicKeyPem()
    expect(pem).toBe(publicPem)
  })

  /* ----------- 2) 启动：Redis 空 → 生成 + 写 ----------- */
  it('onModuleInit Redis 无值 → 生成新 keypair 并写 Redis（带 TTL）', async () => {
    const redis = makeFakeRedis()
    const svc = new RsaKeyService(redis as unknown as Redis, makeConfig({ RSA_KEY_TTL_HOURS: 1 }))
    await svc.onModuleInit()
    expect(redis.set).toHaveBeenCalledTimes(1)
    const args = redis.set.mock.calls[0]
    expect(args[0]).toBe(RSA_ADMIN_KEYPAIR_KEY)
    /* 第三、四个参数 = 'EX' / 3600（1h） */
    expect(args[2]).toBe('EX')
    expect(args[3]).toBe(3600)
    const pem = await svc.getPublicKeyPem()
    expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/)
  })

  /* ----------- 3) decrypt happy ----------- */
  it('decrypt happy：用相同公钥加密的密文可被正确解密', async () => {
    const redis = makeFakeRedis()
    const svc = new RsaKeyService(redis as unknown as Redis, makeConfig())
    await svc.onModuleInit()
    const pem = await svc.getPublicKeyPem()
    const cipher = encryptForServer(pem, 'My$ecurePwd-2026')
    const plain = await svc.decrypt(cipher)
    expect(plain).toBe('My$ecurePwd-2026')
  })

  /* ----------- 4) decrypt 非法 cipher ----------- */
  it('decrypt 非法 cipher → 抛 BIZ_DATA_CONFLICT 密码加密格式错误', async () => {
    const redis = makeFakeRedis()
    const svc = new RsaKeyService(redis as unknown as Redis, makeConfig())
    await svc.onModuleInit()
    /* 非法 base64 + 非合法 RSA 密文 */
    const bogus = Buffer.from('not-a-valid-rsa-cipher-xxxx').toString('base64')
    await expect(svc.decrypt(bogus)).rejects.toBeInstanceOf(BusinessException)
    try {
      await svc.decrypt(bogus)
    } catch (err) {
      expect((err as BusinessException).bizCode).toBe(BizErrorCode.BIZ_DATA_CONFLICT)
    }
  })

  /* ----------- 5) decrypt 空字符串 → PARAM_INVALID ----------- */
  it('decrypt 空字符串 → 抛 PARAM_INVALID', async () => {
    const redis = makeFakeRedis()
    const svc = new RsaKeyService(redis as unknown as Redis, makeConfig())
    await svc.onModuleInit()
    try {
      await svc.decrypt('')
      fail('should throw')
    } catch (err) {
      expect((err as BusinessException).bizCode).toBe(BizErrorCode.PARAM_INVALID)
    }
  })

  /* ----------- 6) rotateKeypair → 公钥发生变化 ----------- */
  it('rotateKeypair 强制轮换：公钥 PEM 不同 + Redis 重新写入', async () => {
    const redis = makeFakeRedis()
    const svc = new RsaKeyService(redis as unknown as Redis, makeConfig())
    await svc.onModuleInit()
    const pem1 = await svc.getPublicKeyPem()
    expect(redis.set).toHaveBeenCalledTimes(1)

    await svc.rotateKeypair()
    const pem2 = await svc.getPublicKeyPem()
    expect(pem2).not.toBe(pem1)
    /* DEL + SET 各 1 次 */
    expect(redis.del).toHaveBeenCalledWith(RSA_ADMIN_KEYPAIR_KEY)
    expect(redis.set).toHaveBeenCalledTimes(2)
  })

  /* ----------- 7) Redis 异常时仍能解密（容灾） ----------- */
  it('Redis get 异常时 onModuleInit 不抛；首次解密走内存生成兜底', async () => {
    const redis: FakeRedis = {
      store: new Map(),
      get: jest.fn(async () => {
        throw new Error('redis down')
      }),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 0)
    }
    const svc = new RsaKeyService(redis as unknown as Redis, makeConfig())
    await expect(svc.onModuleInit()).resolves.toBeUndefined()
    /* Redis get 异常 → 进入生成分支；set 仍被尝试 */
    const pem = await svc.getPublicKeyPem()
    expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/)
    const cipher = encryptForServer(pem, 'fallback-pwd')
    const plain = await svc.decrypt(cipher)
    expect(plain).toBe('fallback-pwd')
  })
})
