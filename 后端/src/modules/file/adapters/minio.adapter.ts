import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Client as MinioClient } from 'minio'
import {
  type PresignInput,
  type PutObjectInput,
  type PutObjectResult,
  type StorageAdapter,
  type StorageAdapterOptions,
  type StsCredential
} from './storage.adapter'

/**
 * MinIO 存储适配器（开发环境默认）
 *
 * 设计：
 * - minio-js 8.x 已统一 Promise API（`putObject` / `presignedPutObject` / `presignedGetObject`）
 * - bucket 不存在时自动创建（开发环境便利）；生产由运维统一预创建并设置 policy
 * - STS：P3-REVIEW-01 R1 / I-03 修复后改为 mode='presigned-put'（单次 PUT URL），
 *        不再返回 root ak/sk；生产 MinIO 启用 Identity Plugin 后可在本类追加真 STS-AssumeRole 分支
 *
 * 用途：通过 file.module 的 useFactory 注入到 STORAGE_ADAPTER
 */
@Injectable()
export class MinioAdapter implements StorageAdapter {
  readonly name = 'minio' as const
  private readonly logger = new Logger(MinioAdapter.name)
  private readonly client: MinioClient
  private readonly options: StorageAdapterOptions

  /**
   * 构造适配器
   * @param options 由 file.module useFactory 提供
   */
  constructor(options: StorageAdapterOptions) {
    this.options = options
    this.client = new MinioClient({
      endPoint: options.endpoint,
      port: options.port,
      useSSL: options.useSSL,
      accessKey: options.accessKey,
      secretKey: options.secretKey,
      region: options.region ?? 'cn-north-1'
    })
  }

  /**
   * 启动时确保 3 个 bucket 存在；任何子项失败仅记录日志，不阻塞启动
   * 返回值：void
   * 用途：file.module onModuleInit 调用
   */
  async init(): Promise<void> {
    const targets = Object.values(this.options.buckets)
    for (const bucket of targets) {
      try {
        const exists = await this.client.bucketExists(bucket)
        if (!exists) {
          await this.client.makeBucket(bucket, this.options.region ?? 'cn-north-1')
          this.logger.log(`MinIO bucket 创建成功 ${bucket}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(`MinIO bucket 检查/创建失败 ${bucket}：${msg}（开发环境可忽略）`)
      }
    }
  }

  /**
   * 上传对象（小文件 putObject；minio-js 内部超过 partSize 自动 multipart）
   * 参数：见 StorageAdapter#putObject
   * 返回值：PutObjectResult
   */
  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const result = await this.client.putObject(
      input.bucket,
      input.objectKey,
      input.body,
      input.body.length,
      { 'Content-Type': input.contentType }
    )
    return {
      bucket: input.bucket,
      objectKey: input.objectKey,
      etag: result.etag,
      size: input.body.length
    }
  }

  /**
   * 删除对象
   * 参数：bucket / objectKey
   * 返回值：void
   */
  async removeObject(bucket: string, objectKey: string): Promise<void> {
    await this.client.removeObject(bucket, objectKey)
  }

  /**
   * 预签名 GET URL（私有桶下载）
   * 参数：input.expiresSec 默认调用方传入
   * 返回值：URL 字符串
   */
  async presignGetUrl(input: PresignInput): Promise<string> {
    return this.client.presignedGetObject(input.bucket, input.objectKey, input.expiresSec)
  }

  /**
   * 预签名 PUT URL（前端直传）
   * 参数：input.contentType 当前 minio-js 8.x 不支持在签名时强制 Content-Type
   *       前端 PUT 时若错传 Content-Type，对象仍可写入；强约束建议改用 STS
   * 返回值：URL 字符串
   */
  async presignPutUrl(input: PresignInput): Promise<string> {
    return this.client.presignedPutObject(input.bucket, input.objectKey, input.expiresSec)
  }

  /**
   * 临时凭证：mode='presigned-put'（P3-REVIEW-01 R1 / I-03 修复）
   *
   * 安全性变化：
   *   - **不再** 返回 MinIO root accessKey / secretKey（旧版 R0 行为）
   *   - 改为返回 1 个 15 分钟单次有效的 PUT URL
   *   - 前端：`fetch(putUrl, { method: 'PUT', body, headers: { 'Content-Type': '...' } })`
   *   - 完成后业务侧用 confirm 接口（P4 阶段）落 file_meta，本方法不入库
   *
   * 生产升级路径：MinIO 启用 Identity Plugin（OIDC/LDAP STS API）后，可在本方法
   *               按 ENV `MINIO_STS_ENABLED=true` 切换到真 STS-AssumeRole 分支
   *
   * 参数：bucket / keyPrefix / expiresSec
   * 返回值：StsCredential（mode='presigned-put'，含 putUrl + objectKey）
   */
  async generateStsCredential(
    bucket: string,
    keyPrefix: string,
    expiresSec: number
  ): Promise<StsCredential> {
    const protocol = this.options.useSSL ? 'https' : 'http'
    const endpoint = `${protocol}://${this.options.endpoint}:${this.options.port}`
    /* keyPrefix 末尾确保有 / —— 拼装单文件 object key */
    const prefix = keyPrefix.endsWith('/') ? keyPrefix : `${keyPrefix}/`
    const objectKey = `${prefix}${randomUUID().replace(/-/g, '')}`
    const putUrl = await this.client.presignedPutObject(bucket, objectKey, expiresSec)
    return {
      mode: 'presigned-put',
      provider: 'minio',
      /* presigned-put 模式下不暴露任何长期/临时 ak/sk */
      accessKeyId: '',
      accessKeySecret: '',
      sessionToken: undefined,
      putUrl,
      objectKey,
      expiration: Date.now() + expiresSec * 1000,
      expiresIn: expiresSec,
      bucket,
      keyPrefix: prefix,
      endpoint,
      region: this.options.region ?? 'cn-north-1'
    }
  }

  /**
   * 拼接公开 URL（CDN 优先；否则 endpoint 直链）
   * 参数：bucket / objectKey
   * 返回值：URL 字符串
   */
  buildPublicUrl(bucket: string, objectKey: string): string {
    if (this.options.cdnPrefix) {
      const trimmed = this.options.cdnPrefix.replace(/\/$/, '')
      return `${trimmed}/${objectKey}`
    }
    const protocol = this.options.useSSL ? 'https' : 'http'
    return `${protocol}://${this.options.endpoint}:${this.options.port}/${bucket}/${objectKey}`
  }
}
