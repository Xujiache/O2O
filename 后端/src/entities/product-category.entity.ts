/**
 * @file product-category.entity.ts
 * @stage P4/T4.4（Sprint 1）
 * @desc TypeORM Entity：D3.3 product_category —— 商品分类（店铺自有，对齐 03_shop_product.sql 第 3 张表）
 * @author 单 Agent V2.0
 *
 * 仅支持 2 级分类（parent_id=0 为根分类）
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 商品分类（店铺自有）
 * 用途：对应 PRD §3.2.4.1 分类管理
 */
@Entity({ name: 'product_category' })
@Index('idx_shop_parent_sort', ['shopId', 'parentId', 'sort'])
@Index('idx_shop_status', ['shopId', 'status'])
export class ProductCategory extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'shop_id', type: 'bigint', unsigned: true, comment: '所属店铺 ID' })
  shopId!: string

  @Column({
    name: 'parent_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '父分类 ID（0=根；只支持二级）'
  })
  parentId!: string

  @Column({ name: 'name', type: 'varchar', length: 64, comment: '分类名称' })
  name!: string

  @Column({
    name: 'icon_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '分类图标'
  })
  iconUrl!: string | null

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序权重（小→前）' })
  sort!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 下架 / 1 上架'
  })
  status!: number
}
