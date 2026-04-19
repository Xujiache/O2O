/**
 * @file invoice.entity.ts
 * @stage P4/T4.34（Sprint 5）
 * @desc TypeORM Entity：D5.8 invoice —— 发票（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * status：0 申请 / 1 开票中 / 2 已开 / 3 失败 / 4 已作废
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 发票
 */
@Entity({ name: 'invoice' })
@Index('uk_invoice_no', ['invoiceNo'], { unique: true })
@Index('idx_applicant_status', ['applicantType', 'applicantId', 'status', 'createdAt'])
@Index('idx_status_created', ['status', 'createdAt'])
export class Invoice extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'invoice_no', type: 'varchar', length: 32, comment: '内部发票编号' })
  invoiceNo!: string

  @Column({
    name: 'applicant_type',
    type: 'tinyint',
    unsigned: true,
    comment: '申请方：1 用户 / 2 商户'
  })
  applicantType!: number

  @Column({ name: 'applicant_id', type: 'bigint', unsigned: true, comment: '申请方 ID' })
  applicantId!: string

  @Column({ name: 'order_nos', type: 'json', comment: '关联订单号数组（一票多单）' })
  orderNos!: string[]

  @Column({
    name: 'invoice_type',
    type: 'tinyint',
    unsigned: true,
    comment: '发票类型：1 电子普票 / 2 电子专票 / 3 纸质普票 / 4 纸质专票'
  })
  invoiceType!: number

  @Column({
    name: 'title_type',
    type: 'tinyint',
    unsigned: true,
    comment: '抬头类型：1 个人 / 2 企业'
  })
  titleType!: number

  @Column({ name: 'title', type: 'varchar', length: 255, comment: '抬头名称' })
  title!: string

  @Column({
    name: 'tax_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '税号（企业必填）'
  })
  taxNo!: string | null

  @Column({
    name: 'register_addr',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '注册地址（企业可选）'
  })
  registerAddr!: string | null

  @Column({
    name: 'register_phone',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '注册电话'
  })
  registerPhone!: string | null

  @Column({
    name: 'bank_name',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '开户行'
  })
  bankName!: string | null

  @Column({
    name: 'bank_account',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '开户账号'
  })
  bankAccount!: string | null

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, comment: '开票金额' })
  amount!: string

  @Column({
    name: 'email',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '电子发票收件邮箱'
  })
  email!: string | null

  @Column({
    name: 'mobile_enc',
    type: 'varbinary',
    length: 255,
    nullable: true,
    comment: '收件手机 AES-256-GCM'
  })
  mobileEnc!: Buffer | null

  @Column({
    name: 'mobile_tail4',
    type: 'varchar',
    length: 8,
    nullable: true,
    comment: '收件手机末 4 位'
  })
  mobileTail4!: string | null

  @Column({
    name: 'enc_key_ver',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '加密密钥版本'
  })
  encKeyVer!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 申请 / 1 开票中 / 2 已开 / 3 失败 / 4 已作废'
  })
  status!: number

  @Column({
    name: 'pdf_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '发票 PDF URL'
  })
  pdfUrl!: string | null

  @Column({
    name: 'e_invoice_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '电子发票号码（开票后回填）'
  })
  eInvoiceNo!: string | null

  @Column({
    name: 'issued_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '开票时间'
  })
  issuedAt!: Date | null

  @Column({
    name: 'error_msg',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '失败原因'
  })
  errorMsg!: string | null
}
