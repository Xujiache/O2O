/**
 * @file product-favorite.entity.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc TypeORM Entity：D3.7 product_favorite —— 用户收藏（对齐 03_shop_product.sql 第 7 张表）
 * @author 单 Agent V2.0
 *
 * target_type=1 商品收藏 / target_type=2 店铺收藏（同表共用）
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 用户收藏（商品/店铺）
 * 用途：对应 PRD §3.1.5.4 收藏管理
 */
@Entity({ name: 'product_favorite' })
@Index('uk_user_target', ['userId', 'targetType', 'targetId'], { unique: true })
@Index('idx_target_type', ['targetType', 'targetId'])
export class ProductFavorite extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '用户 ID' })
  userId!: string

  @Column({
    name: 'target_type',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '收藏类型：1 商品 / 2 店铺'
  })
  targetType!: number

  @Column({
    name: 'target_id',
    type: 'bigint',
    unsigned: true,
    comment: '目标 ID（商品 ID 或店铺 ID）'
  })
  targetId!: string

  @Column({
    name: 'shop_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '冗余店铺 ID（便于按店铺聚合）'
  })
  shopId!: string | null
}
