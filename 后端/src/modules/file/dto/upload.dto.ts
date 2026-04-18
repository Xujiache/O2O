import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'

/**
 * 上传业务模块枚举（DESIGN §5.3 路径规范 {biz}/{yyyyMM}/{uuid}.{ext}）
 *
 * 用途：File Module 通过 bizModule 决定 OSS 路径前缀和 file_meta.biz_module 列；
 *      请勿在此处放业务相关精细分类，避免与 P4 业务耦合
 */
export const UPLOAD_BIZ_MODULES = [
  'avatar',
  'qual',
  'proof',
  'invoice',
  'banner',
  'product',
  'shop',
  'video',
  'temp',
  'other'
] as const
export type UploadBizModule = (typeof UPLOAD_BIZ_MODULES)[number]

/**
 * 代理上传请求 DTO（multipart/form-data 中 form 字段）
 *
 * 用途：POST /api/v1/file/upload，与 file 二进制字段一同提交
 */
export class UploadFileDto {
  @ApiProperty({
    description: '业务模块（决定 OSS 路径前缀与 file_meta.biz_module 列）',
    enum: UPLOAD_BIZ_MODULES,
    example: 'product'
  })
  @IsIn(UPLOAD_BIZ_MODULES as unknown as string[])
  bizModule!: UploadBizModule

  @ApiProperty({
    description: '业务单号（订单号 / 资质 ID 等，可选）',
    required: false,
    example: 'T20260419AB123'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bizNo?: string

  @ApiProperty({
    description: '是否公开访问；true=o2o-public 桶，直返 CDN URL；false=o2o-private，返回签名 URL',
    required: false,
    default: true,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') return value === 'true' || value === '1'
    return Boolean(value)
  })
  isPublic?: boolean = true

  @ApiProperty({
    description: '是否为商品图加水印（仅图片有效；右下角文字水印）',
    required: false,
    default: false,
    example: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') return value === 'true' || value === '1'
    return Boolean(value)
  })
  watermark?: boolean = false
}

/**
 * STS 直传请求 DTO
 *
 * 用途：POST /api/v1/file/sts，前端拿到 ak/sk 后用 minio-js / oss-js 直传
 */
export class StsRequestDto {
  @ApiProperty({ description: '业务模块', enum: UPLOAD_BIZ_MODULES, example: 'qual' })
  @IsIn(UPLOAD_BIZ_MODULES as unknown as string[])
  bizModule!: UploadBizModule

  @ApiProperty({ description: '是否公开桶', required: false, default: false, example: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') return value === 'true' || value === '1'
    return Boolean(value)
  })
  isPublic?: boolean = false

  @ApiProperty({
    description: '可选的 contentType，用于预生成约束（multipart 直传时不强校验）',
    required: false,
    example: 'image/jpeg'
  })
  @IsOptional()
  @IsString()
  contentType?: string
}

/**
 * 预签名 PUT URL 请求 DTO
 *
 * 用途：POST /api/v1/file/presign，前端 PUT 二进制至返回的 URL 即可
 */
export class PresignRequestDto {
  @ApiProperty({ description: '业务模块', enum: UPLOAD_BIZ_MODULES, example: 'avatar' })
  @IsIn(UPLOAD_BIZ_MODULES as unknown as string[])
  bizModule!: UploadBizModule

  @ApiProperty({
    description: '原始文件名（含扩展名，用于派生 object_key）',
    example: 'avatar.png'
  })
  @IsString()
  @MaxLength(255)
  fileName!: string

  @ApiProperty({ description: 'MIME 类型', example: 'image/png' })
  @IsString()
  @MaxLength(64)
  contentType!: string

  @ApiProperty({ description: '是否公开桶', required: false, default: true, example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') return value === 'true' || value === '1'
    return Boolean(value)
  })
  isPublic?: boolean = true

  @ApiProperty({
    description: '签名有效期（秒，默认 900=15min，最大 3600）',
    required: false,
    example: 900
  })
  @IsOptional()
  expiresSec?: number = 900
}
