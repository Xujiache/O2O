/**
 * @file rider.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.6 rider —— 骑手主表
 *       （对齐 01_account.sql 第 6 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 骑手主表（敏感字段：name(_enc + _tail) / mobile 三件套 / id_card 两件套 / bank_card(_enc+_tail4)）
 * 用途：对应 PRD §1.4 平台骑手、§3.3.1 登录与认证、§3.4.4 骑手管理
 */
@Entity({ name: 'rider' })
@Index('uk_rider_no', ['riderNo'], { unique: true })
@Index('uk_mobile_hash', ['mobileHash'], { unique: true })
@Index('uk_id_card_hash', ['idCardHash'], { unique: true })
@Index('idx_audit_status', ['auditStatus', 'createdAt'])
@Index('idx_city_status_online', ['serviceCity', 'status', 'onlineStatus'])
@Index('idx_level', ['level'])
export class Rider extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'rider_no', type: 'varchar', length: 32, comment: '骑手编号（R+日期+序号）' })
  riderNo!: string

  /* ===== 姓名（仅 _enc + 姓 _tail） ===== */
  @Column({ name: 'name_enc', type: 'varbinary', length: 255, comment: '姓名 AES-GCM 密文' })
  nameEnc!: Buffer

  @Column({
    name: 'name_tail',
    type: 'varchar',
    length: 8,
    nullable: true,
    comment: '姓（脱敏展示，例：张*）'
  })
  nameTail!: string | null

  /* ===== 手机三件套 ===== */
  @Column({ name: 'mobile_enc', type: 'varbinary', length: 255, comment: '手机号 AES-GCM' })
  mobileEnc!: Buffer

  @Column({ name: 'mobile_hash', type: 'char', length: 64, comment: '手机号 HMAC-SHA256' })
  mobileHash!: string

  @Column({ name: 'mobile_tail4', type: 'varchar', length: 8, comment: '手机号末 4 位' })
  mobileTail4!: string

  /* ===== 身份证两件套 ===== */
  @Column({ name: 'id_card_enc', type: 'varbinary', length: 255, comment: '身份证 AES-GCM' })
  idCardEnc!: Buffer

  @Column({ name: 'id_card_hash', type: 'char', length: 64, comment: '身份证 HMAC-SHA256' })
  idCardHash!: string

  @Column({
    name: 'gender',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '性别：0 未知 / 1 男 / 2 女'
  })
  gender!: number

  @Column({ name: 'birthday', type: 'date', nullable: true, comment: '生日（Date 形式）' })
  birthday!: Date | null

  /* ===== 银行卡（_enc + _tail4） ===== */
  @Column({
    name: 'bank_card_enc',
    type: 'varbinary',
    length: 255,
    nullable: true,
    comment: '提现银行卡 AES-GCM'
  })
  bankCardEnc!: Buffer | null

  @Column({
    name: 'bank_card_tail4',
    type: 'varchar',
    length: 8,
    nullable: true,
    comment: '银行卡末 4 位'
  })
  bankCardTail4!: string | null

  @Column({ name: 'bank_name', type: 'varchar', length: 64, nullable: true, comment: '开户行名称' })
  bankName!: string | null

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true, comment: '头像 URL' })
  avatarUrl!: string | null

  @Column({
    name: 'vehicle_type',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '配送工具：1 电动车 / 2 摩托车 / 3 自行车 / 4 步行'
  })
  vehicleType!: number | null

  @Column({
    name: 'vehicle_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '电动车车牌号'
  })
  vehicleNo!: string | null

  @Column({ name: 'service_city', type: 'char', length: 6, comment: '服务城市编码' })
  serviceCity!: string

  @Column({
    name: 'level',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '骑手等级：1~5'
  })
  level!: number

  @Column({
    name: 'score',
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 5.0,
    comment: '综合评分（0~5.00；mysql2 默认 string 返回保留精度）'
  })
  score!: string

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
    comment: '账号状态：0 封禁 / 1 正常 / 2 离职'
  })
  status!: number

  @Column({
    name: 'online_status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '在线状态：0 离线 / 1 在线 / 2 忙碌'
  })
  onlineStatus!: number

  @Column({
    name: 'enc_key_ver',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '加密密钥版本'
  })
  encKeyVer!: number

  @Column({
    name: 'last_online_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '最近在线时间'
  })
  lastOnlineAt!: Date | null
}
