/**
 * @file notification.module.ts
 * @stage P9/W5 (Sprint 5) — 通知统一模块（A 集成合并版）
 * @desc 多通道（jpush / sms / wx-subscribe / axn）统一入口 + 推送 token 注册。
 *
 * 注册：
 *   - NotificationService（统一路由）
 *   - JPushProvider（极光 V3，B 主导）
 *   - SmsProvider（阿里云 SMS，C 主导）→ 通过 SMS_PROVIDER token
 *   - WxSubscribeProvider（微信小程序订阅消息，E 主导）→ 通过 WX_SUBSCRIBE_PROVIDER token
 *   - AliyunAxnProvider（阿里云号码中心 AXN，E 主导）→ 通过 AXN_PROVIDER token
 *   - PushTokenService + PushTokenController（推送 token 注册，E 主导）
 *
 * @author A 集成（Sprint 5 W5.A.4）合并 B/C/E 工作
 */

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PushToken } from '@/entities'
import {
  AXN_PROVIDER,
  SMS_PROVIDER,
  WX_SUBSCRIBE_PROVIDER,
  NotificationService
} from './notification.service'
import { JPushProvider } from './providers/jpush.provider'
import { SmsProvider } from './providers/sms.provider'
import { WxSubscribeProvider } from './providers/wx-subscribe.provider'
import { AliyunAxnProvider } from './providers/aliyun-axn.provider'
import { PushTokenService } from './services/push-token.service'
import { PushTokenController } from './controllers/push-token.controller'

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PushToken])],
  providers: [
    NotificationService,
    JPushProvider,
    SmsProvider,
    WxSubscribeProvider,
    AliyunAxnProvider,
    PushTokenService,
    /* token 路由：让 NotificationService 通过 token 注入对应 provider */
    { provide: SMS_PROVIDER, useExisting: SmsProvider },
    { provide: WX_SUBSCRIBE_PROVIDER, useExisting: WxSubscribeProvider },
    { provide: AXN_PROVIDER, useExisting: AliyunAxnProvider }
  ],
  controllers: [PushTokenController],
  exports: [
    NotificationService,
    JPushProvider,
    SmsProvider,
    WxSubscribeProvider,
    AliyunAxnProvider,
    PushTokenService
  ]
})
export class NotificationModule {}
