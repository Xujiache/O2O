/**
 * @file withdraw-record.entity.ts
 * @stage P4/T4.33（Sprint 5）
 * @desc TypeORM Entity：D5.7 withdraw_record —— 提现记录（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * status：0 申请 / 1 审核中 / 2 审核驳回 / 3 打款中 / 4 已打款 / 5 打款失败
 * 银行卡敏感字段三件套（_enc / _tail4 + enc_key_ver）
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 提现记录
 */
@Entity({ name: 'withdraw_record' })
@Index('uk_withdraw_no', ['withdrawNo'], { unique: true })
@Index('idx_owner_status_created', ['ownerType', 'ownerId', 'status', 'createdAt'])
@Index('idx_status_created', ['status', 'createdAt'])
@Index('idx_account_id', ['accountId'])
export class WithdrawRecord extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'withdraw_no', type: 'varchar', length: 32, comment: '提现单号' })
  withdrawNo!: string

  @Column({
    name: 'owner_type',
    type: 'tinyint',
    unsigned: true,
    comment: '提现主体：2 商户 / 3 骑手'
  })
  ownerType!: number

  @Column({ name: 'owner_id', type: 'bigint', unsigned: true, comment: '主体 ID' })
  ownerId!: string

  @Column({ name: 'account_id', type: 'bigint', unsigned: true, comment: '账户 ID' })
  accountId!: string

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, comment: '申请金额' })
  amount!: string

  @Column({
    name: 'fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '提现手续费'
  })
  fee!: string

  @Column({
    name: 'actual_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '实际到账金额'
  })
  actualAmount!: string

  @Column({
    name: 'bank_card_no_enc',
    type: 'varbinary',
    length: 255,
    comment: '银行卡号 AES-256-GCM'
  })
  bankCardNoEnc!: Buffer

  @Column({
    name: 'bank_card_tail4',
    type: 'varchar',
    length: 8,
    comment: '银行卡末 4 位'
  })
  bankCardTail4!: string

  @Column({
    name: 'account_holder_enc',
    type: 'varbinary',
    length: 255,
    comment: '持卡人姓名 AES-256-GCM'
  })
  accountHolderEnc!: Buffer

  @Column({ name: 'bank_name', type: 'varchar', length: 64, comment: '开户行名称（明文）' })
  bankName!: string

  @Column({
    name: 'bank_branch',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '支行名称'
  })
  bankBranch!: string | null

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
    comment: '状态：0 申请 / 1 审核中 / 2 驳回 / 3 打款中 / 4 已打款 / 5 失败'
  })
  status!: number

  @Column({
    name: 'audit_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '审核管理员 ID'
  })
  auditAdminId!: string | null

  @Column({
    name: 'audit_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '审核时间'
  })
  auditAt!: Date | null

  @Column({
    name: 'audit_remark',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '审核备注'
  })
  auditRemark!: string | null

  @Column({
    name: 'payout_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '第三方付款单号'
  })
  payoutNo!: string | null

  @Column({
    name: 'payout_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '打款完成时间'
  })
  payoutAt!: Date | null

  @Column({
    name: 'payout_response',
    type: 'json',
    nullable: true,
    comment: '第三方打款返回'
  })
  payoutResponse!: Record<string, unknown> | null
}
