/**
 * @file merchant-staff.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.5 merchant_staff —— 商户子账号
 *       （对齐 01_account.sql 第 5 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 商户子账号（商户内 username 唯一；密码 bcrypt 60；手机号三件套）
 * 用途：对应 PRD §3.2.1.3 子账号创建、权限分配
 */
@Entity({ name: 'merchant_staff' })
@Index('uk_merchant_username', ['merchantId', 'username'], { unique: true })
@Index('idx_mobile_hash', ['mobileHash'])
export class MerchantStaff extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({ name: 'merchant_id', type: 'bigint', unsigned: true, comment: '所属商户 ID' })
  merchantId!: string

  @Column({ name: 'username', type: 'varchar', length: 64, comment: '登录账号（商户内唯一）' })
  username!: string

  @Column({
    name: 'password_hash',
    type: 'char',
    length: 60,
    comment: 'bcrypt 密码哈希（cost ≥ 10）'
  })
  passwordHash!: string

  @Column({ name: 'name', type: 'varchar', length: 64, nullable: true, comment: '员工姓名' })
  name!: string | null

  @Column({
    name: 'mobile_enc',
    type: 'varbinary',
    length: 255,
    nullable: true,
    comment: '手机号 AES-GCM'
  })
  mobileEnc!: Buffer | null

  @Column({
    name: 'mobile_hash',
    type: 'char',
    length: 64,
    nullable: true,
    comment: '手机号 HMAC-SHA256'
  })
  mobileHash!: string | null

  @Column({
    name: 'mobile_tail4',
    type: 'varchar',
    length: 8,
    nullable: true,
    comment: '手机号末 4 位'
  })
  mobileTail4!: string | null

  @Column({
    name: 'role_code',
    type: 'varchar',
    length: 64,
    default: () => "'staff'",
    comment: '角色编码（store_owner/store_clerk/store_finance）'
  })
  roleCode!: string

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 禁用 / 1 启用'
  })
  status!: number

  @Column({
    name: 'last_login_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '最近登录时间'
  })
  lastLoginAt!: Date | null

  @Column({
    name: 'enc_key_ver',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '加密密钥版本'
  })
  encKeyVer!: number
}
