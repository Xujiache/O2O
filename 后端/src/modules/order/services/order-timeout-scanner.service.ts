/**
 * @file order-timeout-scanner.service.ts
 * @stage P4/T4.20（Sprint 3）
 * @desc 待支付超时扫描器：定时（10s）扫 Redis ZSet `order:paytimeout`，触发关单
 * @author 单 Agent V2.0
 *
 * 双重保障设计（任务书 §7.4）：
 *   - BullMQ delayed queue：精准 15min 触发，进程重启后任务保留（持久化）
 *   - 本扫描器：兜底 10s 一次扫 ZSet，处理 BullMQ 异常 / 漏触发 / 单元测试
 *
 * 流程：
 *   1) onApplicationBootstrap：setInterval(10000ms) 启动；进程销毁清 timer
 *   2) 每次扫描：ZRANGEBYSCORE 0 NOW LIMIT 0 50（最多 50 条）
 *   3) 顺序对每个 orderNo 调 OrderTakeoutService.cancelByTimeout
 *   4) cancelByTimeout 内部已对 status != 0 跳过，幂等安全
 *   5) 取消成功后 ZREM；失败仅 log，下次扫描会重试
 *
 * 注意：
 *   - 该扫描器是单进程职责（生产应通过 leader-election 限制只在单实例运行）；
 *     当前 Sprint 3 为单机部署，直接 setInterval 即可
 *   - 与 BullMQ processor 同时存在时，cancelByTimeout 内部幂等保证不会重复取消
 */

import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy
} from '@nestjs/common'
import type Redis from 'ioredis'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OrderTakeoutService } from './order-takeout.service'

/** 扫描间隔（10s） */
const SCAN_INTERVAL_MS = 10 * 1000
/** 单次扫描最多处理订单数 */
const SCAN_BATCH_SIZE = 50
/** 待支付超时 ZSet（与 takeout.service / processor 同源） */
const PAY_TIMEOUT_ZSET = 'order:paytimeout'

@Injectable()
export class OrderTimeoutScannerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrderTimeoutScannerService.name)
  private timer?: NodeJS.Timeout
  private running = false
  private destroyed = false

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    /* forwardRef 解耦：takeout.service 依赖本 scanner 无关；本 scanner 单向依赖 takeout */
    @Inject(forwardRef(() => OrderTakeoutService))
    private readonly takeoutService: OrderTakeoutService
  ) {}

  /**
   * 启动定时扫描
   */
  onApplicationBootstrap(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.runOnce()
    }, SCAN_INTERVAL_MS)
    this.logger.log(`OrderTimeoutScanner 已启动 intervalMs=${SCAN_INTERVAL_MS}`)
  }

  /**
   * 销毁时清 timer
   */
  onModuleDestroy(): void {
    this.destroyed = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /**
   * 单次扫描（公开供测试 / 手动触发）
   * 返回值：本次取消成功的订单数
   */
  async runOnce(): Promise<number> {
    if (this.running) return 0
    this.running = true
    let canceled = 0
    try {
      const now = Date.now()
      const orderNos = await this.redis
        .zrangebyscore(PAY_TIMEOUT_ZSET, 0, now, 'LIMIT', 0, SCAN_BATCH_SIZE)
        .catch((err: unknown) => {
          this.logger.warn(
            `[SCAN] ZRANGEBYSCORE ${PAY_TIMEOUT_ZSET} 失败：${(err as Error).message}`
          )
          return [] as string[]
        })
      if (orderNos.length === 0) return 0

      for (const orderNo of orderNos) {
        if (this.destroyed) break
        try {
          const ok = await this.takeoutService.cancelByTimeout(orderNo)
          /* 不论 ok=true（真取消）还是 ok=false（已支付/已取消），都从 ZSet 移除 */
          await this.redis.zrem(PAY_TIMEOUT_ZSET, orderNo).catch(() => undefined)
          if (ok) canceled++
        } catch (err) {
          this.logger.error(
            `[SCAN] 取消订单 ${orderNo} 失败：${(err as Error).message}（保留在 ZSet 等待下次重试）`
          )
        }
      }
      if (canceled > 0) {
        this.logger.log(`[SCAN] 本轮关单 ${canceled}/${orderNos.length}`)
      }
    } finally {
      this.running = false
    }
    return canceled
  }
}
