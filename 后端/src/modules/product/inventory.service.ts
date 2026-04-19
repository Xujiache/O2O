/**
 * @file inventory.service.ts
 * @stage P4/T4.6（Sprint 1）
 * @desc Redis Lua 原子库存扣减 + DB CAS 兜底
 * @author 单 Agent V2.0
 *
 * 设计依据：
 *   - DESIGN_P4 §3.2 Product 库存操作
 *   - CONSENSUS_P4 §2.2 库存扣减规则
 *   - ACCEPTANCE_P4 V4.5：并发 100 笔，stock=50 → 必须 50 成功 50 失败
 *
 * 三层语义（写路径）：
 *   1) 下单（preCheck/createOrder）→ deduct() → Redis Lua 原子 DECRBY；负值/不足回滚 + 抛 10200
 *   2) 支付成功 → commit() → MySQL CAS UPDATE；行数不匹配则抛错由数据修复 Job 兜底
 *   3) 取消 / 退款 → restore() → Redis 加回 + Order 编排层负责 DB 加回
 *
 * 关键 Redis Key（对齐 DESIGN_P4 §3.2 + 规范命名）：
 *   stock:sku:{skuId}   String   NO TTL   值=当前可下单余量；-1 表示无限库存
 *
 * 边界约定：
 *   - stock_qty = -1 表示无限库存：deduct/restore 在 Lua 层直接返回 -1，业务跳过；
 *     commit() 中若收到 -1 SKU，按任务定义的 SQL（含 OR stock_qty = -1 兜底）将
 *     允许 UPDATE 通过；调用方应在订单层避免把无限库存 SKU 传入 commit。
 *   - Lua 返回 -2（key 未初始化）→ 自动 preloadStock 回写 DB 值后重试一次；
 *     若重试仍 -2，说明 DB 中无该 SKU，抛 BIZ_RESOURCE_NOT_FOUND。
 *   - deduct 多 SKU 任一失败 → 全量恢复已扣减的 SKU；失败信息记 Logger.error，
 *     不再抛二次错误，外层异常以原始扣减失败为准。
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import Redis from 'ioredis'
import { join } from 'path'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { ProductSku } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'

/* =====================================================================
 * Lua 返回码约定（与 src/redis/lua/stock_*.lua 保持一致）
 * ===================================================================== */
/** Key 未初始化 */
const LUA_KEY_NOT_INIT = -2
/** 无限库存 */
const LUA_UNLIMITED = -1
/** 库存不足 */
const LUA_INSUFFICIENT = -3

/* =====================================================================
 * Redis Key 模板
 * ===================================================================== */
/**
 * 构造库存 Redis Key
 * 参数：skuId 商品 SKU 主键
 * 返回值：`stock:sku:{skuId}` 字符串
 * 用途：内部 Lua eval / SET / GET 统一引用
 */
const STOCK_KEY = (skuId: string): string => `stock:sku:${skuId}`

/* =====================================================================
 * 类型定义
 * ===================================================================== */

/**
 * 库存操作单项
 * 用途：deduct / restore / commit 入参
 */
export interface StockItem {
  /** SKU 主键（雪花字符串） */
  skuId: string
  /** 数量（正整数；调用侧需自校验） */
  qty: number
}

/**
 * mysql2 / pg 通用 OkPacket（仅取 affectedRows）
 */
interface UpdateResultPacket {
  affectedRows?: number
}

/**
 * 库存服务
 *
 * 单 SKU 失败要回滚已扣减的所有 SKU（try/catch 实现，避免半成品扣减）；
 * 全程使用 NestJS Logger 输出日志，并禁用 unsound 类型转换。
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name)

  /** Lua: 扣减脚本原文（构造时一次性同步加载） */
  private readonly deductScript: string
  /** Lua: 恢复脚本原文 */
  private readonly restoreScript: string

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(ProductSku) private readonly skuRepo: Repository<ProductSku>,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {
    /**
     * 同步加载 Lua 脚本：__dirname 在 src 下为 src/modules/product，
     * 上溯两级到 src/redis/lua；编译后在 dist/modules/product，
     * 同样上溯两级到 dist/redis/lua（构建产物需带 lua）。
     */
    const luaDir = join(__dirname, '..', '..', 'redis', 'lua')
    this.deductScript = readFileSync(join(luaDir, 'stock_deduct.lua'), 'utf-8')
    this.restoreScript = readFileSync(join(luaDir, 'stock_restore.lua'), 'utf-8')
  }

  /* ====================================================================
   * Public API
   * ==================================================================== */

  /**
   * 从 DB 回写 Redis 库存（首次下单或 Redis 缺 key 触发）
   *
   * 参数：skuId SKU 主键
   * 返回值：当前 Redis 已生效的库存值（DB stock_qty；若 SET 时已存在则取已存在值）
   * 用途：deduct/restore 在 Lua 返回 -2 时调用；亦可在商品上架后预热调用
   *
   * 并发保护：使用 SET NX 避免覆盖正在被其他请求扣减的 Redis 计数；
   *           NX 失败说明已被并发回写，直接读取当前值即可。
   */
  async preloadStock(skuId: string): Promise<number> {
    const sku = await this.skuRepo.findOne({ where: { id: skuId, isDeleted: 0 } })
    if (!sku) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        `SKU ${skuId} 不存在，无法初始化 Redis 库存`
      )
    }
    const stock = sku.stockQty
    const setResult = await this.redis.set(STOCK_KEY(skuId), String(stock), 'NX')
    if (setResult === 'OK') {
      this.logger.log(`[INVENTORY] preload sku=${skuId} stock=${stock}`)
      return stock
    }
    /* NX 失败：已被并发回写，读取实际生效值 */
    const current = await this.redis.get(STOCK_KEY(skuId))
    const value = current === null ? stock : Number(current)
    this.logger.debug(`[INVENTORY] preload sku=${skuId} race lost, current=${value}`)
    return value
  }

  /**
   * 原子扣减库存（下单阶段）
   *
   * 参数：items 多 SKU 扣减项数组
   * 返回值：void；失败抛 BusinessException
   *
   * 行为：
   *   1) 顺序对每个 item 执行 stock_deduct.lua；
   *   2) Lua 返回 -2 → 先 preloadStock 再重试一次；仍 -2 → 抛 BIZ_RESOURCE_NOT_FOUND；
   *   3) Lua 返回 -1（无限库存）→ 不计入回滚集合，继续下一项；
   *   4) Lua 返回 -3 → 抛 BIZ_OPERATION_FORBIDDEN '库存不足'；
   *   5) Lua 返回 >=0 → 计入回滚集合；
   *   6) 任一项失败 → 对回滚集合调 stock_restore.lua（best-effort，回滚失败仅记日志）；
   *   7) 抛出原始失败异常。
   */
  async deduct(items: StockItem[]): Promise<void> {
    if (items.length === 0) return
    const succeeded: StockItem[] = []
    try {
      for (const item of items) {
        let result = await this.evalDeduct(item.skuId, item.qty)
        if (result === LUA_KEY_NOT_INIT) {
          /* Redis 缺 key → 从 DB 回写后重试一次 */
          await this.preloadStock(item.skuId)
          result = await this.evalDeduct(item.skuId, item.qty)
        }
        if (result === LUA_KEY_NOT_INIT) {
          throw new BusinessException(
            BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
            `SKU ${item.skuId} 库存初始化失败`
          )
        }
        if (result === LUA_INSUFFICIENT) {
          throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '库存不足')
        }
        if (result === LUA_UNLIMITED) {
          /* 无限库存：不计入回滚集合，继续 */
          this.logger.debug(`[INVENTORY] deduct sku=${item.skuId} unlimited, skip Redis`)
          continue
        }
        /* result >= 0：扣减成功 */
        succeeded.push(item)
      }
    } catch (err) {
      if (succeeded.length > 0) {
        this.logger.warn(
          `[INVENTORY] deduct failed, rolling back ${succeeded.length} succeeded items`
        )
        await this.safeRollback(succeeded)
      }
      throw err
    }
  }

  /**
   * 恢复库存（取消订单 / 退款 / 数据修复）
   *
   * 参数：items 多 SKU 恢复项数组
   * 返回值：void
   *
   * 行为：
   *   1) 顺序对每个 item 执行 stock_restore.lua；
   *   2) Lua 返回 -2 → 先 preloadStock 再重试一次；仍 -2 → 抛 BIZ_RESOURCE_NOT_FOUND；
   *   3) Lua 返回 -1（无限库存）→ 忽略；
   *   4) Lua 返回 >=0 → 成功，继续下一项。
   *
   * 与 deduct 不同：restore 不做"全量回滚"，单项失败只抛错并中止剩余恢复（由调用侧重试）。
   */
  async restore(items: StockItem[]): Promise<void> {
    if (items.length === 0) return
    for (const item of items) {
      let result = await this.evalRestore(item.skuId, item.qty)
      if (result === LUA_KEY_NOT_INIT) {
        await this.preloadStock(item.skuId)
        result = await this.evalRestore(item.skuId, item.qty)
      }
      if (result === LUA_KEY_NOT_INIT) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          `SKU ${item.skuId} 库存恢复失败：DB 无对应 SKU`
        )
      }
      if (result === LUA_UNLIMITED) {
        this.logger.debug(`[INVENTORY] restore sku=${item.skuId} unlimited, skip`)
        continue
      }
      this.logger.log(`[INVENTORY] restore sku=${item.skuId} qty=${item.qty} new=${result}`)
    }
  }

  /**
   * 支付成功后实际扣减 DB 库存（CAS 兜底）
   *
   * 参数：items 多 SKU 提交项数组
   * 返回值：void；CAS 失败抛 SYSTEM_DB_ERROR（数据修复 Job 兜底）
   *
   * SQL（CAS）：
   *   UPDATE product_sku SET stock_qty = stock_qty - :qty
   *   WHERE id = :skuId AND (stock_qty >= :qty OR stock_qty = -1)
   *
   * 受影响行数累加；总数 != items.length → 抛错并回滚事务。
   * QueryRunner 包裹事务以保证多 SKU 原子。
   */
  async commit(items: StockItem[]): Promise<void> {
    if (items.length === 0) return
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      let affectedTotal = 0
      for (const item of items) {
        const raw: unknown = await queryRunner.manager.query(
          'UPDATE product_sku SET stock_qty = stock_qty - ? WHERE id = ? AND (stock_qty >= ? OR stock_qty = -1)',
          [item.qty, item.skuId, item.qty]
        )
        const packet = raw as UpdateResultPacket
        affectedTotal += packet.affectedRows ?? 0
      }
      if (affectedTotal !== items.length) {
        throw new BusinessException(
          BizErrorCode.SYSTEM_DB_ERROR,
          `库存 DB CAS 失败：期望 ${items.length} 行，实际 ${affectedTotal} 行`
        )
      }
      await queryRunner.commitTransaction()
      this.logger.log(`[INVENTORY] commit DB CAS ok, count=${items.length}`)
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * 查询 Redis 缓存中当前库存（仅查询用，不触发 DB 回写）
   *
   * 参数：skuId SKU 主键
   * 返回值：number（当前库存值；-1 表示无限）；null（Redis 无 key）
   * 用途：管理后台 / 监控 / 调试
   */
  async getCachedStock(skuId: string): Promise<number | null> {
    const value = await this.redis.get(STOCK_KEY(skuId))
    if (value === null) return null
    return Number(value)
  }

  /* ====================================================================
   * Internal helpers
   * ==================================================================== */

  /**
   * 调用 stock_deduct.lua
   * 参数：skuId / qty
   * 返回值：lua 脚本返回值（-3 / -2 / -1 / >=0）
   */
  private async evalDeduct(skuId: string, qty: number): Promise<number> {
    const raw: unknown = await this.redis.eval(this.deductScript, 1, STOCK_KEY(skuId), String(qty))
    return Number(raw)
  }

  /**
   * 调用 stock_restore.lua
   * 参数：skuId / qty
   * 返回值：lua 脚本返回值（-2 / -1 / >=0）
   */
  private async evalRestore(skuId: string, qty: number): Promise<number> {
    const raw: unknown = await this.redis.eval(this.restoreScript, 1, STOCK_KEY(skuId), String(qty))
    return Number(raw)
  }

  /**
   * deduct 失败时回滚已扣减的 SKU（best-effort，吞异常仅记日志）
   * 参数：items 已扣减成功的项
   * 返回值：void
   */
  private async safeRollback(items: StockItem[]): Promise<void> {
    for (const item of items) {
      try {
        const result = await this.evalRestore(item.skuId, item.qty)
        if (result < 0 && result !== LUA_UNLIMITED) {
          this.logger.error(
            `[INVENTORY] rollback sku=${item.skuId} qty=${item.qty} got lua=${result}`
          )
        }
      } catch (e) {
        this.logger.error(
          `[INVENTORY] rollback sku=${item.skuId} qty=${item.qty} threw: ${(e as Error).message}`
        )
      }
    }
  }
}
