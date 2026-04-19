/**
 * @file review.entity.ts
 * @stage P4/T4.44（Sprint 7）
 * @desc TypeORM Entity：D8.1 review —— 用户评价（对齐 08_review.sql）
 * @author 单 Agent V2.0
 *
 * target_type：1 店铺 / 2 商品 / 3 骑手 / 4 综合
 * 一单一评（uk_order_target）；提交后 24h 内可改
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 用户评价
 */
@Entity({ name: 'review' })
@Index('uk_order_target', ['orderNo', 'targetType', 'targetId'], { unique: true })
@Index('idx_target_score_created', ['targetType', 'targetId', 'score', 'createdAt'])
@Index('idx_user_created', ['userId', 'createdAt'])
@Index('idx_shop_score_created', ['shopId', 'score', 'createdAt'])
@Index('idx_rider_score_created', ['riderId', 'score', 'createdAt'])
export class Review extends BaseEntity {
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

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '评价用户 ID' })
  userId!: string

  @Column({
    name: 'target_type',
    type: 'tinyint',
    unsigned: true,
    comment: '评价对象：1 店铺 / 2 商品 / 3 骑手 / 4 综合'
  })
  targetType!: number

  @Column({ name: 'target_id', type: 'bigint', unsigned: true, comment: '对象 ID' })
  targetId!: string

  @Column({
    name: 'shop_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '冗余店铺 ID'
  })
  shopId!: string | null

  @Column({
    name: 'rider_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '冗余骑手 ID'
  })
  riderId!: string | null

  @Column({ name: 'score', type: 'tinyint', unsigned: true, comment: '总分（1~5）' })
  score!: number

  @Column({
    name: 'taste_score',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '口味分（外卖）'
  })
  tasteScore!: number | null

  @Column({
    name: 'package_score',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '包装分（外卖）'
  })
  packageScore!: number | null

  @Column({
    name: 'delivery_score',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '配送/服务分'
  })
  deliveryScore!: number | null

  @Column({ name: 'content', type: 'varchar', length: 1000, nullable: true, comment: '评价内容' })
  content!: string | null

  @Column({
    name: 'image_urls',
    type: 'json',
    nullable: true,
    comment: '图片 URL 数组（最多 9 张）'
  })
  imageUrls!: string[] | null

  @Column({ name: 'tags', type: 'json', nullable: true, comment: '标签数组' })
  tags!: string[] | null

  @Column({
    name: 'is_anonymous',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否匿名：0 否 / 1 是'
  })
  isAnonymous!: number

  @Column({
    name: 'is_top',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否置顶：0 否 / 1 是（管理员）'
  })
  isTop!: number

  @Column({
    name: 'is_hidden',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否隐藏（违规）：0 否 / 1 是'
  })
  isHidden!: number

  @Column({ name: 'useful_count', type: 'int', unsigned: true, default: 0, comment: '有用计数' })
  usefulCount!: number
}
