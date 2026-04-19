/**
 * @file payment-record.entity.ts
 * @stage P4/T4.24~T4.29（Sprint 4）
 * @desc TypeORM Entity：D5.1 payment_record —— 支付记录（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * status：0 创建 / 1 支付中 / 2 成功 / 3 失败 / 4 关闭 / 5 已退款
 * pay_method：1 微信 / 2 支付宝 / 3 余额 / 4 混合
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 支付记录
 */
@Entity({ name: 'payment_record' })
@Index('uk_pay_no', ['payNo'], { unique: true })
@Index('uk_out_trade', ['outTradeNo'], { unique: true })
@Index('idx_order', ['orderNo', 'orderType'])
@Index('idx_user_status', ['userId', 'status', 'createdAt'])
@Index('idx_status_created', ['status', 'createdAt'])
export class PaymentRecord extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'pay_no', type: 'varchar', length: 28, comment: '平台支付单号（28 位）' })
  payNo!: string

  @Column({
    name: 'out_trade_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '第三方交易号'
  })
  outTradeNo!: string | null

  @Column({ name: 'order_no', type: 'char', length: 18, comment: '关联订单号' })
  orderNo!: string

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '付款用户 ID' })
  userId!: string

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, comment: '本次支付金额' })
  amount!: string

  @Column({
    name: 'pay_method',
    type: 'tinyint',
    unsigned: true,
    comment: '支付方式：1 微信 / 2 支付宝 / 3 余额 / 4 混合'
  })
  payMethod!: number

  @Column({
    name: 'channel',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '渠道明细（如 wxpay_jsapi/alipay_app）'
  })
  channel!: string | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 创建 / 1 支付中 / 2 成功 / 3 失败 / 4 关闭 / 5 已退款'
  })
  status!: number

  @Column({
    name: 'pay_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '支付完成时间'
  })
  payAt!: Date | null

  @Column({
    name: 'client_ip',
    type: 'varbinary',
    length: 16,
    nullable: true,
    comment: '客户端 IP'
  })
  clientIp!: Buffer | null

  @Column({
    name: 'device_info',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '设备信息'
  })
  deviceInfo!: string | null

  @Column({
    name: 'notify_url',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '回调地址'
  })
  notifyUrl!: string | null

  @Column({
    name: 'raw_request',
    type: 'json',
    nullable: true,
    comment: '请求第三方原始报文（脱敏后）'
  })
  rawRequest!: Record<string, unknown> | null

  @Column({
    name: 'raw_response',
    type: 'json',
    nullable: true,
    comment: '第三方原始返回（脱敏后）'
  })
  rawResponse!: Record<string, unknown> | null

  @Column({
    name: 'error_code',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '失败代码'
  })
  errorCode!: string | null

  @Column({
    name: 'error_msg',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '失败描述'
  })
  errorMsg!: string | null
}
