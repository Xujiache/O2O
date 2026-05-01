/**
 * @file api-log.entity.ts
 * @stage P9 Sprint 5 / W5.A.3
 * @desc D10.4 api_log —— 接口请求日志（对齐 10_system.sql 第 4 张表）
 * @author Sprint 5 Agent A
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

@Entity({ name: 'api_log' })
@Index('idx_path_status_created', ['path', 'statusCode', 'createdAt'])
@Index('idx_caller_created', ['callerType', 'callerId', 'createdAt'])
@Index('idx_status_cost', ['statusCode', 'costMs'])
@Index('idx_trace_id', ['traceId'])
@Index('idx_created_at', ['createdAt'])
export class ApiLog extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true })
  id!: string

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  traceId!: string | null

  @Column({ name: 'caller_type', type: 'tinyint', unsigned: true })
  callerType!: number

  @Column({ name: 'caller_id', type: 'bigint', unsigned: true, nullable: true })
  callerId!: string | null

  @Column({ name: 'terminal', type: 'varchar', length: 32, nullable: true })
  terminal!: string | null

  @Column({ name: 'method', type: 'varchar', length: 8 })
  method!: string

  @Column({ name: 'path', type: 'varchar', length: 500 })
  path!: string

  @Column({ name: 'query', type: 'varchar', length: 2000, nullable: true })
  query!: string | null

  @Column({ name: 'body_summary', type: 'json', nullable: true })
  bodySummary!: Record<string, unknown> | null

  @Column({ name: 'status_code', type: 'int' })
  statusCode!: number

  @Column({ name: 'cost_ms', type: 'int', unsigned: true })
  costMs!: number

  @Column({ name: 'response_size', type: 'int', unsigned: true, nullable: true })
  responseSize!: number | null

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null

  @Column({ name: 'error_msg', type: 'varchar', length: 1000, nullable: true })
  errorMsg!: string | null

  @Column({ name: 'client_ip', type: 'varbinary', length: 16, nullable: true })
  clientIp!: Buffer | null

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null
}
