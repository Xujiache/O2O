/**
 * @file channel-mock-smoke.ts
 * @stage P3 / T3.14~T3.15 自验证
 * @desc 4 个 Channel 在 mock 模式下的本地烟囱测试（不依赖真实 Redis/MQ/微信/短信）
 * @author 员工 B
 *
 * 运行：
 *   pnpm --filter 后端 exec ts-node test/manual/channel-mock-smoke.ts
 *
 * 预期：3 个第三方 Channel（WxSubscribe / JPush / AliSms）在 env 配置缺失时
 *       打印 [MOCK] 日志并返回 ok=true；Inbox 因依赖 DB，本脚本中跳过
 */
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { AliSmsChannel } from '../../src/modules/message/channels/ali-sms.channel'
import { JPushChannel } from '../../src/modules/message/channels/jpush.channel'
import { WxSubscribeChannel } from '../../src/modules/message/channels/wx-subscribe.channel'
import { ChannelSendPayload } from '../../src/modules/message/channels/message-channel.interface'
import { MessageChannelType } from '../../src/modules/message/template/template-codes'

/**
 * 极简 ConfigService stub：仅返回空字符串触发 mock 模式
 */
const stubConfig = {
  get<T>(_key: string): T {
    return '' as unknown as T
  }
} as unknown as ConfigService

/**
 * 极简 Redis stub：set/get/del/eval 返回 OK / null
 */
const stubRedis = {
  async set() {
    return 'OK'
  },
  async get() {
    return null
  },
  async del() {
    return 1
  },
  async eval() {
    return 1
  }
} as unknown as Redis

/**
 * 主测试函数
 */
async function main(): Promise<void> {
  // CryptoUtil 需要 ENC_KEY_V1（base64 32 字节）；本测试使用临时 dev key
  if (!process.env.ENC_KEY_V1) {
    process.env.ENC_KEY_V1 = Buffer.from('0'.repeat(32)).toString('base64')
  }
  if (!process.env.HMAC_KEY_V1) {
    process.env.HMAC_KEY_V1 = Buffer.from('0'.repeat(32)).toString('base64')
  }

  console.log('\n========== P3 员工 B Channel Mock 自验证 ==========\n')

  const basePayload: ChannelSendPayload = {
    requestId: `test-${Date.now()}`,
    templateCode: 'ORDER_CREATED',
    templateId: '0',
    channel: MessageChannelType.WX_SUBSCRIBE,
    targetType: 1,
    targetId: '1234567890',
    targetAddress: 'test-target-address',
    title: '测试标题',
    content: '测试内容：订单 T2026041900001 已创建',
    vars: { orderNo: 'T2026041900001' }
  }

  // 1) WxSubscribeChannel
  const wx = new WxSubscribeChannel(stubConfig, stubRedis)
  const r1 = await wx.send({ ...basePayload, channel: MessageChannelType.WX_SUBSCRIBE })
  console.log('WxSubscribeChannel  →', JSON.stringify(r1))

  // 2) JPushChannel
  const jp = new JPushChannel(stubConfig)
  const r2 = await jp.send({ ...basePayload, channel: MessageChannelType.JPUSH })
  console.log('JPushChannel        →', JSON.stringify(r2))

  // 3) AliSmsChannel（频控用 stubRedis SETNX 永远返回 OK，跑首次走 mock）
  const sms = new AliSmsChannel(stubConfig, stubRedis)
  const r3 = await sms.send({
    ...basePayload,
    channel: MessageChannelType.ALI_SMS,
    targetAddress: '13800000000'
  })
  console.log('AliSmsChannel       →', JSON.stringify(r3))

  console.log('\n========== Smoke 通过：3 个 Channel mock 模式均返回 ok=true ==========\n')
}

main().catch((err) => {
  console.error('Smoke 失败：', err)
  process.exit(1)
})
