/**
 * @file merchant-staff.service.ts
 * @desc 商户端子账号 CRUD 服务：分页 / 详情 / 创建 / 更新 / 软删 / 重置密码
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '../../../common'
import { Merchant, MerchantStaff, Shop } from '../../../entities'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import { TOKEN_VER_KEY } from '../../auth/strategies/jwt.strategy'
import { CryptoUtil, PasswordUtil, SnowflakeId } from '../../../utils'
import {
  CreateMerchantStaffDto,
  MerchantStaffRole,
  MerchantStaffVo,
  QueryMerchantStaffDto,
  ResetMerchantStaffPasswordDto,
  UpdateMerchantStaffDto
} from '../dto/merchant-staff.dto'

const MERCHANT_TOKEN_KEY = (uid: string): string => `auth:token:merchant:${uid}`
const MERCHANT_REFRESH_KEY = (uid: string): string => `auth:refresh:merchant:${uid}`
const TOKEN_VER_TTL_SECONDS = 365 * 24 * 3600

interface MerchantShopBinding {
  shopIds: string[]
  shopNames: string[]
}

@Injectable()
export class MerchantStaffService {
  private readonly logger = new Logger(MerchantStaffService.name)

  constructor(
    @InjectRepository(MerchantStaff)
    private readonly staffRepo: Repository<MerchantStaff>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * 商户端：子账号分页查询
   * 参数：merchantId / query
   * 返回值：PageResult<MerchantStaffVo>
   * 用途：GET /merchant/staff
   */
  async listForMerchant(
    merchantId: string,
    query: QueryMerchantStaffDto
  ): Promise<PageResult<MerchantStaffVo>> {
    const shops = await this.listMerchantShops(merchantId)
    if (query.shopId) {
      this.assertRequestedShopOwned(query.shopId, shops)
    }

    const qb = this.staffRepo
      .createQueryBuilder('s')
      .where('s.merchant_id = :merchantId', { merchantId })
      .andWhere('s.is_deleted = 0')

    if (query.role) {
      qb.andWhere('s.role_code IN (:...roleCodes)', {
        roleCodes: roleCodesForQuery(query.role)
      })
    }
    if (query.status !== undefined) {
      qb.andWhere('s.status = :status', { status: query.status })
    }

    qb.orderBy('s.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    const binding = this.toShopBinding(shops)

    return makePageResult(
      rows.map((row) => this.toVo(row, binding)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 商户端：子账号详情
   * 参数：merchantId / staffId
   * 返回值：MerchantStaffVo
   * 用途：GET /merchant/staff/:id
   */
  async detailForMerchant(merchantId: string, staffId: string): Promise<MerchantStaffVo> {
    const staff = await this.findActiveByIdForMerchant(merchantId, staffId)
    const shops = await this.listMerchantShops(merchantId)
    return this.toVo(staff, this.toShopBinding(shops))
  }

  /**
   * 商户端：创建子账号
   * 参数：merchantId / dto
   * 返回值：MerchantStaffVo
   * 用途：POST /merchant/staff
   */
  async createForMerchant(
    merchantId: string,
    dto: CreateMerchantStaffDto
  ): Promise<MerchantStaffVo> {
    const merchant = await this.findMerchantOrThrow(merchantId)
    const shops = await this.assertCompatibleShopIds(merchantId, dto.shopIds)

    await this.ensureUsernameAvailable(merchantId, dto.username)
    const mobileHash = CryptoUtil.hmac(dto.mobile)
    await this.ensureMobileAvailable(mobileHash)

    const mobileTriple = CryptoUtil.encryptTriple(dto.mobile)
    const now = new Date()
    const entity = this.staffRepo.create({
      id: SnowflakeId.next(),
      tenantId: merchant.tenantId,
      merchantId,
      username: dto.username,
      passwordHash: PasswordUtil.hash(dto.password),
      name: dto.realName,
      mobileEnc: mobileTriple.enc,
      mobileHash: mobileTriple.hash,
      mobileTail4: mobileTriple.tail4,
      roleCode: toDbRoleCode(dto.role),
      status: 1,
      lastLoginAt: null,
      encKeyVer: mobileTriple.encKeyVer,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })

    const saved = await this.staffRepo.save(entity)
    this.logger.log(`商户 ${merchantId} 创建子账号 ${saved.id}（${saved.username}）`)
    return this.toVo(saved, this.toShopBinding(shops), dto.mobile)
  }

  /**
   * 商户端：更新子账号
   * 参数：merchantId / staffId / dto
   * 返回值：MerchantStaffVo
   * 用途：PUT /merchant/staff/:id
   */
  async updateForMerchant(
    merchantId: string,
    staffId: string,
    dto: UpdateMerchantStaffDto
  ): Promise<MerchantStaffVo> {
    const staff = await this.findActiveByIdForMerchant(merchantId, staffId)
    const shops = dto.shopIds
      ? await this.assertCompatibleShopIds(merchantId, dto.shopIds)
      : await this.listMerchantShops(merchantId)

    let shouldRevokeToken = false

    if (dto.username !== undefined && dto.username !== staff.username) {
      await this.ensureUsernameAvailable(merchantId, dto.username, staff.id)
      staff.username = dto.username
    }
    if (dto.realName !== undefined) {
      staff.name = dto.realName
    }
    if (dto.mobile !== undefined) {
      const mobileHash = CryptoUtil.hmac(dto.mobile)
      await this.ensureMobileAvailable(mobileHash, staff.id)
      const mobileTriple = CryptoUtil.encryptTriple(dto.mobile)
      staff.mobileEnc = mobileTriple.enc
      staff.mobileHash = mobileTriple.hash
      staff.mobileTail4 = mobileTriple.tail4
      staff.encKeyVer = mobileTriple.encKeyVer
    }
    if (dto.role !== undefined) {
      staff.roleCode = toDbRoleCode(dto.role)
    }
    if (dto.password !== undefined) {
      staff.passwordHash = PasswordUtil.hash(dto.password)
      shouldRevokeToken = true
    }
    if (dto.status !== undefined && dto.status !== staff.status) {
      staff.status = dto.status
      if (dto.status === 0) shouldRevokeToken = true
    }

    const saved = await this.staffRepo.save(staff)
    if (shouldRevokeToken) {
      await this.revokeTokens(saved.id)
    }

    this.logger.log(`商户 ${merchantId} 更新子账号 ${saved.id}`)
    return this.toVo(saved, this.toShopBinding(shops), dto.mobile)
  }

  /**
   * 商户端：软删子账号
   * 参数：merchantId / staffId
   * 返回值：{ ok: true }
   * 用途：DELETE /merchant/staff/:id
   */
  async removeForMerchant(merchantId: string, staffId: string): Promise<{ ok: true }> {
    const staff = await this.findActiveByIdForMerchant(merchantId, staffId)
    const now = new Date()

    staff.username = `del_${staff.id}`
    staff.status = 0
    staff.isDeleted = 1
    staff.deletedAt = now
    staff.mobileEnc = null
    staff.mobileHash = null
    staff.mobileTail4 = null

    await this.staffRepo.save(staff)
    await this.revokeTokens(staff.id)
    this.logger.log(`商户 ${merchantId} 删除子账号 ${staff.id}`)
    return { ok: true as const }
  }

  /**
   * 商户端：重置子账号密码
   * 参数：merchantId / staffId / dto
   * 返回值：{ ok: true }
   * 用途：POST /merchant/staff/:id/password/reset
   */
  async resetPasswordForMerchant(
    merchantId: string,
    staffId: string,
    dto: ResetMerchantStaffPasswordDto
  ): Promise<{ ok: true }> {
    const staff = await this.findActiveByIdForMerchant(merchantId, staffId)
    staff.passwordHash = PasswordUtil.hash(dto.newPassword)
    await this.staffRepo.save(staff)
    await this.revokeTokens(staff.id)
    this.logger.log(`商户 ${merchantId} 重置子账号 ${staff.id} 密码`)
    return { ok: true as const }
  }

  /** 当前商户实体 */
  private async findMerchantOrThrow(merchantId: string): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId, isDeleted: 0 } })
    if (!merchant) {
      throw new BusinessException(BizErrorCode.AUTH_USER_NOT_FOUND, '商户不存在')
    }
    return merchant
  }

  /** 当前商户名下活跃子账号 */
  private async findActiveByIdForMerchant(
    merchantId: string,
    staffId: string
  ): Promise<MerchantStaff> {
    const staff = await this.staffRepo.findOne({
      where: { id: staffId, merchantId, isDeleted: 0 }
    })
    if (!staff) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '子账号不存在')
    }
    return staff
  }

  /** 当前商户全部未删除店铺 */
  private async listMerchantShops(merchantId: string): Promise<Shop[]> {
    return this.shopRepo
      .createQueryBuilder('s')
      .where('s.merchant_id = :merchantId', { merchantId })
      .andWhere('s.is_deleted = 0')
      .orderBy('s.created_at', 'DESC')
      .getMany()
  }

  /**
   * 兼容前端传入 shopIds：仅校验均属于当前商户且至少有 1 个，
   * 实际不做持久化，返回值仍按当前商户全部店铺展开。
   */
  private async assertCompatibleShopIds(
    merchantId: string,
    requestedShopIds: string[]
  ): Promise<Shop[]> {
    const shops = await this.listMerchantShops(merchantId)
    if (shops.length === 0) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '当前商户暂无可关联店铺')
    }

    const ownedSet = new Set(shops.map((shop) => shop.id))
    for (const shopId of requestedShopIds) {
      if (!ownedSet.has(shopId)) {
        throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '存在不属于当前商户的店铺')
      }
    }
    return shops
  }

  /** 单个 shopId 归属校验（用于列表兼容筛选入参） */
  private assertRequestedShopOwned(requestedShopId: string, shops: Shop[]): void {
    if (shops.some((shop) => shop.id === requestedShopId)) return
    throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '店铺不存在或无权访问')
  }

  /** 商户内用户名唯一校验（含已删除记录，避免撞唯一索引） */
  private async ensureUsernameAvailable(
    merchantId: string,
    username: string,
    excludeStaffId?: string
  ): Promise<void> {
    const existing = await this.staffRepo.findOne({ where: { merchantId, username } })
    if (existing && existing.id !== excludeStaffId) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '该用户名已存在')
    }
  }

  /**
   * 手机号唯一校验（按活跃子账号全局唯一）
   * 说明：merchant/password 登录当前按 mobileHash 直接命中 staff，若允许重复将造成登录歧义。
   */
  private async ensureMobileAvailable(mobileHash: string, excludeStaffId?: string): Promise<void> {
    const existing = await this.staffRepo.findOne({ where: { mobileHash, isDeleted: 0 } })
    if (existing && existing.id !== excludeStaffId) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '该手机号已被其他子账号使用')
    }
  }

  /** token 作废（密码重置 / 禁用 / 删除后触发） */
  private async revokeTokens(staffId: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(MERCHANT_TOKEN_KEY(staffId)),
        this.redis.del(MERCHANT_REFRESH_KEY(staffId)),
        this.redis.incr(TOKEN_VER_KEY('merchant', staffId)),
        this.redis.expire(TOKEN_VER_KEY('merchant', staffId), TOKEN_VER_TTL_SECONDS)
      ])
    } catch (err) {
      this.logger.warn(`子账号 ${staffId} token 作废失败：${(err as Error).message}`)
    }
  }

  /** 店铺绑定视图（当前 schema 下统一展开为商户全部店铺） */
  private toShopBinding(shops: Shop[]): MerchantShopBinding {
    return {
      shopIds: shops.map((shop) => shop.id),
      shopNames: shops.map((shop) => shop.name)
    }
  }

  /** Entity → 前端子账号视图 */
  private toVo(
    staff: MerchantStaff,
    shopBinding: MerchantShopBinding,
    plainMobile?: string
  ): MerchantStaffVo {
    return {
      id: staff.id,
      username: staff.username,
      realName: staff.name ?? '',
      mobile: plainMobile ?? this.tryDecryptMobile(staff),
      role: toApiRole(staff.roleCode),
      shopIds: [...shopBinding.shopIds],
      shopNames: [...shopBinding.shopNames],
      status: staff.status,
      lastLoginAt: staff.lastLoginAt,
      createdAt: staff.createdAt
    }
  }

  /** 解密手机号（失败时回落为尾号掩码） */
  private tryDecryptMobile(staff: MerchantStaff): string {
    if (staff.mobileEnc) {
      try {
        return CryptoUtil.decrypt(staff.mobileEnc, staff.encKeyVer)
      } catch (err) {
        this.logger.warn(`子账号 ${staff.id} 手机号解密失败：${(err as Error).message}`)
      }
    }
    return staff.mobileTail4 ? `*******${staff.mobileTail4}` : ''
  }
}

function toDbRoleCode(role: MerchantStaffRole): string {
  switch (role) {
    case 'manager':
      return 'store_owner'
    case 'cashier':
      return 'store_finance'
    case 'staff':
    default:
      return 'store_clerk'
  }
}

function roleCodesForQuery(role: MerchantStaffRole): string[] {
  switch (role) {
    case 'manager':
      return ['store_owner', 'manager']
    case 'cashier':
      return ['store_finance', 'cashier']
    case 'staff':
    default:
      return ['store_clerk', 'staff']
  }
}

function toApiRole(roleCode: string): MerchantStaffRole {
  if (roleCode === 'store_owner' || roleCode === 'manager') return 'manager'
  if (roleCode === 'store_finance' || roleCode === 'cashier') return 'cashier'
  return 'staff'
}
