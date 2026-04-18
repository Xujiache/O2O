/**
 * @file ali-sms.channel.ts
 * @stage P3 / T3.15
 * @desc 阿里云短信通道：同号 60s 频控（Redis K30）+ Aliyun POP 签名 + mock 模式
 * @author 员工 B
 *
 * 频控（任务硬性约束 12）：
 *   Redis Key K30 `rl:sms:freq:{mobileHash}`，TTL 60s
 *   - 命中（已存在该 key） → 返回 ok=false 错误码 SMS_FREQ_LIMIT，不真实调用
 *   - 未命中 → SETNX + EX 60 + 真实调用
 *
 * Mock 模式：当 SMS_AK / SMS_SK 缺失时打日志返回 ok=true（仍走频控避免业务期望不一致）
 *
 * 阿里云短信 SDK 抽象：
 *   官方 @alicloud/dysmsapi20170525 较重，本期采用直签 POP 调用
 *   API: https://dysmsapi.aliyuncs.com/?Action=SendSms
 *   签名：HMAC-SHA1 标准 RPC 签名（V1）；详见
 *     https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms
 *
 * 注意：vars 必须包含 __externalTemplateId（模板登记时把 SMS 模板 ID 放在
 *      message_template.external_template_id 列；MessageService 在送 vars 前注入）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import Redis from 'ioredis'
import { CryptoUtil } from '../../../utils'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import { MessageChannelType } from '../template/template-codes'
import { ChannelSendPayload, ChannelSendResult, MessageChannel } from './message-channel.interface'

/* ===== Redis Key 与 TTL（K30） ===== */
/** 同号 60s 频控 Key 模板 */
export const SMS_FREQ_KEY = (mobileHash: string): string => `rl:sms:freq:${mobileHash}`
/** 频控窗口（秒） */
export const SMS_FREQ_WINDOW_SECONDS = 60

const POP_HOST = 'https://dysmsapi.aliyuncs.com/'

interface AliSendSmsResp {
  Code?: string
  Message?: string
  RequestId?: string
  BizId?: string
}

@Injectable()
export class AliSmsChannel implements MessageChannel {
  readonly type = MessageChannelType.ALI_SMS
  private readonly logger = new Logger(AliSmsChannel.name)

  private readonly accessKeyId: string
  private readonly accessKeySecret: string
  private readonly defaultSignName: string

  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    this.accessKeyId = this.configService.get<string>('thirdParty.smsAk') ?? ''
    this.accessKeySecret = this.configService.get<string>('thirdParty.smsSk') ?? ''
    this.defaultSignName = process.env.SMS_SIGN_NAME ?? 'O2O平台'
  }

  /**
   * 是否处于 mock 模式
   */
  private isMockMode(): boolean {
    return !this.accessKeyId || !this.accessKeySecret
  }

  /**
   * 发送短信
   * 参数：payload（targetAddress = 11 位手机号明文）
   * 返回值：ChannelSendResult
   */
  async send(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    if (!payload.targetAddress) {
      return { ok: false, errorCode: 'SMS_MOBILE_MISSING', errorMsg: '短信缺手机号' }
    }
    // 1) 频控（K30）—— 即便 mock 模式也校验，确保业务侧期望一致
    const mobileHash = CryptoUtil.hmac(payload.targetAddress)
    const freqKey = SMS_FREQ_KEY(mobileHash)
    try {
      // SETNX + EX：true=抢到（首次发）；false=被频控
      const acquired = await this.redis.set(freqKey, '1', 'EX', SMS_FREQ_WINDOW_SECONDS, 'NX')
      if (acquired !== 'OK') {
        this.logger.warn(
          `[ALI_SMS] 同号 ${SMS_FREQ_WINDOW_SECONDS}s 频控命中 mobileHash=${mobileHash.slice(0, 8)}***`
        )
        return {
          ok: false,
          errorCode: 'SMS_FREQ_LIMIT',
          errorMsg: `同号 ${SMS_FREQ_WINDOW_SECONDS} 秒内仅可发送 1 次`
        }
      }
    } catch (err) {
      this.logger.warn(`[ALI_SMS] Redis 频控写入失败：${(err as Error).message}（继续放行）`)
    }

    if (this.isMockMode()) {
      this.logger.warn(
        `[ALI_SMS][MOCK] SMS_AK/SK 未配置，模拟发送：` +
          `mobile=${CryptoUtil.mask(payload.targetAddress)}, code=${payload.templateCode}, content=${payload.content}`
      )
      return { ok: true, externalMsgId: `mock-sms-${Date.now()}`, mock: true }
    }

    // 2) 真实调用：阿里云 POP 接口
    const externalTemplateId =
      typeof payload.vars['__externalTemplateId'] === 'string'
        ? (payload.vars['__externalTemplateId'] as string)
        : ''
    if (!externalTemplateId) {
      return {
        ok: false,
        errorCode: 'SMS_TEMPLATE_MISSING',
        errorMsg: '缺 external_template_id（aliyun template code）'
      }
    }

    const signName =
      typeof payload.vars['__signName'] === 'string'
        ? (payload.vars['__signName'] as string)
        : this.defaultSignName

    // 模板参数：剔除内部 __ 前缀的 key
    const tplParams: Record<string, string> = {}
    for (const [k, v] of Object.entries(payload.vars)) {
      if (k.startsWith('__')) continue
      tplParams[k] = String(v ?? '')
    }
    const params: Record<string, string> = {
      Action: 'SendSms',
      Version: '2017-05-25',
      RegionId: 'cn-hangzhou',
      PhoneNumbers: payload.targetAddress,
      SignName: signName,
      TemplateCode: externalTemplateId,
      TemplateParam: JSON.stringify(tplParams),
      AccessKeyId: this.accessKeyId,
      Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomBytes(16).toString('hex'),
      Timestamp: new Date().toISOString().replace(/\.\d{3}/, ''),
      Action_: 'SendSms' /* 占位，确保不与 Action 冲突时被覆盖 */
    }
    delete params.Action_

    const sign = this.computeSignature(params, this.accessKeySecret)
    params.Signature = sign
    const url = `${POP_HOST}?${this.urlEncode(params)}`

    try {
      const resp = await fetch(url, { method: 'GET' })
      const data = (await resp.json()) as AliSendSmsResp
      if (data.Code !== 'OK') {
        this.logger.warn(`[ALI_SMS] 阿里云返回失败 Code=${data.Code} Message=${data.Message}`)
        return {
          ok: false,
          errorCode: `SMS_${data.Code ?? 'UNKNOWN'}`,
          errorMsg: data.Message ?? '阿里云短信异常'
        }
      }
      return { ok: true, externalMsgId: data.BizId ?? data.RequestId ?? null }
    } catch (err) {
      this.logger.error(`[ALI_SMS] HTTP 异常：${(err as Error).message}`)
      return { ok: false, errorCode: 'SMS_HTTP_ERROR', errorMsg: (err as Error).message }
    }
  }

  /* ========== 阿里云 POP RPC 签名（V1） ========== */

  /**
   * 计算阿里云 RPC 签名（HMAC-SHA1）
   * 参数：params 待签参数；accessKeySecret AK Secret
   * 返回值：签名字符串
   */
  private computeSignature(params: Record<string, string>, accessKeySecret: string): string {
    const sortedKeys = Object.keys(params).sort()
    const canonical = sortedKeys
      .map((k) => `${this.popEncode(k)}=${this.popEncode(params[k])}`)
      .join('&')
    const stringToSign = `GET&${this.popEncode('/')}&${this.popEncode(canonical)}`
    return crypto
      .createHmac('sha1', `${accessKeySecret}&`)
      .update(stringToSign, 'utf8')
      .digest('base64')
  }

  /**
   * 阿里云 POP 特殊 URL 编码（与 RFC3986 对齐）
   */
  private popEncode(s: string): string {
    return encodeURIComponent(s).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~')
  }

  private urlEncode(params: Record<string, string>): string {
    return Object.keys(params)
      .map((k) => `${this.popEncode(k)}=${this.popEncode(params[k])}`)
      .join('&')
  }
}
