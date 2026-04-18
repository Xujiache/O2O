/**
 * @file crypto.util.ts
 * @stage P3/T3.2
 * @desc 敏感字段加解密 + 等值检索 工具（对齐 encryption.md §三/§四/§六 三件套规范）
 * @author 员工 A
 *
 * 三列模式（与 P2 SQL 列名一一对应）：
 *   <field>_enc    VARBINARY(255)  AES-256-GCM 密文（IV(12B)+CipherText+Tag(16B)）
 *   <field>_hash   CHAR(64)        HMAC-SHA256 hex（确定性，等值检索）
 *   <field>_tail4  VARCHAR(8)      末 4 位明文（脱敏展示）
 *
 * 密钥管理：
 *   - 开发：从 ENC_KEY_V1（base64 32 字节）+ HMAC_KEY_V1（base64 32 字节）派生
 *   - 生产：建议接 KMS（本类预留 enc_key_ver 多版本支持）
 *   - 缓存：进程内首次使用时构造，常驻内存
 *
 * 注意：本工具是 **纯静态类**，业务通过 `CryptoUtil.encrypt(plain, 1)` 调用；
 *       Encrypt/Decrypt 不需注入 NestJS DI 容器，故未做成 @Injectable() Service。
 *       如未来需 KMS 拉密钥（异步），可在 P9 阶段抽象为 CryptoService。
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'

/** AES 算法字面量 */
const AES_ALGORITHM = 'aes-256-gcm'
/** GCM IV 长度（字节，固定 12） */
const IV_LENGTH = 12
/** GCM AuthTag 长度（字节，固定 16） */
const TAG_LENGTH = 16

/**
 * 三件套加密产物
 * 用途：业务 service 同时把 enc/hash/tail4 写入 *_enc / *_hash / *_tail4 三列
 */
export interface EncryptedTriple {
  enc: Buffer
  hash: string
  tail4: string
  encKeyVer: number
}

/**
 * 解析后的密钥对（按 enc_key_ver）
 */
interface DerivedKey {
  aesKey: Buffer
  hmacKey: Buffer
}

/**
 * CryptoUtil（敏感字段三件套）
 *
 * 提供：
 *  - encrypt(plain, ver?) → { enc, hash, tail4, encKeyVer }
 *  - decrypt(enc, ver) → plain
 *  - hmac(plain) → hex（独立调用，仅算 hash）
 *  - tail4(plain, n=4)
 */
export class CryptoUtil {
  /** 进程级密钥缓存：{ ver → DerivedKey } */
  private static keyCache = new Map<number, DerivedKey>()

  /** 写入用的当前密钥版本（轮换时调高）；从 ENV CURRENT_ENC_KEY_VER 读取，默认 1 */
  private static get currentVer(): number {
    const v = parseInt(process.env.CURRENT_ENC_KEY_VER ?? '1', 10)
    return Number.isFinite(v) && v > 0 ? v : 1
  }

  /**
   * 取指定版本的派生密钥（懒加载 + 缓存）
   * 参数：ver 密钥版本（默认取 currentVer）
   * 返回值：DerivedKey（aesKey + hmacKey 各 32 字节）
   * 错误：ENV 中对应 ENC_KEY_V{ver} 或 HMAC_KEY_V{ver} 缺失则抛 Error
   */
  private static getKey(ver: number): DerivedKey {
    if (this.keyCache.has(ver)) {
      return this.keyCache.get(ver)!
    }
    const aesEnv = process.env[`ENC_KEY_V${ver}`]
    const hmacEnv =
      process.env[`HMAC_KEY_V${ver}`] ?? aesEnv /* HMAC 缺省时复用 AES key（开发兜底） */
    if (!aesEnv) {
      throw new Error(`[CryptoUtil] 缺少环境变量 ENC_KEY_V${ver}（base64 32B）`)
    }
    const aesKey = Buffer.from(aesEnv, 'base64')
    if (aesKey.length !== 32) {
      throw new Error(`[CryptoUtil] ENC_KEY_V${ver} 解码后必须为 32 字节，当前 ${aesKey.length}`)
    }
    const hmacKey = Buffer.from(hmacEnv!, 'base64')
    if (hmacKey.length !== 32) {
      throw new Error(`[CryptoUtil] HMAC_KEY_V${ver} 解码后必须为 32 字节，当前 ${hmacKey.length}`)
    }
    const derived: DerivedKey = { aesKey, hmacKey }
    this.keyCache.set(ver, derived)
    return derived
  }

  /**
   * AES-256-GCM 加密
   * 参数：plain 明文字符串；ver 写入用密钥版本（默认 currentVer）
   * 返回值：Buffer（IV(12B) + CipherText + Tag(16B)）
   * 用途：私有；业务调用 encrypt(...) 时获取整套三元组
   */
  static aesEncrypt(plain: string, ver: number = this.currentVer): Buffer {
    const { aesKey } = this.getKey(ver)
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(AES_ALGORITHM, aesKey, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, encrypted, tag])
  }

  /**
   * AES-256-GCM 解密
   * 参数：buf 三段拼接的密文（IV(12B) + CipherText + Tag(16B)）；ver 加密时使用的密钥版本
   * 返回值：明文字符串
   * 错误：密钥版本错 / 密文被篡改 → 抛 Error（GCM AuthTag 校验失败）
   */
  static aesDecrypt(buf: Buffer, ver: number): string {
    if (!buf || buf.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('[CryptoUtil] 密文长度不足，无法包含 IV+Tag')
    }
    const { aesKey } = this.getKey(ver)
    const iv = buf.subarray(0, IV_LENGTH)
    const tag = buf.subarray(buf.length - TAG_LENGTH)
    const cipherText = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)
    const decipher = createDecipheriv(AES_ALGORITHM, aesKey, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()])
    return decrypted.toString('utf8')
  }

  /**
   * 计算 HMAC-SHA256（确定性，可建唯一索引）
   * 参数：plain 明文字符串；ver 密钥版本（默认 currentVer）
   * 返回值：64 字符 hex 字符串
   * 用途：mobile_hash / id_card_hash 等等值检索列；登录、查重
   */
  static hmac(plain: string, ver: number = this.currentVer): string {
    const { hmacKey } = this.getKey(ver)
    return createHmac('sha256', hmacKey).update(plain, 'utf8').digest('hex')
  }

  /**
   * 取末 N 位（默认 4）作为脱敏展示
   * 参数：plain 明文；n 截取位数（默认 4）
   * 返回值：末 N 位字符串；plain 长度不足时返回原文
   */
  static tail(plain: string, n = 4): string {
    if (!plain) return ''
    return plain.length <= n ? plain : plain.slice(-n)
  }

  /**
   * 别名：取末 4 位（业务 service 调用频次最高，单独别名简化书写）
   * 参数：plain 明文
   * 返回值：4 字符尾段
   */
  static tail4(plain: string): string {
    return this.tail(plain, 4)
  }

  /**
   * 加密（仅返回密文 Buffer，不含 hash/tail4）
   * 参数：plain 明文；ver 可选密钥版本（默认 currentVer）
   * 返回值：Buffer（IV(12B) + CipherText + Tag(16B)），可直接落 VARBINARY 列
   * 用途：业务 service 写入 *_enc 列时；hash/tail4 由 hmac() / tail4() 单独调用，
   *       或一次性使用 encryptTriple() 取三件套。
   */
  static encrypt(plain: string, ver: number = this.currentVer): Buffer {
    return this.aesEncrypt(plain, ver)
  }

  /**
   * 解密（语法糖，与 aesDecrypt 等价）
   * 参数：buf 三段拼接的密文；ver 加密时使用的密钥版本
   * 返回值：明文字符串
   */
  static decrypt(buf: Buffer, ver: number): string {
    return this.aesDecrypt(buf, ver)
  }

  /**
   * 一站式加密：返回 { enc, hash, tail4, encKeyVer } 三件套
   * 参数：plain 明文（如手机号 13800001234）
   * 返回值：EncryptedTriple
   * 用途：业务 service 写入用户/商户/骑手等含敏感字段表（一次写齐三列防遗漏）
   *
   * 示例：
   *   const t = CryptoUtil.encryptTriple(mobile)
   *   user.mobileEnc = t.enc; user.mobileHash = t.hash;
   *   user.mobileTail4 = t.tail4; user.encKeyVer = t.encKeyVer
   */
  static encryptTriple(plain: string): EncryptedTriple {
    const ver = this.currentVer
    return {
      enc: this.aesEncrypt(plain, ver),
      hash: this.hmac(plain, ver),
      tail4: this.tail(plain, 4),
      encKeyVer: ver
    }
  }

  /**
   * Mask 中间位（用于日志/展示，例：13800001234 → 138****1234）
   * 参数：plain 明文；keepHead 保留前 N 位（默认 3）；keepTail 保留后 N 位（默认 4）
   * 返回值：mask 后字符串
   */
  static mask(plain: string | null | undefined, keepHead = 3, keepTail = 4): string {
    if (!plain) return ''
    const len = plain.length
    if (len <= keepHead + keepTail) return plain
    return plain.slice(0, keepHead) + '*'.repeat(len - keepHead - keepTail) + plain.slice(-keepTail)
  }

  /**
   * 测试钩子：清空密钥缓存（仅供单元测试，业务请勿调用）
   * 参数：无
   * 返回值：无
   */
  static __resetCache(): void {
    this.keyCache.clear()
  }
}
