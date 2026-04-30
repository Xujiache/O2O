/**
 * @file saga-state.service.ts
 * @stage P9 Sprint 2 / W2.B.2（P9-P1-09）
 * @desc Saga 状态持久化服务：create / load / save / markCompleted / markFailed / findStuckSagas
 * @author 单 Agent V2.0（Sprint 2 Agent B）
 *
 * 用法（被 SagaRunnerService 注入）：
 *   1) 启动 saga：create({ sagaId, sagaType, context })
 *   2) 每步前：const state = await load(sagaId)（可选；回放时使用）
 *   3) 每步后：save(sagaId, { stepIdx, context })
 *   4) 全部完成：markCompleted(sagaId)
 *   5) 任一步失败（saga-runner 已落 DLQ）：markFailed(sagaId, errorMsg)
 *   6) 启动时：findStuckSagas() 扫描 status=0 且 updated_at < now-staleAfterMs 的卡住 saga
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { SagaState, SagaStateStatusEnum } from '@/entities'

/* ============================================================================
 * 类型 / 常量
 * ============================================================================ */

/** create 入参 */
export interface CreateSagaStateInput {
  /** Saga 实例 ID（雪花字符串） */
  sagaId: string
  /** Saga 类型（OrderPaidSaga / OrderCanceledSaga / ...） */
  sagaType: string
  /** 业务上下文初始快照 */
  context: Record<string, unknown>
}

/** save 入参（partial 更新） */
export interface SaveSagaStateInput {
  /** 当前步骤索引 */
  stepIdx?: number
  /** 业务上下文快照（覆盖式） */
  context?: Record<string, unknown>
  /** 状态值（默认保持不变；用于补偿中标记） */
  status?: number
  /** 失败原因 */
  errorMsg?: string | null
}

/** 默认 stuck 阈值：5 分钟未更新视为卡住 */
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000

/* ============================================================================
 * 服务
 * ============================================================================ */

@Injectable()
export class SagaStateService {
  private readonly logger = new Logger(SagaStateService.name)

  constructor(
    @InjectRepository(SagaState)
    private readonly repo: Repository<SagaState>
  ) {}

  /**
   * 创建一条 Saga 状态记录（启动 saga 时调用）
   * 参数：input { sagaId, sagaType, context }
   * 返回值：创建后的 SagaState（含 createdAt）
   * 行为：status=0（进行中），stepIdx=0；context 落 JSON 列
   */
  async create(input: CreateSagaStateInput): Promise<SagaState> {
    const entity = this.repo.create({
      sagaId: input.sagaId,
      sagaType: input.sagaType,
      status: SagaStateStatusEnum.RUNNING,
      stepIdx: 0,
      contextJson: this.safeContext(input.context),
      errorMsg: null,
      tenantId: 1,
      isDeleted: 0
    })
    return this.repo.save(entity)
  }

  /**
   * 加载指定 sagaId 的状态记录
   * 参数：sagaId 雪花字符串
   * 返回值：SagaState 或 null（不存在）
   */
  async load(sagaId: string): Promise<SagaState | null> {
    return this.repo.findOne({ where: { sagaId, isDeleted: 0 } })
  }

  /**
   * 保存进度（partial）
   * 参数：sagaId / partial（stepIdx / context / status / errorMsg）
   * 返回值：void
   * 行为：仅更新传入的字段；其他字段保持；updated_at 由 DB ON UPDATE 自动刷新
   */
  async save(sagaId: string, partial: SaveSagaStateInput): Promise<void> {
    const update: QueryDeepPartialEntity<SagaState> = {}
    if (partial.stepIdx !== undefined) update.stepIdx = partial.stepIdx
    if (partial.context !== undefined) {
      update.contextJson = this.safeContext(partial.context) as QueryDeepPartialEntity<
        Record<string, unknown>
      >
    }
    if (partial.status !== undefined) update.status = partial.status
    if (partial.errorMsg !== undefined) update.errorMsg = partial.errorMsg
    if (Object.keys(update).length === 0) return
    await this.repo.update({ sagaId, isDeleted: 0 }, update)
  }

  /**
   * 标记 saga 已完成（status=1）
   * 参数：sagaId
   * 返回值：void
   */
  async markCompleted(sagaId: string): Promise<void> {
    await this.repo.update(
      { sagaId, isDeleted: 0 },
      { status: SagaStateStatusEnum.COMPLETED, errorMsg: null }
    )
  }

  /**
   * 标记 saga 失败（status=2 + errorMsg）
   * 参数：sagaId / errorMsg
   * 返回值：void
   */
  async markFailed(sagaId: string, errorMsg: string): Promise<void> {
    const truncated = errorMsg.length > 500 ? errorMsg.slice(0, 500) : errorMsg
    await this.repo.update(
      { sagaId, isDeleted: 0 },
      { status: SagaStateStatusEnum.FAILED, errorMsg: truncated }
    )
  }

  /**
   * 扫描卡住的 saga：status=0（进行中）且 updated_at < now - staleAfterMs
   * 参数：staleAfterMs 卡住阈值（毫秒）；默认 5min
   * 返回值：SagaState[]（最近更新时间倒序，最多 100 条）
   * 用途：服务启动 / 定时巡检 → 把卡住的 saga 写运维告警 / OperationLog；不自动续跑
   */
  async findStuckSagas(staleAfterMs: number = DEFAULT_STALE_AFTER_MS): Promise<SagaState[]> {
    const cutoff = new Date(Date.now() - Math.max(0, staleAfterMs))
    return this.repo.find({
      where: {
        status: SagaStateStatusEnum.RUNNING,
        isDeleted: 0,
        updatedAt: LessThan(cutoff)
      },
      order: { updatedAt: 'DESC' },
      take: 100
    })
  }

  /* ==========================================================================
   * 内部
   * ========================================================================== */

  /**
   * 上下文 JSON 安全化：复用 saga-runner.safeJson 思路
   * 参数：input 任意 object
   * 返回值：可序列化的浅拷贝；失败时返回 {}（避免阻塞 saga）
   */
  private safeContext(input: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(input)) as Record<string, unknown>
    } catch (err) {
      this.logger.warn(
        `[saga-state] context 序列化失败，回退空对象：${err instanceof Error ? err.message : String(err)}`
      )
      return {}
    }
  }
}
