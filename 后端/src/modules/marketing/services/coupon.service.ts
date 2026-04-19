/**
 * @file coupon.service.ts
 * @stage P4/T4.9（Sprint 2）
 * @desc 优惠券模板服务：CRUD + 上下架 + per_user_limit/总量校验 + receivedQty 增减（事务）
 * @author 单 Agent V2.0
 *
 * 数据：MySQL `coupon`
 * 缓存：
 *   - 模板详情：coupon:tpl:{couponId}                 TTL 300s
 *   - 用户可领列表：暂不缓存（改字段较多，命中率低）
 *
 * 关键约束：
 *   1. 商户端 :id 接口必须 assertOwner（issuerType=2 && issuerId === currentUser.uid）
 *   2. 已发出（receivedQty>0）的券，update 仅允许改 name / description / imageUrl / status
 *   3. 删除：receivedQty>0 拒绝；先下架再删
 *   4. receivedQty 增减必须走 user-coupon.service 的事务（本 service 仅暴露 helper：
 *      findActiveById / assertOwner / 缓存失效）
 */

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Coupon } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { generateBizNo, SnowflakeId } from '@/utils'
import {
  type AvailableCouponQueryDto,
  type CouponVo,
  type CreateCouponDto,
  type QueryCouponDto,
  type UpdateCouponDto,
  type UpdateCouponStatusDto
} from '../dto/coupon.dto'

/* ============================================================================
 * Redis 缓存键 + TTL
 * ============================================================================ */
const COUPON_TPL_KEY = (couponId: string): string => `coupon:tpl:${couponId}`
const COUPON_TPL_TTL_SECONDS = 300

/** 已发出后允许改的"安全字段"白名单 */
const SAFE_UPDATE_FIELDS = ['name', 'description', 'imageUrl'] as const

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name)

  constructor(
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ==========================================================================
   * 商户端
   * ========================================================================== */

  /**
   * 商户端：新建店铺券（issuerType=2 / issuerId=merchantId）
   * 参数：merchantId 当前商户 ID（来自 currentUser.uid）；dto
   * 返回值：CouponVo
   * 用途：POST /merchant/coupons
   */
  async merchantCreate(merchantId: string, dto: CreateCouponDto): Promise<CouponVo> {
    return this.createInternal(2, merchantId, dto)
  }

  /**
   * 商户端：我的券模板列表（按 status / coupon_type / scene 筛选）
   * 参数：merchantId / query
   * 返回值：PageResult<CouponVo>
   * 用途：GET /merchant/coupons
   */
  async merchantList(merchantId: string, query: QueryCouponDto): Promise<PageResult<CouponVo>> {
    const where: FindOptionsWhere<Coupon> = {
      isDeleted: 0,
      issuerType: 2,
      issuerId: merchantId
    }
    if (query.status !== undefined) where.status = query.status
    if (query.couponType !== undefined) where.couponType = query.couponType
    if (query.scene !== undefined) where.scene = query.scene
    return this.queryWithName(where, query)
  }

  /**
   * 商户端：详情（含 owner 校验）
   * 参数：couponId / merchantId
   * 返回值：CouponVo
   * 用途：GET /merchant/coupons/:id
   */
  async merchantDetail(couponId: string, merchantId: string): Promise<CouponVo> {
    const c = await this.assertOwner(couponId, merchantId)
    return this.toVo(c)
  }

  /**
   * 商户端：编辑（已发出 receivedQty>0 → 仅允许改安全字段）
   * 参数：couponId / merchantId / dto
   * 返回值：CouponVo
   * 用途：PUT /merchant/coupons/:id
   */
  async merchantUpdate(
    couponId: string,
    merchantId: string,
    dto: UpdateCouponDto
  ): Promise<CouponVo> {
    const c = await this.assertOwner(couponId, merchantId)
    return this.updateInternal(c, dto)
  }

  /**
   * 商户端：上下架/停用
   * 参数：couponId / merchantId / dto
   * 返回值：CouponVo
   * 用途：PUT /merchant/coupons/:id/status
   */
  async merchantUpdateStatus(
    couponId: string,
    merchantId: string,
    dto: UpdateCouponStatusDto
  ): Promise<CouponVo> {
    const c = await this.assertOwner(couponId, merchantId)
    c.status = dto.status
    const saved = await this.couponRepo.save(c)
    await this.invalidateTplCache(couponId)
    this.logger.log(`商户 ${merchantId} 修改券 ${couponId} status → ${dto.status}`)
    return this.toVo(saved)
  }

  /**
   * 商户端：软删（receivedQty>0 → 拒绝，先下架再删）
   * 参数：couponId / merchantId
   * 返回值：void
   * 用途：DELETE /merchant/coupons/:id
   */
  async merchantDelete(couponId: string, merchantId: string): Promise<void> {
    const c = await this.assertOwner(couponId, merchantId)
    if (c.receivedQty > 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '该券已被领取，请先下架（status=2）后再操作下架并停用'
      )
    }
    if (c.status !== 2) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '请先下架（status=2）后再删除'
      )
    }
    await this.softDelete(c, `商户 ${merchantId}`)
  }

  /* ==========================================================================
   * 用户端公开
   * ========================================================================== */

  /**
   * 用户端"可领券"列表（仅 status=1 + 未达 totalQty + 在生效时段）
   * 参数：query
   * 返回值：PageResult<CouponVo>
   * 用途：GET /coupons/available
   *
   * 设计：
   *   - 当前 coupon 表无 city_code 列；query.cityCode 仅做白名单兼容性占位（不参与 SQL）
   *   - scene 可选筛选（不传时全部）
   *   - shopId 可选：要么 applicable_shops 包含 shopId，要么 applicable_shops IS NULL（全部）
   *   - 未达 totalQty：(total_qty = 0 OR received_qty < total_qty)
   *   - 在生效时段（仅 valid_type=1）：valid_from IS NULL OR valid_from <= NOW()，
   *                                     valid_to   IS NULL OR valid_to   >= NOW()
   *   - 排序：按 created_at DESC（运营新发的优先）
   */
  async publicAvailableList(query: AvailableCouponQueryDto): Promise<PageResult<CouponVo>> {
    const qb = this.couponRepo
      .createQueryBuilder('c')
      .where('c.is_deleted = 0')
      .andWhere('c.status = 1')
      .andWhere('(c.total_qty = 0 OR c.received_qty < c.total_qty)')
      .andWhere('(c.valid_type = 2 OR c.valid_from IS NULL OR c.valid_from <= NOW(3))')
      .andWhere('(c.valid_type = 2 OR c.valid_to   IS NULL OR c.valid_to   >= NOW(3))')

    if (query.scene !== undefined) {
      qb.andWhere('c.scene = :scene', { scene: query.scene })
    }
    if (query.shopId) {
      qb.andWhere('(c.applicable_shops IS NULL OR JSON_CONTAINS(c.applicable_shops, :shopJson))', {
        shopJson: JSON.stringify(query.shopId)
      })
    }

    qb.orderBy('c.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /* ==========================================================================
   * 管理端
   * ========================================================================== */

  /**
   * 管理端：新建平台券（issuerType=1 / issuerId=null）
   * 参数：opAdminId / dto
   * 返回值：CouponVo
   * 用途：POST /admin/coupons
   */
  async adminCreate(opAdminId: string, dto: CreateCouponDto): Promise<CouponVo> {
    const vo = await this.createInternal(1, null, dto)
    await this.operationLogService.write({
      opAdminId,
      module: 'marketing',
      action: 'create',
      resourceType: 'coupon',
      resourceId: vo.id,
      description: `新建平台券「${vo.name}」（${vo.couponCode}）`
    })
    return vo
  }

  /**
   * 管理端：全量分页（按 issuerType / issuerId / status / couponType / scene 筛选）
   * 参数：query
   * 返回值：PageResult<CouponVo>
   * 用途：GET /admin/coupons
   */
  async adminList(query: QueryCouponDto): Promise<PageResult<CouponVo>> {
    const where: FindOptionsWhere<Coupon> = { isDeleted: 0 }
    if (query.issuerType !== undefined) where.issuerType = query.issuerType
    if (query.issuerId) where.issuerId = query.issuerId
    if (query.status !== undefined) where.status = query.status
    if (query.couponType !== undefined) where.couponType = query.couponType
    if (query.scene !== undefined) where.scene = query.scene
    return this.queryWithName(where, query)
  }

  /**
   * 管理端：详情
   * 参数：couponId
   * 返回值：CouponVo
   * 用途：GET /admin/coupons/:id
   */
  async adminDetail(couponId: string): Promise<CouponVo> {
    const c = await this.findActiveById(couponId)
    return this.toVo(c)
  }

  /**
   * 管理端：编辑（同商户端规则；写 OperationLog）
   * 参数：couponId / opAdminId / dto
   * 返回值：CouponVo
   * 用途：PUT /admin/coupons/:id
   */
  async adminUpdate(couponId: string, opAdminId: string, dto: UpdateCouponDto): Promise<CouponVo> {
    const c = await this.findActiveById(couponId)
    const saved = await this.updateInternal(c, dto)
    await this.operationLogService.write({
      opAdminId,
      module: 'marketing',
      action: 'update',
      resourceType: 'coupon',
      resourceId: couponId,
      description: `编辑券「${c.name}」（${c.couponCode}）`
    })
    return saved
  }

  /**
   * 管理端：软删（同商户端规则；写 OperationLog）
   * 参数：couponId / opAdminId
   * 返回值：void
   * 用途：DELETE /admin/coupons/:id
   */
  async adminDelete(couponId: string, opAdminId: string): Promise<void> {
    const c = await this.findActiveById(couponId)
    if (c.receivedQty > 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '该券已被领取，请先下架（status=2）后再操作下架并停用'
      )
    }
    if (c.status !== 2) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        '请先下架（status=2）后再删除'
      )
    }
    await this.softDelete(c, `管理员 ${opAdminId}`)
    await this.operationLogService.write({
      opAdminId,
      module: 'marketing',
      action: 'delete',
      resourceType: 'coupon',
      resourceId: couponId,
      description: `软删除券「${c.name}」（${c.couponCode}）`
    })
  }

  /* ==========================================================================
   * 共用工具（暴露给 user-coupon.service 复用）
   * ========================================================================== */

  /**
   * 找一个未删除的券；不存在抛 BIZ_RESOURCE_NOT_FOUND
   * 参数：couponId
   * 返回值：Coupon entity
   */
  async findActiveById(couponId: string): Promise<Coupon> {
    const c = await this.couponRepo.findOne({ where: { id: couponId, isDeleted: 0 } })
    if (!c) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '优惠券不存在')
    }
    return c
  }

  /**
   * 命中模板缓存读取（缓存命中转换为 entity 形态）
   * 参数：couponId
   * 返回值：Coupon | null
   * 用途：高频热点券模板（如新人券）查询提速；user-coupon.service 内部可选用
   */
  async getTplFromCache(couponId: string): Promise<Coupon | null> {
    try {
      const raw = await this.redis.get(COUPON_TPL_KEY(couponId))
      if (!raw) return null
      const obj = JSON.parse(raw) as Coupon
      /* JSON 反序列化丢失 Date 类型，手工还原 */
      if (obj.validFrom) obj.validFrom = new Date(obj.validFrom)
      if (obj.validTo) obj.validTo = new Date(obj.validTo)
      if (obj.createdAt) obj.createdAt = new Date(obj.createdAt)
      if (obj.updatedAt) obj.updatedAt = new Date(obj.updatedAt)
      return obj
    } catch (err) {
      this.logger.warn(`Redis GET coupon tpl ${couponId} 失败：${(err as Error).message}`)
      return null
    }
  }

  /**
   * 写模板缓存
   * 参数：c Coupon entity
   * 返回值：void
   */
  async setTplCache(c: Coupon): Promise<void> {
    try {
      await this.redis.set(COUPON_TPL_KEY(c.id), JSON.stringify(c), 'EX', COUPON_TPL_TTL_SECONDS)
    } catch (err) {
      this.logger.warn(`Redis SET coupon tpl ${c.id} 失败：${(err as Error).message}`)
    }
  }

  /**
   * 失效模板缓存
   * 参数：couponId
   * 返回值：void
   * 用途：编辑 / 删除 / 上下架 / receivedQty 变更后调用
   */
  async invalidateTplCache(couponId: string): Promise<void> {
    try {
      await this.redis.del(COUPON_TPL_KEY(couponId))
    } catch (err) {
      this.logger.warn(`Redis DEL coupon tpl ${couponId} 失败：${(err as Error).message}`)
    }
  }

  /**
   * 校验券归属（issuerType=2 商户券 + issuerId 必须 === merchantId），不通过抛 20003
   * 参数：couponId / merchantId
   * 返回值：Coupon entity
   * 用途：商户端 :id 接口入口
   */
  async assertOwner(couponId: string, merchantId: string): Promise<Coupon> {
    const c = await this.findActiveById(couponId)
    if (c.issuerType !== 2 || c.issuerId !== merchantId) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本人发券，禁止操作',
        HttpStatus.FORBIDDEN
      )
    }
    return c
  }

  /**
   * Entity → VO（统一转换；已含金额字段 string 化、Date 透传）
   * 参数：c Coupon entity
   * 返回值：CouponVo
   */
  toVo(c: Coupon): CouponVo {
    return {
      id: c.id,
      couponCode: c.couponCode,
      name: c.name,
      issuerType: c.issuerType,
      issuerId: c.issuerId,
      couponType: c.couponType,
      discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount,
      maxDiscount: c.maxDiscount,
      scene: c.scene,
      applicableShops: c.applicableShops,
      applicableCategories: c.applicableCategories,
      totalQty: c.totalQty,
      receivedQty: c.receivedQty,
      usedQty: c.usedQty,
      perUserLimit: c.perUserLimit,
      validType: c.validType,
      validFrom: c.validFrom,
      validTo: c.validTo,
      validDays: c.validDays,
      imageUrl: c.imageUrl,
      description: c.description,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }
  }

  /* ==========================================================================
   * 私有实现
   * ========================================================================== */

  /**
   * 创建券模板核心逻辑（管理端 / 商户端共用；issuerType / issuerId 由 controller 注入）
   */
  private async createInternal(
    issuerType: number,
    issuerId: string | null,
    dto: CreateCouponDto
  ): Promise<CouponVo> {
    this.assertCreatePayloadConsistent(dto)

    const now = new Date()
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null
    const validTo = dto.validTo ? new Date(dto.validTo) : null
    if (validFrom && validTo && validFrom.getTime() >= validTo.getTime()) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'validFrom 必须早于 validTo')
    }

    const entity = this.couponRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      couponCode: this.genCouponCode(),
      name: dto.name,
      issuerType,
      issuerId,
      couponType: dto.couponType,
      discountValue: dto.discountValue,
      minOrderAmount: dto.minOrderAmount ?? '0.00',
      maxDiscount: dto.maxDiscount ?? null,
      scene: dto.scene,
      applicableShops: dto.applicableShops ?? null,
      applicableCategories: dto.applicableCategories ?? null,
      totalQty: dto.totalQty ?? 0,
      receivedQty: 0,
      usedQty: 0,
      perUserLimit: dto.perUserLimit ?? 1,
      validType: dto.validType,
      validFrom,
      validTo,
      validDays: dto.validDays ?? null,
      imageUrl: dto.imageUrl ?? null,
      description: dto.description ?? null,
      status: dto.status ?? 1,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })

    const saved = await this.couponRepo.save(entity)
    this.logger.log(
      `${issuerType === 1 ? '管理员' : `商户 ${issuerId ?? '?'}`} 新建券 ${saved.id}（${saved.name}/${saved.couponCode}）`
    )
    return this.toVo(saved)
  }

  /**
   * 更新券模板核心逻辑（管理端 / 商户端共用）
   *
   * receivedQty=0：允许全字段更新；
   * receivedQty>0：只允许 SAFE_UPDATE_FIELDS（name / description / imageUrl）+ status，
   *                其余字段命中即抛 BIZ_OPERATION_FORBIDDEN。
   */
  private async updateInternal(c: Coupon, dto: UpdateCouponDto): Promise<CouponVo> {
    const isLocked = c.receivedQty > 0
    const violations: string[] = []

    /* ==== 安全字段：任何状态都可改 ==== */
    if (dto.name !== undefined) c.name = dto.name
    if (dto.description !== undefined) c.description = dto.description
    if (dto.imageUrl !== undefined) c.imageUrl = dto.imageUrl

    /* ==== 核心字段：locked 时禁改 ==== */
    if (dto.couponType !== undefined && dto.couponType !== c.couponType) {
      if (isLocked) violations.push('couponType')
      else c.couponType = dto.couponType
    }
    if (dto.discountValue !== undefined && dto.discountValue !== c.discountValue) {
      if (isLocked) violations.push('discountValue')
      else c.discountValue = dto.discountValue
    }
    if (dto.minOrderAmount !== undefined && dto.minOrderAmount !== c.minOrderAmount) {
      if (isLocked) violations.push('minOrderAmount')
      else c.minOrderAmount = dto.minOrderAmount
    }
    if (dto.maxDiscount !== undefined && dto.maxDiscount !== c.maxDiscount) {
      if (isLocked) violations.push('maxDiscount')
      else c.maxDiscount = dto.maxDiscount
    }
    if (dto.scene !== undefined && dto.scene !== c.scene) {
      if (isLocked) violations.push('scene')
      else c.scene = dto.scene
    }
    if (dto.applicableShops !== undefined) {
      if (isLocked) violations.push('applicableShops')
      else c.applicableShops = dto.applicableShops
    }
    if (dto.applicableCategories !== undefined) {
      if (isLocked) violations.push('applicableCategories')
      else c.applicableCategories = dto.applicableCategories
    }
    if (dto.totalQty !== undefined && dto.totalQty !== c.totalQty) {
      /* 总量允许放大（不允许缩到 < receivedQty 之下，会击穿超发保护） */
      if (isLocked && dto.totalQty !== 0 && dto.totalQty < c.receivedQty) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `totalQty(${dto.totalQty}) 不能小于已领数量 ${c.receivedQty}`
        )
      }
      c.totalQty = dto.totalQty
    }
    if (dto.perUserLimit !== undefined && dto.perUserLimit !== c.perUserLimit) {
      if (isLocked) violations.push('perUserLimit')
      else c.perUserLimit = dto.perUserLimit
    }
    if (dto.validType !== undefined && dto.validType !== c.validType) {
      if (isLocked) violations.push('validType')
      else c.validType = dto.validType
    }
    if (dto.validFrom !== undefined) {
      if (isLocked) violations.push('validFrom')
      else c.validFrom = dto.validFrom ? new Date(dto.validFrom) : null
    }
    if (dto.validTo !== undefined) {
      if (isLocked) violations.push('validTo')
      else c.validTo = dto.validTo ? new Date(dto.validTo) : null
    }
    if (dto.validDays !== undefined && dto.validDays !== c.validDays) {
      if (isLocked) violations.push('validDays')
      else c.validDays = dto.validDays
    }

    if (violations.length > 0) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `已发出的券仅允许修改 ${SAFE_UPDATE_FIELDS.join('/')}（违规字段：${violations.join(',')}）`
      )
    }

    /* validFrom < validTo 校验（含同时改 / 单边改两种情况） */
    if (c.validType === 1 && c.validFrom && c.validTo) {
      if (c.validFrom.getTime() >= c.validTo.getTime()) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'validFrom 必须早于 validTo')
      }
    }

    const saved = await this.couponRepo.save(c)
    await this.invalidateTplCache(c.id)
    this.logger.log(`券 ${c.id}（${c.couponCode}）已更新`)
    return this.toVo(saved)
  }

  /**
   * 软删
   * 参数：c Coupon entity；actorDesc 操作者描述（用于日志）
   * 返回值：void
   */
  private async softDelete(c: Coupon, actorDesc: string): Promise<void> {
    const now = new Date()
    c.isDeleted = 1
    c.deletedAt = now
    c.updatedAt = now
    await this.couponRepo.save(c)
    await this.invalidateTplCache(c.id)
    this.logger.log(`${actorDesc} 软删除券 ${c.id}（${c.couponCode}）`)
  }

  /**
   * 列表查询通用方法（带 name 模糊匹配 + created_at DESC + 分页）
   */
  private async queryWithName(
    where: FindOptionsWhere<Coupon>,
    query: QueryCouponDto
  ): Promise<PageResult<CouponVo>> {
    const qb = this.couponRepo.createQueryBuilder('c').where(where)
    if (query.name) qb.andWhere('c.name LIKE :n', { n: `%${query.name}%` })
    qb.orderBy('c.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 入参一致性校验（couponType vs discountValue / validType vs valid_from~valid_days）
   */
  private assertCreatePayloadConsistent(dto: CreateCouponDto): void {
    /* 折扣券：discountValue 应在 (0, 1) 区间 */
    if (dto.couponType === 2) {
      const dv = parseFloat(dto.discountValue)
      if (!Number.isFinite(dv) || dv <= 0 || dv >= 1) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          '折扣券 discountValue 必须在 (0, 1) 之间，例如 0.85 表示 85 折'
        )
      }
    }
    /* 满减/立减：discountValue > 0 */
    if (dto.couponType === 1 || dto.couponType === 3) {
      const dv = parseFloat(dto.discountValue)
      if (!Number.isFinite(dv) || dv <= 0) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          '满减/立减券 discountValue 必须 > 0'
        )
      }
    }
    /* 满减券必须设置 minOrderAmount */
    if (dto.couponType === 1) {
      const moa = parseFloat(dto.minOrderAmount ?? '0')
      if (!Number.isFinite(moa) || moa <= 0) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, '满减券必须设置 minOrderAmount > 0')
      }
    }
    /* 有效期一致性 */
    if (dto.validType === 1) {
      if (!dto.validFrom || !dto.validTo) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          'validType=1 必须同时传入 validFrom 和 validTo'
        )
      }
    } else if (dto.validType === 2) {
      if (!dto.validDays || dto.validDays <= 0) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          'validType=2 必须传入 validDays > 0'
        )
      }
    }
  }

  /**
   * 生成券模板编码
   * 格式：C + yyyyMMdd + 6 位日内序列；与 generateBizNo 一致风格
   * 返回值：string（15 位）
   */
  private genCouponCode(): string {
    return generateBizNo('C')
  }
}
