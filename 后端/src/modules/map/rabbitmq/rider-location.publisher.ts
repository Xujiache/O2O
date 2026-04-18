import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqplib from 'amqplib'
import type { Channel, ChannelModel } from 'amqplib'
import type { RiderLocationPayload } from '../rider-location.service'

/** rider.location 队列常量（与 consumer 一致） */
export const RIDER_LOCATION_QUEUE = 'rider.location'

/** Publisher Token */
export const RIDER_LOCATION_PUBLISHER = Symbol('RIDER_LOCATION_PUBLISHER')

/**
 * 骑手位置 Publisher 抽象
 *
 * 用途：
 * - 业务模块依赖 RIDER_LOCATION_PUBLISHER 而非具体实现
 * - 提供 InMemory 实现兜底（RABBITMQ_URL 未配置时），便于本机自验证不阻塞
 */
export interface RiderLocationPublisher {
  /**
   * 投递一批骑手位置点
   * @param payloads 一批位置（已校验过 lng/lat）
   * @param batchId  追踪用 ID
   */
  publishBatch(payloads: RiderLocationPayload[], batchId: string): Promise<void>
}

/**
 * RabbitMQ Publisher（生产实现）
 *
 * 设计：
 * - 单 channel 复用；进程退出前 `close`
 * - 队列声明 durable=true；消息 persistent；保障重启不丢
 * - 单批 publish 一条 message（payloads 序列化为 JSON），批量切分由调用方控制
 *
 * 用途：MapModule.useFactory 在有 RABBITMQ_URL 时注入本类；否则注入 InMemory 兜底
 */
@Injectable()
export class AmqpRiderLocationPublisher
  implements RiderLocationPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AmqpRiderLocationPublisher.name)
  private connection?: ChannelModel
  private channel?: Channel
  private url: string

  /**
   * 构造 Publisher
   * @param config 读取 rabbitmq.url
   */
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.url = config.get<string>('rabbitmq.url', '')
  }

  /**
   * 模块启动时自动连接
   */
  async onModuleInit(): Promise<void> {
    if (!this.url) {
      this.logger.warn(
        'RABBITMQ_URL 未配置，AmqpRiderLocationPublisher 不会真正连接（应使用 InMemory 兜底）'
      )
      return
    }
    await this.ensureChannel()
  }

  /**
   * 模块销毁时清理
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel) await this.channel.close()
    } catch {
      /* ignore */
    }
    try {
      if (this.connection) await this.connection.close()
    } catch {
      /* ignore */
    }
  }

  /**
   * 投递一批骑手位置（持久化消息 + headers.batch-id）
   * 参数：payloads / batchId
   * 返回值：void
   */
  async publishBatch(payloads: RiderLocationPayload[], batchId: string): Promise<void> {
    if (payloads.length === 0) return
    const channel = await this.ensureChannel()
    const body = Buffer.from(
      JSON.stringify({ batchId, count: payloads.length, items: payloads }),
      'utf-8'
    )
    const ok = channel.sendToQueue(RIDER_LOCATION_QUEUE, body, {
      persistent: true,
      contentType: 'application/json',
      headers: { 'batch-id': batchId, 'item-count': payloads.length }
    })
    if (!ok) {
      // 写入缓冲区已满，等 drain 一次
      await new Promise<void>((resolve) => channel.once('drain', () => resolve()))
    }
  }

  /**
   * 懒连接 + 声明队列
   * 返回值：可用 channel
   */
  private async ensureChannel(): Promise<Channel> {
    if (this.channel) return this.channel
    if (!this.connection) {
      this.connection = await amqplib.connect(this.url)
      this.connection.on('error', (err: Error) =>
        this.logger.error(`amqplib connection error：${err.message}`)
      )
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ 连接关闭')
        this.connection = undefined
        this.channel = undefined
      })
    }
    const channel = await this.connection.createChannel()
    await channel.assertQueue(RIDER_LOCATION_QUEUE, { durable: true })
    this.channel = channel
    return channel
  }
}

/**
 * 内存兜底 Publisher
 *
 * 用途：
 * - RABBITMQ_URL 未配置 / 单元测试时使用
 * - 直接调用注入的 onBatch 回调（由 consumer 注册），不经过 AMQP
 */
@Injectable()
export class InMemoryRiderLocationPublisher implements RiderLocationPublisher {
  private readonly logger = new Logger(InMemoryRiderLocationPublisher.name)
  private listener:
    | ((payloads: RiderLocationPayload[], batchId: string) => Promise<void>)
    | undefined

  /**
   * Consumer 注册自身：本进程内直接路由
   * @param listener 回调
   */
  setListener(
    listener: (payloads: RiderLocationPayload[], batchId: string) => Promise<void>
  ): void {
    this.listener = listener
  }

  /**
   * 投递（直接交给 listener；listener 缺失时只 log）
   * 参数：payloads / batchId
   * 返回值：void
   */
  async publishBatch(payloads: RiderLocationPayload[], batchId: string): Promise<void> {
    if (!this.listener) {
      this.logger.debug(
        `InMemory publish 但无 listener：batchId=${batchId} count=${payloads.length}`
      )
      return
    }
    await this.listener(payloads, batchId)
  }
}
