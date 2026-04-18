/**
 * @file wx-subscribe.channel.ts
 * @stage P3 / T3.14
 * @desc 微信小程序订阅消息通道
 *       - access_token：Redlock 模式（Redis SET NX PX）防并发刷新；缓存 7000s（< 微信 7200s）
 *       - 调用 https://api.weixin.qq.com/cgi-bin/message/subscribe/send
 *       - mock 模式：当 WECHAT_MP_APPID/SECRET 缺失时打日志返回 ok=true，不真实调用
 * @author 员工 B
 *
 * 关键点（DESIGN_P3 §4.3 + 任务硬性约束 10）：
 *   1. 分布式锁 `lock:wx:token`，TTL 5s，防止多实例并发刷新撞配额
 *   2. 缓存 Key `cache:wx:access_token`，TTL 7000s（小于微信 7200s 提前 200s 续期）
 *   3. 锁失败时退避 100ms 后重试取缓存（其他实例可能已刷新）
 *   4. 调用失败 / 返回非 0 errcode → 返回 ok=false，让 Consumer 决定重试
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import * as crypto from 'crypto'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import { MessageChannelType } from '../template/template-codes'
import { ChannelSendPayload, ChannelSendResult, MessageChannel } from './message-channel.interface'

/* ===== Redis Key 与 TTL ===== */
/** 微信 access_token 缓存 Key */
export const WX_ACCESS_TOKEN_CACHE_KEY = 'cache:wx:access_token'
/** access_token 缓存 TTL（秒）；小于微信 7200s 提前续期 */
export const WX_ACCESS_TOKEN_TTL_SECONDS = 7000
/** 分布式锁 Key（防并发刷新 access_token） */
export const WX_TOKEN_LOCK_KEY = 'lock:wx:token'
/** 分布式锁 TTL（毫秒）：5s 内必须完成 HTTPS 请求 */
export const WX_TOKEN_LOCK_TTL_MS = 5000
/** 锁失败时重试取缓存的退避（毫秒） */
export const WX_TOKEN_RETRY_BACKOFF_MS = 100
/** 锁失败时最大重试次数 */
export const WX_TOKEN_MAX_RETRIES = 30

/** 微信 API 域名 */
const WX_API_HOST = 'https://api.weixin.qq.com'

/** 微信 access_token 接口响应 */
interface WxAccessTokenResp {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

/** 微信订阅消息接口响应 */
interface WxSendResp {
  errcode?: number
  errmsg?: string
  msgid?: number | string
}

@Injectable()
export class WxSubscribeChannel implements MessageChannel {
  readonly type = MessageChannelType.WX_SUBSCRIBE
  private readonly logger = new Logger(WxSubscribeChannel.name)

  private readonly appId: string
  private readonly appSecret: string

  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    this.appId = this.configService.get<string>('thirdParty.wechatMpAppid') ?? ''
    this.appSecret = this.configService.get<string>('thirdParty.wechatMpSecret') ?? ''
  }

  /**
   * 是否处于 mock 模式（env 配置缺失时）
   * 返回值：true=mock；false=正式调用
   */
  private isMockMode(): boolean {
    return !this.appId || !this.appSecret
  }

  /**
   * 发送订阅消息
   * 参数：payload
   * 返回值：ChannelSendResult
   */
  async send(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    if (this.isMockMode()) {
      this.logger.warn(
        `[WX_SUBSCRIBE][MOCK] WECHAT_MP_APPID/SECRET 未配置，模拟发送：` +
          `openid=${payload.targetAddress}, code=${payload.templateCode}, content=${payload.content}`
      )
      return { ok: true, externalMsgId: `mock-wx-${Date.now()}`, mock: true }
    }
    if (!payload.targetAddress) {
      return {
        ok: false,
        errorCode: 'WX_OPENID_MISSING',
        errorMsg: '订阅消息缺 openid（target_address）'
      }
    }
    let accessToken: string | null = null
    try {
      accessToken = await this.getAccessToken()
    } catch (err) {
      this.logger.error(`[WX_SUBSCRIBE] 获取 access_token 失败：${(err as Error).message}`)
      return { ok: false, errorCode: 'WX_TOKEN_FAILED', errorMsg: (err as Error).message }
    }
    if (!accessToken) {
      return { ok: false, errorCode: 'WX_TOKEN_NULL', errorMsg: 'access_token 为空' }
    }

    // 真实调用 cgi-bin/message/subscribe/send
    const externalTemplateId =
      typeof payload.vars['__externalTemplateId'] === 'string'
        ? (payload.vars['__externalTemplateId'] as string)
        : ''
    const data: Record<string, { value: string }> = {}
    for (const [k, v] of Object.entries(payload.vars)) {
      if (k.startsWith('__')) continue
      data[k] = { value: String(v ?? '') }
    }
    const body = {
      touser: payload.targetAddress,
      template_id: externalTemplateId,
      page: payload.linkUrl ?? '',
      data
    }
    try {
      const resp = await this.httpJson<WxSendResp>(
        `${WX_API_HOST}/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
        body
      )
      if ((resp.errcode ?? 0) !== 0) {
        // 40001/42001：access_token 过期或无效 → 强制刷新 + 让 Consumer 重试
        if (resp.errcode === 40001 || resp.errcode === 42001) {
          await this.invalidateToken()
        }
        this.logger.warn(
          `[WX_SUBSCRIBE] 微信返回失败 errcode=${resp.errcode} errmsg=${resp.errmsg}`
        )
        return {
          ok: false,
          errorCode: `WX_${resp.errcode}`,
          errorMsg: resp.errmsg ?? '微信接口异常'
        }
      }
      return { ok: true, externalMsgId: resp.msgid ? String(resp.msgid) : null }
    } catch (err) {
      this.logger.error(`[WX_SUBSCRIBE] HTTP 异常：${(err as Error).message}`)
      return {
        ok: false,
        errorCode: 'WX_HTTP_ERROR',
        errorMsg: (err as Error).message
      }
    }
  }

  /**
   * 取 access_token（缓存优先；miss 时分布式锁 + 微信 API 刷新）
   * 返回值：access_token 字符串
   * 错误：网络 / 微信返回错误时抛 Error；调用方捕获返回 ok=false
   *
   * Redlock 流程：
   *   1. GET cache:wx:access_token → 命中直接返回
   *   2. SET lock:wx:token NX PX 5000 → 抢锁
   *      a. 抢到 → 调微信 cgi-bin/token → 缓存 7000s → DEL lock → 返回
   *      b. 抢失败 → sleep 100ms 后回到第 1 步（最多 30 次）
   */
  async getAccessToken(): Promise<string> {
    // 1) 缓存读
    const cached = await this.redis.get(WX_ACCESS_TOKEN_CACHE_KEY)
    if (cached) return cached

    const lockToken = crypto.randomBytes(16).toString('hex')
    for (let attempt = 0; attempt < WX_TOKEN_MAX_RETRIES; attempt++) {
      // 2) 抢分布式锁
      const acquired = await this.redis.set(
        WX_TOKEN_LOCK_KEY,
        lockToken,
        'PX',
        WX_TOKEN_LOCK_TTL_MS,
        'NX'
      )
      if (acquired === 'OK') {
        try {
          // 双重检查：抢锁后再次读缓存（其他实例可能已刷新）
          const cachedDouble = await this.redis.get(WX_ACCESS_TOKEN_CACHE_KEY)
          if (cachedDouble) return cachedDouble
          // 3) 调微信 API 刷新
          const url = `${WX_API_HOST}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(this.appId)}&secret=${encodeURIComponent(this.appSecret)}`
          const resp = await this.httpGet<WxAccessTokenResp>(url)
          if ((resp.errcode ?? 0) !== 0 || !resp.access_token) {
            throw new Error(
              `微信刷新 access_token 失败 errcode=${resp.errcode} errmsg=${resp.errmsg}`
            )
          }
          // 4) 写缓存（TTL 7000s）
          await this.redis.set(
            WX_ACCESS_TOKEN_CACHE_KEY,
            resp.access_token,
            'EX',
            WX_ACCESS_TOKEN_TTL_SECONDS
          )
          this.logger.log(
            `[WX_SUBSCRIBE] access_token 已刷新（expires_in=${resp.expires_in}s，缓存 ${WX_ACCESS_TOKEN_TTL_SECONDS}s）`
          )
          return resp.access_token
        } finally {
          // 5) 安全释放锁（Lua CAS：只在 token 一致时 DEL，避免误删别人的锁）
          await this.releaseLock(WX_TOKEN_LOCK_KEY, lockToken)
        }
      }
      // 抢锁失败，退避后回看缓存
      await new Promise<void>((resolve) => setTimeout(resolve, WX_TOKEN_RETRY_BACKOFF_MS))
      const cachedAfterWait = await this.redis.get(WX_ACCESS_TOKEN_CACHE_KEY)
      if (cachedAfterWait) return cachedAfterWait
    }
    throw new Error(
      `[WX_SUBSCRIBE] 抢 ${WX_TOKEN_LOCK_KEY} 锁 ${WX_TOKEN_MAX_RETRIES} 次仍未成功，放弃刷新`
    )
  }

  /**
   * 失效 access_token 缓存（用于 40001/42001 等服务端反馈）
   */
  async invalidateToken(): Promise<void> {
    await this.redis.del(WX_ACCESS_TOKEN_CACHE_KEY)
  }

  /**
   * 安全释放分布式锁（Lua CAS：仅持有 token 一致才 DEL）
   * 参数：key Redis 锁 key；token 当前实例随机 token
   */
  private async releaseLock(key: string, token: string): Promise<void> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      else
        return 0
      end
    `
    try {
      await this.redis.eval(script, 1, key, token)
    } catch (err) {
      this.logger.warn(`[WX_SUBSCRIBE] 释放 ${key} 锁失败：${(err as Error).message}`)
    }
  }

  /* ========== 简易 HTTP 工具（基于 Node 20 fetch） ========== */

  private async httpGet<T>(url: string): Promise<T> {
    const resp = await fetch(url, { method: 'GET' })
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
    }
    return (await resp.json()) as T
  }

  private async httpJson<T>(url: string, body: unknown): Promise<T> {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
    }
    return (await resp.json()) as T
  }
}
