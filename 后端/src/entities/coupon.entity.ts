/**
 * @file coupon.entity.ts
 * @stage P4/T4.9（Sprint 2）
 * @desc TypeORM Entity：D7.1 coupon —— 优惠券模板（对齐 07_marketing.sql 第 1 张表）
 * @author 单 Agent V2.0
 *
 * 4 类券：1 满减 / 2 折扣 / 3 立减 / 4 免运费
 * 2 套有效期：1 固定时段（valid_from/valid_to） / 2 领取后 N 天（valid_days）
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 优惠券模板
 * 用途：对应 PRD §3.2.6.3 商户营销工具、§3.4.7.1 平台优惠券
 */
@Entity({ name: 'coupon' })
@Index('uk_coupon_code', ['couponCode'], { unique: true })
@Index('idx_issuer', ['issuerType', 'issuerId', 'status'])
@Index('idx_status_valid', ['status', 'validFrom', 'validTo'])
export class Coupon extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'coupon_code', type: 'varchar', length: 64, comment: '券模板编码' })
  couponCode!: string

  @Column({ name: 'name', type: 'varchar', length: 128, comment: '券名称（例：满 30 减 5）' })
  name!: string

  @Column({
    name: 'issuer_type',
    type: 'tinyint',
    unsigned: true,
    comment: '发券方：1 平台 / 2 商户'
  })
  issuerType!: number

  @Column({
    name: 'issuer_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '发券方 ID（issuer_type=2 时为 merchant.id）'
  })
  issuerId!: string | null

  @Column({
    name: 'coupon_type',
    type: 'tinyint',
    unsigned: true,
    comment: '券类型：1 满减 / 2 折扣 / 3 立减 / 4 免运费'
  })
  couponType!: number

  @Column({
    name: 'discount_value',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '面额：满减/立减为元，折扣为 0~1（如 0.85=85 折）'
  })
  discountValue!: string

  @Column({
    name: 'min_order_amount',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '订单最低金额（满减门槛）'
  })
  minOrderAmount!: string

  @Column({
    name: 'max_discount',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '最大优惠（折扣券封顶）'
  })
  maxDiscount!: string | null

  @Column({
    name: 'scene',
    type: 'tinyint',
    unsigned: true,
    comment: '使用场景：1 外卖 / 2 跑腿 / 3 通用'
  })
  scene!: number

  @Column({
    name: 'applicable_shops',
    type: 'json',
    nullable: true,
    comment: '适用店铺 ID 数组（NULL=全部）'
  })
  applicableShops!: string[] | null

  @Column({
    name: 'applicable_categories',
    type: 'json',
    nullable: true,
    comment: '适用品类编码数组'
  })
  applicableCategories!: string[] | null

  @Column({
    name: 'total_qty',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '总发放数量（0=不限）'
  })
  totalQty!: number

  @Column({ name: 'received_qty', type: 'int', unsigned: true, default: 0, comment: '已领取数量' })
  receivedQty!: number

  @Column({ name: 'used_qty', type: 'int', unsigned: true, default: 0, comment: '已使用数量' })
  usedQty!: number

  @Column({
    name: 'per_user_limit',
    type: 'smallint',
    unsigned: true,
    default: 1,
    comment: '每人限领数量'
  })
  perUserLimit!: number

  @Column({
    name: 'valid_type',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '有效期类型：1 固定时段 / 2 领取后 N 天'
  })
  validType!: number

  @Column({
    name: 'valid_from',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '固定时段起始（valid_type=1）'
  })
  validFrom!: Date | null

  @Column({
    name: 'valid_to',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '固定时段结束'
  })
  validTo!: Date | null

  @Column({
    name: 'valid_days',
    type: 'smallint',
    unsigned: true,
    nullable: true,
    comment: '领取后有效天数（valid_type=2）'
  })
  validDays!: number | null

  @Column({
    name: 'image_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '券面图'
  })
  imageUrl!: string | null

  @Column({
    name: 'description',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '使用说明'
  })
  description!: string | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 停用 / 1 启用 / 2 已下架'
  })
  status!: number
}
