/**
 * @file api/file.ts
 * @stage P7/T7.7 (Sprint 1)
 * @desc 文件上传：身份证、健康证、车辆、配送凭证、申诉证据
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type { FileUploadResult } from '@/types/biz'
import { logger } from '@/utils/logger'
import { getStorage, STORAGE_KEYS } from '@/utils/storage'

/** 业务模块（与后端 P3 file 模块对齐） */
export type FileBizModule =
  | 'rider-id-card'
  | 'rider-health-cert'
  | 'rider-vehicle'
  | 'rider-certificate'
  | 'rider-pickup-proof'
  | 'rider-deliver-proof'
  | 'rider-appeal'
  | 'rider-emergency'
  | 'rider-feedback'

function getEnv(k: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.[k] ?? ''
}

const API_BASE = getEnv('VITE_API_BASE_URL') || 'http://localhost:3000/api/v1'

/**
 * 上传单文件（基于 uni.uploadFile）
 * @param filePath 本地路径（uni.chooseImage 返回）
 * @param bizModule 业务模块
 * @param isPublic 是否公开
 */
export function uploadFile(
  filePath: string,
  bizModule: FileBizModule,
  isPublic: 0 | 1 = 0
): Promise<FileUploadResult> {
  return new Promise((resolve, reject) => {
    const token = getStorage<string>(STORAGE_KEYS.TOKEN) ?? ''
    uni.uploadFile({
      url: `${API_BASE}/file/upload`,
      filePath,
      name: 'file',
      formData: {
        bizModule,
        isPublic: String(isPublic)
      },
      header: {
        Authorization: token ? `Bearer ${token}` : '',
        'X-Client-Type': 'rider'
      },
      success: (res) => {
        try {
          const body = JSON.parse(res.data) as {
            code: number
            data: FileUploadResult
            message?: string
          }
          if (body.code === 0 && body.data) {
            resolve(body.data)
          } else {
            reject(new Error(body.message ?? '上传失败'))
          }
        } catch (e) {
          logger.warn('file.upload.parse.fail', { e: String(e) })
          reject(new Error('上传响应解析失败'))
        }
      },
      fail: (err) => reject(new Error(err.errMsg ?? '上传失败'))
    })
  })
}

/**
 * 选择图片 → 上传（语法糖）
 */
export function chooseAndUploadImage(opt: {
  bizModule: FileBizModule
  count?: number
  sourceType?: ('album' | 'camera')[]
  isPublic?: 0 | 1
}): Promise<FileUploadResult[]> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: opt.count ?? 1,
      sourceType: opt.sourceType ?? ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        try {
          const arr: FileUploadResult[] = []
          for (const path of res.tempFilePaths) {
            const r = await uploadFile(path, opt.bizModule, opt.isPublic ?? 0)
            arr.push(r)
          }
          resolve(arr)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      },
      fail: (err) => reject(new Error(err.errMsg ?? '选择图片失败'))
    })
  })
}
