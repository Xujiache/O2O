/**
 * @file dlq-retry-log.entity.ts
 * @stage P9 Sprint 3 / W3.B.2
 * @desc TypeORM Entity：dlq_retry_log —— DLQ 自动重试日志（对齐 14_dlq_retry_log.sql）
 * @author 单 Agent V2.0（Sprint 3 Agent B）
 *
 * 用途：
 *   1) BullMQ orchestration-dlq Processor 接收 saga-failed job 时落库
 *   2) DlqRetryProcessor 按状态/next_retry_at 调度自动重试
 *   3) 管理后台 admin-dlq.controller 分页查询 / 手动重试 / 丢弃
 *
 * 与 saga_state 区别：
 *   - saga_state 是"运行态"快照（每步落 context_json）
 *   - dlq_retry_log 是"失败后"重试视角（status / retry_count / next_retry_at）
 *
 * 状态机：
 *   - 0 PENDING            初始/重试中
 *   - 1 RETRY_OK           重试成功
 *   - 2 PERMANENT_FAILED   3 次重试仍失败 → 触发钉钉告警
 *   - 3 DISCARDED          管理员手动丢弃
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * DLQ 重试日志状态枚举
 */
export const DlqRetryLogStatusEnum = {
  PENDING: 0,
  RETRY_OK: 1,
  PERMANENT_FAILED: 2,
  DISCARDED: 3
} as const

/** DLQ 重试日志状态字面量 */
export type DlqRetryLogStatus = (typeof DlqRetryLogStatusEnum)[keyof typeof DlqRetryLogStatusEnum]

/**
 * DLQ 自动重试日志实体
 */
@Entity({ name: 'dlq_retry_log' })
@Index('idx_status_next_retry', ['status', 'nextRetryAt'])
@Index('idx_saga_id', ['sagaId'])
export class DlqRetryLog {
  @PrimaryColumn({
    name: 'id',
    type: 'bigint',
    comment: '主键（雪花字符串数值）'
  })
  id!: string

  @Column({
    name: 'saga_id',
    type: 'varchar',
    length: 64,
    comment: '原 saga 实例 ID'
  })
  sagaId!: string

  @Column({
    name: 'saga_name',
    type: 'varchar',
    length: 64,
    comment: 'Saga 名'
  })
  sagaName!: string

  @Column({
    name: 'source',
    type: 'varchar',
    length: 32,
    comment: '事件源：order / payment / cron / manual'
  })
  source!: string

  @Column({
    name: 'event_name',
    type: 'varchar',
    length: 64,
    comment: '事件名'
  })
  eventName!: string

  @Column({
    name: 'failed_step',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '失败步骤名'
  })
  failedStep!: string | null

  @Column({
    name: 'error',
    type: 'text',
    nullable: true,
    comment: '首次落库时的错误信息'
  })
  error!: string | null

  @Column({
    name: 'body_json',
    type: 'json',
    nullable: true,
    comment: '原始事件 body 快照'
  })
  bodyJson!: Record<string, unknown> | null

  @Column({
    name: 'status',
    type: 'tinyint',
    default: 0,
    comment: '0 PENDING / 1 RETRY_OK / 2 PERMANENT_FAILED / 3 DISCARDED'
  })
  status!: number

  @Column({
    name: 'retry_count',
    type: 'int',
    default: 0,
    comment: '已重试次数'
  })
  retryCount!: number

  @Column({
    name: 'next_retry_at',
    type: 'datetime',
    nullable: true,
    comment: '下次重试时刻（NULL 表示无需再试）'
  })
  nextRetryAt!: Date | null

  @Column({
    name: 'last_error',
    type: 'text',
    nullable: true,
    comment: '最近一次失败原因（覆盖式）'
  })
  lastError!: string | null

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '创建时间'
  })
  createdAt!: Date

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: '更新时间'
  })
  updatedAt!: Date
}
