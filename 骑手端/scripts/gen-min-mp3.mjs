/**
 * @file gen-min-mp3.mjs
 * @stage P7-R1 / R-01
 * @desc 生成最小合法 MPEG-1 Layer III silent MP3（约 432 字节，3 frame × 144 byte）
 *
 * 触发：P7-REVIEW-01 R-01。new-dispatch.mp3 0 字节占位升级为真最小有效 MP3：
 *   - 满足 audioCtx.play() 不触发 onError（避免与 P6/I-03 同款隐患）
 *   - 文件结构合法：MPEG-1 Layer III, 32 kbps, 32 kHz, mono, 全静音
 *   - 体积 ≤ 1KB（提示词要求"≤ 1KB 真最小有效 mp3"）
 *
 * Frame header（4 字节）：
 *   byte 0: FF       sync byte
 *   byte 1: FB       1111(sync) 11(MPEG-1) 01(Layer III) 1(no CRC)
 *   byte 2: 18       0001(32 kbps idx) 10(32 kHz idx) 0(no padding) 0(private)
 *   byte 3: C0       11(mono) 00(no ext) 0(copyright) 0(original) 00(emphasis)
 *
 * Frame size = 144 * 32000 / 32000 = 144 字节
 * 余下 140 字节 side info + main data 全 0 = silence
 *
 * 输出 3 个连续 frame，确保解码器可锁定第一个 sync 并稳定回放
 *
 * @author 单 Agent V2.0 (P7-R1 / R-01)
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../src/static/audio/new-dispatch.mp3')

const FRAME_SIZE = 144
const FRAME_COUNT = 3

const buf = Buffer.alloc(FRAME_SIZE * FRAME_COUNT)
for (let i = 0; i < FRAME_COUNT; i++) {
  const off = i * FRAME_SIZE
  buf[off + 0] = 0xff
  buf[off + 1] = 0xfb
  buf[off + 2] = 0x18
  buf[off + 3] = 0xc0
  /* 余下 140 字节默认 0x00 = silence */
}

writeFileSync(OUT, buf)

const total = buf.length
console.log(`[OK] 生成最小 MPEG-1 Layer III silent MP3`)
console.log(`     输出: ${OUT}`)
console.log(`     大小: ${total} 字节 (${FRAME_COUNT} frame × ${FRAME_SIZE})`)
console.log(`     header: FF FB 18 C0 (32 kbps / 32 kHz / mono)`)
console.log(`     时长: ~${((FRAME_COUNT * 1152) / 32000).toFixed(3)} sec`)
