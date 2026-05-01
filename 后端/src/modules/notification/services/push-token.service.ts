/**
 * @file push-token.service.ts
 * @stage P9 Sprint 5 / W5.E.3
 * @desc push_token 表服务：register / unregister / heartbeat / cleanInactive / findActiveByUser
 * @author Agent E (P9 Sprint 5)
 *
 * 设计要点：
 *   - 主键雪花字符串，UPSERT 由（user_id + user_type + platform + device_id）唯一键保障
 *   - 软删使用 is_deleted（0 有效 / 1 已注销 / 2 不活跃清理）
 *   - 心跳仅更新 last_active_at；register 兼容已存在 → 更新 last_active_at + registration_id
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, LessThan, Repository } from 'typeorm'
import { PushToken, PushTokenDeletedEnum } from '@/entities'
import { SnowflakeId } from '@/utils/snowflake-id'

/* ============================================================================
 * 输入 / 输出 类型
 * ============================================================================ */

/** register 入参 */
export interface PushTokenRegisterInput {
  userId: string
  /** 1 user / 2 merchant / 3 rider */
  userType: number
  /** ios | android | mp */
  platform: string
  registrationId: string
  deviceId?: string
  appVersion?: string
}

/** register / unregister / heartbeat 返回 */
export interface PushTokenOpResult {
  ok: boolean
  /** 操作影响的记录 id（register 时可空字符串表示新建） */
  id?: string
  message?: string
}

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class PushTokenService {
  private readonly logger = new Logger(PushTokenService.name)

  constructor(
    @InjectRepository(PushToken)
    private readonly repo: Repository<PushToken>
  ) {}

  /* ============================================================================
   * 1. 注册（UPSERT）
   * ============================================================================ */

  /**
   * 注册推送 token
   * 行为：
   *   - 已存在（user_id + user_type + platform + device_id 唯一键命中）→
   *     更新 registration_id / app_version / last_active_at / is_deleted=0
   *   - 不存在 → 新建
   *
   * 参数：input PushTokenRegisterInput
   * 返回值：PushTokenOpResult
   */
  async register(input: PushTokenRegisterInput): Promise<PushTokenOpResult> {
    if (!input.userId || !input.registrationId || !input.platform) {
      return { ok: false, message: 'param_empty' }
    }
    const deviceId = input.deviceId ?? ''
    /* P9 Sprint 5 / W5.A.4 fix：
       PushToken.deviceId 列类型 `string | null`，但 TypeORM FindOptionsWhere
       不接受 `string | null` 联合（仅 string | FindOperator<string> | undefined）；
       通过 as 桥接 IsNull() FindOperator → 类型安全收口 */
    const existing = await this.repo.findOne({
      where: {
        userId: input.userId,
        userType: input.userType,
        platform: input.platform,
        deviceId: (deviceId ? deviceId : IsNull()) as unknown as string
      }
    })

    const now = new Date()
    if (existing) {
      existing.registrationId = input.registrationId
      existing.appVersion = input.appVersion ?? existing.appVersion
      existing.lastActiveAt = now
      existing.isDeleted = PushTokenDeletedEnum.ACTIVE
      await this.repo.save(existing)
      return { ok: true, id: existing.id, message: 'updated' }
    }

    const entity = this.repo.create({
      id: SnowflakeId.next(),
      userId: input.userId,
      userType: input.userType,
      platform: input.platform,
      registrationId: input.registrationId,
      deviceId: deviceId || null,
      appVersion: input.appVersion ?? null,
      createdAt: now,
      lastActiveAt: now,
      isDeleted: PushTokenDeletedEnum.ACTIVE
    })
    await this.repo.save(entity)
    return { ok: true, id: entity.id, message: 'created' }
  }

  /* ============================================================================
   * 2. 注销（软删）
   * ============================================================================ */

  /**
   * 注销推送 token（软删）
   * 行为：
   *   - 指定 deviceId → 仅注销该设备
   *   - 未指定 deviceId → 注销该用户所有设备
   *
   * 参数：userId / userType / deviceId?
   * 返回值：PushTokenOpResult，message 内含影响行数
   */
  async unregister(
    userId: string,
    userType: number,
    deviceId?: string
  ): Promise<PushTokenOpResult> {
    if (!userId) return { ok: false, message: 'param_empty' }

    const qb = this.repo
      .createQueryBuilder()
      .update(PushToken)
      .set({ isDeleted: PushTokenDeletedEnum.UNREGISTERED, lastActiveAt: new Date() })
      .where('user_id = :uid', { uid: userId })
      .andWhere('user_type = :ut', { ut: userType })
      .andWhere('is_deleted = 0')

    if (deviceId) {
      qb.andWhere('device_id = :did', { did: deviceId })
    }

    const r = await qb.execute()
    const affected = (r.affected as number | undefined) ?? 0
    return { ok: true, message: `affected_${affected}` }
  }

  /* ============================================================================
   * 3. 心跳
   * ============================================================================ */

  /**
   * 心跳：更新 last_active_at（不动 registration_id）
   * 参数：userId / userType / deviceId?
   * 返回值：PushTokenOpResult
   */
  async heartbeat(userId: string, userType: number, deviceId?: string): Promise<PushTokenOpResult> {
    if (!userId) return { ok: false, message: 'param_empty' }

    const qb = this.repo
      .createQueryBuilder()
      .update(PushToken)
      .set({ lastActiveAt: new Date() })
      .where('user_id = :uid', { uid: userId })
      .andWhere('user_type = :ut', { ut: userType })
      .andWhere('is_deleted = 0')

    if (deviceId) {
      qb.andWhere('device_id = :did', { did: deviceId })
    }

    const r = await qb.execute()
    const affected = (r.affected as number | undefined) ?? 0
    return { ok: true, message: `affected_${affected}` }
  }

  /* ============================================================================
   * 4. 清理不活跃 token（定时任务用）
   * ============================================================================ */

  /**
   * 清理 N 天不活跃 token（软删 is_deleted=2）
   * 参数：daysAgo 默认 30
   * 返回值：被清理的记录数
   */
  async cleanInactive(daysAgo = 30): Promise<number> {
    const threshold = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    const r = await this.repo
      .createQueryBuilder()
      .update(PushToken)
      .set({ isDeleted: PushTokenDeletedEnum.CLEANED_INACTIVE })
      .where({ lastActiveAt: LessThan(threshold) })
      .andWhere('is_deleted = 0')
      .execute()
    const affected = (r.affected as number | undefined) ?? 0
    if (affected > 0) {
      this.logger.log(`[PushTokenService.cleanInactive] daysAgo=${daysAgo} affected=${affected}`)
    }
    return affected
  }

  /* ============================================================================
   * 5. 查询用户当前活跃 tokens
   * ============================================================================ */

  /**
   * 查询用户当前所有活跃 token（NotificationService 推送时使用）
   * 参数：userId / userType
   * 返回值：PushToken[]
   */
  async findActiveByUser(userId: string, userType: number): Promise<PushToken[]> {
    if (!userId) return []
    return this.repo.find({
      where: {
        userId,
        userType,
        isDeleted: PushTokenDeletedEnum.ACTIVE
      },
      order: { lastActiveAt: 'DESC' }
    })
  }
}
