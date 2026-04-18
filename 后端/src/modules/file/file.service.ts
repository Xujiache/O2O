import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { FileMeta } from '@/entities/file-meta.entity'
import { SnowflakeId } from '@/utils/snowflake-id.util'
import { STORAGE_ADAPTER, type StorageAdapter } from './adapters/storage.adapter'
import {
  PresignRequestDto,
  StsRequestDto,
  UPLOAD_BIZ_MODULES,
  UploadFileDto,
  type UploadBizModule
} from './dto/upload.dto'
import {
  type FileUploadResultDto,
  type PresignResultDto,
  type StsCredentialDto
} from './dto/file-result.dto'
import { assertFileAllowed, getExt, mimeToFileType } from './utils/mime.util'
import { addWatermark, probeImageMeta } from './utils/watermark.util'

/**
 * 上传上下文（P3-REVIEW-01 R1 / I-02 修复后强制由 controller 通过
 * `@CurrentUser()` 装饰器从 JwtAuthGuard 注入的 req.user 转换得到，
 * 不再支持从 HTTP Header 兜底）
 *
 * 字段：
 *   - uploaderType  来自 user.userType 枚举映射：user→1 / merchant→2 / rider→3 / admin→4
 *   - uploaderId    来自 user.uid（雪花字符串）
 */
export interface UploadContext {
  uploaderType: number
  uploaderId: string
}

/**
 * File Service —— 文件存储核心业务编排
 *
 * 设计：
 * - 适配器只负责 IO；本类编排 校验 → 水印 → 入库 → 返回
 * - 公开桶直返 CDN URL；私有桶返回 15 分钟签名 URL
 * - 删除走软删（is_deleted=1 + deleted_at），OSS 端的对象清理交给 P9 异步 Job
 *
 * 用途：
 * - file.controller：5 个 endpoint 统一调用本类
 * - 其他业务模块（P4 商品/订单/资质）import FileService 后通过 `getById` 反查
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name)
  private readonly buckets: Record<'public' | 'private' | 'temp', string>
  private initialized = false

  /**
   * 构造服务
   * @param adapter        存储适配器（MinIO 或 AliOSS，由 module useFactory 注入）
   * @param fileMetaRepo   file_meta 表 TypeORM Repository
   * @param config         读取 file.* 配置
   */
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter,
    @InjectRepository(FileMeta) private readonly fileMetaRepo: Repository<FileMeta>,
    private readonly config: ConfigService
  ) {
    this.buckets = {
      public: this.config.get<string>('file.publicBucket', 'o2o-public'),
      private: this.config.get<string>('file.privateBucket', 'o2o-private'),
      temp: this.config.get<string>('file.tempBucket', 'o2o-temp')
    }
  }

  /**
   * 启动时确保 bucket 存在（仅执行一次）
   * 用途：file.controller 接口首次调用时懒触发，或 module onApplicationBootstrap
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    await this.adapter.init()
    this.initialized = true
  }

  /**
   * 代理上传：multipart 直接接收 → 校验 → （可选）水印 → put 到 OSS → 入库
   *
   * 参数：file Express.Multer.File；dto UploadFileDto；ctx UploadContext
   * 返回值：FileUploadResultDto
   * 错误：
   *  - PARAM_INVALID + 415 不支持的 MIME / 扩展名
   *  - PARAM_INVALID + 413 文件过大
   *  - STORAGE_PROVIDER_ERROR + 502 OSS IO 失败
   */
  async upload(
    file: Express.Multer.File,
    dto: UploadFileDto,
    ctx: UploadContext
  ): Promise<FileUploadResultDto> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '上传文件不能为空',
        HttpStatus.BAD_REQUEST
      )
    }
    await this.ensureInitialized()

    assertFileAllowed(file.originalname, file.mimetype, file.size)

    let body = file.buffer
    if (dto.watermark) {
      body = await addWatermark(body, file.mimetype)
    }

    const isPublic = dto.isPublic !== false
    const bucket = isPublic ? this.buckets.public : this.buckets.private
    const objectKey = this.buildObjectKey(dto.bizModule, file.originalname)

    try {
      await this.adapter.putObject({
        bucket,
        objectKey,
        body,
        contentType: file.mimetype
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`OSS putObject 失败：${msg}`)
      throw new BusinessException(
        BizErrorCode.STORAGE_PROVIDER_ERROR,
        `对象存储写入失败：${msg}`,
        HttpStatus.BAD_GATEWAY
      )
    }

    const meta = await probeImageMeta(body, file.mimetype)
    const md5 = createHash('md5').update(body).digest('hex')

    const entity = await this.persistFileMeta({
      bucket,
      objectKey,
      fileName: file.originalname,
      fileSize: body.length,
      mimeType: file.mimetype,
      md5,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      uploaderType: ctx.uploaderType,
      uploaderId: ctx.uploaderId,
      bizModule: dto.bizModule,
      bizNo: dto.bizNo ?? null,
      isPublic
    })

    const url = isPublic
      ? this.adapter.buildPublicUrl(bucket, objectKey)
      : await this.adapter.presignGetUrl({ bucket, objectKey, expiresSec: 900 })
    if (isPublic) {
      entity.cdnUrl = url
      await this.fileMetaRepo.save(entity)
    }
    return this.toDto(entity, url)
  }

  /**
   * STS 直传凭证生成
   * 参数：dto；ctx
   * 返回值：StsCredentialDto
   */
  async generateSts(dto: StsRequestDto, _ctx: UploadContext): Promise<StsCredentialDto> {
    await this.ensureInitialized()
    const isPublic = dto.isPublic === true
    const bucket = isPublic ? this.buckets.public : this.buckets.private
    const yyyymm = this.yyyymm()
    const keyPrefix = `${dto.bizModule}/${yyyymm}/`
    const credential = await this.adapter.generateStsCredential(bucket, keyPrefix, 900)
    return { ...credential }
  }

  /**
   * 预签名 PUT URL
   * 参数：dto；ctx
   * 返回值：PresignResultDto
   */
  async generatePresign(dto: PresignRequestDto, _ctx: UploadContext): Promise<PresignResultDto> {
    await this.ensureInitialized()
    if (!UPLOAD_BIZ_MODULES.includes(dto.bizModule)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `bizModule 非法：${dto.bizModule}`)
    }
    assertFileAllowed(dto.fileName, dto.contentType, 1) // size 仅做 0 检查兜底
    const expiresSec = Math.min(Math.max(dto.expiresSec ?? 900, 60), 3600)
    const isPublic = dto.isPublic !== false
    const bucket = isPublic ? this.buckets.public : this.buckets.private
    const objectKey = this.buildObjectKey(dto.bizModule, dto.fileName)
    const url = await this.adapter.presignPutUrl({
      bucket,
      objectKey,
      expiresSec,
      contentType: dto.contentType
    })
    return {
      url,
      bucket,
      objectKey,
      expiration: Date.now() + expiresSec * 1000,
      contentType: dto.contentType
    }
  }

  /**
   * 删除文件（软删 + OSS 物理删除）
   *
   * 鉴权策略（P3-REVIEW-01 R1 / I-02 收紧）：
   *   - 管理员（uploaderType=4）放行
   *   - 其他必须 uploaderId 与文件 owner 一致；非 owner 直接抛 20003
   *   - 不再额外要求 uploaderType 一致（避免商户用户登录后 type 字段刷新导致误判；
   *     uid 维度的归属判定足够防越权）
   *
   * 参数：id 文件主键；ctx 当前操作方（来自 @CurrentUser() 推导）
   * 返回值：被删 fileMeta 的 fileNo
   * 错误：
   *   - BIZ_RESOURCE_NOT_FOUND 文件不存在或已被删
   *   - AUTH_PERMISSION_DENIED 非 owner 且非 admin
   */
  async remove(id: string, ctx: UploadContext): Promise<string> {
    const file = await this.fileMetaRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!file) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '文件不存在或已被删除',
        HttpStatus.NOT_FOUND
      )
    }
    /* I-02：admin 放行；其他要求 owner uid 一致 */
    const isAdmin = ctx.uploaderType === 4
    const isOwner = file.uploaderId === ctx.uploaderId
    if (!isAdmin && !isOwner) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '仅文件 owner 或管理员可删除',
        HttpStatus.FORBIDDEN
      )
    }
    try {
      await this.adapter.removeObject(file.bucket, file.objectKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`OSS 删除失败但继续软删 ${file.bucket}/${file.objectKey}：${msg}`)
    }
    file.isDeleted = 1
    file.deletedAt = new Date()
    file.updatedAt = new Date()
    await this.fileMetaRepo.save(file)
    return file.fileNo
  }

  /**
   * 根据 ID 反查文件元数据 + 可访问 URL（业务模块用）
   *
   * 鉴权策略（P3-REVIEW-02 R2 / I-09 收紧）：
   *   - 管理员（uploaderType=4）放行
   *   - 其他必须 uploaderId 与文件 owner 一致；非 owner 直接抛 20003 / 403
   *   - 与 remove() 方法保持一致的 owner 校验语义，防止越权访问私有文件 URL
   *
   * 参数：id 文件主键；ctx 当前操作方（来自 @CurrentUser() 推导）
   * 返回值：FileUploadResultDto
   * 错误：
   *   - BIZ_RESOURCE_NOT_FOUND 文件不存在或已被删（404）
   *   - AUTH_PERMISSION_DENIED 非 owner 且非 admin（403）
   */
  async getById(id: string, ctx: UploadContext): Promise<FileUploadResultDto> {
    const file = await this.fileMetaRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!file) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '文件不存在或已被删除',
        HttpStatus.NOT_FOUND
      )
    }
    /* R2/I-09：admin 放行；其他要求 owner uid 一致（与 remove() 同语义） */
    const isAdmin = ctx.uploaderType === 4
    const isOwner = file.uploaderId === ctx.uploaderId
    if (!isAdmin && !isOwner) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '仅文件 owner 或管理员可查看',
        HttpStatus.FORBIDDEN
      )
    }
    const url =
      file.isPublic === 1
        ? (file.cdnUrl ?? this.adapter.buildPublicUrl(file.bucket, file.objectKey))
        : await this.adapter.presignGetUrl({
            bucket: file.bucket,
            objectKey: file.objectKey,
            expiresSec: 900
          })
    return this.toDto(file, url)
  }

  /**
   * 入库 file_meta（内部）
   * 参数：拼装好的列值
   * 返回值：FileMeta 实体
   */
  private async persistFileMeta(input: {
    bucket: string
    objectKey: string
    fileName: string
    fileSize: number
    mimeType: string
    md5: string
    width: number | null
    height: number | null
    uploaderType: number
    uploaderId: string
    bizModule: UploadBizModule
    bizNo: string | null
    isPublic: boolean
  }): Promise<FileMeta> {
    const now = new Date()
    const entity = this.fileMetaRepo.create({
      id: SnowflakeId.nextString(),
      tenantId: 1,
      fileNo: SnowflakeId.nextFileNo(),
      bucket: input.bucket,
      objectKey: input.objectKey,
      fileName: input.fileName,
      fileSize: String(input.fileSize),
      mimeType: input.mimeType,
      fileType: mimeToFileType(input.mimeType),
      width: input.width,
      height: input.height,
      durationS: null,
      md5: input.md5,
      cdnUrl: null,
      uploaderType: input.uploaderType,
      uploaderId: input.uploaderId,
      bizModule: input.bizModule,
      bizNo: input.bizNo,
      isPublic: input.isPublic ? 1 : 0,
      expireAt: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    return this.fileMetaRepo.save(entity)
  }

  /**
   * 统一 DTO 转换（内部）
   * 参数：file 实体；url 已计算的访问 URL
   * 返回值：FileUploadResultDto
   */
  private toDto(file: FileMeta, url: string): FileUploadResultDto {
    return {
      id: file.id,
      fileNo: file.fileNo,
      bucket: file.bucket,
      objectKey: file.objectKey,
      url,
      size: typeof file.fileSize === 'string' ? parseInt(file.fileSize, 10) : file.fileSize,
      mimeType: file.mimeType,
      isPublic: file.isPublic === 1
    }
  }

  /**
   * 拼装 OSS 对象 Key（{biz}/{yyyyMM}/{uuid}.{ext}）
   * 参数：bizModule / fileName
   * 返回值：string
   */
  private buildObjectKey(bizModule: UploadBizModule, fileName: string): string {
    const ext = getExt(fileName) || 'bin'
    const id = randomUUID().replace(/-/g, '')
    return `${bizModule}/${this.yyyymm()}/${id}.${ext}`
  }

  /**
   * 取当前年月（yyyyMM）
   * 用途：路径分桶按月分桶，便于运维清理
   */
  private yyyymm(): string {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  }
}
