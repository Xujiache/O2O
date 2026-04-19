/**
 * X-Sign 加签：所有敏感写操作请求带签名
 *
 * 算法（与后端 P3 ADMIN_SIGN_* 规范对齐）：
 *   sortedKeys = sort(query + body keys, asc)
 *   raw = key1=val1&key2=val2&...&timestamp=...&nonce=...
 *   sign = SHA256(raw + ADMIN_SIGN_SECRET)  （前端用 HMAC-SHA256 也可，由 env 选择）
 *
 * 默认前端只算 sha256(rawData)，secret 注入由后端转发层完成（避免泄露）
 * 如需真签名，配置 VITE_ADMIN_SIGN_SECRET 注入到内存（不入 localStorage）
 *
 * @module utils/business/sign
 */
import sha256 from 'crypto-js/sha256'
import hmacSha256 from 'crypto-js/hmac-sha256'
import encHex from 'crypto-js/enc-hex'

/**
 * 计算 X-Sign 头：基于请求参数 + timestamp + nonce
 *
 * @param data 请求参数（query 与 body 合并后的对象）
 * @param timestamp 时间戳 ms
 * @param nonce 随机串
 * @param secret 可选：HMAC 密钥；不传则用纯 SHA256
 * @returns hex 字符串
 */
export function genSign(
  data: Record<string, unknown>,
  timestamp: number,
  nonce: string,
  secret?: string
): string {
  const flat: Record<string, string> = {}
  Object.keys(data || {})
    .sort()
    .forEach((k) => {
      const v = data[k]
      if (v === undefined || v === null) return
      if (typeof v === 'object') flat[k] = JSON.stringify(v)
      else flat[k] = String(v)
    })
  const raw = Object.entries(flat)
    .map(([k, v]) => `${k}=${v}`)
    .concat([`timestamp=${timestamp}`, `nonce=${nonce}`])
    .join('&')
  if (secret) {
    return hmacSha256(raw, secret).toString(encHex)
  }
  return sha256(raw).toString(encHex)
}

/**
 * 生成 nonce 随机串（16 chars base36）
 */
export function genNonce(): string {
  return (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)).slice(
    0,
    16
  )
}
