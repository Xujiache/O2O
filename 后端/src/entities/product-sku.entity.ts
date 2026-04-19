/**
 * @file product-sku.entity.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc TypeORM Entity：D3.5 product_sku —— 商品 SKU（库存归位，对齐 03_shop_product.sql 第 5 张表）
 * @author 单 Agent V2.0
 *
 * 单规格商品也建一条 default SKU；库存 stock_qty 实际由 Redis stock:sku:{skuId} 缓存扣减，
 * MySQL 仅作兜底，允许临时短暂为负
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 规格组合项
 */
export interface SkuSpecItem {
  key: string
  value: string
}

/**
 * 商品 SKU
 * 用途：对应 PRD §3.2.4 商品规格、库存
 */
@Entity({ name: 'product_sku' })
@Index('uk_product_sku_code', ['productId', 'skuCode'], { unique: true })
@Index('idx_product_status', ['productId', 'status'])
export class ProductSku extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'product_id', type: 'bigint', unsigned: true, comment: '商品 ID' })
  productId!: string

  @Column({
    name: 'sku_code',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '商家自定义 SKU 编码（店铺内唯一）'
  })
  skuCode!: string | null

  @Column({
    name: 'spec_name',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '规格名称（拼接：大份+加辣）'
  })
  specName!: string | null

  @Column({
    name: 'spec_json',
    type: 'json',
    nullable: true,
    comment: '规格组合 JSON（[{"key":"size","value":"大"}]）'
  })
  specJson!: SkuSpecItem[] | null

  @Column({ name: 'price', type: 'decimal', precision: 10, scale: 2, comment: 'SKU 售价' })
  price!: string

  @Column({
    name: 'original_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'SKU 划线价'
  })
  originalPrice!: string | null

  @Column({
    name: 'packaging_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: 'SKU 级打包费（覆盖商品级）'
  })
  packagingFee!: string

  @Column({
    name: 'stock_qty',
    type: 'int',
    default: 0,
    comment: '库存数量（-1 表示无限库存；应用层用 Redis 缓存扣减）'
  })
  stockQty!: number

  @Column({ name: 'sales', type: 'int', unsigned: true, default: 0, comment: 'SKU 销量' })
  sales!: number

  @Column({
    name: 'weight_g',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '商品重量（克）'
  })
  weightG!: number | null

  @Column({
    name: 'volume_ml',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '商品体积（毫升）'
  })
  volumeMl!: number | null

  @Column({
    name: 'is_default',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否默认 SKU：0 否 / 1 是'
  })
  isDefault!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 下架 / 1 上架 / 2 售罄'
  })
  status!: number
}
