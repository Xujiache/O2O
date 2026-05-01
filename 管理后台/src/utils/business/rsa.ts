/**
 * RSA-OAEP/SHA-256 客户端加密
 *
 * 用途：管理后台登录页提交前先用服务端下发的 PEM 公钥加密 password，
 *       后端 RsaKeyService.decrypt 用对应私钥解密。
 *
 * 设计：
 *   - 优先使用 SubtleCrypto（现代浏览器内置；无需 npm 包；Chrome 60+ / Edge 79+ / Firefox 55+ / Safari 11+）
 *   - PEM (spki) 解析：剥头尾 + atob → ArrayBuffer
 *   - 加密参数：name='RSA-OAEP'，hash='SHA-256'，与后端 padding=OAEP / oaepHash='sha256' 对齐
 *   - 输出 base64（与后端 Buffer.from(cipher, 'base64') 对齐）
 *
 * @module utils/business/rsa
 */

/**
 * 把 spki PEM 字符串解析为 ArrayBuffer
 * 入参：pem 含 BEGIN/END 头的标准 PEM
 * 出参：spki 二进制
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const trimmed = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/[\r\n\s]/g, '')
  const binary = atob(trimmed)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * ArrayBuffer → base64 字符串
 * 入参：buf ArrayBuffer
 * 出参：base64
 */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

/**
 * RSA-OAEP/SHA-256 加密
 *
 * 入参：
 *   - pubkeyPem  服务端 GET /api/v1/admin/pubkey 拿到的 spki PEM
 *   - plain      待加密明文（≤ 190 字节，2048 bit OAEP/SHA-256 限制）
 * 出参：base64 字符串
 *
 * 失败：抛 Error；调用方自行 try/catch 兜底（可降级为明文提交）
 */
export async function encryptRsa(pubkeyPem: string, plain: string): Promise<string> {
  if (!pubkeyPem || !plain) {
    throw new Error('[encryptRsa] pubkeyPem / plain 不可为空')
  }
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('[encryptRsa] 当前环境缺少 SubtleCrypto（浏览器版本过低）')
  }
  const keyBuf = pemToArrayBuffer(pubkeyPem)
  const cryptoKey = await subtle.importKey(
    'spki',
    keyBuf,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
  const encoder = new TextEncoder()
  const cipherBuf = await subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, encoder.encode(plain))
  return arrayBufferToBase64(cipherBuf)
}

/**
 * sessionStorage 缓存键（与登录页一致）
 */
export const ADMIN_PUBKEY_STORAGE_KEY = 'admin:pubkey:cache'

/** 缓存 envelope */
interface CachedPubkey {
  pubkey: string
  expiresAt: number
}

/**
 * 从 sessionStorage 取缓存的公钥（已过期 / 不存在 → null）
 * 出参：pubkey PEM 或 null
 */
export function getCachedPubkey(): string | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_PUBKEY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPubkey
    if (!parsed.pubkey || !parsed.expiresAt) return null
    if (Date.now() > parsed.expiresAt) return null
    return parsed.pubkey
  } catch {
    return null
  }
}

/**
 * 写入 sessionStorage 缓存
 * 入参：pubkey PEM；ttlSeconds 服务端给的 ttl（秒）
 */
export function setCachedPubkey(pubkey: string, ttlSeconds: number): void {
  try {
    const envelope: CachedPubkey = {
      pubkey,
      expiresAt: Date.now() + ttlSeconds * 1000
    }
    sessionStorage.setItem(ADMIN_PUBKEY_STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    /* 忽略：sessionStorage 不可用（隐私模式）；下次登录会重新拉取 */
  }
}
