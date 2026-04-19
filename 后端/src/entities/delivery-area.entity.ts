/**
 * @file delivery-area.entity.ts
 * @stage P4/T4.2（Sprint 1）
 * @desc TypeORM Entity：D2.2 delivery_area —— 配送区域（对齐 02_region.sql 第 2 张表）
 * @author 单 Agent V2.0
 *
 * area_type=1 商户配送圈（owner_id=shop.id）；area_type=2 平台跑腿服务区（owner_id=NULL）
 * polygon 列存 GeoJSON Polygon；应用层用 turf.js 做点-多边形判断
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/** GeoJSON Polygon 严格类型（与 turf 兼容） */
export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

/**
 * 配送区域（多边形围栏，GeoJSON）
 * 用途：对应 PRD §3.2.2.3 配送范围自定义、§3.4.7.4 区域管理
 */
@Entity({ name: 'delivery_area' })
@Index('idx_owner_type', ['areaType', 'ownerId', 'status'])
@Index('idx_city_status', ['cityCode', 'status'])
export class DeliveryArea extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({
    name: 'area_type',
    type: 'tinyint',
    unsigned: true,
    comment: '区域类型：1 商户配送圈 / 2 平台跑腿服务区'
  })
  areaType!: number

  @Column({
    name: 'owner_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '归属 ID（type=1→shop.id，type=2→NULL）'
  })
  ownerId!: string | null

  @Column({ name: 'name', type: 'varchar', length: 64, comment: '区域名称' })
  name!: string

  @Column({ name: 'city_code', type: 'char', length: 6, comment: '所属城市编码' })
  cityCode!: string

  @Column({ name: 'polygon', type: 'json', comment: 'GeoJSON Polygon' })
  polygon!: GeoJsonPolygon

  @Column({
    name: 'delivery_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '基础配送费（type=1 时使用）'
  })
  deliveryFee!: string | null

  @Column({
    name: 'min_order',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '起送价（type=1 时使用）'
  })
  minOrder!: string | null

  @Column({
    name: 'extra_fee_rule',
    type: 'json',
    nullable: true,
    comment: '阶梯加价规则（按距离/重量；JSON 数组）'
  })
  extraFeeRule!: Record<string, unknown> | null

  @Column({
    name: 'priority',
    type: 'int',
    default: 0,
    comment: '优先级（同店多区域时大→优先）'
  })
  priority!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 停用 / 1 启用'
  })
  status!: number
}
