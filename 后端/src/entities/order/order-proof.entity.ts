/**
 * @file order-proof.entity.ts
 * @stage P4/T4.14 / T4.21（Sprint 3）
 * @desc TypeORM Entity：D4.5 order_proof —— 取送件凭证（不分表，对齐 04_order.sql）
 * @author 单 Agent V2.0
 *
 * proof_type：1 取件凭证 / 2 送达凭证 / 3 异常凭证
 * uploader_type：1 用户 / 2 商户 / 3 骑手 / 4 管理员
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 取送件凭证
 */
@Entity({ name: 'order_proof' })
@Index('idx_order_type', ['orderNo', 'proofType'])
@Index('idx_uploader_created', ['uploaderType', 'uploaderId', 'createdAt'])
export class OrderProof extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'order_no', type: 'char', length: 18, comment: '订单号' })
  orderNo!: string

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number

  @Column({
    name: 'proof_type',
    type: 'tinyint',
    unsigned: true,
    comment: '凭证类型：1 取件 / 2 送达 / 3 异常'
  })
  proofType!: number

  @Column({
    name: 'uploader_type',
    type: 'tinyint',
    unsigned: true,
    comment: '上传方：1 用户 / 2 商户 / 3 骑手 / 4 管理员'
  })
  uploaderType!: number

  @Column({ name: 'uploader_id', type: 'bigint', unsigned: true, comment: '上传方 ID' })
  uploaderId!: string

  @Column({ name: 'image_urls', type: 'json', comment: '凭证图片 URL 数组（最多 6 张）' })
  imageUrls!: string[]

  @Column({
    name: 'signature_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '电子签名图（可选）'
  })
  signatureUrl!: string | null

  @Column({
    name: 'lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '上传时经度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  lng!: number | null

  @Column({
    name: 'lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '上传时纬度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  lat!: number | null

  @Column({ name: 'ocr_text', type: 'text', nullable: true, comment: 'OCR 识别文本（用于稽核）' })
  ocrText!: string | null

  @Column({ name: 'remark', type: 'varchar', length: 255, nullable: true, comment: '说明' })
  remark!: string | null
}
