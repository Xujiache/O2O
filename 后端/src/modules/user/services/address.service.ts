/**
 * @file address.service.ts
 * @stage P3 / T3.9
 * @desc 用户收货地址 CRUD + 默认切换；手机号入库强制 enc/hash/tail4
 * @author 员工 B
 *
 * 数据来源：MySQL `user_address`
 * 默认切换原则：同一用户最多一条 is_default=1；切换时使用 transaction 保证一致性
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '../../../common'
import { UserAddress } from '../../../entities'
import { CryptoUtil, SnowflakeId } from '../../../utils'
import { AddressVo, CreateAddressDto, UpdateAddressDto } from '../dto/address.dto'

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name)

  constructor(
    @InjectRepository(UserAddress) private readonly addrRepo: Repository<UserAddress>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * 列出当前用户的全部地址（按 is_default desc, created_at desc）
   * 参数：userId
   * 返回值：AddressVo[]
   * 用途：GET /api/v1/me/addresses
   */
  async list(userId: string): Promise<AddressVo[]> {
    const rows = await this.addrRepo
      .createQueryBuilder('a')
      .where('a.user_id = :uid AND a.is_deleted = 0', { uid: userId })
      .orderBy('a.is_default', 'DESC')
      .addOrderBy('a.created_at', 'DESC')
      .getMany()
    return rows.map((r) => this.toVo(r))
  }

  /**
   * 取单条地址（脱敏）
   * 参数：userId / addressId
   * 返回值：AddressVo
   * 用途：GET /api/v1/me/addresses/:id
   */
  async detail(userId: string, addressId: string): Promise<AddressVo> {
    const a = await this.findOwned(userId, addressId)
    return this.toVo(a)
  }

  /**
   * 新增地址
   * 参数：userId / dto
   * 返回值：AddressVo
   * 用途：POST /api/v1/me/addresses
   */
  async create(userId: string, dto: CreateAddressDto): Promise<AddressVo> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserAddress)
      // 若设为默认，先清除当前默认
      if (dto.isDefault === 1) {
        await repo
          .createQueryBuilder()
          .update()
          .set({ isDefault: 0 })
          .where('user_id = :uid AND is_deleted = 0 AND is_default = 1', { uid: userId })
          .execute()
      } else {
        // 用户首条地址自动设为默认
        const count = await repo.count({ where: { userId, isDeleted: 0 } })
        if (count === 0) dto.isDefault = 1
      }
      const e = repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        userId,
        receiverName: dto.receiverName,
        receiverMobileEnc: CryptoUtil.encrypt(dto.receiverMobile),
        receiverMobileHash: CryptoUtil.hmac(dto.receiverMobile),
        receiverMobileTail4: CryptoUtil.tail4(dto.receiverMobile),
        provinceCode: dto.provinceCode,
        cityCode: dto.cityCode,
        districtCode: dto.districtCode,
        provinceName: dto.provinceName,
        cityName: dto.cityName,
        districtName: dto.districtName,
        detail: dto.detail,
        tag: dto.tag ?? null,
        lng: dto.lng !== undefined ? String(dto.lng) : null,
        lat: dto.lat !== undefined ? String(dto.lat) : null,
        isDefault: dto.isDefault ?? 0,
        encKeyVer: 1,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      await repo.save(e)
      this.logger.log(`用户 ${userId} 新增地址 ${e.id}（默认=${e.isDefault}）`)
      return this.toVo(e)
    })
  }

  /**
   * 更新地址
   * 参数：userId / addressId / dto
   * 返回值：AddressVo
   * 用途：PUT /api/v1/me/addresses/:id
   */
  async update(userId: string, addressId: string, dto: UpdateAddressDto): Promise<AddressVo> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserAddress)
      const a = await repo.findOne({
        where: { id: addressId, userId, isDeleted: 0 }
      })
      if (!a) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '地址不存在')

      if (dto.isDefault === 1 && a.isDefault !== 1) {
        await repo
          .createQueryBuilder()
          .update()
          .set({ isDefault: 0 })
          .where('user_id = :uid AND is_deleted = 0 AND is_default = 1', { uid: userId })
          .execute()
      }
      // 局部赋值
      if (dto.receiverName !== undefined) a.receiverName = dto.receiverName
      if (dto.receiverMobile !== undefined) {
        a.receiverMobileEnc = CryptoUtil.encrypt(dto.receiverMobile)
        a.receiverMobileHash = CryptoUtil.hmac(dto.receiverMobile)
        a.receiverMobileTail4 = CryptoUtil.tail4(dto.receiverMobile)
      }
      if (dto.provinceCode !== undefined) a.provinceCode = dto.provinceCode
      if (dto.cityCode !== undefined) a.cityCode = dto.cityCode
      if (dto.districtCode !== undefined) a.districtCode = dto.districtCode
      if (dto.provinceName !== undefined) a.provinceName = dto.provinceName
      if (dto.cityName !== undefined) a.cityName = dto.cityName
      if (dto.districtName !== undefined) a.districtName = dto.districtName
      if (dto.detail !== undefined) a.detail = dto.detail
      if (dto.tag !== undefined) a.tag = dto.tag
      if (dto.lng !== undefined) a.lng = dto.lng !== null ? String(dto.lng) : null
      if (dto.lat !== undefined) a.lat = dto.lat !== null ? String(dto.lat) : null
      if (dto.isDefault !== undefined) a.isDefault = dto.isDefault
      await repo.save(a)
      return this.toVo(a)
    })
  }

  /**
   * 软删地址
   * 参数：userId / addressId
   * 返回值：{ ok: true }
   * 用途：DELETE /api/v1/me/addresses/:id
   */
  async remove(userId: string, addressId: string): Promise<{ ok: true }> {
    const a = await this.findOwned(userId, addressId)
    a.isDeleted = 1
    a.deletedAt = new Date()
    await this.addrRepo.save(a)
    // 删除的是默认地址 → 自动把最近创建的另一条置为默认
    if (a.isDefault === 1) {
      const next = await this.addrRepo
        .createQueryBuilder('a')
        .where('a.user_id = :uid AND a.is_deleted = 0 AND a.id != :id', {
          uid: userId,
          id: addressId
        })
        .orderBy('a.created_at', 'DESC')
        .getOne()
      if (next) {
        next.isDefault = 1
        await this.addrRepo.save(next)
      }
    }
    return { ok: true }
  }

  /**
   * 切换默认地址
   * 参数：userId / addressId
   * 返回值：AddressVo（已被切为默认的那条）
   * 用途：PUT /api/v1/me/addresses/:id/default
   */
  async setDefault(userId: string, addressId: string): Promise<AddressVo> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserAddress)
      const a = await repo.findOne({
        where: { id: addressId, userId, isDeleted: 0 }
      })
      if (!a) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '地址不存在')
      await repo
        .createQueryBuilder()
        .update()
        .set({ isDefault: 0 })
        .where('user_id = :uid AND is_deleted = 0 AND is_default = 1', { uid: userId })
        .execute()
      a.isDefault = 1
      await repo.save(a)
      return this.toVo(a)
    })
  }

  /**
   * 校验地址归属（防止越权）
   * 参数：userId / addressId
   * 返回值：UserAddress entity
   */
  private async findOwned(userId: string, addressId: string): Promise<UserAddress> {
    const a = await this.addrRepo.findOne({
      where: { id: addressId, userId, isDeleted: 0 }
    })
    if (!a) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '地址不存在')
    return a
  }

  /**
   * Entity → 列表/详情视图
   */
  private toVo(a: UserAddress): AddressVo {
    return {
      id: a.id,
      receiverName: a.receiverName,
      receiverMobileTail4: a.receiverMobileTail4,
      provinceCode: a.provinceCode,
      cityCode: a.cityCode,
      districtCode: a.districtCode,
      provinceName: a.provinceName,
      cityName: a.cityName,
      districtName: a.districtName,
      detail: a.detail,
      tag: a.tag,
      lng: a.lng,
      lat: a.lat,
      isDefault: a.isDefault,
      createdAt: a.createdAt
    }
  }
}
