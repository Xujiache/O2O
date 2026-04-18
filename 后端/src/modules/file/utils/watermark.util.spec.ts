import sharp from 'sharp'
import { addWatermark, probeImageMeta } from './watermark.util'

/**
 * watermark.util 单元测试
 *
 * 覆盖：
 * - 非图片 mime → 原 buffer 透传
 * - jpeg / png 加水印不报错且尺寸不变（不做像素级校验，避免平台差异）
 * - probeImageMeta 拿到宽高
 *
 * 用途：T3.24 水印关键路径
 */
describe('watermark.util', () => {
  /** 构造 200x200 纯色 PNG */
  const buildPng = async (): Promise<Buffer> =>
    sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 200, b: 200 } }
    })
      .png()
      .toBuffer()

  /** 构造 200x200 纯色 JPEG */
  const buildJpg = async (): Promise<Buffer> =>
    sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 200, b: 200 } }
    })
      .jpeg()
      .toBuffer()

  it('非图片 mime → 原 buffer 透传', async () => {
    const buf = Buffer.from('hello')
    const r = await addWatermark(buf, 'application/pdf')
    expect(r).toBe(buf)
  })

  it('PNG 加水印保持 PNG 编码且尺寸 200x200', async () => {
    const png = await buildPng()
    const out = await addWatermark(png, 'image/png', '@O2O平台测试')
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(200)
    expect(meta.height).toBe(200)
  })

  it('JPEG 加水印保持 JPEG', async () => {
    const jpg = await buildJpg()
    const out = await addWatermark(jpg, 'image/jpeg')
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
  })

  it('probeImageMeta 返回宽高', async () => {
    const png = await buildPng()
    const meta = await probeImageMeta(png, 'image/png')
    expect(meta).toEqual({ width: 200, height: 200 })
  })

  it('probeImageMeta 非图片 → null', async () => {
    const meta = await probeImageMeta(Buffer.from('x'), 'application/pdf')
    expect(meta).toBeNull()
  })

  it('addWatermark 处理失败应返回原图（不抛错）', async () => {
    const broken = Buffer.from('not-a-real-image')
    const out = await addWatermark(broken, 'image/png')
    expect(out).toBe(broken)
  })
})
