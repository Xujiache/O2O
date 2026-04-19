/**
 * @file transfer-record.entity.ts
 * @stage P4/T4.42（Sprint 6）
 * @desc TypeORM Entity：D6.2 transfer_record —— 转单记录（对齐 06_dispatch.sql）
 * @author 单 Agent V2.0
 *
 * status：0 申请中 / 1 已转出 / 2 已驳回 / 3 已取消
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 转单记录
 */
@Entity({ name: 'transfer_record' })
@Index('idx_order_no', ['orderNo'])
@Index('idx_from_rider_status', ['fromRiderId', 'status', 'createdAt'])
@Index('idx_status_created', ['status', 'createdAt'])
export class TransferRecord extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'order_no', type: 'char', length: 18, comment: '订单号' })
  orderNo!: string

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number

  @Column({ name: 'from_rider_id', type: 'bigint', unsigned: true, comment: '原骑手 ID' })
  fromRiderId!: string

  @Column({
    name: 'to_rider_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '转入骑手 ID（接单后填）'
  })
  toRiderId!: string | null

  @Column({ name: 'reason_code', type: 'varchar', length: 64, comment: '原因编码' })
  reasonCode!: string

  @Column({
    name: 'reason_detail',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '原因详情'
  })
  reasonDetail!: string | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 申请中 / 1 已转出 / 2 已驳回 / 3 已取消'
  })
  status!: number

  @Column({
    name: 'audit_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '审核管理员 ID'
  })
  auditAdminId!: string | null

  @Column({
    name: 'audit_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '审核时间'
  })
  auditAt!: Date | null

  @Column({
    name: 'audit_remark',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '审核备注'
  })
  auditRemark!: string | null
}
