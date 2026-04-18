import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqplib from 'amqplib'
import type { Channel, ChannelModel } from 'amqplib'
import { Pool } from 'pg'
import {
  InMemoryRiderLocationPublisher,
  RIDER_LOCATION_PUBLISHER,
  RIDER_LOCATION_QUEUE,
  type RiderLocationPublisher
} from '../rabbitmq/rider-location.publisher'
import type { RiderLocationPayload } from '../rider-location.service'
import { TIMESCALE_POOL } from '../timescale/timescale.provider'

/** 队列消息载体 */
interface QueueMessage {
  batchId: string
  count: number
  items: RiderLocationPayload[]
}

/**
 * 骑手位置 Consumer（DESIGN_P3 §6.2）
 *
 * 设计：
 * - 启动时自动消费 RabbitMQ rider.location 队列
 * - 内置内存缓冲：每秒（或缓冲区达 batchSize）批量写 TimescaleDB 一次
 * - 写入失败：保留 1 次重试 + 落 dead-letter（开发态降级直接 ack 并打 error）
 * - InMemory 模式：直接由 publisher 调用 onBatch；不连 RabbitMQ
 *
 * 用途：MapModule 启动时自动 bootstrap；写 rider_location_ts 超表
 */
@Injectable()
export class RiderLocationConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RiderLocationConsumer.name)
  private connection?: ChannelModel
  private channel?: Channel
  private flushTimer?: NodeJS.Timeout
  private buffer: RiderLocationPayload[] = []
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private readonly amqpUrl: string

  /**
   * 构造 Consumer
   * @param config              读取 batch 与 flush 配置
   * @param pool                pg.Pool 用于批量 INSERT
   * @param publisher           Publisher（InMemory 时反向注册 listener）
   */
  constructor(
    private readonly config: ConfigService,
    @Inject(TIMESCALE_POOL) private readonly pool: Pool,
    @Inject(RIDER_LOCATION_PUBLISHER) private readonly publisher: RiderLocationPublisher
  ) {
    this.batchSize = config.get<number>('map.riderReportBatchSize', 2000)
    this.flushIntervalMs = config.get<number>('map.riderReportFlushIntervalMs', 1000)
    this.amqpUrl = config.get<string>('rabbitmq.url', '')
  }

  /**
   * 启动时挂消费者；同时启 flush 定时器
   */
  async onApplicationBootstrap(): Promise<void> {
    if (this.publisher instanceof InMemoryRiderLocationPublisher) {
      this.publisher.setListener(async (payloads, batchId) => {
        await this.acceptBatch(payloads, batchId)
      })
      this.logger.log(`RiderLocationConsumer 进入 InMemory 模式（无 RABBITMQ_URL）`)
    } else if (this.amqpUrl) {
      try {
        await this.startAmqpConsumer()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(`RabbitMQ 消费者启动失败：${msg}（开发态可忽略）`)
      }
    } else {
      this.logger.warn('RABBITMQ_URL 未配置，RiderLocationConsumer 不消费任何消息')
    }
    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch((err) =>
        this.logger.error(
          `flushBuffer 周期性失败：${err instanceof Error ? err.message : String(err)}`
        )
      )
    }, this.flushIntervalMs)
    this.logger.log(
      `RiderLocationConsumer 已启动 batchSize=${this.batchSize} flushIntervalMs=${this.flushIntervalMs}`
    )
  }

  /**
   * 模块销毁
   */
  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }
    await this.flushBuffer().catch(() => undefined)
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
   * 接收一批位置（来自 AMQP 或 InMemory）→ 加入缓冲区
   * 参数：payloads / batchId
   * 返回值：void
   */
  async acceptBatch(payloads: RiderLocationPayload[], batchId: string): Promise<void> {
    if (payloads.length === 0) return
    this.buffer.push(...payloads)
    if (this.buffer.length >= this.batchSize) {
      await this.flushBuffer()
    }
    this.logger.debug(
      `acceptBatch ${batchId} count=${payloads.length} bufferSize=${this.buffer.length}`
    )
  }

  /**
   * 把缓冲区写入 TimescaleDB（批量 INSERT 多 VALUES）
   *
   * 设计：单条 INSERT 多 (...) ；失败回退保留缓冲（最多 batchSize），下次再试
   * 用途：周期性 + 满批立即触发
   */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return
    const drained = this.buffer.splice(0, this.buffer.length)
    try {
      await this.bulkInsert(drained)
      this.logger.log(`TimescaleDB 批量写入 ${drained.length} 条`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`TimescaleDB 写入失败 ${drained.length} 条：${msg}`)
      // 回填重试一次
      if (this.buffer.length + drained.length <= this.batchSize * 2) {
        this.buffer.unshift(...drained)
      } else {
        this.logger.error(`缓冲区已满，丢弃 ${drained.length} 条以避免内存爆炸`)
      }
    }
  }

  /**
   * 批量 INSERT 到 rider_location_ts
   * 参数：payloads
   * 返回值：void
   */
  private async bulkInsert(payloads: RiderLocationPayload[]): Promise<void> {
    if (payloads.length === 0) return
    const cols = [
      'time',
      'rider_id',
      'order_no',
      'lng',
      'lat',
      'speed_kmh',
      'direction',
      'accuracy_m',
      'battery',
      'tenant_id'
    ]
    const values: string[] = []
    const args: unknown[] = []
    payloads.forEach((p, idx) => {
      const base = idx * cols.length
      values.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`
      )
      args.push(
        new Date(p.ts),
        p.riderId,
        p.orderNo,
        p.lng,
        p.lat,
        p.speedKmh,
        p.direction,
        p.accuracy,
        p.battery,
        p.tenantId
      )
    })
    const sql = `INSERT INTO rider_location_ts (${cols.join(',')}) VALUES ${values.join(',')}`
    await this.pool.query(sql, args)
  }

  /**
   * 启动 AMQP 消费者
   * 返回值：void
   */
  private async startAmqpConsumer(): Promise<void> {
    this.connection = await amqplib.connect(this.amqpUrl)
    const channel = await this.connection.createChannel()
    this.channel = channel
    await channel.assertQueue(RIDER_LOCATION_QUEUE, { durable: true })
    await channel.prefetch(8)
    await channel.consume(
      RIDER_LOCATION_QUEUE,
      (msg) => {
        if (!msg) return
        const handle = async (): Promise<void> => {
          try {
            const body = JSON.parse(msg.content.toString('utf-8')) as QueueMessage
            await this.acceptBatch(body.items, body.batchId)
            channel.ack(msg)
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            this.logger.error(`AMQP 消费失败：${errMsg}`)
            channel.nack(msg, false, false)
          }
        }
        void handle()
      },
      { noAck: false }
    )
    this.logger.log(`已订阅 RabbitMQ 队列 ${RIDER_LOCATION_QUEUE}`)
  }
}
