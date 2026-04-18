/**
 * @file password.util.ts
 * @stage P3/T3.2
 * @desc 密码哈希工具：bcrypt cost ≥ 10（DESIGN_P3 §硬性约束 8）
 *       同时兼容旧 `$scrypt$...` 占位 hash（员工 B 在 T3.10/T3.12 创建子账号
 *       时使用过的占位实现），verify 时自动按前缀分发。
 * @author 员工 A
 *
 * 实现备注：项目使用 bcryptjs（纯 JS）替代 bcrypt（native binding）以避免
 * Windows / Alpine 容器中的 node-gyp 编译依赖；bcryptjs 与 bcrypt 算法完全一致，
 * 生成的 60 位 hash 与 P2 SQL 中所有 password_hash CHAR(60) 字段完美兼容。
 *
 * API 设计：
 *   - hash() / verify() 默认采用同步实现（hashSync / compareSync），
 *     bcrypt cost=10 同步耗时约 50~100ms（登录场景可接受），
 *     兼容业务 service 链式调用：
 *         e.passwordHash = PasswordUtil.hash(plain)
 *   - hashAsync() / verifyAsync() 提供异步版本，避免阻塞 EventLoop。
 */

import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'

/** bcrypt cost；DESIGN_P3 硬性约束 ≥ 10 */
const BCRYPT_COST = 10

/**
 * 密码工具类
 * 用途：
 *   - 创建管理员/商户子账号时 hash(plain)
 *   - 登录时 verify(plain, hashed)
 */
export class PasswordUtil {
  /**
   * 计算密码哈希（bcrypt cost=10）
   * 参数：plain 明文密码
   * 返回值：60 字符 bcrypt hash（形如 `$2b$10$...`），可直接落 password_hash CHAR(60) 列
   * 错误：plain 为空 → 抛 Error
   * 用途：写入 password_hash 列前调用
   */
  static hash(plain: string): string {
    if (!plain) throw new Error('密码不能为空')
    return bcrypt.hashSync(plain, BCRYPT_COST)
  }

  /**
   * 校验明文密码与 hash 是否匹配
   * 参数：plain 明文密码；hashed 已存储的 hash 字串（bcrypt 60 位 / 旧 `$scrypt$...`）
   * 返回值：true/false（含输入异常时 false）
   * 用途：登录时密码比对；自动识别 bcrypt / 旧 scrypt 占位
   */
  static verify(plain: string, hashed: string): boolean {
    if (!plain || !hashed) return false
    /* 旧 scrypt 占位 hash（B 在 T3.10/T3.12 写入）—— 兼容校验 */
    if (hashed.startsWith('$scrypt$')) {
      return PasswordUtil.verifyScryptLegacy(plain, hashed)
    }
    /* 标准 bcrypt：$2a$ / $2b$ / $2y$ 开头 */
    try {
      return bcrypt.compareSync(plain, hashed)
    } catch {
      return false
    }
  }

  /**
   * 异步版 hash（不阻塞 EventLoop；高并发登录可选用）
   * 参数：plain 明文
   * 返回值：Promise<string>
   */
  static async hashAsync(plain: string): Promise<string> {
    if (!plain) throw new Error('密码不能为空')
    return bcrypt.hash(plain, BCRYPT_COST)
  }

  /**
   * 异步版 verify
   * 参数：plain 明文；hashed hash 字串
   * 返回值：Promise<boolean>
   */
  static async verifyAsync(plain: string, hashed: string): Promise<boolean> {
    if (!plain || !hashed) return false
    if (hashed.startsWith('$scrypt$')) {
      return PasswordUtil.verifyScryptLegacy(plain, hashed)
    }
    try {
      return await bcrypt.compare(plain, hashed)
    } catch {
      return false
    }
  }

  /**
   * 旧 scrypt 占位 hash 校验（兼容期保留；后续升级路径：
   * verify 通过后自动 reHash → 写回 password_hash）
   */
  private static verifyScryptLegacy(plain: string, hashed: string): boolean {
    const parts = hashed.split('$')
    /* ['', 'scrypt', 'N=16384', '<salt>', '<key>'] */
    if (parts.length !== 5) return false
    const N = parseInt(parts[2].split('=')[1] ?? '16384', 10)
    const salt = Buffer.from(parts[3], 'hex')
    const expected = Buffer.from(parts[4], 'hex')
    const got = crypto.scryptSync(plain, salt, expected.length, { N })
    try {
      return crypto.timingSafeEqual(got, expected)
    } catch {
      return false
    }
  }
}
