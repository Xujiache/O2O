/**
 * @file message.consumer.ts
 * @stage P3 / T3.13
 * @desc 消息推送 RabbitMQ 拓扑声明 + Producer + Consumer
 * @author 员工 B
 *
 * 职责：
 *   1. onModuleInit：连接 RabbitMQ，声明 exchange / queue / DLX 拓扑
 *   2. publish(payload)：向主队列投递（MessageService 调用）
 *   3. consume：消费主队列；分发到对应 Channel；
 *      ① 成功 → ack + 写 push_record 状态=2
 *      ② 失败：attempts < 3 → 投递到 retry 队列（TTL 退避）
 *               attempts ≥ 3 → 投递到死信队列 + push_record 状态=3
 *   4. onModuleDestroy：优雅关闭 channel + connection
 *
 * Mock 模式：当 RABBITMQ_URL 为空时，进入 in-memory 模式：
 *   publish 时直接同步路由到 handleMessage；不真实连接 MQ；本地开发与单测可用
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqp from 'amqplib'
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib'
import {
  MESSAGE_DEAD_EXCHANGE,
  MESSAGE_DEAD_QUEUE,
  MESSAGE_DEAD_ROUTING_KEY,
  MESSAGE_EXCHANGE,
  MESSAGE_MAX_ATTEMPTS,
  MESSAGE_PREFETCH,
  MESSAGE_QUEUE,
  MESSAGE_RETRY_EXCHANGE,
  MESSAGE_RETRY_QUEUE,
  MESSAGE_RETRY_ROUTING_KEY,
  MESSAGE_RETRY_TTL_MS,
  MESSAGE_ROUTING_KEY
} from './rabbitmq.constants'
import { MessageService } from '../message.service'

/** Consumer 处理的消息载荷 */
export interface MessagePushJob {
  /** 业务幂等 request_id（写入 push_record.request_id） */
  requestId: string
  /** 模板 code */
  templateCode: string
  /** 模板 ID（DB 内） */
  templateId: string | null
  /** 通道 1/2/3/4 */
  channel: number
  /** 目标用户 1/2/3 */
  targetType: number
  /** 目标用户 ID */
  targetId: string
  /** 目标地址 */
  targetAddress: string
  /** 标题（已渲染） */
  title: string | null
  /** 内容（已渲染） */
  content: string
  /** 模板变量 */
  vars: Record<string, unknown>
  /** 业务关联 */
  category?: number
  relatedType?: number | null
  relatedNo?: string | null
  linkUrl?: string | null
  /** 已尝试次数（每次重试 +1） */
  attempts: number
}

@Injectable()
export class MessageConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageConsumer.name)

  private connection: ChannelModel | null = null
  private channel: Channel | null = null
  /** 是否已声明完拓扑 */
  private topologyReady = false
  /** mock 模式（未配置 RABBITMQ_URL） */
  private mock = false

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MessageService))
    private readonly messageService: MessageService
  ) {}

  /**
   * 模块启动：连接 MQ + 声明拓扑 + 注册 Consumer
   */
  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('rabbitmq.url') ?? ''
    if (!url) {
      this.mock = true
      this.logger.warn(
        '[MQ][MOCK] RABBITMQ_URL 未配置，进入 in-memory 模式：publish 直接同步路由到 handleMessage（无重试/无 DLX）'
      )
      return
    }
    try {
      this.connection = await amqp.connect(url)
      this.channel = await this.connection.createChannel()
      await this.declareTopology(this.channel)
      await this.channel.prefetch(MESSAGE_PREFETCH)
      await this.channel.consume(
        MESSAGE_QUEUE,
        (msg) => {
          if (msg) void this.onMessage(msg)
        },
        { noAck: false }
      )
      this.topologyReady = true
      this.logger.log(
        `[MQ] 已连接 RabbitMQ，拓扑声明完毕；监听 ${MESSAGE_QUEUE} prefetch=${MESSAGE_PREFETCH}`
      )

      this.connection.on('error', (err: Error) =>
        this.logger.error(`[MQ] 连接错误：${err.message}`)
      )
      this.connection.on('close', () => this.logger.warn('[MQ] 连接已关闭'))
    } catch (err) {
      this.mock = true
      this.logger.error(
        `[MQ] 连接 ${url} 失败，降级到 in-memory mock 模式：${(err as Error).message}`
      )
    }
  }

  /**
   * 模块销毁：关闭 channel/connection
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel) await this.channel.close()
    } catch (err) {
      this.logger.warn(`[MQ] 关闭 channel 失败：${(err as Error).message}`)
    }
    try {
      if (this.connection) await this.connection.close()
    } catch (err) {
      this.logger.warn(`[MQ] 关闭 connection 失败：${(err as Error).message}`)
    }
  }

  /**
   * 投递消息到主队列（MessageService.send 内调用）
   * 参数：job 待投递的载荷
   * 返回值：Promise<void>
   * 用途：业务层只关心 publish；Consumer 内部完成消费/重试/死信
   */
  async publish(job: MessagePushJob): Promise<void> {
    if (this.mock || !this.channel) {
      // mock 模式下同步消费
      await this.handleMessage(job)
      return
    }
    const ok = this.channel.publish(
      MESSAGE_EXCHANGE,
      MESSAGE_ROUTING_KEY,
      Buffer.from(JSON.stringify(job)),
      { persistent: true, contentType: 'application/json' }
    )
    if (!ok) {
      this.logger.warn(`[MQ] publish 缓冲区满，requestId=${job.requestId}`)
    }
  }

  /**
   * 消费一条消息
   */
  private async onMessage(msg: ConsumeMessage): Promise<void> {
    const ch = this.channel
    if (!ch) return
    let job: MessagePushJob
    try {
      job = JSON.parse(msg.content.toString()) as MessagePushJob
    } catch (err) {
      this.logger.error(
        `[MQ] 消息解析失败，丢弃：${(err as Error).message}（content=${msg.content.toString().slice(0, 200)}）`
      )
      ch.ack(msg)
      return
    }
    try {
      const result = await this.handleMessage(job)
      if (result.ok) {
        ch.ack(msg)
      } else {
        await this.routeFailure(ch, msg, job, result.errorCode, result.errorMsg)
      }
    } catch (err) {
      await this.routeFailure(ch, msg, job, 'CONSUMER_EXCEPTION', (err as Error).message)
    }
  }

  /**
   * 真正的业务处理：分发到对应 Channel + 写 push_record
   * 返回值：{ ok, errorCode?, errorMsg? }
   */
  async handleMessage(job: MessagePushJob): Promise<{
    ok: boolean
    errorCode?: string | null
    errorMsg?: string | null
  }> {
    const result = await this.messageService.processJob(job)
    return result
  }

  /**
   * 失败路由：< 3 次 → retry queue（TTL 60s 后回到主队列）；≥ 3 次 → dead queue
   */
  private async routeFailure(
    ch: Channel,
    msg: ConsumeMessage,
    job: MessagePushJob,
    errorCode?: string | null,
    errorMsg?: string | null
  ): Promise<void> {
    job.attempts = (job.attempts ?? 0) + 1
    const newBody = Buffer.from(JSON.stringify(job))
    if (job.attempts < MESSAGE_MAX_ATTEMPTS) {
      ch.publish(MESSAGE_RETRY_EXCHANGE, MESSAGE_RETRY_ROUTING_KEY, newBody, {
        persistent: true,
        contentType: 'application/json'
      })
      this.logger.warn(
        `[MQ] 投递到 retry 队列：requestId=${job.requestId} attempts=${job.attempts} err=${errorCode}/${errorMsg}`
      )
    } else {
      ch.publish(MESSAGE_DEAD_EXCHANGE, MESSAGE_DEAD_ROUTING_KEY, newBody, {
        persistent: true,
        contentType: 'application/json'
      })
      this.logger.error(
        `[MQ] 投递到死信队列：requestId=${job.requestId} attempts=${job.attempts} err=${errorCode}/${errorMsg}`
      )
      // 同步把 push_record 标失败
      await this.messageService.markFinalFailed(job, errorCode ?? null, errorMsg ?? null)
    }
    ch.ack(msg)
  }

  /**
   * 声明 RabbitMQ 拓扑（exchange / queue / DLX）
   * 参数：ch Channel
   * 返回值：Promise<void>
   * 用途：onModuleInit 内一次性声明，幂等
   */
  private async declareTopology(ch: Channel): Promise<void> {
    // 主交换机 + 主队列
    await ch.assertExchange(MESSAGE_EXCHANGE, 'direct', { durable: true })
    await ch.assertQueue(MESSAGE_QUEUE, { durable: true })
    await ch.bindQueue(MESSAGE_QUEUE, MESSAGE_EXCHANGE, MESSAGE_ROUTING_KEY)

    // 重试交换机 + 重试队列（带 TTL；过期路由回主交换机）
    await ch.assertExchange(MESSAGE_RETRY_EXCHANGE, 'direct', { durable: true })
    await ch.assertQueue(MESSAGE_RETRY_QUEUE, {
      durable: true,
      messageTtl: MESSAGE_RETRY_TTL_MS,
      deadLetterExchange: MESSAGE_EXCHANGE,
      deadLetterRoutingKey: MESSAGE_ROUTING_KEY
    })
    await ch.bindQueue(MESSAGE_RETRY_QUEUE, MESSAGE_RETRY_EXCHANGE, MESSAGE_RETRY_ROUTING_KEY)

    // 死信交换机 + 死信队列
    await ch.assertExchange(MESSAGE_DEAD_EXCHANGE, 'direct', { durable: true })
    await ch.assertQueue(MESSAGE_DEAD_QUEUE, { durable: true })
    await ch.bindQueue(MESSAGE_DEAD_QUEUE, MESSAGE_DEAD_EXCHANGE, MESSAGE_DEAD_ROUTING_KEY)
  }

  /**
   * 暴露给外部检查：mq 是否就绪
   */
  isReady(): boolean {
    return this.mock || this.topologyReady
  }
}
