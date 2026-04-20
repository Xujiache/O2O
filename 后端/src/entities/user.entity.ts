/**
 * @file user.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.1 user —— C 端用户主表（对齐 01_account.sql 第 1 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 用户主表（敏感字段加密三件套：mobile / id_card；real_name 仅 _enc）
 * 用途：对应 PRD §1.4 C 端用户、§3.1.5 个人中心、§3.5.1.2 用户中心
 */
@Entity({ name: 'user' })
@Index('uk_union_id', ['unionId'], { unique: true })
@Index('uk_open_id_mp', ['openIdMp'], { unique: true })
@Index('uk_mobile_hash', ['mobileHash'], { unique: true })
@Index('idx_status_tenant', ['status', 'tenantId'])
@Index('idx_created_at', ['createdAt'])
export class User extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({
    name: 'union_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '微信开放平台 unionId'
  })
  unionId!: string | null

  @Column({
    name: 'open_id_mp',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '微信小程序 openId'
  })
  openIdMp!: string | null

  @Column({ name: 'nickname', type: 'varchar', length: 64, nullable: true, comment: '昵称' })
  nickname!: string | null

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true, comment: '头像 URL' })
  avatarUrl!: string | null

  @Column({
    name: 'gender',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '性别：0 未知 / 1 男 / 2 女'
  })
  gender!: number

  @Column({
    name: 'birthday',
    type: 'date',
    nullable: true,
    comment: '生日（Date 形式；TypeORM 写入会自动 toISOString）'
  })
  birthday!: Date | null

  /* ===== 手机号三件套 ===== */
  @Column({
    name: 'mobile_enc',
    type: 'varbinary',
    length: 255,
    nullable: true,
    comment: '手机号 AES-GCM 密文'
  })
  mobileEnc!: Buffer | null

  @Column({
    name: 'mobile_hash',
    type: 'char',
    length: 64,
    nullable: true,
    comment: '手机号 HMAC-SHA256 hex'
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

  /* ===== 身份证两件套（_enc + _hash） ===== */
  @Column({
    name: 'id_card_enc',
    type: 'varbinary',
    length: 255,
    nullable: true,
    comment: '身份证 AES-GCM 密文'
  })
  idCardEnc!: Buffer | null

  @Column({
    name: 'id_card_hash',
    type: 'char',
    length: 64,
    nullable: true,
    comment: '身份证 HMAC-SHA256 hex'
  })
  idCardHash!: string | null

  @Column({
    name: 'id_card_tail4',
    type: 'varchar',
    length: 4,
    nullable: true,
    comment: '身份证后4位（脱敏展示）'
  })
  idCardTail4!: string | null

  /* ===== 真实姓名（仅 _enc） ===== */
  @Column({
    name: 'real_name_enc',
    type: 'varbinary',
    length: 255,
    nullable: true,
    comment: '真实姓名 AES-GCM 密文'
  })
  realNameEnc!: Buffer | null

  @Column({
    name: 'is_realname',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否实名：0 未实名 / 1 已实名'
  })
  isRealname!: number

  @Column({
    name: 'enc_key_ver',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '加密密钥版本号'
  })
  encKeyVer!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '账号状态：0 封禁 / 1 正常 / 2 注销中'
  })
  status!: number

  @Column({
    name: 'reg_source',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '注册来源：1 微信小程序 / 2 H5 / 3 APP'
  })
  regSource!: number

  @Column({
    name: 'reg_ip',
    type: 'varbinary',
    length: 16,
    nullable: true,
    comment: '注册 IP（IPv4 4B / IPv6 16B）'
  })
  regIp!: Buffer | null

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
}
