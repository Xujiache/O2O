/**
 * @file operation-log.entity.ts
 * @stage P3 / T3.12
 * @desc D10.3 operation_log —— 操作日志（对齐 10_system.sql 第 3 张表）
 * @author 员工 B（admin/blacklist 服务写入操作日志依赖；员工 C 的 file_meta 已在 ./file-meta.entity.ts）
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

@Entity({ name: 'operation_log' })
@Index('idx_admin_created', ['opAdminId', 'createdAt'])
@Index('idx_module_action_created', ['module', 'action', 'createdAt'])
@Index('idx_resource', ['resourceType', 'resourceId'])
@Index('idx_created_at', ['createdAt'])
export class OperationLog extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true })
  id!: string

  @Column({ name: 'op_admin_id', type: 'bigint', unsigned: true })
  opAdminId!: string

  @Column({ name: 'op_admin_name', type: 'varchar', length: 64, nullable: true })
  opAdminName!: string | null

  @Column({ name: 'module', type: 'varchar', length: 64 })
  module!: string

  @Column({ name: 'action', type: 'varchar', length: 64 })
  action!: string

  @Column({ name: 'resource_type', type: 'varchar', length: 64, nullable: true })
  resourceType!: string | null

  @Column({ name: 'resource_id', type: 'varchar', length: 64, nullable: true })
  resourceId!: string | null

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true })
  description!: string | null

  @Column({ name: 'request_method', type: 'varchar', length: 8, nullable: true })
  requestMethod!: string | null

  @Column({ name: 'request_url', type: 'varchar', length: 500, nullable: true })
  requestUrl!: string | null

  @Column({ name: 'request_params', type: 'json', nullable: true })
  requestParams!: Record<string, unknown> | null

  @Column({ name: 'response_code', type: 'int', nullable: true })
  responseCode!: number | null

  @Column({ name: 'client_ip', type: 'varbinary', length: 16, nullable: true })
  clientIp!: Buffer | null

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null

  @Column({ name: 'cost_ms', type: 'int', unsigned: true, nullable: true })
  costMs!: number | null

  @Column({ name: 'is_success', type: 'tinyint', unsigned: true, default: 1 })
  isSuccess!: number

  @Column({ name: 'error_msg', type: 'varchar', length: 1000, nullable: true })
  errorMsg!: string | null
}
