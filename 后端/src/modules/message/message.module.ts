/**
 * @file message.module.ts
 * @stage P3/T3.13~T3.15 + P3-REVIEW-01 R1（I-01/I-04 修复）
 * @desc 消息推送模块（4 通道 + RabbitMQ + 18+ 模板 + 站内信 4 接口）
 * @author 员工 B 初版 + 员工 A R1 增量（4 channel token + InboxController）
 *
 * R1 增量：
 *   1. 用 useExisting 把 4 个 Channel Class 绑到 Symbol token（W X _SUBSCRIBE_CHANNEL 等），
 *      MessageService 通过 token 注入抽象，便于 mock；
 *   2. 注册 InboxController（4 个站内信 HTTP 接口）。
 *
 * 业务侧调用：
 *   注入 `MessageService` → `await msg.send({ code: 'ORDER_CREATED', targetType: 1, targetId, vars })`
 *
 * 循环依赖：
 *   MessageService 与 MessageConsumer 互引（service.publish→consumer / consumer.handle→service）
 *   两侧构造函数均使用 `forwardRef(() => ...)` 解耦
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MessageInbox, MessageTemplate, PushRecord } from '../../entities'
import { HealthModule } from '../../health/health.module'
import { AliSmsChannel } from './channels/ali-sms.channel'
import { InboxChannel } from './channels/inbox.channel'
import { JPushChannel } from './channels/jpush.channel'
import {
  ALI_SMS_CHANNEL,
  INBOX_CHANNEL,
  JPUSH_CHANNEL,
  WX_SUBSCRIBE_CHANNEL
} from './channels/message-channel.interface'
import { WxSubscribeChannel } from './channels/wx-subscribe.channel'
import { MessageConsumer } from './consumer/message.consumer'
import { InboxController } from './inbox.controller'
import { MessageService } from './message.service'
import { TemplateService } from './template/template.service'

@Module({
  imports: [
    ConfigModule,
    HealthModule,
    TypeOrmModule.forFeature([MessageTemplate, MessageInbox, PushRecord])
  ],
  /* InboxController：4 个站内信 HTTP 接口（被 R1 / I-04 完整化） */
  controllers: [InboxController],
  providers: [
    TemplateService,
    /* ===== 4 个具体 Channel 实现 ===== */
    WxSubscribeChannel,
    JPushChannel,
    AliSmsChannel,
    InboxChannel,
    /* ===== Channel 抽象 token：useExisting 复用上面 4 个具体实例 ===== */
    { provide: WX_SUBSCRIBE_CHANNEL, useExisting: WxSubscribeChannel },
    { provide: JPUSH_CHANNEL, useExisting: JPushChannel },
    { provide: ALI_SMS_CHANNEL, useExisting: AliSmsChannel },
    { provide: INBOX_CHANNEL, useExisting: InboxChannel },
    MessageConsumer,
    MessageService
  ],
  exports: [MessageService, TemplateService]
})
export class MessageModule {}
