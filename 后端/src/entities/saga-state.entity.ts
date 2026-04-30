/**
 * @file saga-state.entity.ts
 * @stage P9 Sprint 2 / W2.B.2（P9-P1-09）
 * @desc TypeORM Entity：saga_state —— Saga 状态持久化（对齐 12_saga_state.sql）
 * @author 单 Agent V2.0（Sprint 2 Agent B）
 *
 * 用途：解决 SagaRunner 仅维持内存状态的风险；服务重启 / 崩溃后可：
 *   1) findStuckSagas 扫描 status=0 且 updated_at 过老的卡住 saga
 *   2) 通过 context_json 重放业务上下文（人工补偿）
 *
 * 设计要点：
 *   - 主键直接使用 saga_id（雪花字符串），无独立 id 列
 *   - status 取值：0 进行中 / 1 已完成 / 2 失败 / 3 补偿中
 *   - context_json 由 service 层负责序列化（避免 BullMQ 循环引用，复用 saga-runner 的 safeJson 风格）
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * Saga 状态值常量
 */
export const SagaStateStatusEnum = {
  RUNNING: 0,
  COMPLETED: 1,
  FAILED: 2,
  COMPENSATING: 3
} as const

/** Saga 状态值联合 */
export type SagaStateStatus = (typeof SagaStateStatusEnum)[keyof typeof SagaStateStatusEnum]

/**
 * Saga 状态持久化主表
 */
@Entity({ name: 'saga_state' })
@Index('idx_status_type', ['status', 'sagaType'])
@Index('idx_updated_at', ['updatedAt'])
export class SagaState extends BaseEntity {
  @PrimaryColumn({
    name: 'saga_id',
    type: 'varchar',
    length: 64,
    comment: 'Saga 实例 ID（雪花字符串）'
  })
  sagaId!: string

  @Column({
    name: 'saga_type',
    type: 'varchar',
    length: 64,
    comment: 'Saga 类型：OrderPaidSaga / OrderCanceledSaga / RefundSucceedSaga / ...'
  })
  sagaType!: string

  @Column({
    name: 'status',
    type: 'tinyint',
    default: 0,
    comment: '0 进行中 / 1 已完成 / 2 失败 / 3 补偿中'
  })
  status!: number

  @Column({
    name: 'step_idx',
    type: 'int',
    default: 0,
    comment: '当前步骤索引（从 0 开始；每步成功后 +1）'
  })
  stepIdx!: number

  @Column({
    name: 'context_json',
    type: 'json',
    comment: 'Saga 上下文快照（事件 envelope / 中间结果）'
  })
  contextJson!: Record<string, unknown>

  @Column({
    name: 'error_msg',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '失败原因（status=2 时填充）'
  })
  errorMsg!: string | null
}
