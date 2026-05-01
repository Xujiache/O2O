/**
 * @file admin-export.service.ts
 * @stage P9 Sprint 4 / W4.B.1
 * @desc 管理后台异步导出任务编排服务（Redis 状态 + BullMQ 投递）
 * @author 单 Agent V2.0（Sprint 4 Agent B）
 *
 * 职责：
 *   - createJob：写 Redis 状态（PENDING）+ 投递 BullMQ `admin-export-queue`
 *   - getJob   ：读 Redis 状态
 *   - cancelJob：标记 CANCELED（worker 处理时幂等检查跳过）
 *
 * 状态机：PENDING → RUNNING → SUCCESS / FAILED；任意阶段可被 cancelJob 改为 CANCELED
 *
 * Redis 键：`export:job:{jobId}` 序列化 JSON；TTL=24h
 *
 * 注意：本 service 不直接执行导出，重活在 AdminExportProcessor 内完成
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import type Redis from 'ioredis'
import { REDIS_CLIENT } from '@/health/redis.provider'

/** BullMQ 队列名：管理端导出（concurrency=2，独立 Worker） */
export const ADMIN_EXPORT_QUEUE = 'admin-export-queue'

/** BullMQ jobName */
export const ADMIN_EXPORT_JOB_NAME = 'admin-export'

/** Redis Key 前缀 */
const REDIS_KEY_PREFIX = 'export:job:'

/** Redis TTL：24h（任务最长保留时间） */
const REDIS_TTL_SEC = 24 * 3600

/** 导出业务模块（与 processor 内分发逻辑保持同步） */
export type ExportModule = 'order' | 'merchant' | 'rider' | 'finance' | string

/** 导出任务状态字面量 */
export type ExportJobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED'

/** Redis 中存储的 Job 状态结构 */
export interface ExportJobState {
  jobId: string
  status: ExportJobStatus
  module: ExportModule
  query: Record<string, unknown>
  adminId: string
  downloadUrl?: string
  errorMsg?: string
  createdAt: number
  updatedAt: number
}

/** createJob 入参 */
export interface CreateJobInput {
  module: ExportModule
  query: Record<string, unknown>
  adminId: string
}

/** BullMQ Job Payload */
export interface AdminExportJobData {
  jobId: string
  module: ExportModule
  query: Record<string, unknown>
  adminId: string
}

/** getJob 返回的对外 VO（不外泄 query） */
export interface ExportJobVo {
  status: ExportJobStatus
  downloadUrl?: string
  errorMsg?: string
}

/**
 * AdminExportService
 *
 * 用途：admin-export.controller 编排 createJob / getJob / cancelJob
 * 注入：REDIS_CLIENT + InjectQueue(ADMIN_EXPORT_QUEUE)
 */
@Injectable()
export class AdminExportService {
  private readonly logger = new Logger(AdminExportService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional()
    @InjectQueue(ADMIN_EXPORT_QUEUE)
    private readonly queue?: Queue<AdminExportJobData>
  ) {}

  /**
   * 创建导出任务：写 Redis 状态 + 投递 BullMQ
   *
   * 入参：input { module, query, adminId }
   * 返回：{ jobId } —— 18 位时间戳 + 6 位随机后缀
   *
   * 行为：
   *   1) 生成 jobId
   *   2) Redis SETEX `export:job:{jobId}` JSON.stringify(state) TTL=24h
   *   3) BullMQ queue.add（attempts=1；processor 内自行 catch + 状态机回写）
   *   4) queue 未注入或 add 异常时回写 status=FAILED + errorMsg；本 method 仍返回 jobId
   *
   * 注意：参数不做业务校验（controller / DTO 层负责）；本 method 假定 input 合法
   */
  async createJob(input: CreateJobInput): Promise<{ jobId: string }> {
    const jobId = this.genJobId()
    const now = Date.now()
    const state: ExportJobState = {
      jobId,
      status: 'PENDING',
      module: input.module,
      query: input.query ?? {},
      adminId: input.adminId,
      createdAt: now,
      updatedAt: now
    }
    await this.writeState(state)

    if (!this.queue) {
      this.logger.warn(`[admin-export] BullMQ queue 未注入，jobId=${jobId} 直接标记 FAILED`)
      await this.patchState(jobId, { status: 'FAILED', errorMsg: '导出队列未就绪' })
      return { jobId }
    }

    try {
      await this.queue.add(
        ADMIN_EXPORT_JOB_NAME,
        { jobId, module: input.module, query: input.query ?? {}, adminId: input.adminId },
        {
          attempts: 1,
          removeOnComplete: { age: 24 * 3600 },
          removeOnFail: { age: 7 * 24 * 3600 }
        }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[admin-export] enqueue 失败 jobId=${jobId}：${msg}`)
      await this.patchState(jobId, { status: 'FAILED', errorMsg: `enqueue 失败：${msg}` })
    }

    return { jobId }
  }

  /**
   * 查询导出任务状态
   * 入参：jobId
   * 返回：ExportJobVo（status / downloadUrl / errorMsg）
   *
   * 行为：
   *   - Redis 中不存在 → 返回 status=FAILED + errorMsg='任务不存在或已过期'
   */
  async getJob(jobId: string): Promise<ExportJobVo> {
    const state = await this.readState(jobId)
    if (!state) {
      return { status: 'FAILED', errorMsg: '任务不存在或已过期' }
    }
    return {
      status: state.status,
      downloadUrl: state.downloadUrl,
      errorMsg: state.errorMsg
    }
  }

  /**
   * 取消导出任务（标记 CANCELED；worker 处理时幂等跳过）
   * 入参：jobId
   * 返回：{ canceled: boolean }
   *
   * 行为：
   *   - Redis 不存在 → 返回 false
   *   - 状态已是 SUCCESS / FAILED / CANCELED → 直接返回 true（幂等）
   *   - 其余 → patchState status=CANCELED
   */
  async cancelJob(jobId: string): Promise<{ canceled: boolean }> {
    const state = await this.readState(jobId)
    if (!state) return { canceled: false }
    if (state.status === 'CANCELED' || state.status === 'SUCCESS' || state.status === 'FAILED') {
      return { canceled: true }
    }
    await this.patchState(jobId, { status: 'CANCELED' })
    return { canceled: true }
  }

  /* ==========================================================================
   * 给 Processor / 自身使用的状态读写（public 便于 processor import）
   * ========================================================================== */

  /**
   * Redis 读 state（public 供 processor 读取并做幂等校验）
   * 返回 null 表示 key 不存在或 JSON 解析失败
   */
  async readState(jobId: string): Promise<ExportJobState | null> {
    const raw = await this.redis.get(REDIS_KEY_PREFIX + jobId)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ExportJobState
    } catch (err) {
      this.logger.warn(
        `[admin-export] Redis JSON 解析失败 jobId=${jobId}：${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
  }

  /**
   * Redis 整体覆盖写（带 TTL）
   */
  async writeState(state: ExportJobState): Promise<void> {
    await this.redis.set(REDIS_KEY_PREFIX + state.jobId, JSON.stringify(state), 'EX', REDIS_TTL_SEC)
  }

  /**
   * Redis 增量更新（read → merge → write，附带刷新 TTL）
   * 注：非原子；管理端导出场景写入并发极低，可接受
   */
  async patchState(
    jobId: string,
    patch: Partial<Omit<ExportJobState, 'jobId' | 'createdAt'>>
  ): Promise<ExportJobState | null> {
    const current = await this.readState(jobId)
    if (!current) return null
    const next: ExportJobState = {
      ...current,
      ...patch,
      jobId: current.jobId,
      createdAt: current.createdAt,
      updatedAt: Date.now()
    }
    await this.writeState(next)
    return next
  }

  /**
   * 生成 jobId：14 位 yyyymmddHHMMSS + 6 位随机
   */
  private genJobId(): string {
    const d = new Date()
    const yyyy = d.getFullYear().toString()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const rand = Math.random().toString(36).slice(2, 8)
    return `${yyyy}${mm}${dd}${hh}${mi}${ss}${rand}`
  }
}
