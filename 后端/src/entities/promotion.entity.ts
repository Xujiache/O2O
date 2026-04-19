/**
 * @file promotion.entity.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc TypeORM Entity：D7.3 promotion —— 营销活动（满减/折扣/拼单/秒杀，对齐 07_marketing.sql 第 3 张表）
 * @author 单 Agent V2.0
 *
 * promo_type：1 满减 / 2 折扣 / 3 拼单 / 4 新人福利 / 5 限时秒杀
 * rule_json 字段示例：
 *   - 满减阶梯：[{"min":30,"discount":5},{"min":50,"discount":10}]
 *   - 折扣：{"rate":0.85,"max":20}
 *   - 拼单：{"groupSize":3,"discountPerHead":2,"timeoutMinutes":30}
 *   - 新人：{"discount":10,"firstOrderOnly":true}
 *   - 秒杀：{"price":9.9,"qty":50,"perUserLimit":1}
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 营销活动
 * 用途：对应 PRD §3.2.4.5 优惠商品 / §3.4.7.2 营销活动
 */
@Entity({ name: 'promotion' })
@Index('uk_promotion_code', ['promotionCode'], { unique: true })
@Index('idx_status_valid', ['status', 'validFrom', 'validTo'])
@Index('idx_issuer_promo_type', ['issuerType', 'issuerId', 'promoType'])
export class Promotion extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'promotion_code', type: 'varchar', length: 64, comment: '活动编码' })
  promotionCode!: string

  @Column({ name: 'name', type: 'varchar', length: 128, comment: '活动名称' })
  name!: string

  @Column({
    name: 'promo_type',
    type: 'tinyint',
    unsigned: true,
    comment: '类型：1 满减 / 2 折扣 / 3 拼单 / 4 新人福利 / 5 限时秒杀'
  })
  promoType!: number

  @Column({
    name: 'issuer_type',
    type: 'tinyint',
    unsigned: true,
    comment: '发起方：1 平台 / 2 商户'
  })
  issuerType!: number

  @Column({
    name: 'issuer_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '发起方 ID'
  })
  issuerId!: string | null

  @Column({
    name: 'scene',
    type: 'tinyint',
    unsigned: true,
    comment: '场景：1 外卖 / 2 跑腿 / 3 通用'
  })
  scene!: number

  @Column({
    name: 'applicable_shops',
    type: 'json',
    nullable: true,
    comment: '适用店铺 ID 数组'
  })
  applicableShops!: string[] | null

  @Column({
    name: 'applicable_products',
    type: 'json',
    nullable: true,
    comment: '适用商品 ID 数组'
  })
  applicableProducts!: string[] | null

  @Column({
    name: 'rule_json',
    type: 'json',
    comment: '规则 JSON（满减阶梯/折扣率/拼单人数等）'
  })
  ruleJson!: Record<string, unknown>

  @Column({
    name: 'total_qty',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '活动名额（0=不限）'
  })
  totalQty!: number

  @Column({ name: 'used_qty', type: 'int', unsigned: true, default: 0, comment: '已用名额' })
  usedQty!: number

  @Column({
    name: 'per_user_limit',
    type: 'smallint',
    unsigned: true,
    default: 1,
    comment: '每人限制次数'
  })
  perUserLimit!: number

  @Column({ name: 'valid_from', type: 'datetime', precision: 3, comment: '生效起始' })
  validFrom!: Date

  @Column({ name: 'valid_to', type: 'datetime', precision: 3, comment: '失效时间' })
  validTo!: Date

  @Column({
    name: 'priority',
    type: 'int',
    default: 0,
    comment: '优先级（多活动叠加时使用）'
  })
  priority!: number

  @Column({
    name: 'is_stackable',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否可与其他活动/券叠加：0 否 / 1 是'
  })
  isStackable!: number

  @Column({
    name: 'description',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '活动说明'
  })
  description!: string | null

  @Column({
    name: 'image_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '活动图片'
  })
  imageUrl!: string | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 草稿 / 1 启用 / 2 暂停 / 3 已结束'
  })
  status!: number
}
