/**
 * @file auth.service.ts
 * @stage P3/T3.4 ~ T3.7
 * @desc 统一认证授权服务：JWT 签发 / 刷新 / 吊销 / 登录风控 / 短信验证码 /
 *       小程序 jscode2session / 商户/骑手/管理员账密登录
 * @author 员工 A
 *
 * 关键 Redis Key（对齐 redis-keys.md K01~K05 + K30）：
 *   K01  auth:token:{userType}:{userId}        String  TTL 2h     access token 留痕（可一键 DEL）
 *   K02  auth:refresh:{userType}:{userId}      String  TTL 7d     refresh token
 *   K03  auth:sms:{mobileHash}                 String  TTL 5min   短信验证码
 *   K04  auth:loginfail:{mobileHash}           Integer TTL 30min  登录失败计数
 *   K30  rl:sms:freq:{mobileHash}              Integer TTL 60s    短信发送频控
 *
 * 登录风控（DESIGN_P3 §2.4）：
 *   1) 计算 mobileHash = HMAC(mobile)
 *   2) 若 K04 ≥ 5 → 抛 20011 账户锁定 30min
 *   3) 校验密码/验证码失败 → INCR K04 + EXPIRE 30min
 *   4) 成功 → DEL K04
 *
 * Token 吊销（DESIGN_P3 §2.2）：
 *   - JWT payload 含 ver 字段
 *   - 修改密码 / 强制下线 / 角色变更（管理员）→ INCR auth:tokenver:{userType}:{uid}
 *   - JwtStrategy.validate 校验 payload.ver >= 当前 ver
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'crypto'
import Redis from 'ioredis'
import { In, Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { BizErrorCode } from '../../common/error-codes'
import { BusinessException } from '../../common/exceptions/business.exception'
import {
  Admin,
  AdminRole,
  Blacklist,
  Merchant,
  MerchantStaff,
  Permission,
  Rider,
  RolePermission,
  User
} from '../../entities'
import { REDIS_CLIENT } from '../../health/redis.provider'
import { CryptoUtil, PasswordUtil, SnowflakeId } from '../../utils'
import type { AuthUser } from './decorators/current-user.decorator'
import type { JwtPayload } from './strategies/jwt.strategy'
import { TOKEN_VER_KEY } from './strategies/jwt.strategy'
import { PERM_CACHE_KEY, PERM_CACHE_TTL_SECONDS, PERM_WILDCARD } from './guards/permission.guard'

/* ===== Redis Key 模板 ===== */
const TOKEN_KEY = (userType: string, uid: string): string => `auth:token:${userType}:${uid}`
const REFRESH_KEY = (userType: string, uid: string): string => `auth:refresh:${userType}:${uid}`
const SMS_KEY = (mobileHash: string): string => `auth:sms:${mobileHash}`
const LOGIN_FAIL_KEY = (mobileHash: string): string => `auth:loginfail:${mobileHash}`
const SMS_FREQ_KEY = (mobileHash: string): string => `rl:sms:freq:${mobileHash}`

/* ===== TTL 常量 ===== */
const REFRESH_TTL_SECONDS = 7 * 24 * 3600 /* 7d */
const SMS_CODE_TTL_SECONDS = 5 * 60 /* 5min */
const LOGIN_FAIL_TTL_SECONDS = 30 * 60 /* 30min */
const LOGIN_FAIL_THRESHOLD = 5
const SMS_FREQ_TTL_SECONDS = 60 /* 60s 同号同 scene */

/** 短信验证码场景 */
export type SmsScene = 'login' | 'bind' | 'register' | 'reset'

/** Token 对（DESIGN_P3 §2.1 登录接口出参） */
export interface TokenPair {
  accessToken: string
  refreshToken: string
  /** access token 过期秒数（前端可用于刷新调度） */
  expiresIn: number
}

/** 微信 jscode2session 响应（截取关键字段） */
interface WxSessionResp {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

/**
 * 统一认证服务
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(MerchantStaff)
    private readonly merchantStaffRepo: Repository<MerchantStaff>,
    @InjectRepository(Rider) private readonly riderRepo: Repository<Rider>,
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectRepository(AdminRole) private readonly adminRoleRepo: Repository<AdminRole>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(Blacklist) private readonly blacklistRepo: Repository<Blacklist>
  ) {}

  /* =========================================================================
   * 一、Token 签发 / 刷新 / 吊销 / 登出
   * ========================================================================= */

  /**
   * 签发 access + refresh token 对
   * 参数：uid 用户主键；userType 端类型；tenantId 租户；extra 可选透传字段
   * 返回值：TokenPair
   * 用途：所有登录接口成功后内部调用
   */
  async issueTokenPair(
    uid: string,
    userType: AuthUser['userType'],
    tenantId = 1,
    extra?: { isSuper?: boolean; merchantId?: string }
  ): Promise<TokenPair> {
    /* 取/初始化 ver（用于一键吊销） */
    const verKey = TOKEN_VER_KEY(userType, uid)
    let ver = 1
    try {
      const verStr = await this.redis.get(verKey)
      if (verStr != null) {
        const n = parseInt(verStr, 10)
        if (Number.isFinite(n) && n > 0) ver = n
      } else {
        await this.redis.set(verKey, '1', 'EX', 365 * 24 * 3600)
      }
    } catch (err) {
      this.logger.warn(`Redis 取 ver 失败 uid=${uid}：${(err as Error).message}`)
    }

    const expiresIn = this.config.get<number>('jwt.expiresIn') ?? 7200
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      uid,
      userType,
      tenantId,
      ver,
      ...(extra?.isSuper !== undefined ? { isSuper: extra.isSuper } : {}),
      ...(extra?.merchantId !== undefined ? { merchantId: extra.merchantId } : {})
    }
    const accessToken = await this.jwt.signAsync(payload, { algorithm: 'HS512', expiresIn })

    /* refresh token = UUID（不签 JWT，仅 Redis 索引） */
    const refreshToken = randomUUID()
    try {
      await Promise.all([
        this.redis.set(TOKEN_KEY(userType, uid), accessToken, 'EX', expiresIn),
        this.redis.set(REFRESH_KEY(userType, uid), refreshToken, 'EX', REFRESH_TTL_SECONDS)
      ])
    } catch (err) {
      this.logger.warn(`Redis 写 token 失败 uid=${uid}：${(err as Error).message}`)
    }

    return { accessToken, refreshToken, expiresIn }
  }

  /**
   * 刷新 token
   * 参数：refreshToken 客户端持有的 refresh token
   * 返回值：新的 TokenPair
   * 错误：refresh 不存在或不匹配 → 20006
   *
   * 实现：refresh 与 uid/userType 解耦，需要先扫描；为简化用 K02 全扫成本高，
   *       此处约定客户端必须同时携带 uid + userType + refreshToken（POST body）。
   *       AuthController.refresh 会带这三个字段进来。
   */
  async refreshTokenPair(
    uid: string,
    userType: AuthUser['userType'],
    refreshToken: string
  ): Promise<TokenPair> {
    if (!uid || !userType || !refreshToken) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'uid/userType/refreshToken 不可为空')
    }
    const key = REFRESH_KEY(userType, uid)
    const stored = await this.redis.get(key)
    if (!stored || stored !== refreshToken) {
      throw new BusinessException(BizErrorCode.AUTH_REFRESH_TOKEN_INVALID)
    }
    return this.issueTokenPair(uid, userType, 1)
  }

  /**
   * 登出：DEL token + refresh + INCR ver（让历史 token 立即失效）
   * 参数：uid / userType
   * 返回值：{ ok: true }
   */
  async logout(uid: string, userType: AuthUser['userType']): Promise<{ ok: true }> {
    try {
      await Promise.all([
        this.redis.del(TOKEN_KEY(userType, uid)),
        this.redis.del(REFRESH_KEY(userType, uid)),
        this.redis.incr(TOKEN_VER_KEY(userType, uid)),
        this.redis.expire(TOKEN_VER_KEY(userType, uid), 365 * 24 * 3600)
      ])
    } catch (err) {
      this.logger.warn(`登出 Redis 操作失败 uid=${uid}：${(err as Error).message}`)
    }
    return { ok: true }
  }

  /* =========================================================================
   * 二、登录风控
   * ========================================================================= */

  /**
   * 登录前置：检查是否被锁
   * 参数：mobileHash
   * 错误：失败次数 ≥ 5 → 20011
   */
  async ensureNotLocked(mobileHash: string): Promise<void> {
    try {
      const v = await this.redis.get(LOGIN_FAIL_KEY(mobileHash))
      if (v && parseInt(v, 10) >= LOGIN_FAIL_THRESHOLD) {
        throw new BusinessException(BizErrorCode.AUTH_LOGIN_LOCKED)
      }
    } catch (err) {
      if (err instanceof BusinessException) throw err
      this.logger.warn(`Redis 取 loginfail 失败：${(err as Error).message}`)
    }
  }

  /**
   * 登录失败 +1
   * 参数：mobileHash
   */
  async markLoginFail(mobileHash: string): Promise<void> {
    try {
      const cnt = await this.redis.incr(LOGIN_FAIL_KEY(mobileHash))
      if (cnt === 1) {
        await this.redis.expire(LOGIN_FAIL_KEY(mobileHash), LOGIN_FAIL_TTL_SECONDS)
      }
    } catch (err) {
      this.logger.warn(`Redis INCR loginfail 失败：${(err as Error).message}`)
    }
  }

  /**
   * 登录成功：清失败计数
   */
  async clearLoginFail(mobileHash: string): Promise<void> {
    try {
      await this.redis.del(LOGIN_FAIL_KEY(mobileHash))
    } catch (err) {
      this.logger.warn(`Redis DEL loginfail 失败：${(err as Error).message}`)
    }
  }

  /* =========================================================================
   * 三、短信验证码（发送 / 校验 / 频控）
   * ========================================================================= */

  /**
   * 发送短信验证码（占位实现：仅写 Redis；接入阿里云短信由 P9 / 员工 B 替换）
   * 参数：mobile 11 位手机号；scene 场景
   * 返回值：{ ok: true; ttl: 5min; mock?: code }（dev 环境暴露 mock code 便于联调）
   * 错误：60s 频控命中 → 30002；mobile 格式不合法 → 10001
   */
  async sendSms(
    mobile: string,
    scene: SmsScene = 'login'
  ): Promise<{ ok: true; ttl: number; mock?: string }> {
    if (!mobile || !/^1[3-9]\d{9}$/.test(mobile)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '手机号格式不合法')
    }
    const mobileHash = CryptoUtil.hmac(mobile)

    /* 60s 频控 */
    try {
      const ok = await this.redis.set(
        SMS_FREQ_KEY(mobileHash),
        '1',
        'EX',
        SMS_FREQ_TTL_SECONDS,
        'NX'
      )
      if (ok !== 'OK') {
        throw new BusinessException(BizErrorCode.SMS_SEND_TOO_FREQUENT)
      }
    } catch (err) {
      if (err instanceof BusinessException) throw err
      this.logger.warn(`Redis 频控写入失败：${(err as Error).message}`)
    }

    /* 生成 6 位数字验证码 */
    const code = String(Math.floor(100000 + Math.random() * 900000))
    try {
      await this.redis.set(SMS_KEY(mobileHash), code, 'EX', SMS_CODE_TTL_SECONDS)
    } catch (err) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_REDIS_ERROR,
        `短信验证码写入失败：${(err as Error).message}`
      )
    }

    /* TODO P9：接入阿里云短信 SDK（员工 B 的 message 模块 AliSmsChannel） */
    const env = this.config.get<string>('app.env')
    if (env !== 'production') {
      this.logger.log(`[SMS-MOCK] mobile=${this.maskMobile(mobile)} scene=${scene} code=${code}`)
      return { ok: true, ttl: SMS_CODE_TTL_SECONDS, mock: code }
    }
    this.logger.log(`[SMS] mobile=${this.maskMobile(mobile)} scene=${scene}`)
    return { ok: true, ttl: SMS_CODE_TTL_SECONDS }
  }

  /**
   * 校验短信验证码（成功后立即 DEL，防止重放）
   * 参数：mobile / smsCode
   * 错误：不存在/过期 → 20015；不匹配 → 20014
   */
  async verifySms(mobile: string, smsCode: string): Promise<void> {
    if (!mobile || !smsCode) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'mobile / smsCode 不可为空')
    }
    const mobileHash = CryptoUtil.hmac(mobile)
    const stored = await this.redis.get(SMS_KEY(mobileHash))
    if (!stored) {
      throw new BusinessException(BizErrorCode.AUTH_SMS_CODE_EXPIRED)
    }
    if (stored !== smsCode) {
      throw new BusinessException(BizErrorCode.AUTH_SMS_CODE_INVALID)
    }
    /* 用过即删；防重放 */
    await this.redis.del(SMS_KEY(mobileHash))
  }

  /* =========================================================================
   * 四、小程序 wx-mp 登录
   * ========================================================================= */

  /**
   * 调用微信 jscode2session 接口，换取 openid + session_key
   * 参数：code 小程序前端 wx.login() 拿到的 code
   * 返回值：{ openId, sessionKey, unionId? }
   * 错误：APPID/SECRET 缺失 → 50006；微信返回 errcode → 40001
   *
   * 注：本期使用 fetch（Node 18+ 内置），无需引入 axios；超时 5s
   */
  async wxJscode2Session(
    code: string
  ): Promise<{ openId: string; sessionKey: string; unionId?: string }> {
    const appid = this.config.get<string>('thirdParty.wechatMpAppid')
    const secret = this.config.get<string>('thirdParty.wechatMpSecret')
    if (!appid || !secret) {
      /* dev mock：appid/secret 未配置时，按 code 派生固定 openid，便于本机自验证 */
      const env = this.config.get<string>('app.env')
      if (env !== 'production') {
        const mockOpenId = `mock_openid_${createHash24(code)}`
        this.logger.warn(`[WX-MOCK] appid 未配置；mock openid=${mockOpenId}`)
        return { openId: mockOpenId, sessionKey: 'mock_session_key' }
      }
      throw new BusinessException(
        BizErrorCode.SYSTEM_CONFIG_MISSING,
        '微信小程序 APPID/SECRET 未配置'
      )
    }
    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}` +
      `&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      const resp = await fetch(url, { signal: ctrl.signal })
      const data = (await resp.json()) as WxSessionResp
      if (data.errcode && data.errcode !== 0) {
        throw new BusinessException(
          BizErrorCode.WX_API_ERROR,
          `微信 jscode2session 失败：[${data.errcode}] ${data.errmsg ?? ''}`
        )
      }
      if (!data.openid) {
        throw new BusinessException(BizErrorCode.WX_API_ERROR, '微信返回缺 openid')
      }
      return {
        openId: data.openid,
        sessionKey: data.session_key ?? '',
        unionId: data.unionid
      }
    } catch (err) {
      if (err instanceof BusinessException) throw err
      throw new BusinessException(
        BizErrorCode.WX_API_ERROR,
        `调用微信 jscode2session 失败：${(err as Error).message}`
      )
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 小程序登录：code → openId → 找/建用户 → 签 token
   * 参数：code
   * 返回值：{ tokens, user }
   *
   * 设计（对齐 ALIGNMENT Q3.1）：
   *   - 首次匿名登录 → 创建 user 行，nickname/avatar 为空，待客户端 PUT /me 补
   *   - 老用户 → 直接登录
   */
  async wxMpLogin(code: string): Promise<{
    tokens: TokenPair
    user: {
      id: string
      nickname: string | null
      avatarUrl: string | null
      mobileTail4: string | null
    }
  }> {
    const wx = await this.wxJscode2Session(code)
    let u = await this.userRepo.findOne({ where: { openIdMp: wx.openId, isDeleted: 0 } })
    if (!u) {
      u = this.userRepo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        openIdMp: wx.openId,
        unionId: wx.unionId ?? null,
        nickname: null,
        avatarUrl: null,
        gender: 0,
        birthday: null,
        mobileEnc: null,
        mobileHash: null,
        mobileTail4: null,
        idCardEnc: null,
        idCardHash: null,
        realNameEnc: null,
        isRealname: 0,
        encKeyVer: 1,
        status: 1,
        regSource: 1,
        regIp: null,
        lastLoginAt: new Date(),
        lastLoginIp: null,
        isDeleted: 0
      })
      await this.userRepo.save(u)
      this.logger.log(`新用户 wx-mp 注册：openId=${wx.openId} → uid=${u.id}`)
    } else {
      u.lastLoginAt = new Date()
      await this.userRepo.save(u)
    }

    /* 黑名单校验 */
    await this.checkBlacklist(1 /* user */, u.id)

    if (u.status !== 1) {
      throw new BusinessException(BizErrorCode.AUTH_ACCOUNT_DISABLED)
    }
    const tokens = await this.issueTokenPair(u.id, 'user', u.tenantId)
    return {
      tokens,
      user: {
        id: u.id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        mobileTail4: u.mobileTail4
      }
    }
  }

  /**
   * 用户绑定手机号
   * 参数：uid / mobile / smsCode
   * 返回值：{ ok: true }
   * 错误：手机号已被他人占用 → 10011
   */
  async bindMobile(uid: string, mobile: string, smsCode: string): Promise<{ ok: true }> {
    if (!/^1[3-9]\d{9}$/.test(mobile)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '手机号格式不合法')
    }
    await this.verifySms(mobile, smsCode)

    const u = await this.userRepo.findOne({ where: { id: uid, isDeleted: 0 } })
    if (!u) throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND)

    const t = CryptoUtil.encryptTriple(mobile)
    const dup = await this.userRepo.findOne({
      where: { mobileHash: t.hash, isDeleted: 0 }
    })
    if (dup && dup.id !== uid) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '该手机号已绑定其他账号')
    }
    u.mobileEnc = t.enc
    u.mobileHash = t.hash
    u.mobileTail4 = t.tail4
    u.encKeyVer = t.encKeyVer
    await this.userRepo.save(u)
    return { ok: true }
  }

  /* =========================================================================
   * 五、商户登录（账号密码 / 短信验证码）
   * ========================================================================= */

  /**
   * 商户登录（mobile + password）
   * 步骤：
   *   1) 风控前置（K04 ≥ 5 拒）
   *   2) merchant_staff 找子账号；若 staff.username 与 mobile 同时是登录名时优先 staff
   *   3) 没有 staff，则按 merchant.mobile_hash 找主账号（也支持 mobile 登录）
   *   4) bcrypt 校验
   *   5) 黑名单 + 状态校验
   *   6) 签 token；userType=merchant；payload.merchantId 透传
   */
  async merchantLogin(
    mobile: string,
    password: string
  ): Promise<{ tokens: TokenPair; merchant: MerchantLoginVo }> {
    if (!mobile || !password) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '账号/密码不可为空')
    }
    const mobileHash = CryptoUtil.hmac(mobile)
    await this.ensureNotLocked(mobileHash)

    /* 优先 staff（更精确） */
    let staff: MerchantStaff | null = null
    let merchant: Merchant | null = null

    staff = await this.merchantStaffRepo.findOne({
      where: { mobileHash, isDeleted: 0 }
    })
    if (staff) {
      if (!PasswordUtil.verify(password, staff.passwordHash)) {
        await this.markLoginFail(mobileHash)
        throw new BusinessException(BizErrorCode.AUTH_PASSWORD_INCORRECT)
      }
      if (staff.status !== 1) {
        throw new BusinessException(BizErrorCode.AUTH_ACCOUNT_DISABLED)
      }
      merchant = await this.merchantRepo.findOne({ where: { id: staff.merchantId, isDeleted: 0 } })
      if (!merchant) {
        throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND, '所属商户不存在')
      }
    } else {
      merchant = await this.merchantRepo.findOne({ where: { mobileHash, isDeleted: 0 } })
      if (!merchant) {
        await this.markLoginFail(mobileHash)
        throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND, '账号不存在')
      }
      /* 主账号无 password 列 —— 强制走子账号；这里直接拒，引导前端走 sms-login */
      throw new BusinessException(
        BizErrorCode.AUTH_PASSWORD_INCORRECT,
        '商户主账号请使用短信验证码登录'
      )
    }

    if (merchant.status !== 1) {
      throw new BusinessException(BizErrorCode.AUTH_ACCOUNT_DISABLED, '商户账号已封禁/暂停营业')
    }
    /* 黑名单 */
    await this.checkBlacklist(2 /* merchant */, merchant.id)

    await this.clearLoginFail(mobileHash)
    staff.lastLoginAt = new Date()
    await this.merchantStaffRepo.save(staff)

    const tokens = await this.issueTokenPair(staff.id, 'merchant', staff.tenantId, {
      merchantId: merchant.id
    })
    return {
      tokens,
      merchant: this.toMerchantLoginVo(merchant, staff)
    }
  }

  /**
   * 商户短信登录（仅主账号 mobile + smsCode；首次登录建议绑定 staff）
   * 参数：mobile / smsCode
   */
  async merchantSmsLogin(
    mobile: string,
    smsCode: string
  ): Promise<{ tokens: TokenPair; merchant: MerchantLoginVo }> {
    const mobileHash = CryptoUtil.hmac(mobile)
    await this.ensureNotLocked(mobileHash)
    try {
      await this.verifySms(mobile, smsCode)
    } catch (err) {
      await this.markLoginFail(mobileHash)
      throw err
    }

    const merchant = await this.merchantRepo.findOne({ where: { mobileHash, isDeleted: 0 } })
    if (!merchant) {
      throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND, '该手机号未注册商户')
    }
    if (merchant.status !== 1) {
      throw new BusinessException(BizErrorCode.AUTH_ACCOUNT_DISABLED)
    }
    await this.checkBlacklist(2, merchant.id)
    await this.clearLoginFail(mobileHash)

    /* 主账号短信登录：以 merchant.id 为 uid，userType=merchant；merchantId 同 uid */
    const tokens = await this.issueTokenPair(merchant.id, 'merchant', merchant.tenantId, {
      merchantId: merchant.id
    })
    return {
      tokens,
      merchant: this.toMerchantLoginVo(merchant, null)
    }
  }

  /* =========================================================================
   * 六、骑手登录（mobile + password；rider 表无 password 列 → 走 sms 主流程）
   * ========================================================================= */

  /**
   * 骑手登录（mobile + smsCode；rider 表无密码，强制 SMS 登录）
   * 参数：mobile / smsCode
   * 返回值：{ tokens, rider }
   */
  async riderLogin(
    mobile: string,
    smsCode: string
  ): Promise<{ tokens: TokenPair; rider: RiderLoginVo }> {
    const mobileHash = CryptoUtil.hmac(mobile)
    await this.ensureNotLocked(mobileHash)
    try {
      await this.verifySms(mobile, smsCode)
    } catch (err) {
      await this.markLoginFail(mobileHash)
      throw err
    }

    const rider = await this.riderRepo.findOne({ where: { mobileHash, isDeleted: 0 } })
    if (!rider) {
      throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND, '该手机号未注册骑手')
    }
    if (rider.status !== 1) {
      throw new BusinessException(BizErrorCode.AUTH_ACCOUNT_DISABLED)
    }
    await this.checkBlacklist(3, rider.id)
    await this.clearLoginFail(mobileHash)

    rider.lastOnlineAt = new Date()
    await this.riderRepo.save(rider)

    const tokens = await this.issueTokenPair(rider.id, 'rider', rider.tenantId)
    return {
      tokens,
      rider: {
        id: rider.id,
        riderNo: rider.riderNo,
        nameTail: rider.nameTail,
        mobileTail4: rider.mobileTail4,
        level: rider.level,
        score: rider.score,
        serviceCity: rider.serviceCity,
        status: rider.status,
        onlineStatus: rider.onlineStatus
      }
    }
  }

  /* =========================================================================
   * 七、管理员登录（username + password；返回菜单 + 权限码）
   * ========================================================================= */

  /**
   * 管理员登录
   * 参数：username / password / captcha 可选
   * 返回值：{ tokens, admin, menus, permissions }
   * 错误：
   *   - 账号不存在/密码错 → 20013（共用以避免账号枚举）
   *   - 账号禁用 → 20020
   *   - 失败 5 次锁 30min → 20011
   */
  async adminLogin(
    username: string,
    password: string,
    _captcha?: string
  ): Promise<{
    tokens: TokenPair
    admin: AdminLoginVo
    menus: MenuNode[]
    permissions: string[]
  }> {
    if (!username || !password) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '账号/密码不可为空')
    }

    /* 用 username（小写）做 hash 用作 lockKey；与手机号风控共用一套 K04 */
    const lockKey = CryptoUtil.hmac(`admin:${username.toLowerCase()}`)
    await this.ensureNotLocked(lockKey)

    const a = await this.adminRepo.findOne({ where: { username, isDeleted: 0 } })
    if (!a) {
      await this.markLoginFail(lockKey)
      throw new BusinessException(BizErrorCode.AUTH_PASSWORD_INCORRECT)
    }
    if (!PasswordUtil.verify(password, a.passwordHash)) {
      await this.markLoginFail(lockKey)
      throw new BusinessException(BizErrorCode.AUTH_PASSWORD_INCORRECT)
    }
    if (a.status !== 1) {
      throw new BusinessException(BizErrorCode.AUTH_ACCOUNT_DISABLED)
    }
    await this.clearLoginFail(lockKey)

    /* 加载权限码集合 + 菜单树 */
    const { permissions, menus } = await this.loadAdminAccess(a.id, a.isSuper === 1)
    /* 写权限缓存（PermissionGuard 复用） */
    try {
      const codes = a.isSuper === 1 ? new Set([PERM_WILDCARD]) : new Set(permissions)
      const key = PERM_CACHE_KEY(a.id)
      const pipeline = this.redis.pipeline()
      pipeline.del(key)
      pipeline.sadd(key, ...Array.from(codes))
      pipeline.expire(key, PERM_CACHE_TTL_SECONDS)
      await pipeline.exec()
    } catch (err) {
      this.logger.warn(`登录写权限缓存失败 admin=${a.id}：${(err as Error).message}`)
    }

    a.lastLoginAt = new Date()
    await this.adminRepo.save(a)

    const tokens = await this.issueTokenPair(a.id, 'admin', a.tenantId, {
      isSuper: a.isSuper === 1
    })
    return {
      tokens,
      admin: {
        id: a.id,
        username: a.username,
        nickname: a.nickname,
        avatarUrl: a.avatarUrl,
        mobileTail4: a.mobileTail4,
        email: a.email,
        isSuper: a.isSuper === 1
      },
      menus,
      permissions
    }
  }

  /* =========================================================================
   * 内部工具
   * ========================================================================= */

  /**
   * 黑名单校验
   * 参数：targetType 1 用户 / 2 商户 / 3 骑手；targetId 主键
   * 错误：命中生效中黑名单 → 20021
   */
  private async checkBlacklist(targetType: number, targetId: string): Promise<void> {
    const hit = await this.blacklistRepo
      .createQueryBuilder('b')
      .where('b.target_type = :t AND b.target_id = :id', { t: targetType, id: targetId })
      .andWhere('b.status = 1 AND b.is_deleted = 0')
      .andWhere('(b.expire_at IS NULL OR b.expire_at > NOW(3))')
      .getOne()
    if (hit) {
      throw new BusinessException(BizErrorCode.AUTH_ACCOUNT_BLACKLISTED, hit.reason)
    }
  }

  /**
   * 加载管理员菜单树 + 权限码集合
   * 参数：adminId / isSuper
   * 返回值：{ permissions, menus }
   *
   * 实现：
   *   - 超管：加载全部 status=1 的菜单 + 全部 resource_code（含通配 *）
   *   - 普通：通过 admin_role + role_permission + permission 三表 join 取并集
   */
  private async loadAdminAccess(
    adminId: string,
    isSuper: boolean
  ): Promise<{
    permissions: string[]
    menus: MenuNode[]
  }> {
    let permissionRows: Permission[]
    if (isSuper) {
      permissionRows = await this.permissionRepo.find({
        where: { isDeleted: 0, status: 1 },
        order: { sort: 'ASC' }
      })
    } else {
      const adminRoles = await this.adminRoleRepo.find({
        where: { adminId, isDeleted: 0 }
      })
      const roleIds = adminRoles.map((r) => r.roleId)
      if (roleIds.length === 0) {
        return { permissions: [], menus: [] }
      }
      const rolePerms = await this.rolePermissionRepo.find({
        where: { roleId: In(roleIds), isDeleted: 0 }
      })
      const permIds = Array.from(new Set(rolePerms.map((rp) => rp.permissionId)))
      if (permIds.length === 0) {
        return { permissions: [], menus: [] }
      }
      permissionRows = await this.permissionRepo.find({
        where: { id: In(permIds), isDeleted: 0, status: 1 },
        order: { sort: 'ASC' }
      })
    }

    /* 权限码（菜单 + 按钮 + 接口 全 resource_code） */
    const permissions = permissionRows.map((p) => p.resourceCode)

    /* 菜单树：仅 resource_type=1，按 parent_id 分组 */
    const menus: MenuNode[] = []
    const byId = new Map<string, MenuNode>()
    for (const p of permissionRows) {
      if (p.resourceType !== 1) continue
      const node: MenuNode = {
        id: p.id,
        parentId: p.parentId,
        code: p.resourceCode,
        name: p.resourceName,
        icon: p.icon,
        sort: p.sort,
        children: []
      }
      byId.set(p.id, node)
    }
    for (const node of byId.values()) {
      const parent = byId.get(node.parentId)
      if (parent) parent.children.push(node)
      else menus.push(node)
    }
    return { permissions, menus }
  }

  /**
   * Merchant + Staff → 登录响应 VO（脱敏）
   */
  private toMerchantLoginVo(m: Merchant, s: MerchantStaff | null): MerchantLoginVo {
    return {
      id: m.id,
      merchantNo: m.merchantNo,
      name: m.name,
      shortName: m.shortName,
      logoUrl: m.logoUrl,
      industryCode: m.industryCode,
      mobileTail4: m.mobileTail4,
      auditStatus: m.auditStatus,
      status: m.status,
      staff: s
        ? {
            id: s.id,
            username: s.username,
            name: s.name,
            roleCode: s.roleCode,
            mobileTail4: s.mobileTail4
          }
        : null
    }
  }

  /** 简易脱敏（日志用） */
  private maskMobile(m: string): string {
    return CryptoUtil.mask(m, 3, 4)
  }
}

/* ===== 出参 VO（与 Controller 保持一致；放本文件避免单独 dto 文件爆炸） ===== */

export interface MenuNode {
  id: string
  parentId: string
  code: string
  name: string
  icon: string | null
  sort: number
  children: MenuNode[]
}

export interface AdminLoginVo {
  id: string
  username: string
  nickname: string | null
  avatarUrl: string | null
  mobileTail4: string | null
  email: string | null
  isSuper: boolean
}

export interface MerchantStaffVo {
  id: string
  username: string
  name: string | null
  roleCode: string
  mobileTail4: string | null
}

export interface MerchantLoginVo {
  id: string
  merchantNo: string
  name: string
  shortName: string | null
  logoUrl: string | null
  industryCode: string
  mobileTail4: string
  auditStatus: number
  status: number
  staff: MerchantStaffVo | null
}

export interface RiderLoginVo {
  id: string
  riderNo: string
  nameTail: string | null
  mobileTail4: string
  level: number
  score: string
  serviceCity: string
  status: number
  onlineStatus: number
}

/**
 * 短 hash（仅 dev mock openId 用）
 */
function createHash24(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) & 0x7fffffff
  return h.toString(36)
}
