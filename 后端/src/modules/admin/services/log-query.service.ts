/**
 * @file log-query.service.ts
 * @stage P9 Sprint 5 / W5.A.3（消化 L8-09 真后端日志查询）
 * @desc 操作日志 / API 日志真后端聚合查询
 * @author Sprint 5 Agent A
 *
 * 用途：admin-system.controller `GET /admin/system/operation-log/list` / `/api-log/list`
 *
 * 查询特性：
 *   - 时间范围（startAt / endAt）
 *   - 关键字模糊（admin name / module / action / path / trace_id）
 *   - 按 admin / caller / status_code / error_code 精确筛
 *   - 分页 + 总数
 *   - 默认按 created_at DESC + 最大 200 行限制
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiLog, OperationLog } from '@/entities'
import { makePageResult, type PageResult } from '@/common'

/**
 * 操作日志查询参数
 */
export interface OperationLogQuery {
  page?: number
  pageSize?: number
  /** 模糊匹配 op_admin_name / module / action / resource_id / description */
  keyword?: string
  /** 精确：操作管理员 ID */
  opAdminId?: string
  /** 精确：模块 */
  module?: string
  /** 精确：动作 */
  action?: string
  /** 时间范围（ISO 字符串或 Date） */
  startAt?: string | Date
  endAt?: string | Date
}

/**
 * API 日志查询参数
 */
export interface ApiLogQuery {
  page?: number
  pageSize?: number
  /** 模糊匹配 path / trace_id / error_msg */
  keyword?: string
  /** 精确：链路 ID */
  traceId?: string
  /** 精确：调用方类型 1~5 */
  callerType?: number
  /** 精确：调用方 ID */
  callerId?: string
  /** 精确：HTTP method */
  method?: string
  /** 状态码筛选：>=400 表示错误 */
  statusCode?: number
  /** 是否仅看错误（status >= 400） */
  errorOnly?: boolean
  /** 时间范围 */
  startAt?: string | Date
  endAt?: string | Date
}

/** 单页最大行数硬限制（防大数据查询） */
const HARD_PAGE_SIZE_LIMIT = 200

@Injectable()
export class LogQueryService {
  private readonly logger = new Logger(LogQueryService.name)

  constructor(
    @InjectRepository(OperationLog)
    private readonly operationLogRepo: Repository<OperationLog>,
    @InjectRepository(ApiLog)
    private readonly apiLogRepo: Repository<ApiLog>
  ) {}

  /**
   * 查询操作日志
   * @returns PageResult<OperationLog>（含 total / list / meta）
   */
  async queryOperationLogs(query: OperationLogQuery): Promise<PageResult<OperationLog>> {
    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize)
    const qb = this.operationLogRepo.createQueryBuilder('l').where('l.is_deleted = 0')

    if (query.keyword) {
      qb.andWhere(
        '(l.op_admin_name LIKE :k OR l.module LIKE :k OR l.action LIKE :k OR l.resource_id LIKE :k OR l.description LIKE :k)',
        { k: `%${query.keyword}%` }
      )
    }
    if (query.opAdminId) qb.andWhere('l.op_admin_id = :id', { id: query.opAdminId })
    if (query.module) qb.andWhere('l.module = :m', { m: query.module })
    if (query.action) qb.andWhere('l.action = :a', { a: query.action })
    if (query.startAt) qb.andWhere('l.created_at >= :s', { s: this.toDate(query.startAt) })
    if (query.endAt) qb.andWhere('l.created_at <= :e', { e: this.toDate(query.endAt) })

    qb.orderBy('l.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    try {
      const [rows, total] = await qb.getManyAndCount()
      return makePageResult(rows, total, page, pageSize)
    } catch (err) {
      this.logger.error(
        `[LogQuery] operation_log 查询失败：${err instanceof Error ? err.message : String(err)}`
      )
      return makePageResult<OperationLog>([], 0, page, pageSize)
    }
  }

  /**
   * 查询 API 日志
   * @returns PageResult<ApiLog>
   */
  async queryApiLogs(query: ApiLogQuery): Promise<PageResult<ApiLog>> {
    const page = this.normalizePage(query.page)
    const pageSize = this.normalizePageSize(query.pageSize)
    const qb = this.apiLogRepo.createQueryBuilder('l').where('l.is_deleted = 0')

    if (query.keyword) {
      qb.andWhere('(l.path LIKE :k OR l.trace_id LIKE :k OR l.error_msg LIKE :k)', {
        k: `%${query.keyword}%`
      })
    }
    if (query.traceId) qb.andWhere('l.trace_id = :tid', { tid: query.traceId })
    if (query.callerType !== undefined) qb.andWhere('l.caller_type = :ct', { ct: query.callerType })
    if (query.callerId) qb.andWhere('l.caller_id = :cid', { cid: query.callerId })
    if (query.method) qb.andWhere('l.method = :method', { method: query.method.toUpperCase() })
    if (query.statusCode !== undefined) qb.andWhere('l.status_code = :sc', { sc: query.statusCode })
    if (query.errorOnly) qb.andWhere('l.status_code >= 400')
    if (query.startAt) qb.andWhere('l.created_at >= :s', { s: this.toDate(query.startAt) })
    if (query.endAt) qb.andWhere('l.created_at <= :e', { e: this.toDate(query.endAt) })

    qb.orderBy('l.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    try {
      const [rows, total] = await qb.getManyAndCount()
      return makePageResult(rows, total, page, pageSize)
    } catch (err) {
      this.logger.error(
        `[LogQuery] api_log 查询失败：${err instanceof Error ? err.message : String(err)}`
      )
      return makePageResult<ApiLog>([], 0, page, pageSize)
    }
  }

  private normalizePage(p: number | undefined): number {
    const n = Number(p)
    if (!Number.isFinite(n) || n < 1) return 1
    return Math.floor(n)
  }

  private normalizePageSize(ps: number | undefined): number {
    const n = Number(ps)
    if (!Number.isFinite(n) || n < 1) return 20
    return Math.min(Math.floor(n), HARD_PAGE_SIZE_LIMIT)
  }

  private toDate(input: string | Date): Date {
    return input instanceof Date ? input : new Date(input)
  }
}
