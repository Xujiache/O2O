/**
 * @file user-address.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.2 user_address —— 用户收货地址簿（对齐 01_account.sql 第 2 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 用户收货地址簿（含收件人手机号三件套）
 * 用途：对应 PRD §3.1.5.2 地址管理
 */
@Entity({ name: 'user_address' })
@Index('idx_user_default', ['userId', 'isDefault', 'isDeleted'])
@Index('idx_district_code', ['districtCode'])
export class UserAddress extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '所属用户 ID（→ user.id）' })
  userId!: string

  @Column({ name: 'receiver_name', type: 'varchar', length: 64, comment: '收件人姓名' })
  receiverName!: string

  @Column({
    name: 'receiver_mobile_enc',
    type: 'varbinary',
    length: 255,
    comment: '收件人手机号 AES-GCM 密文'
  })
  receiverMobileEnc!: Buffer

  @Column({
    name: 'receiver_mobile_hash',
    type: 'char',
    length: 64,
    comment: '收件人手机号 HMAC-SHA256'
  })
  receiverMobileHash!: string

  @Column({
    name: 'receiver_mobile_tail4',
    type: 'varchar',
    length: 8,
    comment: '收件人手机号末 4 位'
  })
  receiverMobileTail4!: string

  @Column({ name: 'province_code', type: 'char', length: 6, comment: '省级行政区划代码' })
  provinceCode!: string

  @Column({ name: 'city_code', type: 'char', length: 6, comment: '市级行政区划代码' })
  cityCode!: string

  @Column({ name: 'district_code', type: 'char', length: 6, comment: '区/县行政区划代码' })
  districtCode!: string

  @Column({ name: 'province_name', type: 'varchar', length: 32, comment: '省名称冗余' })
  provinceName!: string

  @Column({ name: 'city_name', type: 'varchar', length: 32, comment: '市名称冗余' })
  cityName!: string

  @Column({ name: 'district_name', type: 'varchar', length: 32, comment: '区/县名称冗余' })
  districtName!: string

  @Column({ name: 'detail', type: 'varchar', length: 255, comment: '详细地址' })
  detail!: string

  @Column({
    name: 'tag',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '地址标签：家/公司/学校/其他'
  })
  tag!: string | null

  @Column({
    name: 'lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '经度（GCJ-02；mysql2 默认以 string 返回保留精度）'
  })
  lng!: string | null

  @Column({
    name: 'lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '纬度（mysql2 默认以 string 返回）'
  })
  lat!: string | null

  @Column({
    name: 'is_default',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否默认地址：0 否 / 1 是'
  })
  isDefault!: number

  @Column({
    name: 'enc_key_ver',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '加密密钥版本'
  })
  encKeyVer!: number
}
