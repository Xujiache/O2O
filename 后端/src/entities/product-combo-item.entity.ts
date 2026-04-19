/**
 * @file product-combo-item.entity.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc TypeORM Entity：D3.6 product_combo_item —— 套餐子项（对齐 03_shop_product.sql 第 6 张表）
 * @author 单 Agent V2.0
 *
 * 仅当 product.product_type=2（套餐）时存在子项；下单时按子项分别扣减库存
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 套餐子项
 * 用途：对应 PRD §3.2.4.4 套餐管理
 */
@Entity({ name: 'product_combo_item' })
@Index('idx_combo_sort', ['comboProductId', 'sort'])
export class ProductComboItem extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({
    name: 'combo_product_id',
    type: 'bigint',
    unsigned: true,
    comment: '套餐主商品 ID（product.product_type=2）'
  })
  comboProductId!: string

  @Column({ name: 'item_product_id', type: 'bigint', unsigned: true, comment: '子商品 ID' })
  itemProductId!: string

  @Column({
    name: 'item_sku_id',
    type: 'bigint',
    unsigned: true,
    comment: '子 SKU ID（即使单规格也填 default SKU）'
  })
  itemSkuId!: string

  @Column({ name: 'qty', type: 'smallint', unsigned: true, default: 1, comment: '该子项数量' })
  qty!: number

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序' })
  sort!: number
}
