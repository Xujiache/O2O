import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 文件元数据实体（对应 P2 migrations/10_system.sql 的 file_meta 表）
 *
 * 设计要点：
 * - 主键 BIGINT UNSIGNED，由应用层雪花 ID 生成；TypeScript 字符串承载，
 *   避免 53 位安全整数溢出
 * - file_no 业务侧编号，全局唯一（前缀 F + 时间戳 + 随机后缀）
 * - bucket + object_key 组合唯一，对应 OSS 真实对象
 * - is_public=1 时直返 cdn_url；is_public=0 时返回签名 URL
 * - 软删 + 五标配字段对齐 P2 ACCEPTANCE §二（继承 BaseEntity）
 *
 * 用途：File 模块（员工 C 负责）写入；其他模块通过 file_no/biz_no 反查
 */
@Entity({ name: 'file_meta' })
@Index('idx_md5', ['md5'])
@Index('idx_uploader_module', ['uploaderType', 'uploaderId', 'bizModule'])
@Index('idx_biz', ['bizModule', 'bizNo'])
@Index('idx_expire_at', ['expireAt'])
export class FileMeta extends BaseEntity {
  /** 主键，雪花 ID 字符串 */
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true })
  id!: string

  /** 业务文件编号（前缀 F + 14 位时间 + 8 位随机；upload 后回写） */
  @Column({ name: 'file_no', type: 'varchar', length: 64, unique: true })
  fileNo!: string

  /** OSS bucket 名称（o2o-public / o2o-private / o2o-temp） */
  @Column({ name: 'bucket', type: 'varchar', length: 64 })
  bucket!: string

  /** OSS 对象路径（{biz}/{yyyyMM}/{uuid}.{ext}） */
  @Column({ name: 'object_key', type: 'varchar', length: 512 })
  objectKey!: string

  /** 原始文件名（含扩展名） */
  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string

  /** 文件大小（字节） */
  @Column({ name: 'file_size', type: 'bigint', unsigned: true })
  fileSize!: string

  /** MIME 类型（image/jpeg / video/mp4 / application/pdf 等） */
  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType!: string

  /** 业务分类：1 图片 / 2 视频 / 3 PDF / 4 Excel / 5 其他 */
  @Column({ name: 'file_type', type: 'tinyint', unsigned: true })
  fileType!: number

  /** 图片/视频宽度（像素） */
  @Column({ name: 'width', type: 'int', unsigned: true, nullable: true })
  width!: number | null

  /** 图片/视频高度（像素） */
  @Column({ name: 'height', type: 'int', unsigned: true, nullable: true })
  height!: number | null

  /** 视频/音频时长（秒） */
  @Column({ name: 'duration_s', type: 'int', unsigned: true, nullable: true })
  durationS!: number | null

  /** MD5 去重 */
  @Column({ name: 'md5', type: 'char', length: 32, nullable: true })
  md5!: string | null

  /** CDN 直链（公开文件直接返回） */
  @Column({ name: 'cdn_url', type: 'varchar', length: 512, nullable: true })
  cdnUrl!: string | null

  /** 上传方：1 用户 / 2 商户 / 3 骑手 / 4 管理员 / 5 系统 */
  @Column({ name: 'uploader_type', type: 'tinyint', unsigned: true })
  uploaderType!: number

  /** 上传方 ID */
  @Column({ name: 'uploader_id', type: 'bigint', unsigned: true })
  uploaderId!: string

  /** 业务模块（avatar / qual / proof / invoice / banner / product / video / shop / temp / other） */
  @Column({ name: 'biz_module', type: 'varchar', length: 64, nullable: true })
  bizModule!: string | null

  /** 业务单号 */
  @Column({ name: 'biz_no', type: 'varchar', length: 64, nullable: true })
  bizNo!: string | null

  /** 是否公开：0 私有需签名 / 1 公开 */
  @Column({ name: 'is_public', type: 'tinyint', unsigned: true, default: 1 })
  isPublic!: number

  /** 过期时间（NULL=永久） */
  @Column({ name: 'expire_at', type: 'datetime', precision: 3, nullable: true })
  expireAt!: Date | null
}
