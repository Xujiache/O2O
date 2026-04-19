/**
 * @file user-coupon.entity.ts
 * @stage P4/T4.10（Sprint 2）
 * @desc TypeORM Entity：D7.2 user_coupon —— 用户已领取的券（对齐 07_marketing.sql 第 2 张表）
 * @author 单 Agent V2.0
 *
 * status：0 已过期 / 1 未使用 / 2 已使用 / 3 冻结（订单未支付）
 * received_source：1 主动领 / 2 活动赠 / 3 邀请奖 / 4 客服补偿
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 用户已领取的券
 * 用途：对应 PRD §3.1.5.3 优惠券管理；下单时由 DiscountCalc 计算抵扣
 */
@Entity({ name: 'user_coupon' })
@Index('idx_user_status_valid', ['userId', 'status', 'validTo'])
@Index('idx_coupon_status', ['couponId', 'status'])
@Index('idx_used_order', ['usedOrderNo'])
export class UserCoupon extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '用户 ID' })
  userId!: string

  @Column({ name: 'coupon_id', type: 'bigint', unsigned: true, comment: '券模板 ID' })
  couponId!: string

  @Column({
    name: 'coupon_code',
    type: 'varchar',
    length: 64,
    comment: '券编码冗余（避免 join）'
  })
  couponCode!: string

  @Column({ name: 'valid_from', type: 'datetime', precision: 3, comment: '生效起始' })
  validFrom!: Date

  @Column({ name: 'valid_to', type: 'datetime', precision: 3, comment: '失效时间' })
  validTo!: Date

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 已过期 / 1 未使用 / 2 已使用 / 3 冻结'
  })
  status!: number

  @Column({
    name: 'used_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '使用时间'
  })
  usedAt!: Date | null

  @Column({
    name: 'used_order_no',
    type: 'char',
    length: 18,
    nullable: true,
    comment: '使用订单号'
  })
  usedOrderNo!: string | null

  @Column({
    name: 'used_order_type',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '使用订单类型：1 外卖 / 2 跑腿'
  })
  usedOrderType!: number | null

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '实际抵扣金额'
  })
  discountAmount!: string | null

  @Column({
    name: 'received_source',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '领取来源：1 主动领 / 2 活动赠 / 3 邀请奖 / 4 客服补偿'
  })
  receivedSource!: number | null
}
