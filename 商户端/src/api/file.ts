/**
 * @file api/file.ts
 * @stage P6/T6.8 (Sprint 1)
 * @desc 文件上传（资质 / 商品图 / 评价图 / 凭证）
 *   后端 P3 file 模块：POST /file/upload
 *   business module:
 *     - merchant_qualification (资质)
 *     - product_image
 *     - review_evidence
 *     - shop_image
 *     - withdraw_evidence
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from '@/utils/logger'
import { getStorage, STORAGE_KEYS } from '@/utils/storage'
import type { FileUploadResult } from '@/types/biz'

/** 读取 env 变量 */
function getEnv(key: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.[key] ?? ''
}

const API_BASE = getEnv('VITE_API_BASE_URL') || 'http://localhost:3000/api/v1'

/**
 * 上传单个文件
 * @param filePath 本地路径（uni.chooseImage 返回的 tempFilePath）
 * @param bizModule 业务模块标记
 * @param isPublic 是否公开（false 走 STS 私有桶；true 走 CDN 公共桶）
 */
export function uploadFile(
  filePath: string,
  bizModule: string,
  isPublic = true
): Promise<FileUploadResult> {
  return new Promise((resolve, reject) => {
    const token = getStorage<string>(STORAGE_KEYS.TOKEN)
    uni.uploadFile({
      url: `${API_BASE}/file/upload`,
      filePath,
      name: 'file',
      formData: {
        bizModule,
        isPublic: isPublic ? '1' : '0'
      },
      header: {
        'X-Client-Type': 'merchant',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
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
            reject(new Error(body.message ?? '上传失败'))
          }
        } catch (e) {
          logger.warn('file.upload.parse.fail', { e: String(e), raw: res.data })
          reject(new Error('上传响应解析失败'))
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg ?? '上传失败'))
      }
    })
  })
}

/** 串行上传多个文件 */
export async function uploadImages(
  filePaths: string[],
  bizModule = 'product_image',
  isPublic = true
): Promise<FileUploadResult[]> {
  const results: FileUploadResult[] = []
  for (const p of filePaths) {
    const r = await uploadFile(p, bizModule, isPublic)
    results.push(r)
  }
  return results
}

/**
 * 选择图片并上传（封装 uni.chooseImage + uploadImages）
 * @param count 最多张数
 * @param bizModule 业务模块
 * @returns 上传后的 url 数组
 */
export function chooseAndUpload(
  count: number,
  bizModule: string,
  isPublic = true
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        try {
          const raw = (res as { tempFilePaths?: string | string[] }).tempFilePaths
          const paths: string[] = Array.isArray(raw) ? raw : raw ? [raw] : []
          if (paths.length === 0) {
            resolve([])
            return
          }
          uni.showLoading({ title: '上传中...' })
          const uploaded = await uploadImages(paths, bizModule, isPublic)
          uni.hideLoading()
          resolve(uploaded.map((u) => u.url))
        } catch (e) {
          uni.hideLoading()
          reject(e)
        }
      },
      fail: () => resolve([])
    })
  })
}
