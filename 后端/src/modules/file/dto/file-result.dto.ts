import { ApiProperty } from '@nestjs/swagger'

/**
 * 上传成功结果（4 接口共用）
 *
 * 用途：
 * - 代理上传 / 完成 STS 直传后台回执 → 返回 `url + fileNo + meta`
 * - 前端落入 `<img src=url>` 或保存 fileNo 关联业务
 */
export class FileUploadResultDto {
  @ApiProperty({ description: '文件主键（雪花 ID 字符串）', example: '7212876543210123456' })
  id!: string

  @ApiProperty({
    description: '业务文件号（前缀 F + 时间戳 + 随机）',
    example: 'F202604190120000abc12345'
  })
  fileNo!: string

  @ApiProperty({ description: 'OSS bucket', example: 'o2o-public' })
  bucket!: string

  @ApiProperty({ description: 'OSS 对象 Key', example: 'product/202604/abc12345.jpg' })
  objectKey!: string

  @ApiProperty({
    description:
      '可访问 URL；公开桶为 CDN/MinIO 直链；私有桶为 15 分钟有效签名 URL（消费方在过期前用即可）',
    example: 'http://localhost:9000/o2o-public/product/202604/abc12345.jpg'
  })
  url!: string

  @ApiProperty({ description: '文件大小（字节）', example: 102400 })
  size!: number

  @ApiProperty({ description: 'MIME 类型', example: 'image/jpeg' })
  mimeType!: string

  @ApiProperty({ description: '是否公开桶', example: true })
  isPublic!: boolean
}

/**
 * STS 临时凭证返回 DTO
 *
 * 双模式（P3-REVIEW-01 R1 / I-03 修复后）：
 *   - mode='sts'           AliOSS 真 STS-AssumeRole；返回临时 ak/sk + sessionToken（生产）
 *   - mode='presigned-put' MinIO 单次 PUT URL；前端 fetch(putUrl, { method:'PUT', body })
 *
 * 用途：前端拿到响应后按 mode 分支：
 *   - sts            走 minio-js / oss-js（带 sessionToken）
 *   - presigned-put  走 fetch PUT（更安全，不暴露 root ak/sk）
 */
export class StsCredentialDto {
  @ApiProperty({
    description: '凭证模式：sts=真 STS（OSS 推荐），presigned-put=预签名 PUT（MinIO dev 推荐）',
    enum: ['sts', 'presigned-put'],
    required: false,
    example: 'presigned-put'
  })
  mode?: 'sts' | 'presigned-put'

  @ApiProperty({ description: '存储类型 minio / ali-oss', example: 'minio' })
  provider!: 'minio' | 'ali-oss'

  @ApiProperty({
    description:
      '【presigned-put 模式专用】单次 PUT URL（前端 fetch 时方法必须为 PUT，body 为文件）',
    required: false,
    example: 'http://localhost:9000/o2o-private/qual/202604/abc.jpg?X-Amz-Algorithm=...'
  })
  putUrl?: string

  @ApiProperty({
    description: '【presigned-put 模式专用】PUT 后的 object key（业务 confirm 时回填到 file_meta）',
    required: false,
    example: 'qual/202604/abc12345.jpg'
  })
  objectKey?: string

  @ApiProperty({ description: '凭证有效秒数（默认 900s = 15min）', example: 900 })
  expiresIn!: number

  @ApiProperty({
    description: '【sts 模式专用】Access Key ID（presigned-put 模式下为空）',
    required: false,
    example: 'STS.AKIA...'
  })
  accessKeyId?: string

  @ApiProperty({
    description: '【sts 模式专用】Access Key Secret（presigned-put 模式下为空）',
    required: false
  })
  accessKeySecret?: string

  @ApiProperty({
    description: '【sts 模式专用】Session Token（OSS STS 必返；presigned-put 模式下为空）',
    required: false,
    example: 'eyJhbGc...'
  })
  sessionToken?: string

  @ApiProperty({ description: '凭证过期时间（毫秒时间戳）', example: 1745040900000 })
  expiration!: number

  @ApiProperty({ description: 'OSS bucket', example: 'o2o-private' })
  bucket!: string

  @ApiProperty({ description: '允许写入的 object key 前缀', example: 'qual/202604/' })
  keyPrefix!: string

  @ApiProperty({
    description: 'OSS endpoint URL（不带 bucket 前缀）',
    example: 'http://localhost:9000'
  })
  endpoint!: string

  @ApiProperty({
    description: 'Region（OSS 可空；MinIO 默认 cn-north-1）',
    required: false,
    example: 'cn-north-1'
  })
  region?: string
}

/**
 * 预签名 PUT URL 返回 DTO
 *
 * 用途：前端直接 `fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } })`
 */
export class PresignResultDto {
  @ApiProperty({
    description: '预签名 PUT URL（一次性，含签名 query）',
    example: 'http://localhost:9000/...'
  })
  url!: string

  @ApiProperty({ description: 'OSS bucket', example: 'o2o-public' })
  bucket!: string

  @ApiProperty({
    description: 'OSS 对象 Key（前端 PUT 完后用此 key 调用 confirm 接口）',
    example: 'avatar/202604/abc.png'
  })
  objectKey!: string

  @ApiProperty({ description: '签名过期时间（毫秒时间戳）', example: 1745040900000 })
  expiration!: number

  @ApiProperty({
    description: '允许的 Content-Type（前端 PUT 必须使用同值）',
    example: 'image/png'
  })
  contentType!: string
}
