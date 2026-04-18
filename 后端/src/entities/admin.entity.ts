/**
 * @file admin.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.9 admin —— 平台管理员
 *       （对齐 01_account.sql 第 9 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 平台管理员（含手机号三件套；is_super=1 时绕过 RBAC）
 * 用途：对应 PRD §1.4 平台管理员、§3.4.9.1 权限管理
 */
@Entity({ name: 'admin' })
@Index('uk_username', ['username'], { unique: true })
@Index('idx_status', ['status'])
export class Admin extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({ name: 'username', type: 'varchar', length: 64, comment: '登录账号（全局唯一）' })
  username!: string

  @Column({ name: 'password_hash', type: 'char', length: 60, comment: 'bcrypt 哈希（cost ≥ 10）' })
  passwordHash!: string

  @Column({
    name: 'nickname',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '昵称/真实姓名'
  })
  nickname!: string | null

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true, comment: '头像' })
  avatarUrl!: string | null

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

  @Column({ name: 'email', type: 'varchar', length: 128, nullable: true, comment: '邮箱（明文）' })
  email!: string | null

  @Column({
    name: 'is_super',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否超管：0 否 / 1 是（绕过 RBAC）'
  })
  isSuper!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 禁用 / 1 正常'
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
    name: 'last_login_ip',
    type: 'varbinary',
    length: 16,
    nullable: true,
    comment: '最近登录 IP'
  })
  lastLoginIp!: Buffer | null

  @Column({
    name: 'enc_key_ver',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '加密密钥版本'
  })
  encKeyVer!: number
}
