/**
 * @file rsa-key.service.ts
 * @stage P9 / W5.C.1 (Sprint 5) — 管理后台登录 RSA 密码包服务端
 * @desc 启动时从 Redis（rsa:admin:keypair）加载或生成 2048 位 RSA 密钥对，
 *       供管理后台登录页：
 *         1) GET /api/v1/admin/pubkey 取公钥（PEM）
 *         2) /api/v1/auth/admin/login 入口 RSA-OAEP/SHA-256 解密 passwordCipher
 *
 * 设计要点（与 Sprint 3 wechat-pay-v3.provider.ts envelope 风格一致）：
 *   - 单例 + 内存缓存：解密热路径不走 Redis
 *   - Redis 持久化（24h TTL）：进程重启 / 多实例共享同一密钥对，避免登录页用旧 key
 *   - 失败兜底：Redis 异常不影响首次启动（继续生成内存 keypair；后台再异步写一次）
 *   - rotateKeypair：管理员强制轮换（DEL Redis + 立即生成新 keypair；老缓存被覆盖）
 *
 * @author Agent C (P9 Sprint 5)
 */

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  generateKeyPairSync,
  privateDecrypt,
  constants as cryptoConstants,
  createPrivateKey,
  createPublicKey,
  type KeyObject
} from 'crypto'
import Redis from 'ioredis'
import { BizErrorCode } from '../../../common/error-codes'
import { BusinessException } from '../../../common/exceptions/business.exception'
import { REDIS_CLIENT } from '../../../health/redis.provider'

/** Redis Key（与 redis-keys.md 风格一致：业务前缀:用途:子域） */
export const RSA_ADMIN_KEYPAIR_KEY = 'rsa:admin:keypair'

/** 默认 TTL（秒）：24h；可由 RSA_KEY_TTL_HOURS 覆盖 */
const DEFAULT_TTL_SECONDS = 24 * 3600

/** Redis 中存放的 keypair envelope */
interface RedisKeypair {
  publicPem: string
  privatePem: string
  /** 生成时间戳（ms），用于排查 */
  generatedAt: number
}

/**
 * RSA 密钥对管理服务
 * 用途：
 *   - admin-pubkey.controller GET /admin/pubkey 取 PEM
 *   - auth.service.adminLogin 入口解密 passwordCipher
 */
@Injectable()
export class RsaKeyService implements OnModuleInit {
  private readonly logger = new Logger(RsaKeyService.name)

  /** 内存缓存：进程内热路径不走 Redis */
  private cached: { publicPem: string; privateKey: KeyObject } | null = null

  /** TTL 秒（构造函数读 env） */
  private readonly ttlSeconds: number

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService
  ) {
    const hours = this.config.get<number>('RSA_KEY_TTL_HOURS')
    const parsed = typeof hours === 'string' ? parseInt(hours, 10) : hours
    this.ttlSeconds =
      typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0
        ? parsed * 3600
        : DEFAULT_TTL_SECONDS
  }

  /**
   * Nest 生命周期：模块初始化时尝试从 Redis 加载，否则生成新 keypair
   * 异常吞掉（避免 Redis 抖动阻塞 server 启动）；首次解密时再 lazy 兜底。
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.loadOrGenerate()
    } catch (err) {
      this.logger.warn(`[RsaKeyService] onModuleInit 失败：${(err as Error).message}`)
    }
  }

  /**
   * 取公钥 PEM
   * 返回值：spki 格式公钥 PEM 字符串
   * 用途：admin-pubkey.controller 返回给前端登录页
   */
  async getPublicKeyPem(): Promise<string> {
    const kp = await this.ensureKeypair()
    return kp.publicPem
  }

  /**
   * 解密 cipher（base64） → 原文 utf8
   * 参数：cipherBase64 前端 SubtleCrypto.encrypt(RSA-OAEP/SHA-256) → base64
   * 返回值：明文字符串
   * 错误：
   *   - 解密失败 → BIZ_DATA_CONFLICT '密码加密格式错误'
   *   - cipher 为空 → PARAM_INVALID
   */
  async decrypt(cipherBase64: string): Promise<string> {
    if (!cipherBase64 || typeof cipherBase64 !== 'string') {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'passwordCipher 不可为空')
    }
    const kp = await this.ensureKeypair()
    let cipherBuf: Buffer
    try {
      cipherBuf = Buffer.from(cipherBase64, 'base64')
    } catch {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '密码加密格式错误')
    }
    try {
      const plain = privateDecrypt(
        {
          key: kp.privateKey,
          padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        cipherBuf
      )
      return plain.toString('utf8')
    } catch (err) {
      this.logger.warn(`[RsaKeyService] decrypt 失败：${(err as Error).message}`)
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '密码加密格式错误')
    }
  }

  /**
   * 强制轮换 keypair：DEL Redis + 立即生成新 keypair（同步覆盖内存缓存）
   * 用途：超管手动旋转 / 怀疑泄露
   */
  async rotateKeypair(): Promise<void> {
    try {
      await this.redis.del(RSA_ADMIN_KEYPAIR_KEY)
    } catch (err) {
      this.logger.warn(`[RsaKeyService] rotate DEL Redis 失败：${(err as Error).message}`)
    }
    this.cached = null
    await this.loadOrGenerate(true /* forceGenerate */)
    this.logger.log('[RsaKeyService] keypair 已轮换')
  }

  /* ====================== 内部 ====================== */

  /**
   * 确保 cached 不为 null；为 null 时重新 loadOrGenerate
   */
  private async ensureKeypair(): Promise<{ publicPem: string; privateKey: KeyObject }> {
    if (this.cached) return this.cached
    await this.loadOrGenerate()
    if (!this.cached) {
      /* 极端情况：Redis 全程异常 + 生成异常；理论上 generateKeyPairSync 不会失败 */
      throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, 'RSA keypair 不可用')
    }
    return this.cached
  }

  /**
   * 从 Redis 取或生成 keypair；写内存 + Redis
   * 参数：forceGenerate 强制跳过 Redis 读，直接生成
   */
  private async loadOrGenerate(forceGenerate = false): Promise<void> {
    if (!forceGenerate) {
      try {
        const raw = await this.redis.get(RSA_ADMIN_KEYPAIR_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as RedisKeypair
          if (parsed.publicPem && parsed.privatePem) {
            this.cached = {
              publicPem: parsed.publicPem,
              privateKey: createPrivateKey(parsed.privatePem)
            }
            this.logger.log(
              `[RsaKeyService] 从 Redis 加载 keypair（generatedAt=${parsed.generatedAt}）`
            )
            return
          }
        }
      } catch (err) {
        this.logger.warn(`[RsaKeyService] Redis 读 keypair 失败：${(err as Error).message}`)
      }
    }

    /* 生成新 keypair */
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
    /* 内存缓存（KeyObject 比反复 PEM 解析快） */
    this.cached = {
      publicPem: publicKey,
      privateKey: createPrivateKey(privateKey)
    }
    /* 异步落 Redis；失败不阻塞 */
    const envelope: RedisKeypair = {
      publicPem: publicKey,
      privatePem: privateKey,
      generatedAt: Date.now()
    }
    try {
      await this.redis.set(RSA_ADMIN_KEYPAIR_KEY, JSON.stringify(envelope), 'EX', this.ttlSeconds)
      this.logger.log(`[RsaKeyService] 生成新 keypair 并写 Redis ttl=${this.ttlSeconds}s`)
    } catch (err) {
      this.logger.warn(`[RsaKeyService] Redis 写 keypair 失败：${(err as Error).message}`)
    }
  }

  /**
   * 仅供测试：暴露当前内存缓存的公钥 KeyObject（spki PEM 输入也可解析）
   * 用途：spec 用此方法验证 rotate 后 PEM 已变化
   */
  /* istanbul ignore next */
  publicKeyObjectForTest(): KeyObject | null {
    return this.cached ? createPublicKey(this.cached.publicPem) : null
  }
}
