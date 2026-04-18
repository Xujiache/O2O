import { Injectable, Logger } from '@nestjs/common'
import OSS from 'ali-oss'
import {
  type PresignInput,
  type PutObjectInput,
  type PutObjectResult,
  type StorageAdapter,
  type StorageAdapterOptions,
  type StsCredential
} from './storage.adapter'

/**
 * 阿里云 OSS 适配器（生产环境推荐）
 *
 * 设计：
 * - 直接使用 ali-oss 6.x 官方 SDK，签名走 V1（V4 接口预留 signatureUrlV4，可在 P9 切换）
 * - 单 client 实例对所有 bucket 操作；put/get 时通过 useBucket 切换
 * - STS 凭证生成需要单独的 RAM-AssumeRole 配置（OSS_RAM_ROLE_ARN），这里给出
 *   完整接入点；环境变量缺失时降级返回长期 ak/sk + keyPrefix（仅开发兜底）
 *
 * 用途：通过 file.module 的 useFactory 注入到 STORAGE_ADAPTER（env: STORAGE_PROVIDER=ali-oss）
 */
@Injectable()
export class AliOssAdapter implements StorageAdapter {
  readonly name = 'ali-oss' as const
  private readonly logger = new Logger(AliOssAdapter.name)
  private readonly client: OSS
  private readonly options: StorageAdapterOptions

  /**
   * 构造适配器
   * @param options 由 file.module useFactory 提供
   */
  constructor(options: StorageAdapterOptions) {
    this.options = options
    this.client = new OSS({
      accessKeyId: options.accessKey,
      accessKeySecret: options.secretKey,
      endpoint: this.buildEndpoint(),
      region: options.region,
      secure: options.useSSL,
      cname: false,
      timeout: 30_000
    })
  }

  /**
   * 启动自检：尝试 listBuckets，确保凭证可用；不阻塞启动
   * 返回值：void
   */
  async init(): Promise<void> {
    try {
      await this.client.listBuckets({})
      this.logger.log('AliOSS 凭证可用')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`AliOSS listBuckets 失败：${msg}（生产请检查 RAM 权限）`)
    }
  }

  /**
   * 上传对象
   * 参数：见 StorageAdapter#putObject
   * 返回值：PutObjectResult
   */
  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    this.client.useBucket(input.bucket)
    const result = await this.client.put(input.objectKey, input.body, {
      mime: input.contentType,
      headers: { 'Content-Type': input.contentType }
    })
    return {
      bucket: input.bucket,
      objectKey: input.objectKey,
      etag: (result.res.headers as Record<string, string> | undefined)?.etag,
      size: input.body.length
    }
  }

  /**
   * 删除对象
   * 参数：bucket / objectKey
   * 返回值：void
   */
  async removeObject(bucket: string, objectKey: string): Promise<void> {
    this.client.useBucket(bucket)
    await this.client.delete(objectKey)
  }

  /**
   * 预签名 GET URL
   * 参数：input.expiresSec
   * 返回值：URL 字符串
   */
  async presignGetUrl(input: PresignInput): Promise<string> {
    this.client.useBucket(input.bucket)
    return this.client.signatureUrl(input.objectKey, {
      expires: input.expiresSec,
      method: 'GET'
    })
  }

  /**
   * 预签名 PUT URL（OSS 支持 Content-Type 强约束）
   * 参数：input.contentType 必传
   * 返回值：URL 字符串
   */
  async presignPutUrl(input: PresignInput): Promise<string> {
    this.client.useBucket(input.bucket)
    return this.client.signatureUrl(input.objectKey, {
      expires: input.expiresSec,
      method: 'PUT',
      'Content-Type': input.contentType ?? 'application/octet-stream'
    })
  }

  /**
   * STS 临时凭证（mode='sts'，支持完整 AssumeRole 流程）—— 生产用真 STS-AssumeRole
   *
   * 必填环境变量（生产）：
   *  - OSS_STS_ACCESS_KEY_ID / OSS_STS_ACCESS_KEY_SECRET（具备 sts:AssumeRole 权限的 RAM 子账号）
   *  - OSS_RAM_ROLE_ARN（acs:ram::账号id:role/角色名）
   *
   * 缺失时退回长期 ak/sk + keyPrefix（开发兜底；生产严禁如此使用）
   *
   * 参数：bucket / keyPrefix / expiresSec
   * 返回值：StsCredential（mode='sts'，含临时 ak/sk + sessionToken）
   */
  async generateStsCredential(
    bucket: string,
    keyPrefix: string,
    expiresSec: number
  ): Promise<StsCredential> {
    const stsAk = process.env.OSS_STS_ACCESS_KEY_ID
    const stsSk = process.env.OSS_STS_ACCESS_KEY_SECRET
    const roleArn = process.env.OSS_RAM_ROLE_ARN
    const endpoint = this.buildEndpoint()

    if (stsAk && stsSk && roleArn) {
      const sts = new OSS.STS({ accessKeyId: stsAk, accessKeySecret: stsSk })
      /* 仅授权 keyPrefix 下写入 + 读取 */
      const policy = {
        Version: '1',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['oss:PutObject', 'oss:GetObject'],
            Resource: [`acs:oss:*:*:${bucket}/${keyPrefix}*`]
          }
        ]
      }
      const result = await sts.assumeRole(roleArn, policy, expiresSec, 'o2o-platform')
      return {
        mode: 'sts',
        provider: 'ali-oss',
        accessKeyId: result.credentials.AccessKeyId,
        accessKeySecret: result.credentials.AccessKeySecret,
        sessionToken: result.credentials.SecurityToken,
        expiration: new Date(result.credentials.Expiration).getTime(),
        expiresIn: expiresSec,
        bucket,
        keyPrefix,
        endpoint,
        region: this.options.region
      }
    }
    /* 开发兜底（仅开发；生产请配置 OSS_STS_*） */
    this.logger.warn('AliOSS STS 配置缺失，降级返回长期 ak/sk（仅开发可用，生产严禁）')
    return {
      mode: 'sts',
      provider: 'ali-oss',
      accessKeyId: this.options.accessKey,
      accessKeySecret: this.options.secretKey,
      sessionToken: undefined,
      expiration: Date.now() + expiresSec * 1000,
      expiresIn: expiresSec,
      bucket,
      keyPrefix,
      endpoint,
      region: this.options.region
    }
  }

  /**
   * 拼接公开 URL（CDN 优先；否则 oss bucket 直链）
   * 参数：bucket / objectKey
   * 返回值：URL 字符串
   */
  buildPublicUrl(bucket: string, objectKey: string): string {
    if (this.options.cdnPrefix) {
      const trimmed = this.options.cdnPrefix.replace(/\/$/, '')
      return `${trimmed}/${objectKey}`
    }
    const protocol = this.options.useSSL ? 'https' : 'http'
    const region = this.options.region ?? 'oss-cn-hangzhou'
    return `${protocol}://${bucket}.${region}.aliyuncs.com/${objectKey}`
  }

  /**
   * 拼接 OSS endpoint（含协议）
   * 返回值：完整 endpoint URL，无 bucket 前缀
   */
  private buildEndpoint(): string {
    const protocol = this.options.useSSL ? 'https' : 'http'
    if (this.options.endpoint && this.options.endpoint.includes('aliyuncs.com')) {
      return this.options.endpoint.startsWith('http')
        ? this.options.endpoint
        : `${protocol}://${this.options.endpoint}`
    }
    const region = this.options.region ?? 'oss-cn-hangzhou'
    return `${protocol}://${region}.aliyuncs.com`
  }
}
