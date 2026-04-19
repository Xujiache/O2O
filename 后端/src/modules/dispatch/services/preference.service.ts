/**
 * @file preference.service.ts
 * @stage P4/T4.37（Sprint 6）
 * @desc 骑手接单偏好 CRUD（GET / PUT /rider/preference）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 数据来源：MySQL rider_preference（uk_rider_id 唯一）
 *
 * 默认偏好（首次访问无记录时按 06_dispatch.sql 定义）：
 *   - acceptMode = 1（系统派单）
 *   - acceptRadiusM = 3000
 *   - acceptTakeout / acceptErrand = 1
 *   - errandTypes = null（任何子类型都接）
 *   - acceptMaxConcurrent = 5
 *   - voiceEnabled = 1
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RiderPreference } from '@/entities'
import { SnowflakeId } from '@/utils'
import { type GetPreferenceVo, type UpdatePreferenceDto } from '../dto/preference.dto'

/* ============================================================================
 * 默认偏好
 * ============================================================================ */

const DEFAULT_ACCEPT_MODE = 1
const DEFAULT_ACCEPT_RADIUS_M = 3000
const DEFAULT_ACCEPT_TAKEOUT = 1
const DEFAULT_ACCEPT_ERRAND = 1
const DEFAULT_ACCEPT_MAX_CONCURRENT = 5
const DEFAULT_VOICE_ENABLED = 1

@Injectable()
export class PreferenceService {
  private readonly logger = new Logger(PreferenceService.name)

  constructor(
    @InjectRepository(RiderPreference)
    private readonly preferenceRepo: Repository<RiderPreference>
  ) {}

  /* ============================================================================
   * 取偏好（不存在则返回默认 + 自动 INSERT）
   * ============================================================================ */

  /**
   * 查询骑手偏好（首次返回默认 + 持久化）
   * 参数：riderId
   * 返回值：GetPreferenceVo
   */
  async getOrCreate(riderId: string): Promise<GetPreferenceVo> {
    let entity = await this.preferenceRepo.findOne({
      where: { riderId, isDeleted: 0 }
    })
    if (!entity) {
      const now = new Date()
      entity = this.preferenceRepo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        riderId,
        acceptMode: DEFAULT_ACCEPT_MODE,
        acceptRadiusM: DEFAULT_ACCEPT_RADIUS_M,
        acceptTakeout: DEFAULT_ACCEPT_TAKEOUT,
        acceptErrand: DEFAULT_ACCEPT_ERRAND,
        errandTypes: null,
        acceptMaxConcurrent: DEFAULT_ACCEPT_MAX_CONCURRENT,
        voiceEnabled: DEFAULT_VOICE_ENABLED,
        isDeleted: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      try {
        await this.preferenceRepo.save(entity)
      } catch (err) {
        /* 并发首次访问可能 unique 冲突 → 重试一次 */
        this.logger.warn(
          `首次落库偏好失败 rider=${riderId}：${err instanceof Error ? err.message : String(err)}`
        )
        const fetched = await this.preferenceRepo.findOne({
          where: { riderId, isDeleted: 0 }
        })
        if (fetched) entity = fetched
      }
    }
    return this.toVo(entity)
  }

  /* ============================================================================
   * 更新偏好（部分字段；找不到则创建）
   * ============================================================================ */

  /**
   * 更新偏好
   * 参数：riderId / dto
   * 返回值：GetPreferenceVo
   */
  async update(riderId: string, dto: UpdatePreferenceDto): Promise<GetPreferenceVo> {
    let entity = await this.preferenceRepo.findOne({
      where: { riderId, isDeleted: 0 }
    })
    if (!entity) {
      await this.getOrCreate(riderId)
      entity = await this.preferenceRepo.findOne({
        where: { riderId, isDeleted: 0 }
      })
    }
    if (!entity) {
      throw new Error('骑手偏好初始化失败')
    }
    if (dto.acceptMode !== undefined) entity.acceptMode = dto.acceptMode
    if (dto.acceptRadiusM !== undefined) entity.acceptRadiusM = dto.acceptRadiusM
    if (dto.acceptTakeout !== undefined) entity.acceptTakeout = dto.acceptTakeout
    if (dto.acceptErrand !== undefined) entity.acceptErrand = dto.acceptErrand
    if (dto.errandTypes !== undefined) {
      entity.errandTypes = dto.errandTypes.length > 0 ? Array.from(new Set(dto.errandTypes)) : null
    }
    if (dto.acceptMaxConcurrent !== undefined) entity.acceptMaxConcurrent = dto.acceptMaxConcurrent
    if (dto.voiceEnabled !== undefined) entity.voiceEnabled = dto.voiceEnabled
    entity.updatedAt = new Date()
    await this.preferenceRepo.save(entity)
    return this.toVo(entity)
  }

  /* ============================================================================
   * Helper
   * ============================================================================ */

  private toVo(entity: RiderPreference): GetPreferenceVo {
    return {
      riderId: entity.riderId,
      acceptMode: entity.acceptMode,
      acceptRadiusM: entity.acceptRadiusM,
      acceptTakeout: entity.acceptTakeout,
      acceptErrand: entity.acceptErrand,
      errandTypes: entity.errandTypes,
      acceptMaxConcurrent: entity.acceptMaxConcurrent,
      voiceEnabled: entity.voiceEnabled
    }
  }
}
