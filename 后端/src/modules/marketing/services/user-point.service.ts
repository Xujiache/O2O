/**
 * @file user-point.service.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 用户积分服务：余额查询 / earn / use / freeze / unfreeze / 流水分页 / 管理调整
 *       全程 version 乐观锁 CAS（最多 3 次重试）+ 写流水
 * @author 单 Agent V2.0（Agent C）
 *
 * 数据来源：MySQL `user_point` + `user_point_flow`
 * 缓存：余额 `point:user:{userId}` String JSON TTL 60s；写后 DEL
 *
 * BizType 字典（与 07_marketing.sql 对齐）：
 *   1 下单 / 2 评价 / 3 签到 / 4 邀请 / 5 兑换 / 6 过期 / 7 调整
 *
 * CAS 算法：
 *   1) 不存在则 INSERT 初始 row（捕获唯一冲突，重新读）
 *   2) UPDATE user_point SET total_point = total_point ± ?, ..., version = version + 1
 *      WHERE user_id = ? AND version = ? AND total_point ≥ ?（扣减时）
 *   3) 受影响 0 → 重新加载 version 重试，最多 3 次；仍失败抛 SYSTEM_DB_ERROR
 *   4) INSERT user_point_flow（同一事务内）
 *
 * 注意：earn / use / freeze / unfreeze 由其他模块（订单/邀请/评价/兑换/签到）调用，
 *       本期接口已落地；事件订阅（OrderFinished 触发 earn 等）由 Sprint 8 Orchestration 接入。
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '@/common'
import { UserPoint, UserPointFlow } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import {
  AdjustPointDto,
  PointBalanceVo,
  PointFlowQueryDto,
  PointFlowVo
} from '../dto/user-point.dto'

/* =====================================================================
 * 业务类型字典（与 P2 SQL `user_point_flow.biz_type` CHECK/COMMENT 一致）
 * ===================================================================== */
/** 下单 */
const BIZ_TYPE_ORDER = 1
/** 评价 */
const BIZ_TYPE_REVIEW = 2
/** 签到 */
const BIZ_TYPE_CHECKIN = 3
/** 邀请 */
const BIZ_TYPE_INVITE = 4
/** 兑换 */
const BIZ_TYPE_EXCHANGE = 5
/** 过期 */
const BIZ_TYPE_EXPIRE = 6
/** 调整（管理端人工） */
const BIZ_TYPE_ADJUST = 7

/** EARN 合法 biz_type（direction=1 增加） */
const EARNABLE_BIZ_TYPES = new Set<number>([
  BIZ_TYPE_ORDER,
  BIZ_TYPE_REVIEW,
  BIZ_TYPE_CHECKIN,
  BIZ_TYPE_INVITE,
  BIZ_TYPE_ADJUST
])
/** USE 合法 biz_type（direction=2 扣减） */
const USABLE_BIZ_TYPES = new Set<number>([BIZ_TYPE_EXCHANGE, BIZ_TYPE_EXPIRE, BIZ_TYPE_ADJUST])

/** version 乐观锁 CAS 重试上限 */
const CAS_MAX_RETRIES = 3
/** 余额缓存 TTL */
const BALANCE_CACHE_TTL_SECONDS = 60
/** 余额缓存 Key 前缀 */
const BALANCE_CACHE_PREFIX = 'point:user:'

/**
 * 余额缓存 JSON 形态
 * 用途：getBalance() Redis 命中时反序列化
 */
interface BalanceCachePayload {
  userId: string
  totalPoint: number
  frozenPoint: number
  totalEarned: number
  totalUsed: number
}

/**
 * 受影响行数（mysql2 / pg 通用 OkPacket 子集）
 */
interface UpdateResultPacket {
  affectedRows?: number
}

@Injectable()
export class UserPointService {
  private readonly logger = new Logger(UserPointService.name)

  constructor(
    @InjectRepository(UserPoint) private readonly pointRepo: Repository<UserPoint>,
    @InjectRepository(UserPointFlow) private readonly flowRepo: Repository<UserPointFlow>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ============================================================
   *                    Public API（用户端 / 内部 / 管理端）
   * ============================================================ */

  /**
   * 查询用户积分余额（带缓存）
   * 参数：userId
   * 返回值：PointBalanceVo（用户首次查询时未建 row 时返回全 0 视图，不创建 row）
   * 用途：GET /me/points
   */
  async getBalance(userId: string): Promise<PointBalanceVo> {
    const cacheKey = `${BALANCE_CACHE_PREFIX}${userId}`
    try {
      const cached = await this.redis.get(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached) as BalanceCachePayload
        return parsed
      }
    } catch (err) {
      this.logger.warn(`[POINT] 读缓存失败 user=${userId} err=${(err as Error).message}`)
    }

    const row = await this.pointRepo.findOne({ where: { userId, isDeleted: 0 } })
    const vo: PointBalanceVo = row
      ? {
          userId: row.userId,
          totalPoint: row.totalPoint,
          frozenPoint: row.frozenPoint,
          totalEarned: row.totalEarned,
          totalUsed: row.totalUsed
        }
      : {
          userId,
          totalPoint: 0,
          frozenPoint: 0,
          totalEarned: 0,
          totalUsed: 0
        }

    try {
      await this.redis.set(cacheKey, JSON.stringify(vo), 'EX', BALANCE_CACHE_TTL_SECONDS)
    } catch (err) {
      this.logger.warn(`[POINT] 写缓存失败 user=${userId} err=${(err as Error).message}`)
    }
    return vo
  }

  /**
   * 用户端：积分流水分页（按 biz_type / direction 筛）
   * 参数：userId / query
   * 返回值：PageResult<PointFlowVo>
   * 用途：GET /me/points/flows
   */
  async listFlows(userId: string, query: PointFlowQueryDto): Promise<PageResult<PointFlowVo>> {
    const qb = this.flowRepo
      .createQueryBuilder('f')
      .where('f.user_id = :uid AND f.is_deleted = 0', { uid: userId })
    if (query.bizType !== undefined) qb.andWhere('f.biz_type = :bt', { bt: query.bizType })
    if (query.direction !== undefined) qb.andWhere('f.direction = :d', { d: query.direction })
    qb.orderBy('f.created_at', 'DESC').addOrderBy('f.id', 'DESC')
    qb.skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toFlowVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 增加积分（earn）—— version CAS 三次重试 + 写流水
   * 参数：
   *   - userId        用户 ID
   *   - point         本次增加积分（正整数）
   *   - bizType       业务类型（1 下单 / 2 评价 / 3 签到 / 4 邀请 / 7 调整）
   *   - relatedNo     关联业务单号（可空）
   *   - expireDays    本笔积分有效期天数（NULL 表示不过期；写入 expire_at 字段）
   *   - opAdminId     操作管理员 ID（biz_type=7 时使用，可空）
   * 返回值：操作后余额（number）
   * 用途：被订单/评价/签到/邀请/调整等模块调用
   */
  async earn(
    userId: string,
    point: number,
    bizType: number,
    relatedNo?: string | null,
    expireDays?: number | null,
    opAdminId?: string | null
  ): Promise<number> {
    if (!Number.isInteger(point) || point <= 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'earn: point 必须为正整数')
    }
    if (!EARNABLE_BIZ_TYPES.has(bizType)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `earn: 非法 biz_type=${bizType}（合法值：1/2/3/4/7）`
      )
    }
    const expireAt =
      expireDays && expireDays > 0 ? new Date(Date.now() + expireDays * 24 * 3600 * 1000) : null

    const balanceAfter = await this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(manager, userId)
      const updatedRow = await this.casUpdate(manager, row, {
        totalPointDelta: point,
        totalEarnedDelta: point,
        guardCondition: null
      })
      await this.insertFlow(manager, {
        userId,
        direction: 1,
        bizType,
        point,
        balanceAfter: updatedRow.totalPoint,
        relatedNo: relatedNo ?? null,
        expireAt,
        remark: null,
        opAdminId: opAdminId ?? null
      })
      return updatedRow.totalPoint
    })

    await this.invalidateBalanceCache(userId)
    this.logger.log(`[POINT] earn user=${userId} +${point} biz=${bizType} balance=${balanceAfter}`)
    return balanceAfter
  }

  /**
   * 扣减积分（use）—— 余额校验 + version CAS + 写流水
   * 参数：
   *   - userId / point / bizType（5 兑换 / 6 过期 / 7 调整）
   *   - relatedNo / opAdminId
   * 返回值：操作后余额
   * 用途：兑换 / 过期清理 / 管理调整（负向）
   */
  async use(
    userId: string,
    point: number,
    bizType: number,
    relatedNo?: string | null,
    opAdminId?: string | null
  ): Promise<number> {
    if (!Number.isInteger(point) || point <= 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'use: point 必须为正整数')
    }
    if (!USABLE_BIZ_TYPES.has(bizType)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `use: 非法 biz_type=${bizType}（合法值：5/6/7）`
      )
    }

    const balanceAfter = await this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(manager, userId)
      if (row.totalPoint < point) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '积分余额不足')
      }
      const updatedRow = await this.casUpdate(manager, row, {
        totalPointDelta: -point,
        totalUsedDelta: point,
        guardCondition: { minTotalPoint: point }
      })
      await this.insertFlow(manager, {
        userId,
        direction: 2,
        bizType,
        point,
        balanceAfter: updatedRow.totalPoint,
        relatedNo: relatedNo ?? null,
        expireAt: null,
        remark: null,
        opAdminId: opAdminId ?? null
      })
      return updatedRow.totalPoint
    })

    await this.invalidateBalanceCache(userId)
    this.logger.log(`[POINT] use user=${userId} -${point} biz=${bizType} balance=${balanceAfter}`)
    return balanceAfter
  }

  /**
   * 冻结积分（兑换提交后、回调到达前的中间态）
   * 参数：userId / point / relatedNo
   * 返回值：冻结后的 frozenPoint
   * 用途：兑换 service 调用（本期暂未接入兑换流水，提供方法以备 Sprint 8）
   */
  async freeze(userId: string, point: number, relatedNo?: string | null): Promise<number> {
    if (!Number.isInteger(point) || point <= 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'freeze: point 必须为正整数')
    }
    const newFrozen = await this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(manager, userId)
      if (row.totalPoint < point) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '可用积分不足，无法冻结')
      }
      const updatedRow = await this.casUpdate(manager, row, {
        totalPointDelta: -point,
        frozenPointDelta: point,
        guardCondition: { minTotalPoint: point }
      })
      return updatedRow.frozenPoint
    })

    await this.invalidateBalanceCache(userId)
    this.logger.log(`[POINT] freeze user=${userId} ${point} relatedNo=${relatedNo ?? '-'}`)
    return newFrozen
  }

  /**
   * 解冻积分（兑换回滚 / 回调失败补偿）
   * 参数：userId / point / relatedNo
   * 返回值：解冻后的 totalPoint（回到可用余额）
   * 用途：兑换失败 / 取消时调用
   */
  async unfreeze(userId: string, point: number, relatedNo?: string | null): Promise<number> {
    if (!Number.isInteger(point) || point <= 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'unfreeze: point 必须为正整数')
    }
    const newTotal = await this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(manager, userId)
      if (row.frozenPoint < point) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '冻结积分不足，无法解冻')
      }
      const updatedRow = await this.casUpdate(manager, row, {
        totalPointDelta: point,
        frozenPointDelta: -point,
        guardCondition: { minFrozenPoint: point }
      })
      return updatedRow.totalPoint
    })

    await this.invalidateBalanceCache(userId)
    this.logger.log(`[POINT] unfreeze user=${userId} ${point} relatedNo=${relatedNo ?? '-'}`)
    return newTotal
  }

  /**
   * 管理端积分调整（人工 +/-）
   * 参数：targetUserId / dto / opAdminId
   * 返回值：操作后余额
   * 用途：POST /admin/users/:userId/points/adjust
   */
  async adjustByAdmin(
    targetUserId: string,
    dto: AdjustPointDto,
    opAdminId: string
  ): Promise<number> {
    const delta = dto.delta
    let balanceAfter = 0
    if (delta > 0) {
      balanceAfter = await this.dataSource.transaction(async (manager) => {
        const row = await this.ensureRow(manager, targetUserId)
        const updatedRow = await this.casUpdate(manager, row, {
          totalPointDelta: delta,
          totalEarnedDelta: delta,
          guardCondition: null
        })
        await this.insertFlow(manager, {
          userId: targetUserId,
          direction: 1,
          bizType: BIZ_TYPE_ADJUST,
          point: delta,
          balanceAfter: updatedRow.totalPoint,
          relatedNo: dto.relatedNo ?? null,
          expireAt: null,
          remark: dto.reason,
          opAdminId
        })
        return updatedRow.totalPoint
      })
    } else {
      const absPoint = -delta
      balanceAfter = await this.dataSource.transaction(async (manager) => {
        const row = await this.ensureRow(manager, targetUserId)
        if (row.totalPoint < absPoint) {
          throw new BusinessException(
            BizErrorCode.BIZ_OPERATION_FORBIDDEN,
            `用户当前余额 ${row.totalPoint}，不足以扣减 ${absPoint}`
          )
        }
        const updatedRow = await this.casUpdate(manager, row, {
          totalPointDelta: -absPoint,
          totalUsedDelta: absPoint,
          guardCondition: { minTotalPoint: absPoint }
        })
        await this.insertFlow(manager, {
          userId: targetUserId,
          direction: 2,
          bizType: BIZ_TYPE_ADJUST,
          point: absPoint,
          balanceAfter: updatedRow.totalPoint,
          relatedNo: dto.relatedNo ?? null,
          expireAt: null,
          remark: dto.reason,
          opAdminId
        })
        return updatedRow.totalPoint
      })
    }

    await this.invalidateBalanceCache(targetUserId)
    await this.operationLogService.write({
      opAdminId,
      module: 'marketing',
      action: delta > 0 ? 'point_increase' : 'point_decrease',
      resourceType: 'user_point',
      resourceId: targetUserId,
      description: `调整用户 ${targetUserId} 积分 ${delta >= 0 ? '+' : ''}${delta}（${dto.reason}）`
    })
    this.logger.log(
      `[POINT] adjust admin=${opAdminId} target=${targetUserId} delta=${delta} balance=${balanceAfter}`
    )
    return balanceAfter
  }

  /* ============================================================
   *                    Internal helpers
   * ============================================================ */

  /**
   * 确保用户的 user_point row 存在（不存在则 INSERT 初始 0 行）
   * 参数：manager / userId
   * 返回值：UserPoint 实体（含最新 version）
   *
   * 行为：
   *   1) SELECT row by userId
   *   2) 不存在则 INSERT，捕获唯一冲突（uk_user_id）后重新 SELECT
   */
  private async ensureRow(manager: EntityManager, userId: string): Promise<UserPoint> {
    const repo = manager.getRepository(UserPoint)
    const existing = await repo.findOne({ where: { userId, isDeleted: 0 } })
    if (existing) return existing

    const fresh = repo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      userId,
      totalPoint: 0,
      frozenPoint: 0,
      totalEarned: 0,
      totalUsed: 0,
      version: 0,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    try {
      await repo.save(fresh)
      return fresh
    } catch (err) {
      this.logger.warn(
        `[POINT] INSERT user_point 唯一冲突 user=${userId}，重新读取：${(err as Error).message}`
      )
      const retry = await repo.findOne({ where: { userId, isDeleted: 0 } })
      if (!retry) {
        throw new BusinessException(
          BizErrorCode.SYSTEM_DB_ERROR,
          'user_point 初始化竞态后仍无法读取'
        )
      }
      return retry
    }
  }

  /**
   * version 乐观锁 CAS 更新（最多 CAS_MAX_RETRIES 次）
   *
   * 参数：
   *   - manager   事务管理器
   *   - row       当前 row（version 用作 CAS 基线，重试时自动 reload）
   *   - changes   {totalPointDelta?, frozenPointDelta?, totalEarnedDelta?, totalUsedDelta?, guardCondition?}
   *
   * 返回值：更新后的 UserPoint 实体（version 已 +1，全字段对齐）
   * 错误：CAS 重试 3 次仍失败 → SYSTEM_DB_ERROR
   *
   * SQL：
   *   UPDATE user_point SET total_point = total_point + ?, frozen_point = ..., total_earned = ...,
   *                         total_used = ..., version = version + 1, updated_at = ?
   *   WHERE id = ? AND version = ? AND is_deleted = 0
   *         [AND total_point >= ?]   -- guardCondition.minTotalPoint
   *         [AND frozen_point >= ?]  -- guardCondition.minFrozenPoint
   */
  private async casUpdate(
    manager: EntityManager,
    row: UserPoint,
    changes: {
      totalPointDelta?: number
      frozenPointDelta?: number
      totalEarnedDelta?: number
      totalUsedDelta?: number
      guardCondition: { minTotalPoint?: number; minFrozenPoint?: number } | null
    }
  ): Promise<UserPoint> {
    const totalPointDelta = changes.totalPointDelta ?? 0
    const frozenPointDelta = changes.frozenPointDelta ?? 0
    const totalEarnedDelta = changes.totalEarnedDelta ?? 0
    const totalUsedDelta = changes.totalUsedDelta ?? 0

    let current = row
    for (let attempt = 1; attempt <= CAS_MAX_RETRIES; attempt++) {
      const params: Array<string | number | Date> = [
        totalPointDelta,
        frozenPointDelta,
        totalEarnedDelta,
        totalUsedDelta,
        new Date(),
        current.id,
        current.version
      ]
      let extraSql = ''
      if (changes.guardCondition?.minTotalPoint !== undefined) {
        extraSql += ' AND total_point >= ?'
        params.push(changes.guardCondition.minTotalPoint)
      }
      if (changes.guardCondition?.minFrozenPoint !== undefined) {
        extraSql += ' AND frozen_point >= ?'
        params.push(changes.guardCondition.minFrozenPoint)
      }

      const raw: unknown = await manager.query(
        `UPDATE user_point
           SET total_point = total_point + ?,
               frozen_point = frozen_point + ?,
               total_earned = total_earned + ?,
               total_used = total_used + ?,
               version = version + 1,
               updated_at = ?
         WHERE id = ? AND version = ? AND is_deleted = 0${extraSql}`,
        params
      )
      const packet = raw as UpdateResultPacket
      if (packet.affectedRows === 1) {
        current.totalPoint = current.totalPoint + totalPointDelta
        current.frozenPoint = current.frozenPoint + frozenPointDelta
        current.totalEarned = current.totalEarned + totalEarnedDelta
        current.totalUsed = current.totalUsed + totalUsedDelta
        current.version = current.version + 1
        current.updatedAt = new Date()
        return current
      }
      this.logger.warn(
        `[POINT] CAS attempt ${attempt}/${CAS_MAX_RETRIES} 未生效 user=${current.userId} version=${current.version}，重试`
      )
      const reloaded = await manager
        .getRepository(UserPoint)
        .findOne({ where: { id: current.id, isDeleted: 0 } })
      if (!reloaded) {
        throw new BusinessException(
          BizErrorCode.SYSTEM_DB_ERROR,
          `CAS 重试时 user_point 行已不存在 user=${current.userId}`
        )
      }
      if (
        changes.guardCondition?.minTotalPoint !== undefined &&
        reloaded.totalPoint < changes.guardCondition.minTotalPoint
      ) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '积分余额不足')
      }
      if (
        changes.guardCondition?.minFrozenPoint !== undefined &&
        reloaded.frozenPoint < changes.guardCondition.minFrozenPoint
      ) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '冻结积分不足')
      }
      current = reloaded
    }
    throw new BusinessException(
      BizErrorCode.SYSTEM_DB_ERROR,
      `积分 CAS 重试 ${CAS_MAX_RETRIES} 次仍失败 user=${current.userId}`
    )
  }

  /**
   * 写一条积分流水
   * 参数：manager / 输入字段
   * 返回值：void
   */
  private async insertFlow(
    manager: EntityManager,
    input: {
      userId: string
      direction: number
      bizType: number
      point: number
      balanceAfter: number
      relatedNo: string | null
      expireAt: Date | null
      remark: string | null
      opAdminId: string | null
    }
  ): Promise<void> {
    const repo = manager.getRepository(UserPointFlow)
    const flow = repo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      userId: input.userId,
      direction: input.direction,
      bizType: input.bizType,
      point: input.point,
      balanceAfter: input.balanceAfter,
      relatedNo: input.relatedNo,
      expireAt: input.expireAt,
      remark: input.remark,
      opAdminId: input.opAdminId,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await repo.save(flow)
  }

  /**
   * 失效余额缓存（写后调用）
   */
  private async invalidateBalanceCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`${BALANCE_CACHE_PREFIX}${userId}`)
    } catch (err) {
      this.logger.warn(
        `[POINT] DEL ${BALANCE_CACHE_PREFIX}${userId} 失败：${(err as Error).message}`
      )
    }
  }

  /**
   * Entity → VO（积分流水）
   */
  private toFlowVo(e: UserPointFlow): PointFlowVo {
    return {
      id: e.id,
      userId: e.userId,
      direction: e.direction,
      bizType: e.bizType,
      point: e.point,
      balanceAfter: e.balanceAfter,
      relatedNo: e.relatedNo,
      expireAt: e.expireAt,
      remark: e.remark,
      opAdminId: e.opAdminId,
      createdAt: e.createdAt
    }
  }
}
