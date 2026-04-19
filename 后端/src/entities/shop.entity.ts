/**
 * @file shop.entity.ts
 * @stage P4/T4.1（Sprint 1）
 * @desc TypeORM Entity：D3.1 shop —— 店铺主表（对齐 03_shop_product.sql 第 1 张表）
 * @author 单 Agent V2.0
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 店铺主表（联系电话三件套加密 + GCJ-02 经纬度 + 营业/审核两套状态）
 * 用途：对应 PRD §3.2.2 店铺管理、§3.1.2.2 商家详情
 */
@Entity({ name: 'shop' })
@Index('idx_city_status', ['cityCode', 'status'])
@Index('idx_merchant', ['merchantId'])
@Index('idx_district_business', ['districtCode', 'businessStatus', 'score'])
@Index('idx_industry_status', ['industryCode', 'businessStatus'])
@Index('idx_audit_status', ['auditStatus', 'createdAt'])
export class Shop extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'merchant_id', type: 'bigint', unsigned: true, comment: '所属商户 ID' })
  merchantId!: string

  @Column({ name: 'name', type: 'varchar', length: 128, comment: '店铺名称' })
  name!: string

  @Column({ name: 'short_name', type: 'varchar', length: 64, nullable: true, comment: '店铺简称' })
  shortName!: string | null

  @Column({ name: 'logo_url', type: 'varchar', length: 512, nullable: true, comment: '店铺 LOGO' })
  logoUrl!: string | null

  @Column({
    name: 'cover_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '店铺封面图'
  })
  coverUrl!: string | null

  @Column({ name: 'industry_code', type: 'varchar', length: 32, comment: '行业分类编码' })
  industryCode!: string

  @Column({ name: 'province_code', type: 'char', length: 6, comment: '省级行政区划' })
  provinceCode!: string

  @Column({ name: 'city_code', type: 'char', length: 6, comment: '市级行政区划' })
  cityCode!: string

  @Column({ name: 'district_code', type: 'char', length: 6, comment: '区/县行政区划' })
  districtCode!: string

  @Column({ name: 'address', type: 'varchar', length: 255, comment: '门店详细地址' })
  address!: string

  @Column({
    name: 'lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    comment: '门店经度（GCJ-02）',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  lng!: number

  @Column({
    name: 'lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    comment: '门店纬度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  lat!: number

  @Column({
    name: 'contact_mobile_enc',
    type: 'varbinary',
    length: 255,
    comment: '门店电话 AES-256-GCM'
  })
  contactMobileEnc!: Buffer

  @Column({
    name: 'contact_mobile_hash',
    type: 'char',
    length: 64,
    comment: '门店电话 HMAC-SHA256'
  })
  contactMobileHash!: string

  @Column({
    name: 'contact_mobile_tail4',
    type: 'varchar',
    length: 8,
    comment: '门店电话末 4 位'
  })
  contactMobileTail4!: string

  @Column({
    name: 'business_hours_summary',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '营业时间摘要'
  })
  businessHoursSummary!: string | null

  @Column({
    name: 'min_order_amount',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '起送价（元）'
  })
  minOrderAmount!: string

  @Column({
    name: 'base_delivery_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '基础配送费（元）'
  })
  baseDeliveryFee!: string

  @Column({
    name: 'packaging_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '默认打包费（商品级可覆盖）'
  })
  packagingFee!: string

  @Column({
    name: 'delivery_distance_max',
    type: 'int',
    unsigned: true,
    default: 5000,
    comment: '最大配送距离（米）'
  })
  deliveryDistanceMax!: number

  @Column({
    name: 'avg_prepare_min',
    type: 'smallint',
    unsigned: true,
    default: 15,
    comment: '平均出餐时长（分钟）'
  })
  avgPrepareMin!: number

  @Column({
    name: 'score',
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 5.0,
    comment: '综合评分（0~5.00）',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? 0 : Number(v))
    }
  })
  score!: number

  @Column({ name: 'score_count', type: 'int', unsigned: true, default: 0, comment: '评分人数' })
  scoreCount!: number

  @Column({
    name: 'monthly_sales',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '月销量冗余'
  })
  monthlySales!: number

  @Column({
    name: 'auto_accept',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '自动接单：0 关 / 1 开'
  })
  autoAccept!: number

  @Column({
    name: 'announcement',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '店铺公告'
  })
  announcement!: string | null

  @Column({
    name: 'business_status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '营业状态：0 打烊 / 1 营业中 / 2 临时歇业'
  })
  businessStatus!: number

  @Column({
    name: 'audit_status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '信息审核：0 待审 / 1 通过 / 2 驳回'
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
    comment: '账号状态：0 封禁 / 1 正常'
  })
  status!: number
}
