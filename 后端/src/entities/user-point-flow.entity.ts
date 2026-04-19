/**
 * @file user-point-flow.entity.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc TypeORM Entity：D7.6 user_point_flow —— 用户积分流水（对齐 07_marketing.sql 第 6 张表）
 * @author 单 Agent V2.0
 *
 * direction：1 增加 / 2 扣减
 * biz_type：1 下单 / 2 评价 / 3 签到 / 4 邀请 / 5 兑换 / 6 过期 / 7 调整
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 用户积分流水
 * 用途：积分变化全链路审计
 */
@Entity({ name: 'user_point_flow' })
@Index('idx_user_created', ['userId', 'createdAt'])
@Index('idx_user_biz', ['userId', 'bizType', 'createdAt'])
@Index('idx_expire_direction', ['direction', 'expireAt'])
export class UserPointFlow extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '用户 ID' })
  userId!: string

  @Column({
    name: 'direction',
    type: 'tinyint',
    unsigned: true,
    comment: '方向：1 增加 / 2 扣减'
  })
  direction!: number

  @Column({
    name: 'biz_type',
    type: 'tinyint',
    unsigned: true,
    comment: '业务类型：1 下单 / 2 评价 / 3 签到 / 4 邀请 / 5 兑换 / 6 过期 / 7 调整'
  })
  bizType!: number

  @Column({ name: 'point', type: 'int', unsigned: true, comment: '本次发生积分（正数）' })
  point!: number

  @Column({ name: 'balance_after', type: 'int', unsigned: true, comment: '操作后余额' })
  balanceAfter!: number

  @Column({
    name: 'related_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '关联业务单号'
  })
  relatedNo!: string | null

  @Column({
    name: 'expire_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '该笔积分过期时间（仅 direction=1）'
  })
  expireAt!: Date | null

  @Column({
    name: 'remark',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '备注'
  })
  remark!: string | null

  @Column({
    name: 'op_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '操作管理员 ID（biz_type=7）'
  })
  opAdminId!: string | null
}
