/**
 * @file shop-business-hour.entity.ts
 * @stage P4/T4.1（Sprint 1）
 * @desc TypeORM Entity：D3.2 shop_business_hour —— 店铺营业时段（对齐 03_shop_product.sql 第 2 张表）
 * @author 单 Agent V2.0
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 店铺营业时段
 * 用途：对应 PRD §3.2.2.1 营业时间编辑、§3.2.2.2 自动按营业时间启停
 * 注：跨天营业（02:00 收摊）拆为 当日 09:00-23:59 + 次日 00:00-02:00 两条
 */
@Entity({ name: 'shop_business_hour' })
@Index('idx_shop_day', ['shopId', 'dayOfWeek', 'isActive'])
export class ShopBusinessHour extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'shop_id', type: 'bigint', unsigned: true, comment: '所属店铺 ID' })
  shopId!: string

  @Column({
    name: 'day_of_week',
    type: 'tinyint',
    unsigned: true,
    comment: '周几：1=周一 ... 7=周日；0=每天通用'
  })
  dayOfWeek!: number

  @Column({ name: 'open_time', type: 'time', comment: '开门时间' })
  openTime!: string

  @Column({ name: 'close_time', type: 'time', comment: '关门时间（同日；跨日请拆为两条）' })
  closeTime!: string

  @Column({
    name: 'is_active',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '是否生效：0 临时禁用 / 1 启用'
  })
  isActive!: number
}
