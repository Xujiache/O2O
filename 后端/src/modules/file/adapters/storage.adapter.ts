/**
 * 存储适配器统一接口（DESIGN_P3 §五）
 *
 * 设计：
 * - 上层 file.service 仅依赖 `StorageAdapter`，不感知底层是 MinIO 还是 AliOSS
 * - 通过 `STORAGE_PROVIDER` 环境变量在 file.module 中决定注入哪个实现类
 * - 适配器只负责 IO；业务规则（MIME 校验 / 水印 / 入库）由 service 编排
 *
 * 用途：
 * - 开发环境：MinioAdapter（本机 docker 起 minio 容器）
 * - 生产环境：AliOssAdapter（阿里云 OSS）
 * - 任意第三方：未来若接 AWS S3 / 腾讯 COS，按本接口新增 adapter 即可
 */
export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER')

/** 内置 bucket 用途分类（与 DESIGN §5.2 对齐） */
export type BucketKind = 'public' | 'private' | 'temp'

/** 适配器初始化参数（由 file.module 在 useFactory 时构造） */
export interface StorageAdapterOptions {
  endpoint: string
  port: number
  useSSL: boolean
  accessKey: string
  secretKey: string
  region?: string
  /** bucket 名映射（开发可在 env 自定义） */
  buckets: Record<BucketKind, string>
  /** CDN 前缀（公开桶可走 CDN；为空则用 endpoint 直链） */
  cdnPrefix?: string
}

/** 上传输入 */
export interface PutObjectInput {
  bucket: string
  objectKey: string
  body: Buffer
  contentType: string
}

/** 上传结果 */
export interface PutObjectResult {
  bucket: string
  objectKey: string
  etag?: string
  size: number
}

/** 预签名 GET / PUT 输入 */
export interface PresignInput {
  bucket: string
  objectKey: string
  /** 默认 900 秒（15 分钟） */
  expiresSec: number
  /** 仅预签名 PUT 时使用，限制 Content-Type */
  contentType?: string
}

/**
 * STS 临时凭证（双模式，对齐 P3-REVIEW-01 R1 / I-03）
 *
 * mode='sts'           生产模式：真 STS-AssumeRole，返回临时 ak/sk + sessionToken
 *                      （AliOSS 推荐；MinIO 启用 Identity Plugin 后亦可）
 * mode='presigned-put' 开发模式：返回单次 PUT URL（不暴露任何长期凭证）
 *                      （MinIO dev 默认；前端 fetch(putUrl, { method:'PUT', body }) 即可）
 *
 * 字段：
 *   - 公共：mode / provider / bucket / keyPrefix / endpoint / region / expiration / expiresIn
 *   - sts 模式：accessKeyId / accessKeySecret / sessionToken
 *   - presigned-put 模式：putUrl / objectKey
 */
export interface StsCredential {
  /** 凭证模式（向后兼容：旧调用方未传 mode 视为 'sts'） */
  mode?: 'sts' | 'presigned-put'
  provider: 'minio' | 'ali-oss'

  /* sts 模式专用（presigned-put 模式留空字符串） */
  accessKeyId: string
  accessKeySecret: string
  sessionToken?: string

  /* presigned-put 模式专用 */
  putUrl?: string
  objectKey?: string

  /** 过期时间（毫秒时间戳） */
  expiration: number
  /** 有效秒数（默认 900） */
  expiresIn: number

  bucket: string
  keyPrefix: string
  endpoint: string
  region?: string
}

/**
 * StorageAdapter
 *
 * 用途：file.service 通过 @Inject(STORAGE_ADAPTER) 注入
 */
export interface StorageAdapter {
  /** 适配器唯一标识 */
  readonly name: 'minio' | 'ali-oss'

  /** 启动时自检 + 必要时创建 bucket */
  init(): Promise<void>

  /**
   * 直传（代理上传场景）
   * 参数：input 见 PutObjectInput
   * 返回值：PutObjectResult
   */
  putObject(input: PutObjectInput): Promise<PutObjectResult>

  /**
   * 删除对象
   * 参数：bucket / objectKey
   * 返回值：void
   */
  removeObject(bucket: string, objectKey: string): Promise<void>

  /**
   * 生成预签名 GET URL（私有桶下载场景）
   * 参数：见 PresignInput
   * 返回值：URL 字符串
   */
  presignGetUrl(input: PresignInput): Promise<string>

  /**
   * 生成预签名 PUT URL（前端 PUT 直传场景）
   * 参数：见 PresignInput
   * 返回值：URL 字符串
   */
  presignPutUrl(input: PresignInput): Promise<string>

  /**
   * 生成 STS 临时凭证（前端使用 minio-js / oss-js 直传场景）
   * 参数：bucket + keyPrefix + 有效期秒
   * 返回值：StsCredential
   * 备注：MinIO 开发环境若未启用 STS，返回长期 root ak/sk 并附 keyPrefix（仅开发；生产必须 STS）
   */
  generateStsCredential(
    bucket: string,
    keyPrefix: string,
    expiresSec: number
  ): Promise<StsCredential>

  /**
   * 拼接公开 URL（公开桶用，无签名）
   * 参数：bucket + objectKey
   * 返回值：URL 字符串
   */
  buildPublicUrl(bucket: string, objectKey: string): string
}
