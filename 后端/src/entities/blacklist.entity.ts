/**
 * @file blacklist.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.14 blacklist —— 全局黑名单
 *       （对齐 01_account.sql 第 14 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 全局黑名单（用户/商户/骑手/设备/IP 通用）
 * 用途：对应 PRD §3.4.2.3 用户风控 / §3.4.3.4 商户风控 / §3.4.4.5 骑手风控
 */
@Entity({ name: 'blacklist' })
@Index('idx_target_status', ['targetType', 'targetId', 'status'])
@Index('idx_target_value', ['targetType', 'targetValue', 'status'])
@Index('idx_expire_status', ['status', 'expireAt'])
export class Blacklist extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({
    name: 'target_type',
    type: 'tinyint',
    unsigned: true,
    comment: '主体类型：1 用户 / 2 商户 / 3 骑手 / 4 设备 / 5 IP'
  })
  targetType!: number

  @Column({
    name: 'target_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '主体 ID（用户/商户/骑手时填）'
  })
  targetId!: string | null

  @Column({
    name: 'target_value',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '主体值（设备号/IP/手机号 hash 等）'
  })
  targetValue!: string | null

  @Column({ name: 'reason', type: 'varchar', length: 255, comment: '加入黑名单原因' })
  reason!: string

  @Column({
    name: 'evidence_url',
    type: 'varchar',
    length: 1024,
    nullable: true,
    comment: '证据附件 URL'
  })
  evidenceUrl!: string | null

  @Column({
    name: 'level',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '严重等级：1 警告 / 2 限制 / 3 永久封禁'
  })
  level!: number

  @Column({
    name: 'expire_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '过期时间（NULL=永久）'
  })
  expireAt!: Date | null

  @Column({ name: 'op_admin_id', type: 'bigint', unsigned: true, comment: '操作管理员 ID' })
  opAdminId!: string

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 已解除 / 1 生效中'
  })
  status!: number
}
