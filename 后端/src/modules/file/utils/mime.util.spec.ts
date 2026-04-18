import { HttpException } from '@nestjs/common'
import {
  ALLOWED_EXT,
  ALLOWED_MIME,
  FILE_SIZE_LIMITS,
  FILE_TYPE,
  assertFileAllowed,
  getExt,
  getSizeLimitByMime,
  isExtAllowed,
  isMimeAllowed,
  mimeToFileType
} from './mime.util'

/**
 * MIME / 扩展名 / 大小三层校验单元测试
 *
 * 覆盖：白名单 + 越界场景 + 错误信息
 * 用途：T3.24 「StorageAdapter」关键路径
 */
describe('mime.util', () => {
  it('白名单常量应稳定', () => {
    expect(ALLOWED_MIME).toContain('image/jpeg')
    expect(ALLOWED_EXT).toContain('jpg')
  })

  it('isMimeAllowed 应大小写不敏感', () => {
    expect(isMimeAllowed('IMAGE/JPEG')).toBe(true)
    expect(isMimeAllowed('application/zip')).toBe(false)
    expect(isMimeAllowed('')).toBe(false)
  })

  it('getExt / isExtAllowed', () => {
    expect(getExt('a.JPG')).toBe('jpg')
    expect(getExt('noext')).toBe('')
    expect(getExt('.hiddenfile')).toBe('hiddenfile')
    expect(isExtAllowed('PNG')).toBe(true)
    expect(isExtAllowed('exe')).toBe(false)
  })

  it('mimeToFileType 应映射到 file_type 业务分类', () => {
    expect(mimeToFileType('image/png')).toBe(FILE_TYPE.IMAGE)
    expect(mimeToFileType('video/mp4')).toBe(FILE_TYPE.VIDEO)
    expect(mimeToFileType('application/pdf')).toBe(FILE_TYPE.PDF)
    expect(mimeToFileType('application/vnd.ms-excel')).toBe(FILE_TYPE.EXCEL)
    expect(mimeToFileType('application/octet-stream')).toBe(FILE_TYPE.OTHER)
  })

  it('getSizeLimitByMime 应给出对应上限', () => {
    expect(getSizeLimitByMime('image/jpeg')).toBe(FILE_SIZE_LIMITS.image)
    expect(getSizeLimitByMime('video/mp4')).toBe(FILE_SIZE_LIMITS.video)
    expect(getSizeLimitByMime('application/pdf')).toBe(FILE_SIZE_LIMITS.pdf)
  })

  it('assertFileAllowed 合法应不抛', () => {
    expect(() => assertFileAllowed('a.jpg', 'image/jpeg', 1024)).not.toThrow()
  })

  it('assertFileAllowed MIME 不在白名单 → 415', () => {
    try {
      assertFileAllowed('a.zip', 'application/zip', 1024)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException)
      expect((err as HttpException).getStatus()).toBe(415)
    }
  })

  it('assertFileAllowed 扩展名不在白名单 → 415', () => {
    try {
      assertFileAllowed('a.exe', 'image/jpeg', 1024)
      throw new Error('expected throw')
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(415)
    }
  })

  it('assertFileAllowed 大小超限 → 413', () => {
    try {
      assertFileAllowed('a.jpg', 'image/jpeg', 30 * 1024 * 1024)
      throw new Error('expected throw')
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(413)
    }
  })
})
