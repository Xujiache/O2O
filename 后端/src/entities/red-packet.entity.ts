/**
 * @file red-packet.entity.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc TypeORM Entity：D7.4 red_packet —— 红包（对齐 07_marketing.sql 第 4 张表）
 * @author 单 Agent V2.0
 *
 * packet_type：1 普通红包 / 2 拼手气 / 3 现金红包
 * 设计：领取走 Redis 事务原子（详见 RedPacketService.grab）保证不超发
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 红包池
 * 用途：对应 PRD §3.1.5.3 优惠券/红包、§3.4.7.1 优惠券/红包创建
 */
@Entity({ name: 'red_packet' })
@Index('uk_packet_code', ['packetCode'], { unique: true })
@Index('idx_status_valid', ['status', 'validTo'])
@Index('idx_issuer', ['issuerType', 'issuerId', 'status'])
export class RedPacket extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'packet_code', type: 'varchar', length: 64, comment: '红包编码' })
  packetCode!: string

  @Column({ name: 'name', type: 'varchar', length: 128, comment: '红包名称' })
  name!: string

  @Column({
    name: 'packet_type',
    type: 'tinyint',
    unsigned: true,
    comment: '类型：1 普通红包 / 2 拼手气 / 3 现金红包'
  })
  packetType!: number

  @Column({
    name: 'issuer_type',
    type: 'tinyint',
    unsigned: true,
    comment: '发放方：1 平台 / 2 商户'
  })
  issuerType!: number

  @Column({
    name: 'issuer_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '发放方 ID'
  })
  issuerId!: string | null

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, comment: '总金额' })
  totalAmount!: string

  @Column({ name: 'total_qty', type: 'int', unsigned: true, comment: '总份数' })
  totalQty!: number

  @Column({
    name: 'received_qty',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '已领取份数'
  })
  receivedQty!: number

  @Column({
    name: 'received_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '已领取金额'
  })
  receivedAmount!: string

  @Column({
    name: 'min_amount',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '单份最小金额（拼手气）'
  })
  minAmount!: string | null

  @Column({
    name: 'max_amount',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '单份最大金额'
  })
  maxAmount!: string | null

  @Column({
    name: 'target_user_ids',
    type: 'json',
    nullable: true,
    comment: '指定用户 ID 数组（NULL=任意用户）'
  })
  targetUserIds!: string[] | null

  @Column({ name: 'valid_from', type: 'datetime', precision: 3, comment: '生效起始' })
  validFrom!: Date

  @Column({ name: 'valid_to', type: 'datetime', precision: 3, comment: '失效时间' })
  validTo!: Date

  @Column({
    name: 'wishing',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '红包祝福语'
  })
  wishing!: string | null

  @Column({
    name: 'image_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '红包封面图'
  })
  imageUrl!: string | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 草稿 / 1 进行中 / 2 已发完 / 3 已过期 / 4 已退款'
  })
  status!: number
}
