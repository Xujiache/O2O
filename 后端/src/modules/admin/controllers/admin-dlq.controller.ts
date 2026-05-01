/**
 * @file admin-dlq.controller.ts
 * @stage P9 Sprint 3 / W3.B.2
 * @desc 管理后台 DLQ 监控：列表 / 重试 / 丢弃
 * @author 单 Agent V2.0（Sprint 3 Agent B）
 *
 * 路径前缀：/api/v1/admin/dlq
 * 鉴权：JwtAuthGuard + UserTypeGuard + PermissionGuard
 *      列表    @Permissions('biz:system:dlq:view')
 *      重试/丢弃 @Permissions('biz:system:dlq:retry')
 *
 * 注意：本 controller 仅新建文件；admin.module.ts 由 Agent D 完成 controllers 注册
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, Repository } from 'typeorm'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { DlqRetryLog, DlqRetryLogStatusEnum } from '@/entities'
import { DlqRetryProcessor } from '@/modules/orchestration/processors/dlq-retry.processor'
import { type OrchestrationDlqJob } from '@/modules/orchestration/types/orchestration.types'

/* ============================================================================
 * DTO
 * ============================================================================ */

/**
 * DLQ 列表查询参数
 */
export class DlqListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number

  /** 状态：0 PENDING / 1 RETRY_OK / 2 PERMANENT_FAILED / 3 DISCARDED */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  status?: number

  @IsOptional()
  @IsString()
  sagaName?: string

  /** 起始时间（ISO） */
  @IsOptional()
  @IsString()
  startAt?: string

  /** 截止时间（ISO） */
  @IsOptional()
  @IsString()
  endAt?: string
}

/**
 * DLQ 重试响应
 */
export interface DlqRetryResp {
  ok: boolean
  message?: string
}

/* ============================================================================
 * Controller
 * ============================================================================ */

@ApiTags('管理后台 - DLQ 监控')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@UserTypes('admin')
@Controller('admin/dlq')
export class AdminDlqController {
  constructor(
    @InjectRepository(DlqRetryLog)
    private readonly logRepo: Repository<DlqRetryLog>,
    private readonly retryProcessor: DlqRetryProcessor
  ) {}

  /* ==========================================================================
   * 列表查询
   * ========================================================================== */

  /**
   * DLQ 列表（分页 + 筛选 status / sagaName / 时间段）
   */
  @Get('list')
  @Permissions('biz:system:dlq:view')
  @ApiOperation({ summary: 'DLQ 列表（分页 + 筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  async list(@Query() query: DlqListQueryDto) {
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))

    const qb = this.logRepo.createQueryBuilder('d')
    if (query.status !== undefined) {
      qb.andWhere('d.status = :s', { s: query.status })
    }
    if (query.sagaName) {
      qb.andWhere('d.saga_name LIKE :n', { n: `%${query.sagaName}%` })
    }
    if (query.startAt && query.endAt) {
      qb.andWhere({ createdAt: Between(new Date(query.startAt), new Date(query.endAt)) })
    } else if (query.startAt) {
      qb.andWhere('d.created_at >= :sa', { sa: new Date(query.startAt) })
    } else if (query.endAt) {
      qb.andWhere('d.created_at <= :ea', { ea: new Date(query.endAt) })
    }
    qb.orderBy('d.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [rows, total] = await qb.getManyAndCount()

    return {
      records: rows.map((r) => ({
        id: r.id,
        sagaId: r.sagaId,
        sagaName: r.sagaName,
        source: r.source,
        eventName: r.eventName,
        failedStep: r.failedStep,
        status: r.status,
        statusText: this.statusText(r.status),
        retryCount: r.retryCount,
        nextRetryAt: r.nextRetryAt,
        lastError: r.lastError,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      })),
      total,
      page,
      pageSize
    }
  }

  /* ==========================================================================
   * 手动重试
   * ========================================================================== */

  /**
   * 手动重试：把记录 status 改 PENDING + 重新投递 BullMQ
   */
  @Post(':id/retry')
  @Permissions('biz:system:dlq:retry')
  @ApiOperation({ summary: '手动重试 DLQ 记录' })
  @ApiParam({ name: 'id', description: 'dlq_retry_log.id' })
  @ApiSwaggerResponse({ status: 200 })
  async retry(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string
  ): Promise<DlqRetryResp> {
    const entity = await this.logRepo.findOne({ where: { id } })
    if (!entity) {
      return { ok: false, message: 'DLQ 记录不存在' }
    }
    if (entity.status === DlqRetryLogStatusEnum.RETRY_OK) {
      return { ok: false, message: '该记录已重试成功，无需再试' }
    }
    if (entity.status === DlqRetryLogStatusEnum.DISCARDED) {
      return { ok: false, message: '该记录已被丢弃，无法重试' }
    }

    /* 更新状态：PENDING + 立即重投 */
    entity.status = DlqRetryLogStatusEnum.PENDING
    entity.nextRetryAt = new Date()
    await this.logRepo.save(entity)

    /* 重新投递 BullMQ（best-effort）；body 复用 entity 字段 */
    const job: OrchestrationDlqJob = {
      sagaId: entity.sagaId,
      sagaName: entity.sagaName,
      source: this.normalizeSource(entity.source),
      eventName: entity.eventName,
      body: entity.bodyJson,
      failedStep: entity.failedStep ?? '',
      error: entity.lastError ?? entity.error ?? '',
      executedSteps: [],
      failedAt: Date.now(),
      retryCount: entity.retryCount
    }
    const enqueued = await this.retryProcessor.enqueueRetry(job)

    /* opAdminId 留待 admin.module 注入 OperationLogService 后写日志（本期占位） */
    void opAdminId

    return enqueued
      ? { ok: true, message: '已重新投递重试队列' }
      : { ok: false, message: '重投失败（队列未就绪）' }
  }

  /* ==========================================================================
   * 手动丢弃
   * ========================================================================== */

  /**
   * 标记 DISCARDED：管理员手动放弃该 DLQ 记录
   */
  @Post(':id/discard')
  @Permissions('biz:system:dlq:retry')
  @ApiOperation({ summary: '丢弃 DLQ 记录' })
  @ApiParam({ name: 'id', description: 'dlq_retry_log.id' })
  @ApiSwaggerResponse({ status: 200 })
  async discard(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() body: { reason?: string }
  ): Promise<DlqRetryResp> {
    const entity = await this.logRepo.findOne({ where: { id } })
    if (!entity) {
      return { ok: false, message: 'DLQ 记录不存在' }
    }
    entity.status = DlqRetryLogStatusEnum.DISCARDED
    entity.nextRetryAt = null
    if (body?.reason) {
      entity.lastError = `[DISCARDED by admin=${opAdminId}] ${body.reason}`.slice(0, 1000)
    }
    await this.logRepo.save(entity)
    /* TODO admin.module 注入 OperationLogService 后写 OperationLog（本期占位） */
    void opAdminId
    return { ok: true, message: '已丢弃' }
  }

  /* ==========================================================================
   * 内部
   * ========================================================================== */

  /**
   * 状态码 → 文案
   */
  private statusText(status: number): string {
    switch (status) {
      case DlqRetryLogStatusEnum.PENDING:
        return 'PENDING'
      case DlqRetryLogStatusEnum.RETRY_OK:
        return 'RETRY_OK'
      case DlqRetryLogStatusEnum.PERMANENT_FAILED:
        return 'PERMANENT_FAILED'
      case DlqRetryLogStatusEnum.DISCARDED:
        return 'DISCARDED'
      default:
        return `UNKNOWN(${status})`
    }
  }

  /**
   * 把 source 字符串归一为 EventSource 字面量
   */
  private normalizeSource(s: string): OrchestrationDlqJob['source'] {
    if (s === 'order' || s === 'payment' || s === 'cron' || s === 'manual') return s
    return 'manual'
  }
}
