import { HttpStatus } from '@nestjs/common'
import { BizErrorCode, BusinessException } from '@/common'

/**
 * MIME 与扩展名白名单（DESIGN §5.4）
 *
 * 维护原则：仅放业务真正需要的安全类型；新增类型必须同步评估病毒扫描
 *           策略 + 大小限制；切勿盲目放开
 */
export const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'application/pdf'
] as const
export const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'pdf'] as const

/** 大小上限（字节） */
export const FILE_SIZE_LIMITS = {
  image: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  pdf: 10 * 1024 * 1024
} as const

/** file_meta.file_type 业务分类 */
export const FILE_TYPE = {
  IMAGE: 1,
  VIDEO: 2,
  PDF: 3,
  EXCEL: 4,
  OTHER: 5
} as const

export type FileTypeValue = (typeof FILE_TYPE)[keyof typeof FILE_TYPE]

/**
 * 判断 MIME 是否属于白名单（image/* 通配匹配 jpeg/png/webp）
 * 参数：mime 文件 MIME
 * 返回值：true / false
 */
export function isMimeAllowed(mime: string): boolean {
  if (!mime) return false
  return (ALLOWED_MIME as readonly string[]).includes(mime.toLowerCase())
}

/**
 * 提取扩展名（去掉前导 .，统一小写）
 * 参数：fileName 原始文件名
 * 返回值：扩展名（不带点）；无扩展名返回 ''
 */
export function getExt(fileName: string): string {
  if (!fileName) return ''
  const idx = fileName.lastIndexOf('.')
  if (idx < 0 || idx === fileName.length - 1) return ''
  return fileName.slice(idx + 1).toLowerCase()
}

/**
 * 判断扩展名是否在白名单
 * 参数：ext 扩展名（不带点；大小写不敏感）
 * 返回值：true / false
 */
export function isExtAllowed(ext: string): boolean {
  return (ALLOWED_EXT as readonly string[]).includes((ext ?? '').toLowerCase())
}

/**
 * 根据 MIME 推算 file_type（写入 file_meta.file_type）
 * 参数：mime
 * 返回值：FileTypeValue
 */
export function mimeToFileType(mime: string): FileTypeValue {
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return FILE_TYPE.IMAGE
  if (m === 'video/mp4') return FILE_TYPE.VIDEO
  if (m === 'application/pdf') return FILE_TYPE.PDF
  if (m.includes('excel') || m.includes('spreadsheet')) return FILE_TYPE.EXCEL
  return FILE_TYPE.OTHER
}

/**
 * 根据 MIME 取大小上限（字节）
 * 参数：mime
 * 返回值：字节数（默认 image 上限，最严格的安全兜底）
 */
export function getSizeLimitByMime(mime: string): number {
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return FILE_SIZE_LIMITS.image
  if (m === 'video/mp4') return FILE_SIZE_LIMITS.video
  if (m === 'application/pdf') return FILE_SIZE_LIMITS.pdf
  return FILE_SIZE_LIMITS.image
}

/**
 * 三层校验入口：MIME 白名单 + 扩展名白名单 + 大小上限
 *
 * 错误码语义说明（暂复用 A 已建的错误码段位，避免侵入 common）：
 * - MIME 不允许 → PARAM_INVALID + HTTP 415
 * - 扩展名不允许 → PARAM_INVALID + HTTP 415
 * - 大小超限 → PARAM_INVALID + HTTP 413
 *
 * 用途：file.service 在写 OSS 前必须先调用本函数
 */
export function assertFileAllowed(fileName: string, mime: string, size: number): void {
  if (!isMimeAllowed(mime)) {
    throw new BusinessException(
      BizErrorCode.PARAM_INVALID,
      `MIME "${mime}" 不在白名单（image/jpeg|image/png|image/webp|video/mp4|application/pdf）`,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE
    )
  }
  const ext = getExt(fileName)
  if (!isExtAllowed(ext)) {
    throw new BusinessException(
      BizErrorCode.PARAM_INVALID,
      `扩展名 ".${ext || '<empty>'}" 不在白名单（jpg|jpeg|png|webp|mp4|pdf）`,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE
    )
  }
  const limit = getSizeLimitByMime(mime)
  if (size > limit) {
    throw new BusinessException(
      BizErrorCode.PARAM_INVALID,
      `文件大小 ${(size / 1024 / 1024).toFixed(2)}MB 超过上限 ${Math.round(limit / 1024 / 1024)}MB`,
      HttpStatus.PAYLOAD_TOO_LARGE
    )
  }
}
