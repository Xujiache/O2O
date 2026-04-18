/**
 * @file merchant.service.ts
 * @stage P3 / T3.10
 * @desc 商户 CRUD + 入驻审核流转
 * @author 员工 B
 *
 * 数据来源：MySQL `merchant`
 * 审核流：audit_status=0 待审 → 1 通过 / 2 驳回 / 3 待补件（运营按钮）
 * 缓存：K07 `merchant:info:{merchantId}` Hash TTL 30min（更新时 DEL）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '../../../common'
import { Merchant } from '../../../entities'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import { CryptoUtil, SnowflakeId, generateBizNo } from '../../../utils'
import {
  AdminListMerchantQueryDto,
  AuditMerchantDto,
  CreateMerchantDto,
  MerchantDetailVo,
  UpdateMerchantDto
} from '../dto/merchant.dto'

const MERCHANT_INFO_KEY = (id: string): string => `merchant:info:${id}`
const MERCHANT_INFO_TTL_SECONDS = 1800

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name)

  constructor(
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * 商户入驻申请（初次提交）
   * 参数：dto 商户基础信息
   * 返回值：MerchantDetailVo（audit_status=0）
   * 用途：POST /api/v1/merchants（公开接口，注册即可入驻；不在 P3 内做账号自动创建，由 A 的 Auth 模块完成）
   */
  async create(dto: CreateMerchantDto): Promise<MerchantDetailVo> {
    const mobileHash = CryptoUtil.hmac(dto.mobile)
    const dup = await this.merchantRepo.findOne({
      where: { mobileHash, isDeleted: 0 }
    })
    if (dup) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '该手机号已入驻商户')
    }
    const e = this.merchantRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      merchantNo: generateBizNo('M'),
      name: dto.name,
      shortName: dto.shortName ?? null,
      logoUrl: dto.logoUrl ?? null,
      industryCode: dto.industryCode,
      legalPerson: dto.legalPerson ?? null,
      legalIdCardEnc: dto.legalIdCard ? CryptoUtil.encrypt(dto.legalIdCard) : null,
      legalIdCardHash: dto.legalIdCard ? CryptoUtil.hmac(dto.legalIdCard) : null,
      mobileEnc: CryptoUtil.encrypt(dto.mobile),
      mobileHash,
      mobileTail4: CryptoUtil.tail4(dto.mobile),
      email: dto.email ?? null,
      provinceCode: dto.provinceCode,
      cityCode: dto.cityCode,
      districtCode: dto.districtCode,
      auditStatus: 0,
      auditRemark: null,
      auditAt: null,
      auditAdminId: null,
      status: 1,
      encKeyVer: 1,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.merchantRepo.save(e)
    this.logger.log(`商户入驻申请：${e.merchantNo}（${e.name}）`)
    return this.toVo(e)
  }

  /**
   * 取商户详情（脱敏）
   * 参数：merchantId
   * 返回值：MerchantDetailVo
   * 用途：商户端 GET /api/v1/merchants/:id；管理后台 GET /api/v1/admin/merchants/:id
   */
  async detail(merchantId: string): Promise<MerchantDetailVo> {
    const m = await this.findActiveById(merchantId)
    return this.toVo(m)
  }

  /**
   * 更新商户信息
   * 参数：merchantId / dto
   * 返回值：MerchantDetailVo
   * 用途：商户端 PUT /api/v1/merchants/:id；如审核已通过，部分字段需重新审核（本期简化：不卡口）
   */
  async update(merchantId: string, dto: UpdateMerchantDto): Promise<MerchantDetailVo> {
    const m = await this.findActiveById(merchantId)
    if (dto.name !== undefined) m.name = dto.name
    if (dto.shortName !== undefined) m.shortName = dto.shortName
    if (dto.logoUrl !== undefined) m.logoUrl = dto.logoUrl
    if (dto.industryCode !== undefined) m.industryCode = dto.industryCode
    if (dto.legalPerson !== undefined) m.legalPerson = dto.legalPerson
    if (dto.email !== undefined) m.email = dto.email
    if (dto.provinceCode !== undefined) m.provinceCode = dto.provinceCode
    if (dto.cityCode !== undefined) m.cityCode = dto.cityCode
    if (dto.districtCode !== undefined) m.districtCode = dto.districtCode
    await this.merchantRepo.save(m)
    await this.invalidateCache(merchantId)
    return this.toVo(m)
  }

  /**
   * 管理后台审核商户
   * 参数：merchantId / dto / opAdminId 审核管理员
   * 返回值：MerchantDetailVo
   * 用途：POST /api/v1/admin/merchants/:id/audit
   */
  async audit(
    merchantId: string,
    dto: AuditMerchantDto,
    opAdminId: string
  ): Promise<MerchantDetailVo> {
    const m = await this.findActiveById(merchantId)
    if (m.auditStatus === 1 && dto.action === 1) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '商户已通过审核')
    }
    if (dto.action === 2 && (!dto.remark || dto.remark.trim() === '')) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '驳回必须填写备注')
    }
    m.auditStatus = dto.action
    m.auditRemark = dto.remark ?? null
    m.auditAt = new Date()
    m.auditAdminId = opAdminId
    await this.merchantRepo.save(m)
    await this.invalidateCache(merchantId)
    this.logger.log(
      `管理员 ${opAdminId} 审核商户 ${m.merchantNo} → ${this.actionLabel(dto.action)}`
    )
    return this.toVo(m)
  }

  /**
   * 管理后台更新商户账号状态（封禁/解封）
   * 参数：merchantId / status / opAdminId
   * 返回值：MerchantDetailVo
   */
  async adminUpdateStatus(
    merchantId: string,
    status: number,
    opAdminId: string
  ): Promise<MerchantDetailVo> {
    if (![0, 1, 2].includes(status)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '非法 status')
    }
    const m = await this.findActiveById(merchantId)
    m.status = status
    await this.merchantRepo.save(m)
    await this.invalidateCache(merchantId)
    this.logger.log(`管理员 ${opAdminId} 修改商户 ${m.merchantNo} 状态 → ${status}`)
    return this.toVo(m)
  }

  /**
   * 管理后台商户列表
   * 参数：query
   * 返回值：PageResult<MerchantDetailVo>
   * 用途：GET /api/v1/admin/merchants
   */
  async adminList(query: AdminListMerchantQueryDto): Promise<PageResult<MerchantDetailVo>> {
    const qb = this.merchantRepo.createQueryBuilder('m').where('m.is_deleted = 0')
    if (query.name) qb.andWhere('m.name LIKE :n', { n: `%${query.name}%` })
    if (query.mobile) {
      qb.andWhere('m.mobile_hash = :h', { h: CryptoUtil.hmac(query.mobile) })
    }
    if (query.industryCode) qb.andWhere('m.industry_code = :ic', { ic: query.industryCode })
    if (query.cityCode) qb.andWhere('m.city_code = :c', { c: query.cityCode })
    if (query.auditStatus !== undefined) {
      qb.andWhere('m.audit_status = :a', { a: query.auditStatus })
    }
    if (query.status !== undefined) qb.andWhere('m.status = :s', { s: query.status })
    qb.orderBy('m.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 通过 ID 查活跃商户
   * 参数：merchantId
   * 返回值：Merchant entity
   */
  async findActiveById(merchantId: string): Promise<Merchant> {
    const m = await this.merchantRepo.findOne({ where: { id: merchantId, isDeleted: 0 } })
    if (!m) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '商户不存在')
    return m
  }

  /**
   * 失效商户画像缓存（K07）
   */
  private async invalidateCache(merchantId: string): Promise<void> {
    try {
      await this.redis.del(MERCHANT_INFO_KEY(merchantId))
    } catch (err) {
      this.logger.warn(`Redis DEL ${MERCHANT_INFO_KEY(merchantId)} 失败：${(err as Error).message}`)
    }
  }

  /**
   * Entity → 详情视图
   */
  private toVo(m: Merchant): MerchantDetailVo {
    return {
      id: m.id,
      merchantNo: m.merchantNo,
      name: m.name,
      shortName: m.shortName,
      logoUrl: m.logoUrl,
      industryCode: m.industryCode,
      legalPerson: m.legalPerson,
      // 法人身份证号脱敏：仅在 legal_id_card_enc 存在时返回 tail4，本期不解密 enc 字段
      // tail4 信息可由审核时三方核身回传冗余存储；占位时仅通过 legal_id_card_hash 是否非空标识
      legalIdCardTail4: m.legalIdCardHash ? '****' : null,
      mobileTail4: m.mobileTail4,
      email: m.email,
      provinceCode: m.provinceCode,
      cityCode: m.cityCode,
      districtCode: m.districtCode,
      auditStatus: m.auditStatus,
      auditRemark: m.auditRemark,
      auditAt: m.auditAt,
      status: m.status,
      createdAt: m.createdAt
    }
  }

  /**
   * 动作枚举 → 中文（仅日志使用）
   */
  private actionLabel(action: number): string {
    return action === 1 ? '通过' : action === 2 ? '驳回' : '待补件'
  }

  static cacheKeyOf(id: string): string {
    return MERCHANT_INFO_KEY(id)
  }
  static get CACHE_TTL_SECONDS(): number {
    return MERCHANT_INFO_TTL_SECONDS
  }
}
