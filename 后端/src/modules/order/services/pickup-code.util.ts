/**
 * @file pickup-code.util.ts
 * @stage P4/T4.18 + T4.21（Sprint 3）
 * @desc 取件码生成 / Redis 存取 / 校验工具（Injectable，被 OrderErrandService + RiderActionService 注入）
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 设计：
 *   - 6 位纯数字（避开 000000 + 全 9，便于客服口述）
 *   - 生成时 Redis SETEX `pickup:code:{orderNo}` TTL 30 天（订单超期后自动清理）
 *   - 跑腿订单同时落库到 order_errand.pickup_code 列（骑手在没有 Redis 时仍可手动核验）
 *   - 外卖订单：order_takeout 表无 pickup_code 列；本期"以 Redis 为准"。Subagent 1 在
 *     创建外卖订单时通过本工具同样写入 Redis 即可（同 key 格式）。
 *   - 校验：getRedis 与传入 code 比较；不一致抛 BIZ_OPERATION_FORBIDDEN 10012；缺失抛 10010 资源不存在
 *
 * 安全：
 *   - 不在日志中明文打印 pickup code（仅打印 orderNo + 命中/不命中）
 *   - Redis 失败时降级为业务异常（不静默放行）；上层捕获后给前端 "服务繁忙，稍后再试"
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { randomInt } from 'crypto'
import type Redis from 'ioredis'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** Redis 取件码 key */
export const PICKUP_CODE_KEY = (orderNo: string): string => `pickup:code:${orderNo}`

/** TTL：30 天（订单创建到完结的最长合理生命周期） */
export const PICKUP_CODE_TTL_SECONDS = 30 * 24 * 3600

/** 6 位数字范围 [100000, 999999]，避开前导 0 与全 0 */
const CODE_MIN_INCLUSIVE = 100000
const CODE_MAX_EXCLUSIVE = 1000000

@Injectable()
export class PickupCodeUtil {
  private readonly logger = new Logger(PickupCodeUtil.name)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 生成 6 位取件码并写入 Redis（SETEX）
   * 参数：orderNo 18 位订单号
   * 返回值：6 位数字字符串
   * 用途：跑腿/外卖下单成功后立即调用；服务端按此码校验骑手取件
   */
  async generateAndStore(orderNo: string): Promise<string> {
    const code = this.randomCode()
    try {
      await this.redis.set(PICKUP_CODE_KEY(orderNo), code, 'EX', PICKUP_CODE_TTL_SECONDS)
    } catch (err) {
      this.logger.error(`Redis 写入取件码失败 orderNo=${orderNo}：${(err as Error).message}`)
      throw new BusinessException(BizErrorCode.SYSTEM_REDIS_ERROR, '取件码生成失败，请稍后再试')
    }
    this.logger.log(
      `生成取件码 orderNo=${orderNo}（6 位 已写 Redis，TTL ${PICKUP_CODE_TTL_SECONDS}s）`
    )
    return code
  }

  /**
   * 校验取件码与订单一致
   * 参数：orderNo / inputCode
   * 返回值：void（不一致抛 BIZ_OPERATION_FORBIDDEN）
   *
   * 异常：
   *   - 10010 BIZ_RESOURCE_NOT_FOUND   取件码不存在或已过期
   *   - 10012 BIZ_OPERATION_FORBIDDEN  取件码不一致
   *   - 10001 PARAM_INVALID            inputCode 非 6 位数字
   *   - 50004 SYSTEM_REDIS_ERROR       Redis 异常
   */
  async verify(orderNo: string, inputCode: string): Promise<void> {
    if (!inputCode || !/^[0-9]{6}$/.test(inputCode)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '取件码必须为 6 位数字')
    }
    let saved: string | null
    try {
      saved = await this.redis.get(PICKUP_CODE_KEY(orderNo))
    } catch (err) {
      this.logger.error(`Redis 读取取件码失败 orderNo=${orderNo}：${(err as Error).message}`)
      throw new BusinessException(BizErrorCode.SYSTEM_REDIS_ERROR, '取件码校验失败，请稍后再试')
    }
    if (!saved) {
      this.logger.warn(`取件码不存在 / 已过期 orderNo=${orderNo}`)
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '取件码不存在或已过期')
    }
    if (saved !== inputCode) {
      this.logger.warn(`取件码不一致 orderNo=${orderNo}（命中=N）`)
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '取件码错误')
    }
    this.logger.log(`取件码校验通过 orderNo=${orderNo}（命中=Y）`)
  }

  /**
   * 校验通过后清理 Redis 取件码（取件成功后立即作废，避免重放）
   * 参数：orderNo
   * 返回值：void（best-effort，失败仅 warn）
   */
  async invalidate(orderNo: string): Promise<void> {
    try {
      await this.redis.del(PICKUP_CODE_KEY(orderNo))
    } catch (err) {
      this.logger.warn(
        `Redis 删除取件码失败 orderNo=${orderNo}：${(err as Error).message}（不影响业务）`
      )
    }
  }

  /**
   * 生成 6 位随机码（密码学安全）
   * 范围 [100000, 999999]，避免前导 0 与全 0
   */
  private randomCode(): string {
    const n = randomInt(CODE_MIN_INCLUSIVE, CODE_MAX_EXCLUSIVE)
    return n.toString()
  }
}
