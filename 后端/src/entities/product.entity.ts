/**
 * @file product.entity.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc TypeORM Entity：D3.4 product —— 商品主表（对齐 03_shop_product.sql 第 4 张表）
 * @author 单 Agent V2.0
 *
 * 与 product_sku 一对多；库存（stock_qty）放 SKU 表
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 商品主表（含审核两套状态：audit_status / status）
 * 用途：对应 PRD §3.2.4 商品管理、§3.1.2.3 商品管理
 */
@Entity({ name: 'product' })
@Index('idx_shop_status_sort', ['shopId', 'status', 'sort'])
@Index('idx_shop_category_sort', ['shopId', 'categoryId', 'sort'])
@Index('idx_shop_recommend', ['shopId', 'isRecommend', 'status'])
@Index('idx_audit_status', ['auditStatus', 'createdAt'])
export class Product extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'shop_id', type: 'bigint', unsigned: true, comment: '所属店铺 ID' })
  shopId!: string

  @Column({ name: 'category_id', type: 'bigint', unsigned: true, comment: '所属分类 ID' })
  categoryId!: string

  @Column({ name: 'name', type: 'varchar', length: 128, comment: '商品名称' })
  name!: string

  @Column({
    name: 'brief',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '简介（一句话卖点）'
  })
  brief!: string | null

  @Column({ name: 'description', type: 'text', nullable: true, comment: '详细描述' })
  description!: string | null

  @Column({
    name: 'main_image_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '主图 URL'
  })
  mainImageUrl!: string | null

  @Column({
    name: 'image_urls',
    type: 'json',
    nullable: true,
    comment: '商品图片数组（最多 8 张）'
  })
  imageUrls!: string[] | null

  @Column({
    name: 'price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '默认价格（无 SKU 时使用；有 SKU 时为最低价冗余）'
  })
  price!: string

  @Column({
    name: 'original_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '划线原价'
  })
  originalPrice!: string | null

  @Column({
    name: 'packaging_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '商品级打包费（覆盖店铺默认）'
  })
  packagingFee!: string

  @Column({
    name: 'min_order_qty',
    type: 'smallint',
    unsigned: true,
    default: 1,
    comment: '起购数量'
  })
  minOrderQty!: number

  @Column({
    name: 'limit_per_order',
    type: 'smallint',
    unsigned: true,
    default: 0,
    comment: '单笔限购（0=不限）'
  })
  limitPerOrder!: number

  @Column({
    name: 'has_sku',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否多规格：0 单规格 / 1 多规格'
  })
  hasSku!: number

  @Column({
    name: 'product_type',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '商品类型：1 普通 / 2 套餐 / 3 特价'
  })
  productType!: number

  @Column({ name: 'tags', type: 'json', nullable: true, comment: '标签数组' })
  tags!: string[] | null

  @Column({
    name: 'monthly_sales',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '月销量冗余'
  })
  monthlySales!: number

  @Column({ name: 'total_sales', type: 'int', unsigned: true, default: 0, comment: '累计销量' })
  totalSales!: number

  @Column({
    name: 'score',
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 5.0,
    comment: '商品评分',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? 0 : Number(v))
    }
  })
  score!: number

  @Column({ name: 'score_count', type: 'int', unsigned: true, default: 0, comment: '评分人数' })
  scoreCount!: number

  @Column({
    name: 'is_recommend',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否推荐：0 否 / 1 是'
  })
  isRecommend!: number

  @Column({
    name: 'is_new',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否新品'
  })
  isNew!: number

  @Column({
    name: 'audit_status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '审核：0 待审 / 1 通过 / 2 驳回'
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

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '上架状态：0 下架 / 1 上架 / 2 售罄'
  })
  status!: number

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序权重' })
  sort!: number
}
