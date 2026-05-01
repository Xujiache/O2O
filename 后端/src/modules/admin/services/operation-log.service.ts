/**
 * @file operation-log.service.ts
 * @stage P9 Sprint 3 / W3.D.1
 * @desc 管理后台操作日志持久化服务（OperationLogInterceptor 调用入口）
 * @author Sprint3-Agent D
 *
 * 与 user/services/operation-log.service.ts（write API）共存：
 *   - user 域的 OperationLogService.write 仍由各业务 service 主动写日志（旧链路）
 *   - 本服务 writeLog 由 OperationLogInterceptor 自动埋点 admin 写操作（新链路）
 *
 * 行为：
 *   1. payload > 64KB 自动截断，标记 truncated=true
 *   2. 任何异常都吞掉仅 logger.error，绝不阻断业务
 *   3. id 用 SnowflakeId.next；createdAt/updatedAt 由 BaseEntity 字段强制写入
 *   4. trace_id 字段在数据库迁移 15_operation_log_extend.sql 添加；entity 暂未声明该字段
 *      ⇒ 暂存到 requestParams._traceId 兜底（避免改 entity 引发跨域影响）
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OperationLog } from '@/entities'
import { SnowflakeId } from '@/utils'

/** 单条 payload 体最大字节数（64 KB） */
const MAX_PAYLOAD_BYTES = 64 * 1024

/**
 * writeLog 入参
 *
 * 字段：
 *   - adminId    管理员 ID（必填）
 *   - adminName  管理员名（可选；接 CurrentUser('username') 取）
 *   - action     业务动作（与 user 域 module 不同：本字段是路由动作如 'audit'/'create'）
 *   - resource   资源类型（如 'merchant'/'order'/'banner'）
 *   - resourceId 资源主键（可选）
 *   - method     HTTP method
 *   - path       请求路径（不含 query）
 *   - payload    请求 body（可选；脱敏后）
 *   - result     'SUCCESS' | 'FAIL'（默认 SUCCESS）
 *   - errorMsg   失败信息（可选）
 *   - ip         客户端 IP 字符串
 *   - userAgent  User-Agent
 *   - traceId    链路追踪 ID（X-Trace-Id；entity 字段缺失时回退到 requestParams._traceId）
 */
export interface WriteAdminLogInput {
  adminId: string
  adminName?: string
  action: string
  resource: string
  resourceId?: string
  method: string
  path: string
  payload?: Record<string, unknown>
  result?: 'SUCCESS' | 'FAIL'
  errorMsg?: string
  ip?: string
  userAgent?: string
  traceId?: string
}

/**
 * 管理后台操作日志服务（拦截器入口）
 */
@Injectable()
export class OperationLogService {
  private readonly logger = new Logger(OperationLogService.name)

  constructor(
    @InjectRepository(OperationLog)
    private readonly repo: Repository<OperationLog>
  ) {}

  /**
   * 写一条 admin 操作日志（best-effort，吞异常）
   *
   * 参数：input 拦截器组装的字段
   * 返回值：Promise<void>（异常仅日志，不抛）
   */
  async writeLog(input: WriteAdminLogInput): Promise<void> {
    try {
      const safeParams = this.buildPayloadParams(input.payload, input.traceId)
      const ip = this.toIpBuffer(input.ip)
      const entity = this.repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        opAdminId: input.adminId,
        opAdminName: input.adminName ?? null,
        module: this.deriveModule(input.path),
        action: input.action,
        resourceType: input.resource,
        resourceId: input.resourceId ?? null,
        description: `${input.method} ${input.path}`,
        requestMethod: input.method,
        requestUrl: input.path,
        requestParams: safeParams,
        responseCode: null,
        clientIp: ip,
        userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
        costMs: null,
        isSuccess: input.result === 'FAIL' ? 0 : 1,
        errorMsg: input.errorMsg ? input.errorMsg.slice(0, 1000) : null,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      await this.repo.save(entity)
    } catch (err) {
      this.logger.error(
        `[ADMIN-OPLOG] persist failed admin=${input.adminId} action=${input.action} ` +
          `${input.method} ${input.path} err=${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 把 payload 序列化 + 截断；附加 traceId（entity 字段缺失兜底）
   *
   * 参数：payload 原 body / traceId 链路 ID
   * 返回值：requestParams 对象（DB JSON 列）
   */
  private buildPayloadParams(
    payload: Record<string, unknown> | undefined,
    traceId: string | undefined
  ): Record<string, unknown> | null {
    if (!payload && !traceId) return null
    const base: Record<string, unknown> = {}
    if (payload) {
      try {
        const json = JSON.stringify(payload)
        if (json.length > MAX_PAYLOAD_BYTES) {
          base.body = json.slice(0, MAX_PAYLOAD_BYTES)
          base.truncated = true
        } else {
          base.body = payload
        }
      } catch (err) {
        base.body = null
        base.serializeError = err instanceof Error ? err.message : String(err)
      }
    }
    if (traceId) base._traceId = traceId
    return base
  }

  /**
   * IP 字符串 → varbinary(16)（IPv4 / IPv6）
   * 失败回退 null
   */
  private toIpBuffer(ip: string | undefined): Buffer | null {
    if (!ip) return null
    try {
      /* IPv4 a.b.c.d */
      if (ip.includes('.') && !ip.includes(':')) {
        const parts = ip.split('.').map((p) => Number(p))
        if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
          return Buffer.from(parts)
        }
      }
      /* 退化保存为 utf8 字符串前 16 字节（避免 column overflow） */
      return Buffer.from(ip, 'utf8').subarray(0, 16)
    } catch {
      return null
    }
  }

  /**
   * 从 path 推导 module 字段（admin 日志按二级路径归类）
   * 如 /admin/merchant/x/audit → 'merchant'
   *    /api/v1/admin/system/role → 'system'
   */
  private deriveModule(path: string): string {
    const segs = path.replace(/^\/+/, '').split('/').filter(Boolean)
    const idx = segs.indexOf('admin')
    if (idx >= 0 && segs[idx + 1]) return segs[idx + 1]!
    return segs[0] ?? 'admin'
  }
}
