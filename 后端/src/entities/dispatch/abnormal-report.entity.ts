/**
 * @file abnormal-report.entity.ts
 * @stage P4/T4.21（Sprint 3）
 * @desc TypeORM Entity：D6.3 abnormal_report —— 异常上报（对齐 06_dispatch.sql）
 * @author 单 Agent V2.0
 *
 * reporter_type：1 用户 / 2 商户 / 3 骑手
 * status：0 待处理 / 1 处理中 / 2 已解决 / 3 已驳回
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 异常上报
 */
@Entity({ name: 'abnormal_report' })
@Index('idx_order_no', ['orderNo'])
@Index('idx_reporter_status', ['reporterType', 'reporterId', 'status'])
@Index('idx_status_type_created', ['status', 'abnormalType', 'createdAt'])
export class AbnormalReport extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({
    name: 'order_no',
    type: 'char',
    length: 18,
    nullable: true,
    comment: '订单号（可空：与订单无关）'
  })
  orderNo!: string | null

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number | null

  @Column({
    name: 'reporter_type',
    type: 'tinyint',
    unsigned: true,
    comment: '上报方：1 用户 / 2 商户 / 3 骑手'
  })
  reporterType!: number

  @Column({ name: 'reporter_id', type: 'bigint', unsigned: true, comment: '上报方 ID' })
  reporterId!: string

  @Column({ name: 'abnormal_type', type: 'varchar', length: 64, comment: '异常类型编码' })
  abnormalType!: string

  @Column({ name: 'description', type: 'varchar', length: 1000, comment: '异常描述' })
  description!: string

  @Column({
    name: 'evidence_urls',
    type: 'json',
    nullable: true,
    comment: '证据图片/视频 URL 数组'
  })
  evidenceUrls!: string[] | null

  @Column({
    name: 'lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '上报时经度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  lng!: number | null

  @Column({
    name: 'lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '上报时纬度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  lat!: number | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 待处理 / 1 处理中 / 2 已解决 / 3 已驳回'
  })
  status!: number

  @Column({
    name: 'handle_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '处理管理员 ID'
  })
  handleAdminId!: string | null

  @Column({
    name: 'handle_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '处理时间'
  })
  handleAt!: Date | null

  @Column({
    name: 'handle_result',
    type: 'varchar',
    length: 1000,
    nullable: true,
    comment: '处理结果说明'
  })
  handleResult!: string | null
}
