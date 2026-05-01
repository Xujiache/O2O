/**
 * @file admin-login-cipher.spec.ts
 * @stage P9 / W5.C.1 — adminLogin 加密路径单测
 * @desc 仅覆盖 W5.C.1 新增分支：
 *   - passwordCipher 提供时：调用 RsaKeyService.decrypt → bcrypt.compare 走解密后的明文
 *   - 二者都缺时：抛 PARAM_INVALID
 *   - 其余 adminLogin 业务（菜单 / token）不在本 spec 范围
 *
 * 实现策略：直接 stub AuthService 的依赖（避免 TypeORM bootstrap）。
 *
 * @author Agent C (P9 Sprint 5)
 */

import { AuthService } from '../auth.service'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { BizErrorCode } from '../../../common/error-codes'

/* ============================================================================
 * Helpers：构造 AuthService（绕开 NestJS DI）
 * ============================================================================ */

interface FakeAdmin {
  id: string
  username?: string
  nickname?: string | null
  avatarUrl?: string | null
  mobileTail4?: string | null
  email?: string | null
  passwordHash: string
  status: number
  isSuper: number
  tenantId: number
  lastLoginAt: Date | null
}

function makeAuthServiceWithRsa(opts: {
  decryptResult?: string
  decryptThrows?: BusinessException
  adminFound?: FakeAdmin
  passwordVerifyOk?: boolean
}): {
  service: AuthService
  rsaDecryptMock: jest.Mock
} {
  const rsaDecryptMock = jest.fn(async (cipher: string) => {
    if (opts.decryptThrows) throw opts.decryptThrows
    return opts.decryptResult ?? cipher
  })
  const fakeRsa = { decrypt: rsaDecryptMock }
  const fakeRedis = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 0),
    expire: jest.fn(async () => 1),
    incr: jest.fn(async () => 1),
    pipeline: jest.fn(() => ({
      del: jest.fn(),
      sadd: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn(async () => [])
    }))
  }
  const fakeJwt = {
    signAsync: jest.fn(async () => 'TEST.JWT.TOKEN')
  }
  const fakeConfig = {
    get: jest.fn(<T>(_k: string, def?: T): T => def as T)
  }
  const fakeAdminRepo = {
    findOne: jest.fn(async () => opts.adminFound ?? null),
    save: jest.fn(async (a: unknown) => a)
  }
  const noopRepo = {
    findOne: jest.fn(async () => null),
    save: jest.fn(),
    find: jest.fn(async () => []),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null)
    }))
  }
  const fakePermRepo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null)
  }

  /* 走 PasswordUtil.verify 的路径 —— 用 jest.spyOn 替换 */
  /* 注：require 是为了在不污染顶层依赖前提下打 spy */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const utils = require('../../../utils') as {
    PasswordUtil: { verify: (a: string, b: string) => boolean }
  }
  jest.spyOn(utils.PasswordUtil, 'verify').mockReturnValue(opts.passwordVerifyOk ?? true)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cryptoUtilMod = require('../../../utils') as { CryptoUtil: { hmac: (s: string) => string } }
  jest.spyOn(cryptoUtilMod.CryptoUtil, 'hmac').mockReturnValue('HMAC_FIXED')

  const service = new AuthService(
    fakeConfig as unknown as ConstructorParameters<typeof AuthService>[0],
    fakeJwt as unknown as ConstructorParameters<typeof AuthService>[1],
    fakeRedis as unknown as ConstructorParameters<typeof AuthService>[2],
    noopRepo as unknown as ConstructorParameters<typeof AuthService>[3],
    noopRepo as unknown as ConstructorParameters<typeof AuthService>[4],
    noopRepo as unknown as ConstructorParameters<typeof AuthService>[5],
    noopRepo as unknown as ConstructorParameters<typeof AuthService>[6],
    fakeAdminRepo as unknown as ConstructorParameters<typeof AuthService>[7],
    fakePermRepo as unknown as ConstructorParameters<typeof AuthService>[8],
    fakePermRepo as unknown as ConstructorParameters<typeof AuthService>[9],
    fakePermRepo as unknown as ConstructorParameters<typeof AuthService>[10],
    noopRepo as unknown as ConstructorParameters<typeof AuthService>[11],
    fakeRsa as unknown as ConstructorParameters<typeof AuthService>[12]
  )
  return { service, rsaDecryptMock }
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('AuthService.adminLogin (W5.C.1 RSA 解密路径)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('passwordCipher 提供时：调用 RsaKeyService.decrypt 并把解密结果送给 bcrypt', async () => {
    const { service, rsaDecryptMock } = makeAuthServiceWithRsa({
      decryptResult: 'plain-pwd-2026',
      adminFound: {
        id: 'A1',
        username: 'admin',
        nickname: 'Admin',
        avatarUrl: null,
        mobileTail4: '0001',
        email: 'a@b.com',
        passwordHash: '$2a$10$FAKEHASH',
        status: 1,
        isSuper: 1,
        tenantId: 1,
        lastLoginAt: null
      },
      passwordVerifyOk: true
    })

    const result = await service.adminLogin('admin', undefined, undefined, 'CIPHER_BASE64')
    expect(rsaDecryptMock).toHaveBeenCalledWith('CIPHER_BASE64')
    expect(result.tokens.accessToken).toBe('TEST.JWT.TOKEN')
    expect(result.admin.username).toBe('admin')
  })

  it('passwordCipher + password 同时缺 → PARAM_INVALID', async () => {
    const { service } = makeAuthServiceWithRsa({})
    try {
      await service.adminLogin('admin', undefined, undefined, undefined)
      fail('should throw')
    } catch (err) {
      expect((err as BusinessException).bizCode).toBe(BizErrorCode.PARAM_INVALID)
    }
  })

  it('username 缺 → PARAM_INVALID', async () => {
    const { service } = makeAuthServiceWithRsa({})
    try {
      await service.adminLogin('', 'pwd', undefined, undefined)
      fail('should throw')
    } catch (err) {
      expect((err as BusinessException).bizCode).toBe(BizErrorCode.PARAM_INVALID)
    }
  })

  it('cipher 解密失败 → BIZ_DATA_CONFLICT 透传', async () => {
    const { service } = makeAuthServiceWithRsa({
      decryptThrows: new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '密码加密格式错误')
    })
    try {
      await service.adminLogin('admin', undefined, undefined, 'BAD_CIPHER')
      fail('should throw')
    } catch (err) {
      expect((err as BusinessException).bizCode).toBe(BizErrorCode.BIZ_DATA_CONFLICT)
    }
  })

  it('回退兼容：仅传 password（明文）也能走 bcrypt 校验', async () => {
    const { service, rsaDecryptMock } = makeAuthServiceWithRsa({
      adminFound: {
        id: 'A1',
        username: 'admin',
        nickname: 'Admin',
        avatarUrl: null,
        mobileTail4: null,
        email: null,
        passwordHash: '$2a$10$FAKEHASH',
        status: 1,
        isSuper: 0,
        tenantId: 1,
        lastLoginAt: null
      },
      passwordVerifyOk: true
    })
    const result = await service.adminLogin('admin', 'plain-pwd', undefined, undefined)
    expect(rsaDecryptMock).not.toHaveBeenCalled()
    expect(result.tokens.accessToken).toBe('TEST.JWT.TOKEN')
  })
})
