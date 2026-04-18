/**
 * @file user.service.ts
 * @stage P3 / T3.9
 * @desc 用户中心 C 端 / 管理后台用户 CRUD + 实名认证
 * @author 员工 B
 *
 * 数据来源：MySQL `user` 表（01_account.sql）
 * 缓存：K06 `user:info:{userId}` Hash TTL 30min（更新时 DEL）
 * 敏感字段：mobile/id_card/real_name 三组（写入时 enc + hash + tail4；列表禁返回 enc/hash）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '../../../common'
import { User } from '../../../entities'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import { CryptoUtil } from '../../../utils'
import {
  AdminListUserQueryDto,
  SubmitRealnameDto,
  UpdateMyProfileDto,
  UserDetailVo
} from '../dto/user.dto'

/** Redis 缓存 Key（K06）TTL 30min */
const USER_INFO_KEY = (userId: string): string => `user:info:${userId}`
const USER_INFO_TTL_SECONDS = 1800

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * 取当前用户详情（脱敏）
   * 参数：userId 用户 ID（雪花字符串）
   * 返回值：UserDetailVo
   * 用途：GET /api/v1/me
   */
  async getMyProfile(userId: string): Promise<UserDetailVo> {
    const u = await this.findActiveById(userId)
    return this.toDetailVo(u)
  }

  /**
   * 更新当前用户资料
   * 参数：userId / dto 局部更新字段
   * 返回值：更新后的 UserDetailVo
   * 用途：PUT /api/v1/me
   */
  async updateMyProfile(userId: string, dto: UpdateMyProfileDto): Promise<UserDetailVo> {
    const u = await this.findActiveById(userId)
    if (dto.nickname !== undefined) u.nickname = dto.nickname
    if (dto.avatarUrl !== undefined) u.avatarUrl = dto.avatarUrl
    if (dto.gender !== undefined) u.gender = dto.gender
    if (dto.birthday !== undefined) u.birthday = new Date(dto.birthday)
    await this.userRepo.save(u)
    await this.invalidateCache(userId)
    return this.toDetailVo(u)
  }

  /**
   * 提交实名认证
   * 参数：userId / dto 真实姓名 + 身份证号
   * 返回值：UserDetailVo（is_realname=1）
   * 用途：POST /api/v1/me/realname
   *
   * 实现：
   *   1. 计算 idCardHash 校验是否已存在他人占用
   *   2. （留 TODO 占位）调用三方核身适配器；本期默认通过
   *   3. AES-GCM 加密 real_name / id_card 并写入 enc 列；写 mobile 暂不动
   *   4. is_realname = 1；DEL Redis K06
   */
  async submitRealname(userId: string, dto: SubmitRealnameDto): Promise<UserDetailVo> {
    const u = await this.findActiveById(userId)
    if (u.isRealname === 1) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '已实名，无需重复提交')
    }
    const idCardHash = CryptoUtil.hmac(dto.idCard)
    const dup = await this.userRepo
      .createQueryBuilder('u')
      .where('u.id_card_hash = :h', { h: idCardHash })
      .andWhere('u.id != :id', { id: userId })
      .andWhere('u.is_deleted = 0')
      .getOne()
    if (dup) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '该身份证号已被他人实名')
    }

    // TODO: 三方核身适配器（实际接入阿里云身份二要素 / 腾讯云实名核身）
    //       本期占位默认通过
    u.realNameEnc = CryptoUtil.encrypt(dto.realName, u.encKeyVer)
    u.idCardEnc = CryptoUtil.encrypt(dto.idCard, u.encKeyVer)
    u.idCardHash = idCardHash
    u.isRealname = 1
    await this.userRepo.save(u)
    await this.invalidateCache(userId)
    this.logger.log(`用户 ${userId} 实名认证成功`)
    return this.toDetailVo(u)
  }

  /**
   * 管理后台用户列表（分页）
   * 参数：query 查询入参（含 page/pageSize/mobile/nickname/status/isRealname）
   * 返回值：PageResult<UserDetailVo>
   * 用途：GET /api/v1/admin/users
   */
  async adminList(query: AdminListUserQueryDto): Promise<PageResult<UserDetailVo>> {
    const qb = this.userRepo.createQueryBuilder('u').where('u.is_deleted = 0')
    if (query.mobile) {
      qb.andWhere('u.mobile_hash = :h', { h: CryptoUtil.hmac(query.mobile) })
    }
    if (query.nickname) {
      qb.andWhere('u.nickname LIKE :n', { n: `%${query.nickname}%` })
    }
    if (query.status !== undefined) {
      qb.andWhere('u.status = :s', { s: query.status })
    }
    if (query.isRealname !== undefined) {
      qb.andWhere('u.is_realname = :r', { r: query.isRealname })
    }
    qb.orderBy('u.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toDetailVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 管理后台获取用户详情
   * 参数：userId 用户 ID
   * 返回值：UserDetailVo（仍是脱敏视图，全号需走"二次身份校验"接口，本期 TODO）
   * 用途：GET /api/v1/admin/users/:id
   */
  async adminDetail(userId: string): Promise<UserDetailVo> {
    const u = await this.findActiveById(userId)
    return this.toDetailVo(u)
  }

  /**
   * 管理后台更新用户状态（封禁/解封 / 注销）
   * 参数：userId / status 0/1/2
   * 返回值：UserDetailVo
   * 用途：与 BlacklistService 协同；admin.controller PUT /admin/users/:id/status
   */
  async adminUpdateStatus(userId: string, status: number): Promise<UserDetailVo> {
    if (![0, 1, 2].includes(status)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '非法 status')
    }
    const u = await this.findActiveById(userId)
    u.status = status
    await this.userRepo.save(u)
    await this.invalidateCache(userId)
    return this.toDetailVo(u)
  }

  /**
   * 取活跃用户实体（含校验：是否存在 / 是否软删）
   * 参数：userId
   * 返回值：User entity
   */
  private async findActiveById(userId: string): Promise<User> {
    const u = await this.userRepo.findOne({ where: { id: userId, isDeleted: 0 } })
    if (!u) {
      throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND)
    }
    return u
  }

  /**
   * 失效画像缓存（K06）
   * 参数：userId
   * 返回值：Promise<void>
   * 用途：任何写操作之后必须调用，防止脏读
   */
  private async invalidateCache(userId: string): Promise<void> {
    try {
      await this.redis.del(USER_INFO_KEY(userId))
    } catch (err) {
      this.logger.warn(`Redis DEL ${USER_INFO_KEY(userId)} 失败：${(err as Error).message}`)
    }
  }

  /**
   * Entity → 详情视图（脱敏；不返回 *_enc / *_hash）
   * 参数：u User entity
   * 返回值：UserDetailVo
   */
  private toDetailVo(u: User): UserDetailVo {
    return {
      id: u.id,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl,
      gender: u.gender,
      birthday: u.birthday ? toISODate(u.birthday) : null,
      mobileTail4: u.mobileTail4,
      isRealname: u.isRealname,
      status: u.status,
      regSource: u.regSource,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt
    }
  }

  // 暴露 cache key 给单元测试和 admin 触发清缓存
  static cacheKeyOf(userId: string): string {
    return USER_INFO_KEY(userId)
  }
  static get CACHE_TTL_SECONDS(): number {
    return USER_INFO_TTL_SECONDS
  }
}

/**
 * Date → 'YYYY-MM-DD' 简易格式化
 * 参数：d Date
 * 返回值：string
 */
function toISODate(d: Date): string {
  if (!(d instanceof Date)) {
    return String(d)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
