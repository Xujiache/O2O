/**
 * @file merchant.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.3 merchant —— 商户主表（对齐 01_account.sql 第 3 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 商户主表（含联系手机三件套 + 法人身份证两件套）
 * 用途：对应 PRD §1.4 入驻商户、§3.2.1 登录与认证、§3.4.3 商户管理
 */
@Entity({ name: 'merchant' })
@Index('uk_merchant_no', ['merchantNo'], { unique: true })
@Index('uk_mobile_hash', ['mobileHash'], { unique: true })
@Index('idx_audit_status', ['auditStatus', 'createdAt'])
@Index('idx_status_city', ['status', 'cityCode'])
@Index('idx_industry', ['industryCode'])
export class Merchant extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'merchant_no', type: 'varchar', length: 32, comment: '商户编号（M+日期+序号）' })
  merchantNo!: string

  @Column({ name: 'name', type: 'varchar', length: 128, comment: '商户名称' })
  name!: string

  @Column({ name: 'short_name', type: 'varchar', length: 64, nullable: true, comment: '商户简称' })
  shortName!: string | null

  @Column({ name: 'logo_url', type: 'varchar', length: 512, nullable: true, comment: '商户 LOGO' })
  logoUrl!: string | null

  @Column({
    name: 'industry_code',
    type: 'varchar',
    length: 32,
    comment: '行业分类编码（sys_dict industry）'
  })
  industryCode!: string

  @Column({
    name: 'legal_person',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '法定代表人姓名'
  })
  legalPerson!: string | null

  @Column({
    name: 'legal_id_card_enc',
    type: 'varbinary',
    length: 255,
    nullable: true,
    comment: '法人身份证 AES-GCM 密文'
  })
  legalIdCardEnc!: Buffer | null

  @Column({
    name: 'legal_id_card_hash',
    type: 'char',
    length: 64,
    nullable: true,
    comment: '法人身份证 HMAC-SHA256'
  })
  legalIdCardHash!: string | null

  /* ===== 联系手机三件套 ===== */
  @Column({ name: 'mobile_enc', type: 'varbinary', length: 255, comment: '联系手机 AES-GCM' })
  mobileEnc!: Buffer

  @Column({ name: 'mobile_hash', type: 'char', length: 64, comment: '联系手机 HMAC-SHA256' })
  mobileHash!: string

  @Column({ name: 'mobile_tail4', type: 'varchar', length: 8, comment: '联系手机末 4 位' })
  mobileTail4!: string

  @Column({ name: 'email', type: 'varchar', length: 128, nullable: true, comment: '联系邮箱' })
  email!: string | null

  @Column({ name: 'province_code', type: 'char', length: 6, comment: '注册省' })
  provinceCode!: string

  @Column({ name: 'city_code', type: 'char', length: 6, comment: '注册市' })
  cityCode!: string

  @Column({ name: 'district_code', type: 'char', length: 6, comment: '注册区/县' })
  districtCode!: string

  @Column({
    name: 'audit_status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '入驻审核：0 待审 / 1 通过 / 2 驳回 / 3 待补件'
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

  @Column({ name: 'audit_at', type: 'datetime', precision: 3, nullable: true, comment: '审核时间' })
  auditAt!: Date | null

  @Column({
    name: 'audit_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '审核管理员 ID'
  })
  auditAdminId!: string | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '账号状态：0 封禁 / 1 正常 / 2 暂停营业'
  })
  status!: number

  @Column({
    name: 'enc_key_ver',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '加密密钥版本'
  })
  encKeyVer!: number
}
