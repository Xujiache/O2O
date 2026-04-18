/**
 * @file rider.service.ts
 * @stage P3 / T3.11
 * @desc 骑手 CRUD + 资质审核 + 保证金管理
 * @author 员工 B
 *
 * 数据来源：MySQL `rider` / `rider_deposit`
 * 缓存：K08 `rider:info:{riderId}` Hash TTL 30min
 *
 * 保证金一致性：
 *   - 缴纳/补缴：amount 累加；balance_after = 旧 + amount
 *   - 扣除：balance_after = 旧 - amount（允许负余额，运营兜底）
 *   - 退还：balance_after = 旧 - amount
 *   - 必须在事务内执行：先扣 / 加余额，再写明细
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '../../../common'
import { Rider, RiderDeposit } from '../../../entities'
import { REDIS_CLIENT } from '../../../health/redis.provider'
import { CryptoUtil, SnowflakeId, generateBizNo } from '../../../utils'
import {
  AdminListRiderQueryDto,
  AuditRiderDto,
  CreateRiderDto,
  RiderDepositOpDto,
  RiderDepositVo,
  RiderDetailVo,
  UpdateRiderDto
} from '../dto/rider.dto'

const RIDER_INFO_KEY = (id: string): string => `rider:info:${id}`
const RIDER_INFO_TTL_SECONDS = 1800

@Injectable()
export class RiderService {
  private readonly logger = new Logger(RiderService.name)

  constructor(
    @InjectRepository(Rider) private readonly riderRepo: Repository<Rider>,
    @InjectRepository(RiderDeposit) private readonly depositRepo: Repository<RiderDeposit>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource
  ) {}

  /**
   * 骑手注册申请
   * 参数：dto
   * 返回值：RiderDetailVo（audit_status=0）
   * 用途：POST /api/v1/riders（公开）
   */
  async create(dto: CreateRiderDto): Promise<RiderDetailVo> {
    const mobileHash = CryptoUtil.hmac(dto.mobile)
    const idCardHash = CryptoUtil.hmac(dto.idCard)
    const dupMobile = await this.riderRepo.findOne({ where: { mobileHash, isDeleted: 0 } })
    if (dupMobile) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '该手机号已注册骑手')
    }
    const dupIdCard = await this.riderRepo.findOne({ where: { idCardHash, isDeleted: 0 } })
    if (dupIdCard) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '该身份证号已注册骑手')
    }
    const e = this.riderRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      riderNo: generateBizNo('R'),
      nameEnc: CryptoUtil.encrypt(dto.realName),
      nameTail: dto.realName.charAt(0) + '*',
      mobileEnc: CryptoUtil.encrypt(dto.mobile),
      mobileHash,
      mobileTail4: CryptoUtil.tail4(dto.mobile),
      idCardEnc: CryptoUtil.encrypt(dto.idCard),
      idCardHash,
      gender: dto.gender ?? 0,
      birthday: dto.birthday ? new Date(dto.birthday) : null,
      bankCardEnc: null,
      bankCardTail4: null,
      bankName: null,
      avatarUrl: null,
      vehicleType: dto.vehicleType ?? null,
      vehicleNo: dto.vehicleNo ?? null,
      serviceCity: dto.serviceCity,
      level: 1,
      score: '5.00',
      auditStatus: 0,
      auditRemark: null,
      auditAt: null,
      auditAdminId: null,
      status: 1,
      onlineStatus: 0,
      encKeyVer: 1,
      lastOnlineAt: null,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.riderRepo.save(e)
    this.logger.log(`骑手注册申请：${e.riderNo}`)
    return this.toVo(e)
  }

  /**
   * 取骑手详情（脱敏）
   */
  async detail(riderId: string): Promise<RiderDetailVo> {
    const r = await this.findActiveById(riderId)
    return this.toVo(r)
  }

  /**
   * 骑手更新资料
   */
  async update(riderId: string, dto: UpdateRiderDto): Promise<RiderDetailVo> {
    const r = await this.findActiveById(riderId)
    if (dto.avatarUrl !== undefined) r.avatarUrl = dto.avatarUrl
    if (dto.gender !== undefined) r.gender = dto.gender
    if (dto.birthday !== undefined) r.birthday = new Date(dto.birthday)
    if (dto.vehicleType !== undefined) r.vehicleType = dto.vehicleType
    if (dto.vehicleNo !== undefined) r.vehicleNo = dto.vehicleNo
    if (dto.serviceCity !== undefined) r.serviceCity = dto.serviceCity
    if (dto.bankCard !== undefined) {
      r.bankCardEnc = CryptoUtil.encrypt(dto.bankCard)
      r.bankCardTail4 = CryptoUtil.tail4(dto.bankCard)
    }
    if (dto.bankName !== undefined) r.bankName = dto.bankName
    await this.riderRepo.save(r)
    await this.invalidateCache(riderId)
    return this.toVo(r)
  }

  /**
   * 管理后台审核骑手
   */
  async audit(riderId: string, dto: AuditRiderDto, opAdminId: string): Promise<RiderDetailVo> {
    const r = await this.findActiveById(riderId)
    if (dto.action === 2 && (!dto.remark || dto.remark.trim() === '')) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '驳回必须填写备注')
    }
    r.auditStatus = dto.action
    r.auditRemark = dto.remark ?? null
    r.auditAt = new Date()
    r.auditAdminId = opAdminId
    await this.riderRepo.save(r)
    await this.invalidateCache(riderId)
    this.logger.log(`管理员 ${opAdminId} 审核骑手 ${r.riderNo} → ${dto.action}`)
    return this.toVo(r)
  }

  /**
   * 管理后台更新骑手账号状态
   */
  async adminUpdateStatus(
    riderId: string,
    status: number,
    opAdminId: string
  ): Promise<RiderDetailVo> {
    if (![0, 1, 2].includes(status)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '非法 status')
    }
    const r = await this.findActiveById(riderId)
    r.status = status
    await this.riderRepo.save(r)
    await this.invalidateCache(riderId)
    this.logger.log(`管理员 ${opAdminId} 修改骑手 ${r.riderNo} 状态 → ${status}`)
    return this.toVo(r)
  }

  /**
   * 骑手列表
   */
  async adminList(query: AdminListRiderQueryDto): Promise<PageResult<RiderDetailVo>> {
    const qb = this.riderRepo.createQueryBuilder('r').where('r.is_deleted = 0')
    if (query.mobile) qb.andWhere('r.mobile_hash = :h', { h: CryptoUtil.hmac(query.mobile) })
    if (query.serviceCity) qb.andWhere('r.service_city = :sc', { sc: query.serviceCity })
    if (query.auditStatus !== undefined)
      qb.andWhere('r.audit_status = :a', { a: query.auditStatus })
    if (query.status !== undefined) qb.andWhere('r.status = :s', { s: query.status })
    if (query.onlineStatus !== undefined)
      qb.andWhere('r.online_status = :os', { os: query.onlineStatus })
    if (query.level !== undefined) qb.andWhere('r.level = :lv', { lv: query.level })
    qb.orderBy('r.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((row) => this.toVo(row)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /* ========== 保证金 ========== */

  /**
   * 保证金操作（缴纳/补缴/扣除/退还）
   * 参数：riderId / dto / opAdminId（缴纳由骑手触发可传 null；管理后台必传 adminId）
   * 返回值：RiderDepositVo（最新一笔）
   * 用途：POST /api/v1/riders/:id/deposit
   *
   * 实现：
   *   事务：① 算最新余额 ② 写 rider_deposit 明细
   *   余额 = 同 riderId 历史明细按 op_type 求和后的最新值
   */
  async depositOperate(
    riderId: string,
    dto: RiderDepositOpDto,
    opAdminId: string | null
  ): Promise<RiderDepositVo> {
    const r = await this.findActiveById(riderId)
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RiderDeposit)
      const lastBalance = await this.computeBalance(repo, r.id)
      let newBalance = lastBalance
      switch (dto.opType) {
        case 1:
        case 2:
          newBalance = lastBalance + dto.amount
          break
        case 3:
        case 4:
          newBalance = lastBalance - dto.amount
          break
      }
      const e = repo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        riderId: r.id,
        opType: dto.opType,
        amount: dto.amount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        payNo: dto.payNo ?? null,
        reason: dto.reason ?? null,
        opAdminId,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      await repo.save(e)
      this.logger.log(
        `骑手 ${r.riderNo} 保证金 ${this.opTypeLabel(dto.opType)} ${dto.amount}，余额 ${newBalance.toFixed(2)}`
      )
      return this.toDepositVo(e)
    })
  }

  /**
   * 列出骑手保证金明细
   */
  async depositList(
    riderId: string,
    page: number,
    pageSize: number
  ): Promise<PageResult<RiderDepositVo>> {
    const [rows, total] = await this.depositRepo.findAndCount({
      where: { riderId, isDeleted: 0 },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    return makePageResult(
      rows.map((r) => this.toDepositVo(r)),
      total,
      page,
      pageSize
    )
  }

  /**
   * 取当前保证金余额
   */
  async getBalance(riderId: string): Promise<{ balance: string }> {
    const balance = await this.computeBalance(this.depositRepo, riderId)
    return { balance: balance.toFixed(2) }
  }

  /**
   * 计算最新余额（按 op_type 累加：1/2 加，3/4 减）
   */
  private async computeBalance(repo: Repository<RiderDeposit>, riderId: string): Promise<number> {
    const last = await repo
      .createQueryBuilder('d')
      .where('d.rider_id = :rid AND d.is_deleted = 0', { rid: riderId })
      .orderBy('d.created_at', 'DESC')
      .getOne()
    return last ? Number(last.balanceAfter) : 0
  }

  /* ========== 内部辅助 ========== */

  async findActiveById(riderId: string): Promise<Rider> {
    const r = await this.riderRepo.findOne({ where: { id: riderId, isDeleted: 0 } })
    if (!r) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '骑手不存在')
    return r
  }

  private async invalidateCache(riderId: string): Promise<void> {
    try {
      await this.redis.del(RIDER_INFO_KEY(riderId))
    } catch (err) {
      this.logger.warn(`Redis DEL ${RIDER_INFO_KEY(riderId)} 失败：${(err as Error).message}`)
    }
  }

  private toVo(r: Rider): RiderDetailVo {
    return {
      id: r.id,
      riderNo: r.riderNo,
      nameTail: r.nameTail,
      mobileTail4: r.mobileTail4,
      gender: r.gender,
      birthday: r.birthday,
      bankCardTail4: r.bankCardTail4,
      bankName: r.bankName,
      avatarUrl: r.avatarUrl,
      vehicleType: r.vehicleType,
      vehicleNo: r.vehicleNo,
      serviceCity: r.serviceCity,
      level: r.level,
      score: r.score,
      auditStatus: r.auditStatus,
      auditRemark: r.auditRemark,
      status: r.status,
      onlineStatus: r.onlineStatus,
      lastOnlineAt: r.lastOnlineAt,
      createdAt: r.createdAt
    }
  }

  private toDepositVo(d: RiderDeposit): RiderDepositVo {
    return {
      id: d.id,
      riderId: d.riderId,
      opType: d.opType,
      amount: d.amount,
      balanceAfter: d.balanceAfter,
      payNo: d.payNo,
      reason: d.reason,
      opAdminId: d.opAdminId,
      createdAt: d.createdAt
    }
  }

  private opTypeLabel(op: number): string {
    return ['?', '缴纳', '补缴', '扣除', '退还'][op] ?? '?'
  }

  static cacheKeyOf(id: string): string {
    return RIDER_INFO_KEY(id)
  }
  static get CACHE_TTL_SECONDS(): number {
    return RIDER_INFO_TTL_SECONDS
  }
}
