/**
 * @file notification.service.ts
 * @stage P9/W5.B.1 (Sprint 5) — 通知统一路由层
 * @desc 业务侧只调 NotificationService.send(payload)；本类按 channel 字段分发到具体 Provider。
 *
 * 本期（Agent B）实现：
 *   - jpush 路径（落到 JPushProvider）
 *
 * 占位（C/E 后续合并接入）：
 *   - sms（C）→ SmsProvider（@Optional 注入；缺失时 disabled）
 *   - wx-subscribe（E）→ WxSubscribeProvider（@Optional 注入）
 *   - axn（E）→ AxnProvider（@Optional 注入）
 *
 * 设计：
 *   - 全 try/catch；失败仅 logger.error + 返回 { ok: false }
 *   - sms/wx-subscribe/axn 缺 provider → 返回 reason='channel_provider_missing'
 *
 * @author Agent B (P9 Sprint 5)
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type { PushPayload, PushResult, PushTarget } from './notification.types'
import { JPushProvider } from './providers/jpush.provider'

/* ============================================================================
 * 占位 token（C/E 后续合并 provider 时 @Inject 同 token 即可联通）
 * ============================================================================ */

/** SmsProvider 注入 token（由 Agent C 在 Sprint 5 合并实际实现） */
export const SMS_PROVIDER = Symbol('NOTIFICATION_SMS_PROVIDER')

/** WxSubscribeProvider 注入 token（由 Agent E 合并实际实现） */
export const WX_SUBSCRIBE_PROVIDER = Symbol('NOTIFICATION_WX_SUBSCRIBE_PROVIDER')

/** AxnProvider 注入 token（由 Agent E 合并实际实现） */
export const AXN_PROVIDER = Symbol('NOTIFICATION_AXN_PROVIDER')

/* ============================================================================
 * 占位接口（仅类型；C/E 实际类需实现这套形状即可被路由）
 * ============================================================================ */

export interface ISmsProvider {
  send(phone: string, templateCode: string, vars: Record<string, string>): Promise<PushResult>
}

export interface IWxSubscribeProvider {
  send(
    openId: string,
    templateCode: string,
    vars: Record<string, string>,
    extras?: Record<string, unknown>
  ): Promise<PushResult>
}

export interface IAxnProvider {
  bind(phoneA: string, phoneB: string, extras?: Record<string, unknown>): Promise<PushResult>
}

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private readonly jpushProvider: JPushProvider,
    @Optional() @Inject(SMS_PROVIDER) private readonly smsProvider?: ISmsProvider,
    @Optional()
    @Inject(WX_SUBSCRIBE_PROVIDER)
    private readonly wxSubscribeProvider?: IWxSubscribeProvider,
    @Optional() @Inject(AXN_PROVIDER) private readonly axnProvider?: IAxnProvider
  ) {}

  /**
   * 统一发送入口
   * 参数：payload（含 channel 字段）
   * 返回值：PushResult；失败不抛错（best-effort）
   */
  async send(payload: PushPayload): Promise<PushResult> {
    try {
      switch (payload.channel) {
        case 'jpush':
          return await this.sendJPush(payload)
        case 'sms':
          return await this.sendSms(payload)
        case 'wx-subscribe':
          return await this.sendWxSubscribe(payload)
        case 'axn':
          return await this.sendAxn(payload)
        default:
          return { ok: false, reason: 'unknown_channel' }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[NotificationService] send error: ${msg}`)
      return { ok: false, reason: 'service_error' }
    }
  }

  /* ============================================================================
   * 1. jpush 路由
   * ============================================================================ */

  /**
   * 路由到 JPushProvider
   * 参数：payload（target 必填）
   * 返回值：PushResult
   */
  private async sendJPush(payload: PushPayload): Promise<PushResult> {
    const target: PushTarget | undefined = payload.target
    if (!target) {
      return { ok: false, reason: 'jpush_target_missing' }
    }
    const { title, content, extras } = payload
    switch (target.kind) {
      case 'regId':
        return this.jpushProvider.pushByRegistrationId(target.values ?? [], title, content, extras)
      case 'alias':
        return this.jpushProvider.pushByAlias(target.values ?? [], title, content, extras)
      case 'tag':
        return this.jpushProvider.pushByTag(target.values ?? [], title, content, extras)
      case 'all':
        return this.jpushProvider.pushAll(title, content, extras)
      default:
        return { ok: false, reason: 'jpush_target_kind_invalid' }
    }
  }

  /* ============================================================================
   * 2. sms 路由（占位；C 合并 provider 后即可用）
   * ============================================================================ */

  /**
   * 路由到 SmsProvider（C 提供）
   * 参数：payload（phone / templateCode / templateVars 必填）
   * 返回值：PushResult
   */
  private async sendSms(payload: PushPayload): Promise<PushResult> {
    if (!this.smsProvider) {
      return { ok: false, reason: 'channel_provider_missing' }
    }
    if (!payload.phone || !payload.templateCode) {
      return { ok: false, reason: 'sms_params_missing' }
    }
    return this.smsProvider.send(payload.phone, payload.templateCode, payload.templateVars ?? {})
  }

  /* ============================================================================
   * 3. wx-subscribe 路由（占位；E 合并 provider 后即可用）
   * ============================================================================ */

  /**
   * 路由到 WxSubscribeProvider（E 提供）
   * 参数：payload（openId / templateCode / templateVars 必填）
   * 返回值：PushResult
   */
  private async sendWxSubscribe(payload: PushPayload): Promise<PushResult> {
    if (!this.wxSubscribeProvider) {
      return { ok: false, reason: 'channel_provider_missing' }
    }
    if (!payload.openId || !payload.templateCode) {
      return { ok: false, reason: 'wx_subscribe_params_missing' }
    }
    return this.wxSubscribeProvider.send(
      payload.openId,
      payload.templateCode,
      payload.templateVars ?? {},
      payload.extras
    )
  }

  /* ============================================================================
   * 4. axn 路由（占位；E 合并 provider 后即可用）
   * ============================================================================ */

  /**
   * 路由到 AxnProvider（E 提供）
   * 参数：payload（phone / phonePeer 必填）
   * 返回值：PushResult
   */
  private async sendAxn(payload: PushPayload): Promise<PushResult> {
    if (!this.axnProvider) {
      return { ok: false, reason: 'channel_provider_missing' }
    }
    if (!payload.phone || !payload.phonePeer) {
      return { ok: false, reason: 'axn_params_missing' }
    }
    return this.axnProvider.bind(payload.phone, payload.phonePeer, payload.extras)
  }
}
