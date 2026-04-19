/**
 * @file watermark.ts
 * @stage P7/T7.20 (Sprint 3)
 * @desc 凭证拍照水印（canvas 叠加 时间 + 订单号 + GPS）
 *
 * V7.12 / V7.13 验收：
 *   水印含订单号 + 时间，半透明黑底白字（提示词 §5.3）
 *
 * 使用：
 *   const url = await drawWatermark(canvasId, { orderNo, lat, lng, photoPath })
 *
 * @author 单 Agent V2.0 (P7 骑手端 / T7.20)
 */
import dayjs from 'dayjs'
import { logger } from './logger'

export interface WatermarkPayload {
  /** 原图本地路径（uni.chooseImage 返回） */
  photoPath: string
  /** 订单号 */
  orderNo: string
  /** GPS 纬度 */
  lat: number
  /** GPS 经度 */
  lng: number
  /** canvas-id（页面预设的 <canvas type="2d" canvas-id="xxx" />） */
  canvasId: string
}

/** 内部图像尺寸（输出 1280x720 长边） */
const TARGET_W = 1280

/**
 * 画水印：返回带水印的 base64 dataURL
 * 真机环境下用 uni.canvasToTempFilePath 获取临时文件
 */
export function drawWatermark(payload: WatermarkPayload): Promise<string> {
  return new Promise((resolve, reject) => {
    /* Step 1: 获取图片信息 */
    uni.getImageInfo({
      src: payload.photoPath,
      success: (info) => {
        const ratio = TARGET_W / info.width
        const w = TARGET_W
        const h = Math.round(info.height * ratio)
        const ctx = uni.createCanvasContext(payload.canvasId)
        /* Step 2: 画图 */
        ctx.drawImage(info.path, 0, 0, w, h)
        /* Step 3: 半透明黑底条带（高 110px，距底 0） */
        const bandHeight = 110
        const bandTop = h - bandHeight
        ctx.setFillStyle('rgba(0,0,0,0.55)')
        ctx.fillRect(0, bandTop, w, bandHeight)
        /* Step 4: 白字 三行 */
        ctx.setFillStyle('#FFFFFF')
        ctx.setFontSize(28)
        const time = dayjs().format('YYYY-MM-DD HH:mm:ss')
        const gps = `${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`
        ctx.fillText(`订单号：${payload.orderNo}`, 24, bandTop + 36)
        ctx.fillText(`时间：${time}`, 24, bandTop + 70)
        ctx.fillText(`GPS：${gps}`, 24, bandTop + 104)
        /* Step 5: 水印导出 */
        ctx.draw(false, () => {
          uni.canvasToTempFilePath({
            canvasId: payload.canvasId,
            quality: 0.8,
            fileType: 'jpg',
            success: (res) => resolve(res.tempFilePath),
            fail: (err) => {
              logger.warn('watermark.export.fail', { e: String(err.errMsg ?? '') })
              reject(new Error(err.errMsg ?? '水印导出失败'))
            }
          })
        })
      },
      fail: (err) => {
        logger.warn('watermark.getImageInfo.fail', { e: String(err.errMsg ?? '') })
        reject(new Error(err.errMsg ?? '读取图片失败'))
      }
    })
  })
}
