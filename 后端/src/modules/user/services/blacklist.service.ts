/**
 * @file blacklist.service.ts
 * @stage P3 / T3.12
 * @desc 全局黑名单封禁/解封；联动 user/merchant/rider.status=0
 * @author 员工 B
 *
 * 数据来源：MySQL `blacklist` + 联动 `user/merchant/rider`
 * 写操作必写 operation_log
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '../../../common'
import { Blacklist, Merchant, Rider, User } from '../../../entities'
import { SnowflakeId } from '../../../utils'
import { AddBlacklistDto, BlacklistVo, ListBlacklistQueryDto } from '../dto/blacklist.dto'
import { OperationLogService } from './operation-log.service'

@Injectable()
export class BlacklistService {
  private readonly logger = new Logger(BlacklistService.name)

  constructor(
    @InjectRepository(Blacklist) private readonly blRepo: Repository<Blacklist>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Rider) private readonly riderRepo: Repository<Rider>,
    private readonly operationLogService: OperationLogService
  ) {}

  /**
   * 加入黑名单（封禁）
   * 参数：dto / opAdminId
   * 返回值：BlacklistVo
   * 用途：POST /api/v1/admin/blacklist
   *
   * 联动：targetType ∈ {1 用户/2 商户/3 骑手} 时自动 status=0
   */
  async add(dto: AddBlacklistDto, opAdminId: string): Promise<BlacklistVo> {
    if ([1, 2, 3].includes(dto.targetType) && !dto.targetId) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'target_id 必填')
    }
    if ([4, 5].includes(dto.targetType) && !dto.targetValue) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'target_value 必填')
    }
    const e = this.blRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      targetType: dto.targetType,
      targetId: dto.targetId ?? null,
      targetValue: dto.targetValue ?? null,
      reason: dto.reason,
      evidenceUrl: dto.evidenceUrl ?? null,
      level: dto.level ?? 1,
      expireAt: dto.expireAt ? new Date(dto.expireAt) : null,
      opAdminId,
      status: 1,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.blRepo.save(e)

    // 联动：封禁主账号
    if (dto.targetId) {
      await this.cascadeStatus(dto.targetType, dto.targetId, 0)
    }
    await this.operationLogService.write({
      opAdminId,
      module: 'blacklist',
      action: 'create',
      resourceType: this.targetTypeLabel(dto.targetType),
      resourceId: dto.targetId ?? dto.targetValue ?? null,
      description: `加入黑名单：${dto.reason}`
    })
    this.logger.log(
      `管理员 ${opAdminId} 加入黑名单 type=${dto.targetType} id=${dto.targetId ?? dto.targetValue}`
    )
    return this.toVo(e)
  }

  /**
   * 解除黑名单
   * 参数：blacklistId / opAdminId
   * 返回值：BlacklistVo
   * 用途：DELETE /api/v1/admin/blacklist/:id
   */
  async remove(blacklistId: string, opAdminId: string): Promise<BlacklistVo> {
    const b = await this.blRepo.findOne({ where: { id: blacklistId, isDeleted: 0 } })
    if (!b) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '黑名单记录不存在')
    if (b.status === 0) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '已解除')
    }
    b.status = 0
    await this.blRepo.save(b)
    // 联动：恢复主账号 status=1（仅当该主体当前还有其他生效黑名单则不恢复）
    if (b.targetId) {
      const remain = await this.blRepo.count({
        where: {
          targetType: b.targetType,
          targetId: b.targetId,
          status: 1,
          isDeleted: 0
        }
      })
      if (remain === 0) {
        await this.cascadeStatus(b.targetType, b.targetId, 1)
      }
    }
    await this.operationLogService.write({
      opAdminId,
      module: 'blacklist',
      action: 'delete',
      resourceType: this.targetTypeLabel(b.targetType),
      resourceId: b.targetId ?? b.targetValue ?? null,
      description: `解除黑名单：${b.reason}`
    })
    return this.toVo(b)
  }

  /**
   * 黑名单列表
   */
  async list(query: ListBlacklistQueryDto): Promise<PageResult<BlacklistVo>> {
    const qb = this.blRepo.createQueryBuilder('b').where('b.is_deleted = 0')
    if (query.targetType !== undefined) qb.andWhere('b.target_type = :t', { t: query.targetType })
    if (query.status !== undefined) qb.andWhere('b.status = :s', { s: query.status })
    qb.orderBy('b.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 检查指定主体是否在黑名单
   * 参数：targetType / targetId
   * 返回值：true=被封；false=正常
   * 用途：A 的 AuthService.login 内可调用本方法快速判断
   */
  async isBlacklisted(targetType: number, targetId: string): Promise<boolean> {
    const now = new Date()
    const cnt = await this.blRepo
      .createQueryBuilder('b')
      .where('b.target_type = :t AND b.target_id = :id AND b.status = 1 AND b.is_deleted = 0', {
        t: targetType,
        id: targetId
      })
      .andWhere('(b.expire_at IS NULL OR b.expire_at > :now)', { now })
      .getCount()
    return cnt > 0
  }

  /* ========== 内部辅助 ========== */

  /**
   * 联动主账号状态变更
   * 参数：targetType 1/2/3；targetId 主账号 ID；status 目标状态
   */
  private async cascadeStatus(targetType: number, targetId: string, status: number): Promise<void> {
    try {
      if (targetType === 1) {
        await this.userRepo.update({ id: targetId, isDeleted: 0 }, { status })
      } else if (targetType === 2) {
        await this.merchantRepo.update({ id: targetId, isDeleted: 0 }, { status })
      } else if (targetType === 3) {
        await this.riderRepo.update({ id: targetId, isDeleted: 0 }, { status })
      }
    } catch (err) {
      this.logger.warn(
        `黑名单联动 ${targetType}:${targetId} → status=${status} 失败：${(err as Error).message}`
      )
    }
  }

  private targetTypeLabel(t: number): string {
    return ['?', 'user', 'merchant', 'rider', 'device', 'ip'][t] ?? '?'
  }

  private toVo(b: Blacklist): BlacklistVo {
    return {
      id: b.id,
      targetType: b.targetType,
      targetId: b.targetId,
      targetValue: b.targetValue,
      reason: b.reason,
      evidenceUrl: b.evidenceUrl,
      level: b.level,
      expireAt: b.expireAt,
      opAdminId: b.opAdminId,
      status: b.status,
      createdAt: b.createdAt
    }
  }
}
