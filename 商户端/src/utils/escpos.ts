/**
 * @file escpos.ts
 * @stage P6/T6.40 (Sprint 6)
 * @desc ESC/POS 指令封装：商户端订单小票模板（58mm / 80mm）
 *
 * 协议参考：
 *   - ESC @ 初始化打印机
 *   - GS ! n 字号放大（n=0 正常 / n=0x11 双倍宽高 / n=0x22 三倍）
 *   - ESC a n 对齐（0 左 / 1 中 / 2 右）
 *   - GS V 1 切纸
 *   - GS k m d1...dk 0 一维码
 *   - GS L nL nH 左边距
 *
 * 模板：
 *   --- 58mm 模板 (32 字符宽) ---
 *   [店铺名 居中 双倍]
 *   订单号: TO20260418001
 *   下单: 2026-04-18 12:30
 *   ----------------------------------
 *   1) 黑椒牛柳饭        ×2  ¥56.00
 *   2) 糖醋里脊套餐      ×1  ¥22.00
 *   ----------------------------------
 *   合计: ¥78.00
 *   实付: ¥78.00
 *   ----------------------------------
 *   收件: 张***（138****8888）
 *   地址: 南京东路 200 号 *** 单元
 *   备注: 不加香菜
 *   ----------------------------------
 *   取件码: 8731  [一维码]
 *
 * @author 单 Agent V2.0 (P6 商户端 / T6.40)
 */
import type { MerchantOrder } from '@/types/biz'
import { formatAmount, formatTime } from './format'

/** ESC/POS 字节常量 */
const ESC = 0x1b
const GS = 0x1d

/** 字号 */
const FONT_NORMAL = 0x00
const FONT_DOUBLE = 0x11
/** 三倍字号（保留备用） */
export const FONT_TRIPLE = 0x22

/** 对齐 */
const ALIGN_LEFT = 0x00
const ALIGN_CENTER = 0x01
/** 右对齐（保留备用） */
export const ALIGN_RIGHT = 0x02

/** 字符宽度（按纸宽） */
type PaperWidth = 58 | 80
const CHARS_PER_LINE: Record<PaperWidth, number> = { 58: 32, 80: 48 }

class EscPosBuilder {
  private buffer: number[] = []
  private encoder: TextEncoder
  private width: PaperWidth

  constructor(paperWidth: PaperWidth = 58) {
    this.encoder = new TextEncoder()
    this.width = paperWidth
  }

  /** 初始化打印机 */
  init(): this {
    this.buffer.push(ESC, 0x40)
    return this
  }

  /** 设置字号 */
  setFont(size: number): this {
    this.buffer.push(GS, 0x21, size)
    return this
  }

  /** 设置对齐 */
  setAlign(align: number): this {
    this.buffer.push(ESC, 0x61, align)
    return this
  }

  /** 写文本（自动 GBK 转 UTF-8 简化为 utf-8 字节） */
  text(s: string): this {
    const bytes = this.encoder.encode(s)
    this.buffer.push(...bytes)
    return this
  }

  /** 换行 */
  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.buffer.push(0x0a)
    return this
  }

  /** 打印分隔线 */
  separator(char = '-'): this {
    return this.text(char.repeat(CHARS_PER_LINE[this.width])).feed()
  }

  /** 打印一维码（订单号） */
  barcode(data: string): this {
    /* GS k 73 nL nH d1 .. dn */
    const dataBytes = this.encoder.encode(data)
    this.buffer.push(GS, 0x6b, 0x49, dataBytes.length, ...dataBytes)
    this.feed()
    return this
  }

  /** 切纸 */
  cut(): this {
    this.buffer.push(GS, 0x56, 0x01)
    return this
  }

  /** 蜂鸣 */
  beep(): this {
    this.buffer.push(ESC, 0x42, 0x03, 0x05)
    return this
  }

  /** 输出 ArrayBuffer */
  build(): ArrayBuffer {
    const u8 = new Uint8Array(this.buffer)
    return u8.buffer as ArrayBuffer
  }
}

/**
 * 渲染订单小票
 * @param order 订单
 * @param paperWidth 58 / 80mm
 * @param copyType 1 厨房联 / 2 配送联 / 3 客户联
 */
export function renderOrderReceipt(
  order: MerchantOrder,
  paperWidth: PaperWidth = 58,
  copyType: 1 | 2 | 3 = 1
): ArrayBuffer {
  const cw = CHARS_PER_LINE[paperWidth]
  const builder = new EscPosBuilder(paperWidth)

  builder.init()

  /* 标题 */
  builder.setAlign(ALIGN_CENTER).setFont(FONT_DOUBLE).text(order.shopName).feed()
  builder.setFont(FONT_NORMAL)
  const copyName = ['', '【厨房联】', '【配送联】', '【客户联】'][copyType]
  builder.text(copyName).feed(2)

  /* 订单元信息 */
  builder.setAlign(ALIGN_LEFT)
  builder.text(`单号: ${order.orderNo}`).feed()
  builder.text(`下单: ${formatTime(order.createdAt)}`).feed()
  if (order.pickupCode) {
    builder.setFont(FONT_DOUBLE).text(`取件码: ${order.pickupCode}`).feed()
    builder.setFont(FONT_NORMAL)
  }
  builder.separator()

  /* 商品列表 */
  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i]
    const left = `${i + 1}. ${it.productName}${it.skuName ? `(${it.skuName})` : ''}`
    const right = `×${it.qty} ${formatAmount(it.subtotal)}`
    builder.text(padLine(left, right, cw)).feed()
  }
  builder.separator()

  /* 金额 */
  builder.text(padLine('商品合计', formatAmount(order.itemsAmount), cw)).feed()
  builder.text(padLine('配送费', formatAmount(order.deliveryFee), cw)).feed()
  if (order.discountAmount && order.discountAmount !== '0' && order.discountAmount !== '0.00') {
    builder.text(padLine('优惠', '-' + formatAmount(order.discountAmount), cw)).feed()
  }
  builder
    .setFont(FONT_DOUBLE)
    .text(padLine('实付', formatAmount(order.payAmount), cw / 2))
    .feed()
    .setFont(FONT_NORMAL)
  builder.separator()

  /* 配送信息（厨房联跳过） */
  if (copyType !== 1) {
    builder.text(`收件: ${order.receiverName}（${order.receiverMobile}）`).feed()
    builder.text(`地址: ${order.receiverAddress}`).feed()
    builder.text(`距离: ${order.distance}m`).feed()
    if (order.remark) {
      builder.setFont(FONT_DOUBLE).text(`备注: ${order.remark}`).feed()
      builder.setFont(FONT_NORMAL)
    }
    builder.separator()
  }

  /* 一维码（订单号） */
  if (copyType !== 1) {
    builder.setAlign(ALIGN_CENTER).barcode(order.orderNo)
  }

  builder.feed(3).cut()
  return builder.build()
}

/** 填充对齐的一行：左右两端，中间空格补齐 */
function padLine(left: string, right: string, width: number): string {
  const lLen = visualLength(left)
  const rLen = visualLength(right)
  const space = Math.max(1, width - lLen - rLen)
  return left + ' '.repeat(space) + right
}

/** 视觉长度（中文计 2，英文计 1） */
function visualLength(s: string): number {
  let n = 0
  for (const c of s) {
    /* eslint-disable-next-line no-control-regex */
    n += /[\x00-\x7F]/.test(c) ? 1 : 2
  }
  return n
}
