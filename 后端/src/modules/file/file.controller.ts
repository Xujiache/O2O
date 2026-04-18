/**
 * @file file.controller.ts
 * @stage P3/T3.16 + P3-REVIEW-01 R1（I-02 / I-06 修复）
 * @desc 文件存储模块 5 个 HTTP 接口（upload / sts / presign / get / remove）
 * @author 员工 C 初版 + 员工 A R1 接管（替换 X-Uploader-* 兜底为 @CurrentUser + JwtAuthGuard）
 *
 * R1 修复点：
 *   1. 删除 resolveUploadContext（X-Uploader-* 兜底）—— 任何客户端都能伪造 header
 *   2. 类级 @UseGuards(JwtAuthGuard, UserTypeGuard) + @UserTypes('user','merchant','rider','admin')
 *   3. 5 个接口入参：移除 @Headers，改为 @CurrentUser() user: AuthUser
 *   4. user.userType → uploaderType 数值映射：user→1 / merchant→2 / rider→3 / admin→4
 *   5. delete 接口的 owner 校验改为 fileMeta.uploaderId === user.uid 或 user.userType==='admin'
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse as SwaggerApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator'
import { UserTypes } from '../auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '../auth/guards/user-type.guard'
import { PresignRequestDto, StsRequestDto, UploadFileDto } from './dto/upload.dto'
import { FileUploadResultDto, PresignResultDto, StsCredentialDto } from './dto/file-result.dto'
import { FileService, type UploadContext } from './file.service'
import { ApiResponse } from '@/common'

/**
 * userType 字面量 → uploaderType 数值（与 file_meta.uploader_type 列对齐）
 * 用途：把 AuthUser.userType 转换为 file_meta 用的 1/2/3/4 数值
 */
function userToUploadContext(user: AuthUser): UploadContext {
  const map: Record<AuthUser['userType'], number> = {
    user: 1,
    merchant: 2,
    rider: 3,
    admin: 4
  }
  return { uploaderType: map[user.userType], uploaderId: user.uid }
}

/**
 * File Controller —— 5 个接口
 *
 * 路径前缀：/api/v1/file（main.ts setGlobalPrefix）
 * 鉴权（R1 加固）：
 *   - 类级 JwtAuthGuard + UserTypeGuard
 *   - @UserTypes('user', 'merchant', 'rider', 'admin')：4 端均可上传/查询/删除
 *
 * 用途：
 *   POST /upload   代理上传（multipart）
 *   POST /sts      STS / presigned-put 临时凭证
 *   POST /presign  预签名 PUT URL
 *   GET  /:id      反查 file_meta + 可访问 URL
 *   DELETE /:id    软删 + OSS 物理删除（owner 或 admin）
 */
@ApiTags('文件 / File')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user', 'merchant', 'rider', 'admin')
@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * 代理上传（小文件场景）
   * 参数：file Express.Multer.File；dto UploadFileDto；user AuthUser
   * 返回值：FileUploadResultDto
   */
  @Post('upload')
  @ApiOperation({
    summary: '代理上传（multipart）',
    description:
      '小文件代理上传：multipart/form-data 提交 file + bizModule + bizNo 等。\n' +
      '校验链：MIME 白名单 + 扩展名白名单 + 大小限制（图 20MB / 视频 100MB / PDF 10MB）。\n' +
      '错误码：10001 PARAM_INVALID（含 415/413 子语义）；40005 STORAGE_PROVIDER_ERROR'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        bizModule: {
          type: 'string',
          enum: [
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
          ]
        },
        bizNo: { type: 'string' },
        isPublic: { type: 'boolean', default: true },
        watermark: { type: 'boolean', default: false }
      },
      required: ['file', 'bizModule']
    }
  })
  @SwaggerApiResponse({ status: 200, description: '上传成功', type: FileUploadResultDto })
  @SwaggerApiResponse({ status: 413, description: '文件过大' })
  @SwaggerApiResponse({ status: 415, description: 'MIME / 扩展名 不允许' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthUser
  ): Promise<FileUploadResultDto> {
    return this.fileService.upload(file, dto, userToUploadContext(user))
  }

  /**
   * STS 临时凭证（MinIO 适配器返回 presigned-put 模式；OSS 真 STS-AssumeRole）
   * 参数：dto；user AuthUser
   * 返回值：StsCredentialDto
   */
  @Post('sts')
  @ApiOperation({
    summary: 'STS 临时凭证（推荐，移动端/大文件）',
    description:
      'MinIO 适配器：返回 mode=presigned-put + putUrl（15min 单次有效，无 root ak/sk 暴露）；\n' +
      'AliOSS 适配器：返回 mode=sts + 临时 AK/SK + sessionToken（生产 STS-AssumeRole）。\n' +
      '上传完成后业务侧调用 confirm 接口（P4 阶段）落 file_meta。'
  })
  @SwaggerApiResponse({ status: 200, description: '凭证生成成功', type: StsCredentialDto })
  async generateSts(
    @Body() dto: StsRequestDto,
    @CurrentUser() user: AuthUser
  ): Promise<StsCredentialDto> {
    return this.fileService.generateSts(dto, userToUploadContext(user))
  }

  /**
   * 预签名 PUT URL
   * 参数：dto；user AuthUser
   * 返回值：PresignResultDto
   */
  @Post('presign')
  @ApiOperation({
    summary: '预签名 PUT URL（轻量直传）',
    description:
      '返回单次有效的 PUT URL（默认 15min 过期），前端 fetch(url, { method:"PUT", body, headers:{ "Content-Type": ... } })。\n' +
      'OSS 适配器会强约束 Content-Type；MinIO 适配器不强约束（minio-js 限制）。'
  })
  @SwaggerApiResponse({ status: 200, description: '签名 URL 已生成', type: PresignResultDto })
  async generatePresign(
    @Body() dto: PresignRequestDto,
    @CurrentUser() user: AuthUser
  ): Promise<PresignResultDto> {
    return this.fileService.generatePresign(dto, userToUploadContext(user))
  }

  /**
   * 反查文件
   * 参数：id 文件主键
   * 返回值：FileUploadResultDto
   */
  @Get(':id')
  @ApiOperation({
    summary: '反查文件元数据 + 可访问 URL（私有桶返回 15min 签名 URL）',
    description:
      'R2/I-09：仅文件 owner（uploaderId 与 uid 一致）或管理员可查看，防止越权访问私有文件 URL'
  })
  @ApiParam({ name: 'id', description: '文件主键（雪花 ID）' })
  @SwaggerApiResponse({ status: 200, description: '查询成功', type: FileUploadResultDto })
  @SwaggerApiResponse({ status: 403, description: '权限不足（仅 owner 或管理员可查看）' })
  @SwaggerApiResponse({ status: 404, description: '文件不存在' })
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser
  ): Promise<FileUploadResultDto> {
    return this.fileService.getById(id, userToUploadContext(user))
  }

  /**
   * 删除文件（软删 + OSS 物理删除）
   * 参数：id；user AuthUser
   * 返回值：{ fileNo }
   */
  @Delete(':id')
  @ApiOperation({
    summary: '删除文件（软删 + OSS 物理删除）',
    description:
      '仅文件 owner（uploaderId 与 uid 一致）或管理员可调用；非 owner 返回 20003 AUTH_PERMISSION_DENIED'
  })
  @ApiParam({ name: 'id', description: '文件主键' })
  @SwaggerApiResponse({
    status: 200,
    description: '删除成功',
    schema: { example: ApiResponse.ok({ fileNo: 'F202604190120000abc12345' }) }
  })
  @SwaggerApiResponse({ status: 403, description: '权限不足' })
  @SwaggerApiResponse({ status: 404, description: '文件不存在' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser
  ): Promise<{ fileNo: string }> {
    const fileNo = await this.fileService.remove(id, userToUploadContext(user))
    return { fileNo }
  }
}
