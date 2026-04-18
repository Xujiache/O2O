import { Logger } from '@nestjs/common'
import sharp from 'sharp'

/**
 * 水印工具（基于 sharp）
 *
 * 设计：
 * - 仅对 image/jpeg / image/png / image/webp 生效；非图片类型返回原 buffer
 * - 右下角文字水印，半透明黑底白字 SVG 叠加
 * - 不修改原图色彩空间；按图片宽度自适应字号
 * - sharp 失败时记录 warn 并返回原 buffer，不影响上传主流程（水印属增值）
 *
 * 用途：file.service 在 putObject 前调用 `addWatermark(buffer, mime, '@O2O平台')`
 */
const logger = new Logger('WatermarkUtil')

/**
 * 转义 SVG 文本中的特殊字符
 * 参数：text 原始字符串
 * 返回值：已转义字符串
 * 用途：防止水印文字含 `<` `&` 等破坏 SVG
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 给图片右下角加文字水印
 *
 * 参数：buffer 原始图片字节；mime 图片 MIME；text 水印文字（默认 @O2O平台）；opacity 0~1（默认 0.5）
 * 返回值：处理后图片字节（保持原编码：jpeg → jpeg / png → png / webp → webp）
 *         非图片或处理失败时返回原 buffer
 *
 * 用途：商品图、店铺图等增值水印；身份证/资质等私密图严禁加水印
 */
export async function addWatermark(
  buffer: Buffer,
  mime: string,
  text = '@O2O平台',
  opacity = 0.5
): Promise<Buffer> {
  if (!mime || !mime.toLowerCase().startsWith('image/')) {
    return buffer
  }
  try {
    const image = sharp(buffer)
    const meta = await image.metadata()
    const width = meta.width ?? 800
    const height = meta.height ?? 600
    const fontSize = Math.max(14, Math.round(width * 0.04))
    const padding = Math.round(fontSize * 0.6)
    const safeText = escapeXml(text)
    const svgWidth = width
    const svgHeight = height
    const svg = Buffer.from(
      `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .wm { fill: #ffffff; font-family: 'PingFang SC','Microsoft YaHei',sans-serif; font-weight: 700; font-size: ${fontSize}px; opacity: ${opacity}; }
          .bg { fill: #000000; opacity: ${(opacity * 0.5).toFixed(2)}; }
        </style>
        <rect class="bg" x="${svgWidth - safeText.length * fontSize * 0.7 - padding * 2}" y="${
          svgHeight - fontSize - padding * 1.6
        }" width="${safeText.length * fontSize * 0.7 + padding}" height="${fontSize + padding}" rx="4"/>
        <text class="wm" x="${svgWidth - padding}" y="${svgHeight - padding}" text-anchor="end">${safeText}</text>
      </svg>`
    )
    const composite = image.composite([{ input: svg, top: 0, left: 0 }])
    if (mime === 'image/png') return await composite.png().toBuffer()
    if (mime === 'image/webp') return await composite.webp().toBuffer()
    return await composite.jpeg({ quality: 90 }).toBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`水印处理失败，已返回原图：${msg}`)
    return buffer
  }
}

/**
 * 探测图片宽高（仅图片）
 * 参数：buffer 图片字节；mime MIME
 * 返回值：{ width, height } 或 null（非图片）
 * 用途：file.service 写入 file_meta.width/height
 */
export async function probeImageMeta(
  buffer: Buffer,
  mime: string
): Promise<{ width: number; height: number } | null> {
  if (!mime || !mime.toLowerCase().startsWith('image/')) return null
  try {
    const meta = await sharp(buffer).metadata()
    if (typeof meta.width === 'number' && typeof meta.height === 'number') {
      return { width: meta.width, height: meta.height }
    }
    return null
  } catch {
    return null
  }
}
