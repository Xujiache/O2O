/**
 * @file merchant-qualification.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.4 merchant_qualification —— 商户资质附件
 *       （对齐 01_account.sql 第 4 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 商户资质附件
 * 用途：对应 PRD §3.2.1.2 资质认证（营业执照、食品经营许可证等）
 */
@Entity({ name: 'merchant_qualification' })
@Index('idx_merchant_type', ['merchantId', 'qualType'])
export class MerchantQualification extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({
    name: 'merchant_id',
    type: 'bigint',
    unsigned: true,
    comment: '商户 ID（→ merchant.id）'
  })
  merchantId!: string

  @Column({
    name: 'qual_type',
    type: 'tinyint',
    unsigned: true,
    comment: '资质类型：1 营业执照 / 2 食品经营许可证 / 3 法人身份证 / 4 其他'
  })
  qualType!: number

  @Column({ name: 'cert_no', type: 'varchar', length: 64, nullable: true, comment: '证件编号' })
  certNo!: string | null

  @Column({ name: 'cert_name', type: 'varchar', length: 128, nullable: true, comment: '证件名称' })
  certName!: string | null

  @Column({ name: 'valid_from', type: 'date', nullable: true, comment: '生效起始日' })
  validFrom!: Date | null

  @Column({ name: 'valid_to', type: 'date', nullable: true, comment: '到期日（NULL=长期有效）' })
  validTo!: Date | null

  @Column({
    name: 'attach_url',
    type: 'varchar',
    length: 1024,
    comment: '附件图片/PDF 的 MinIO URL'
  })
  attachUrl!: string

  @Column({
    name: 'audit_status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '审核状态：0 待审 / 1 通过 / 2 驳回'
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
}
