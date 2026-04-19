/**
 * @file api/file.ts
 * @stage P5/T5.33, T5.30 (Sprint 6/5)
 * @desc 文件上传 API：使用 uni.uploadFile 直传后端 /file/upload
 * @author 单 Agent V2.0
 */
import { getStorage, STORAGE_KEYS } from '@/utils/storage'
import { logger } from '@/utils/logger'

export interface FileUploadResult {
  id: string
  fileNo: string
  bucket: string
  objectKey: string
  url: string
  size: number
  mimeType: string
  isPublic: boolean
}

function getEnv(key: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.[key] ?? ''
}

const API_BASE = getEnv('VITE_API_BASE_URL') || 'http://localhost:3000/api/v1'

/**
 * 上传单个文件
 * @param filePath uni.chooseImage / uni.chooseVideo 拿到的临时路径
 * @param bizModule 业务模块（avatar/qual/proof/banner/product/shop/temp/other）
 * @param isPublic true → 公开桶，false → 私有桶
 */
export function uploadFile(
  filePath: string,
  bizModule: string,
  isPublic = true
): Promise<FileUploadResult> {
  return new Promise((resolve, reject) => {
    const token = getStorage<string>(STORAGE_KEYS.TOKEN)
    if (!token) {
      reject(new Error('未登录'))
      return
    }
    uni.uploadFile({
      url: `${API_BASE}/file/upload`,
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      formData: {
        bizModule,
        isPublic: isPublic ? 'true' : 'false'
      },
      success: (res) => {
        try {
          const body = JSON.parse(res.data) as {
            code: number
            message: string
            data: FileUploadResult
          }
          if (body.code === 0) {
            resolve(body.data)
          } else {
            reject(new Error(body.message ?? `上传失败 (${body.code})`))
          }
        } catch (e) {
          reject(new Error(`响应解析失败: ${String(e)}`))
        }
      },
      fail: (err) => {
        logger.warn('upload.fail', { err: String(err.errMsg ?? '') })
        reject(new Error(err.errMsg ?? '网络异常'))
      }
    })
  })
}

/**
 * 批量上传图片（按顺序串行；失败任一即抛错）
 */
export async function uploadImages(
  filePaths: string[],
  bizModule = 'temp',
  isPublic = true
): Promise<FileUploadResult[]> {
  const results: FileUploadResult[] = []
  for (const p of filePaths) {
    const r = await uploadFile(p, bizModule, isPublic)
    results.push(r)
  }
  return results
}
