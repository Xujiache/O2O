/**
 * @file rider-qualification.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.7 rider_qualification —— 骑手资质附件
 *       （对齐 01_account.sql 第 7 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 骑手资质附件
 * 用途：对应 PRD §3.3.1.2 实名认证、健康证、从业资格
 */
@Entity({ name: 'rider_qualification' })
@Index('idx_rider_type', ['riderId', 'qualType'])
export class RiderQualification extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({ name: 'rider_id', type: 'bigint', unsigned: true, comment: '骑手 ID（→ rider.id）' })
  riderId!: string

  @Column({
    name: 'qual_type',
    type: 'tinyint',
    unsigned: true,
    comment: '资质类型：1 身份证 / 2 健康证 / 3 从业资格证 / 4 电动车行驶证 / 5 其他'
  })
  qualType!: number

  @Column({ name: 'cert_no', type: 'varchar', length: 64, nullable: true, comment: '证件编号' })
  certNo!: string | null

  @Column({ name: 'valid_from', type: 'date', nullable: true, comment: '生效起始日' })
  validFrom!: Date | null

  @Column({ name: 'valid_to', type: 'date', nullable: true, comment: '到期日' })
  validTo!: Date | null

  @Column({ name: 'attach_url', type: 'varchar', length: 1024, comment: '附件 URL' })
  attachUrl!: string

  @Column({
    name: 'audit_status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '审核状态'
  })
  auditStatus!: number

  @Column({
    name: 'audit_remark',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '审核备注'
  })
  auditRemark!: string | null
}
