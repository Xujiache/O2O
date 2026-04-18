/**
 * @file operation-log.service.ts
 * @stage P3/T3.12（员工 B 范围；组长占位协调）
 * @desc 管理后台写操作日志服务（最小占位）
 * @stub-by 员工 A（组长协调）—— 员工 B 在 T3.12 完成 admin.service.ts 时
 *           import 了本 service，但未提交其实现；为不阻塞 build，组长在
 *           本期提供最小 NestJS Provider 占位，仅打印 logger.log，不入库。
 *           员工 B 后续应：
 *             1. 创建 D10 域 operation_log entity
 *             2. 把本占位替换为真正的 Repository.save 实现
 *             3. 接入 RabbitMQ message.push 队列做异步落盘（DESIGN_P3 §3）
 *
 * 接口契约（与 admin.service.ts 调用面对齐）：
 *   write({ opAdminId, module, action, resourceType, resourceId, description }) → Promise<void>
 */

import { Injectable, Logger } from '@nestjs/common'

/**
 * 写操作日志入参
 * 字段：
 *   - opAdminId    操作管理员 ID（必填）
 *   - module       模块名（admin/merchant/rider/order/finance/cs/risk/operation/system）
 *   - action       动作（create/update/delete/audit/export/ban/unban 等）
 *   - resourceType 资源类型（user/merchant/rider/admin/role/order/...）
 *   - resourceId   资源主键（雪花 ID 字符串）
 *   - description  人类可读描述（中文）
 *   - extra        可选扩展字段（IP / UA / 请求体 hash 等）
 */
export interface WriteOperationLogInput {
  opAdminId: string
  module: string
  action: string
  resourceType: string
  /** 资源主键；针对 IP/设备类黑名单可能为 null，故允许 null 占位 */
  resourceId: string | null
  description: string
  extra?: Record<string, unknown>
}

/**
 * 操作日志服务（最小占位）
 * 用途：被 admin.service / merchant.service 等管理后台 service 注入使用
 */
@Injectable()
export class OperationLogService {
  private readonly logger = new Logger(OperationLogService.name)

  /**
   * 写一条操作日志
   * 参数：input WriteOperationLogInput
   * 返回值：Promise<void>
   * 用途：管理后台写操作之前调用（异常不抛出，避免影响主业务）
   */
  async write(input: WriteOperationLogInput): Promise<void> {
    /* 占位实现：仅 log；后续 B 替换为 operation_log 表入库 */
    this.logger.log(
      `[OPLOG] op=${input.opAdminId} mod=${input.module} act=${input.action} ` +
        `${input.resourceType}#${input.resourceId} ${input.description}`
    )
    return Promise.resolve()
  }
}
