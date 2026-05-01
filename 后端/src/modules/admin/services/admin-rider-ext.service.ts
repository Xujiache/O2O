/**
 * @file admin-rider-ext.service.ts
 * @stage P9 Sprint 4 / W4.C.1 + W4.C.2
 * @desc 管理后台骑手扩展服务：轨迹回放（TimescaleDB）+ 奖惩规则 / 等级配置（sys_config 持久化）
 * @author Sprint4-Agent C
 *
 * 设计：
 *   1. queryTrack：注入 MapService，复用其 queryTrack(riderId, orderNo, fromTs, toTs)
 *      轨迹查询逻辑；返回 GeoJSON LineString + properties (ts/distance/speed)
 *   2. listReward / saveReward / deleteReward：从 sys_config 读取 dispatch.reward_rules
 *      (JSON 数组)，更新后通过 INSERT ... ON DUPLICATE KEY UPDATE 写回 + 清缓存
 *   3. listLevel / saveLevel / deleteLevel：同上，key=dispatch.level_config
 *
 * 注：SysConfigService 现版本仅暴露 get/getMany/invalidate；写入路径直走 dataSource，
 *     与 SysConfigModule 的 @Global 注入保持兼容（A 集成时不需要扩展 SysConfigService）。
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { DataSource } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { MapService } from '@/modules/map/map.service'
import { SysConfigService } from '@/modules/system/sys-config.service'

/** sys_config 键 */
const SYS_KEY_REWARD_RULES = 'dispatch.reward_rules'
const SYS_KEY_LEVEL_CONFIG = 'dispatch.level_config'

/** 轨迹结果（GeoJSON LineString + 元信息） */
export interface RiderTrackResult {
  riderId: string
  orderNo: string
  pointCount: number
  geometry: { type: 'LineString'; coordinates: number[][] }
  timestamps: number[]
  properties: {
    startMs: number
    endMs: number
    totalDistanceM: number
    avgSpeedKmh: number
  }
}

/** 奖惩规则 */
export interface RewardRule {
  id: string
  type: 'punish' | 'reward'
  name: string
  threshold: number
  /** 金额（字符串，BigNumber 兼容） */
  amount: string
  enabled: boolean
}

/** 等级配置 */
export interface LevelConfigItem {
  level: number
  name: string
  condition: Record<string, unknown>
  weight: number
}

@Injectable()
export class AdminRiderExtService {
  private readonly logger = new Logger(AdminRiderExtService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sysConfig: SysConfigService,
    private readonly mapService: MapService
  ) {}

  /* ============================================================================
   * 一、轨迹回放
   * ============================================================================ */

  /**
   * 查询骑手轨迹（按订单 + 可选时间窗口）
   * 参数：riderId 骑手 ID；orderNo 订单号；startTs / endTs 毫秒时间戳（可选）
   * 返回值：GeoJSON LineString（含 timestamps + summary properties）
   * 错误：
   *   - PARAM_INVALID + 400 当 riderId 或 orderNo 缺失
   *   - SYSTEM_DB_ERROR + 502 当 TimescaleDB 查询失败（透传 MapService 异常）
   */
  async queryTrack(
    riderId: string,
    orderNo: string,
    startTs?: number,
    endTs?: number
  ): Promise<RiderTrackResult> {
    if (!riderId || !orderNo) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'riderId / orderNo 必填',
        HttpStatus.BAD_REQUEST
      )
    }
    const fromIso =
      startTs != null && Number.isFinite(Number(startTs))
        ? new Date(Number(startTs)).toISOString()
        : undefined
    const toIso =
      endTs != null && Number.isFinite(Number(endTs))
        ? new Date(Number(endTs)).toISOString()
        : undefined

    const result = await this.mapService.queryTrack(riderId, orderNo, fromIso, toIso)
    return {
      riderId: result.riderId,
      orderNo: result.orderNo,
      pointCount: result.pointCount,
      geometry: result.geometry,
      timestamps: result.timestamps,
      properties: {
        startMs: result.properties.startMs,
        endMs: result.properties.endMs,
        totalDistanceM: result.properties.totalDistanceM,
        avgSpeedKmh: result.properties.avgSpeedKmh
      }
    }
  }

  /* ============================================================================
   * 二、奖惩规则（reward_rules）
   * ============================================================================ */

  /**
   * 奖惩规则列表
   */
  async listReward(): Promise<RewardRule[]> {
    return this.readArrayConfig<RewardRule>(SYS_KEY_REWARD_RULES)
  }

  /**
   * 新增 / 更新奖惩规则（按 id 匹配；缺 id 当作新增并补 id）
   * 参数：rule RewardRule（id 可选）
   * 返回值：写入后的完整列表
   */
  async saveReward(rule: Partial<RewardRule>): Promise<RewardRule[]> {
    if (!rule || !rule.type || !rule.name) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'reward 规则缺少 type / name',
        HttpStatus.BAD_REQUEST
      )
    }
    if (rule.amount == null || !this.isValidAmount(rule.amount)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'reward.amount 非法',
        HttpStatus.BAD_REQUEST
      )
    }
    const list = await this.readArrayConfig<RewardRule>(SYS_KEY_REWARD_RULES)
    const id = rule.id && rule.id.trim() ? rule.id : this.makeId()
    const next: RewardRule = {
      id,
      type: rule.type,
      name: rule.name,
      threshold: Number(rule.threshold ?? 0) || 0,
      amount: new BigNumber(rule.amount).toFixed(2),
      enabled: rule.enabled !== false
    }
    const idx = list.findIndex((r) => r.id === id)
    if (idx >= 0) list[idx] = next
    else list.push(next)
    await this.writeArrayConfig(SYS_KEY_REWARD_RULES, list)
    return list
  }

  /**
   * 删除奖惩规则
   * 参数：id 规则 ID
   * 返回值：写入后的剩余列表
   */
  async deleteReward(id: string): Promise<RewardRule[]> {
    if (!id) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'reward.id 必填',
        HttpStatus.BAD_REQUEST
      )
    }
    const list = await this.readArrayConfig<RewardRule>(SYS_KEY_REWARD_RULES)
    const next = list.filter((r) => r.id !== id)
    await this.writeArrayConfig(SYS_KEY_REWARD_RULES, next)
    return next
  }

  /* ============================================================================
   * 三、等级配置（level_config）
   * ============================================================================ */

  /**
   * 等级配置列表
   */
  async listLevel(): Promise<LevelConfigItem[]> {
    return this.readArrayConfig<LevelConfigItem>(SYS_KEY_LEVEL_CONFIG)
  }

  /**
   * 新增 / 更新等级配置（按 level 匹配）
   */
  async saveLevel(item: Partial<LevelConfigItem>): Promise<LevelConfigItem[]> {
    if (!item || typeof item.level !== 'number' || !item.name) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'level / name 必填',
        HttpStatus.BAD_REQUEST
      )
    }
    const list = await this.readArrayConfig<LevelConfigItem>(SYS_KEY_LEVEL_CONFIG)
    const next: LevelConfigItem = {
      level: item.level,
      name: item.name,
      condition: item.condition ?? {},
      weight: typeof item.weight === 'number' ? item.weight : 1
    }
    const idx = list.findIndex((r) => r.level === next.level)
    if (idx >= 0) list[idx] = next
    else list.push(next)
    list.sort((a, b) => a.level - b.level)
    await this.writeArrayConfig(SYS_KEY_LEVEL_CONFIG, list)
    return list
  }

  /**
   * 删除等级配置
   */
  async deleteLevel(level: number): Promise<LevelConfigItem[]> {
    if (typeof level !== 'number' || !Number.isFinite(level)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'level 必填', HttpStatus.BAD_REQUEST)
    }
    const list = await this.readArrayConfig<LevelConfigItem>(SYS_KEY_LEVEL_CONFIG)
    const next = list.filter((r) => r.level !== level)
    await this.writeArrayConfig(SYS_KEY_LEVEL_CONFIG, next)
    return next
  }

  /* ============================================================================
   * 内部：sys_config 数组读写
   * ============================================================================ */

  /**
   * 读 sys_config 数组配置（命中 SysConfigService.get 缓存）
   */
  private async readArrayConfig<T>(key: string): Promise<T[]> {
    const raw = await this.sysConfig.get<T[]>(key, [])
    return Array.isArray(raw) ? raw : []
  }

  /**
   * 写 sys_config 数组：INSERT ... ON DUPLICATE KEY UPDATE 后清 Redis 缓存
   *   - SysConfigService 当前未提供 set；按文件头注释直接写表 + invalidate
   */
  private async writeArrayConfig<T>(key: string, value: T[]): Promise<void> {
    const json = JSON.stringify(value ?? [])
    try {
      await this.dataSource.query(
        `INSERT INTO sys_config (config_key, config_value, is_deleted, created_at, updated_at)
         VALUES (?, ?, 0, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value),
                                 is_deleted = 0,
                                 updated_at = NOW(3)`,
        [key, json]
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`sys_config 写入失败 key=${key}：${msg}`)
      throw new BusinessException(
        BizErrorCode.SYSTEM_DB_ERROR,
        `sys_config 写入失败：${msg}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
    await this.sysConfig.invalidate(key).catch(() => {
      /* 缓存清理失败不阻塞业务，5min TTL 后自动过期 */
    })
  }

  /** 简单 ID 生成：时间戳 + 4 位随机 */
  private makeId(): string {
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)
      .toString(36)
      .padStart(3, '0')}`
  }

  /** 金额合法性：可被 BigNumber 解析且非负 */
  private isValidAmount(v: string | number): boolean {
    try {
      const bn = new BigNumber(v)
      return bn.isFinite() && bn.isGreaterThanOrEqualTo(0)
    } catch {
      return false
    }
  }
}
