import { randomBytes } from 'crypto'
import { CryptoUtil, type EncryptedTriple } from './crypto.util'

/**
 * CryptoUtil 单元测试
 *
 * 覆盖：
 * - encrypt → decrypt 往返一致
 * - hmac 确定性（同 plain 同 hash）
 * - tail / mask / __resetCache
 *
 * 用途：T3.24 关键路径覆盖
 */
describe('CryptoUtil', () => {
  beforeAll(() => {
    process.env.CURRENT_ENC_KEY_VER = '1'
    process.env.ENC_KEY_V1 = randomBytes(32).toString('base64')
    process.env.HMAC_KEY_V1 = randomBytes(32).toString('base64')
    CryptoUtil.__resetCache()
  })

  it('encryptTriple → decrypt 应往返一致', () => {
    const plain = '13800001234'
    const triple: EncryptedTriple = CryptoUtil.encryptTriple(plain)
    expect(triple.encKeyVer).toBe(1)
    expect(triple.tail4).toBe('1234')
    expect(triple.hash.length).toBe(64)
    const back = CryptoUtil.aesDecrypt(triple.enc, 1)
    expect(back).toBe(plain)
  })

  it('encrypt() 单独返回 Buffer（语法糖）', () => {
    const buf = CryptoUtil.encrypt('plain')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(28)
    expect(CryptoUtil.decrypt(buf, 1)).toBe('plain')
  })

  it('hmac 同输入应返回相同 hash（确定性）', () => {
    const a = CryptoUtil.hmac('hello')
    const b = CryptoUtil.hmac('hello')
    expect(a).toBe(b)
    const c = CryptoUtil.hmac('hello!')
    expect(c).not.toBe(a)
  })

  it('tail() 长度足够时应取末 N 位', () => {
    expect(CryptoUtil.tail('13800001234', 4)).toBe('1234')
    expect(CryptoUtil.tail('abc', 4)).toBe('abc')
    expect(CryptoUtil.tail('', 4)).toBe('')
  })

  it('mask() 中间打星号', () => {
    expect(CryptoUtil.mask('13800001234')).toBe('138****1234')
    expect(CryptoUtil.mask('1234567')).toBe('1234567') // 长度不足，保持原文
    expect(CryptoUtil.mask(null)).toBe('')
  })

  it('aesDecrypt 篡改密文应抛错', () => {
    const triple: EncryptedTriple = CryptoUtil.encryptTriple('plain-text')
    const tampered = Buffer.from(triple.enc)
    tampered[tampered.length - 1] ^= 0xff
    expect(() => CryptoUtil.aesDecrypt(tampered, 1)).toThrow()
  })

  /* P9/Sprint2 W2.A.1 增补：分支覆盖增强（lines 83/87/91/121） */

  it('aesEncrypt 缺失 ENC_KEY_V${ver} 抛 Error', () => {
    const orig = process.env.ENC_KEY_V99
    delete process.env.ENC_KEY_V99
    CryptoUtil.__resetCache()
    expect(() => CryptoUtil.aesEncrypt('plain', 99)).toThrow(/ENC_KEY_V99/)
    if (orig !== undefined) process.env.ENC_KEY_V99 = orig
    /* 恢复 v1 缓存（下次使用前 reset） */
    process.env.ENC_KEY_V1 = randomBytes(32).toString('base64')
    process.env.HMAC_KEY_V1 = randomBytes(32).toString('base64')
    CryptoUtil.__resetCache()
  })

  it('ENC_KEY base64 解码长度 ≠ 32 抛 Error', () => {
    process.env.ENC_KEY_V77 = Buffer.alloc(16).toString('base64') /* 16B 不合法 */
    process.env.HMAC_KEY_V77 = Buffer.alloc(32).toString('base64')
    CryptoUtil.__resetCache()
    expect(() => CryptoUtil.aesEncrypt('plain', 77)).toThrow(/必须为 32 字节/)
    delete process.env.ENC_KEY_V77
    delete process.env.HMAC_KEY_V77
    CryptoUtil.__resetCache()
  })

  it('HMAC_KEY base64 解码长度 ≠ 32 抛 Error', () => {
    process.env.ENC_KEY_V88 = Buffer.alloc(32).toString('base64')
    process.env.HMAC_KEY_V88 = Buffer.alloc(8).toString('base64') /* 8B 不合法 */
    CryptoUtil.__resetCache()
    expect(() => CryptoUtil.aesEncrypt('plain', 88)).toThrow(/HMAC_KEY_V88/)
    delete process.env.ENC_KEY_V88
    delete process.env.HMAC_KEY_V88
    CryptoUtil.__resetCache()
  })

  it('aesDecrypt 长度 < IV+TAG 抛"长度不足"', () => {
    expect(() => CryptoUtil.aesDecrypt(Buffer.alloc(8), 1)).toThrow(/长度不足/)
  })
})
