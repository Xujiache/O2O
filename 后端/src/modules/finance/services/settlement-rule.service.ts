/**
 * @file settlement-rule.service.ts
 * @stage P4/T4.31（Sprint 5）
 * @desc 分账规则服务：CRUD + matchRule（按 priority DESC 找首条匹配）
 * @author 单 Agent V2.0
 *
 * 关键设计（DESIGN_P4 §七）：
 *   - 一条订单 → 三角色（merchant/rider/platform）各自找一条规则
 *   - 匹配优先级：priority 大 → 优先；同 priority 比较 createdAt DESC（新规则覆盖）
 *   - scope_type=1 全局 → 命中所有
 *   - scope_type=2 城市 → scope_value 必须 == 订单 shop.cityCode
 *   - scope_type=3 单店 → scope_value 必须 == 订单 shopId
 *   - 仅查 status=1 启用 + valid 时段内的规则
 *
 * 规则缓存：本期不缓存（CRUD 不频繁；分账 cron 一日一次；列表查询单点 ≤ 100ms）
 *           Sprint 8 可加 Redis 5 分钟 hot cache
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { Brackets, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { SettlementRule } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId } from '@/utils'
import {
  type CreateSettlementRuleDto,
  type QuerySettlementRuleDto,
  type SettlementRuleVo,
  type UpdateSettlementRuleDto
} from '../dto/settlement.dto'
import {
  type SettlementRuleScene,
  SettlementScopeTypeEnum,
  type SettlementScopeType,
  type SettlementTargetType
} from '../types/finance.types'

/**
 * matchRule 入参上下文
 *
 * 字段：
 *   - scene       订单场景：1 外卖 / 2 跑腿（与 OrderType 同源）
 *   - targetType  分账对象：1 商户 / 2 骑手 / 3 平台
 *   - cityCode    订单所属城市编码（外卖取 shop.cityCode；跑腿取下单地址 cityCode）
 *   - shopId      店铺 ID（外卖订单必填；跑腿无）
 *
 * 返回：匹配到的规则 SettlementRule，或 null（未找到任何匹配）
 */
export interface MatchRuleInput {
  scene: SettlementRuleScene
  targetType: SettlementTargetType
  cityCode?: string | null
  shopId?: string | null
}

@Injectable()
export class SettlementRuleService {
  private readonly logger = new Logger(SettlementRuleService.name)

  constructor(
    @InjectRepository(SettlementRule)
    private readonly ruleRepo: Repository<SettlementRule>,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ==========================================================================
   * 一、CRUD（管理端）
   * ========================================================================== */

  /**
   * 新建分账规则
   * 参数：dto 入参；opAdminId 管理员 ID（写 OperationLog）
   * 返回值：SettlementRuleVo
   * 错误：ruleCode 冲突 → BIZ_DATA_CONFLICT；scopeValue 与 scopeType 不一致 → PARAM_INVALID
   */
  async create(dto: CreateSettlementRuleDto, opAdminId: string): Promise<SettlementRuleVo> {
    this.assertScopeConsistency(dto.scopeType, dto.scopeValue)
    this.assertRateRange(dto.rate)

    const dup = await this.ruleRepo.findOne({
      where: { ruleCode: dto.ruleCode, isDeleted: 0 }
    })
    if (dup) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '规则编码已存在')
    }

    const now = new Date()
    const entity = this.ruleRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      ruleCode: dto.ruleCode,
      ruleName: dto.ruleName,
      scene: dto.scene,
      targetType: dto.targetType,
      scopeType: dto.scopeType,
      scopeValue: dto.scopeValue ?? null,
      rate: this.normalizeRate(dto.rate),
      fixedFee: this.normalizeFee(dto.fixedFee ?? '0.00'),
      minFee: dto.minFee ? this.normalizeFee(dto.minFee) : null,
      maxFee: dto.maxFee ? this.normalizeFee(dto.maxFee) : null,
      priority: dto.priority ?? 0,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      status: dto.status ?? 1,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.ruleRepo.save(entity)

    await this.operationLogService.write({
      opAdminId,
      module: 'finance',
      action: 'create',
      resourceType: 'settlement_rule',
      resourceId: saved.id,
      description: `新建分账规则「${saved.ruleName}」（${saved.ruleCode}）`,
      extra: { scene: saved.scene, targetType: saved.targetType, rate: saved.rate }
    })

    return this.toVo(saved)
  }

  /**
   * 编辑规则（部分字段；不允许改 ruleCode / scene / targetType / scopeType）
   * 参数：id；dto；opAdminId
   * 返回值：SettlementRuleVo
   */
  async update(
    id: string,
    dto: UpdateSettlementRuleDto,
    opAdminId: string
  ): Promise<SettlementRuleVo> {
    const rule = await this.findActiveById(id)
    if (dto.rate !== undefined) {
      this.assertRateRange(dto.rate)
      rule.rate = this.normalizeRate(dto.rate)
    }
    if (dto.fixedFee !== undefined) rule.fixedFee = this.normalizeFee(dto.fixedFee)
    if (dto.minFee !== undefined) rule.minFee = this.normalizeFee(dto.minFee)
    if (dto.maxFee !== undefined) rule.maxFee = this.normalizeFee(dto.maxFee)
    if (dto.ruleName !== undefined) rule.ruleName = dto.ruleName
    if (dto.priority !== undefined) rule.priority = dto.priority
    if (dto.validFrom !== undefined) rule.validFrom = new Date(dto.validFrom)
    if (dto.validTo !== undefined) rule.validTo = new Date(dto.validTo)
    if (dto.status !== undefined) rule.status = dto.status
    if (dto.scopeValue !== undefined) {
      this.assertScopeConsistency(rule.scopeType, dto.scopeValue)
      rule.scopeValue = dto.scopeValue
    }
    rule.updatedAt = new Date()
    const saved = await this.ruleRepo.save(rule)

    await this.operationLogService.write({
      opAdminId,
      module: 'finance',
      action: 'update',
      resourceType: 'settlement_rule',
      resourceId: id,
      description: `编辑分账规则「${saved.ruleName}」（${saved.ruleCode}）`,
      extra: { changes: dto }
    })
    return this.toVo(saved)
  }

  /**
   * 软删规则（is_deleted=1；分账 cron 自动跳过）
   */
  async remove(id: string, opAdminId: string): Promise<void> {
    const rule = await this.findActiveById(id)
    rule.isDeleted = 1
    rule.deletedAt = new Date()
    rule.updatedAt = new Date()
    await this.ruleRepo.save(rule)

    await this.operationLogService.write({
      opAdminId,
      module: 'finance',
      action: 'delete',
      resourceType: 'settlement_rule',
      resourceId: id,
      description: `删除分账规则「${rule.ruleName}」（${rule.ruleCode}）`
    })
  }

  /**
   * 单条详情
   */
  async detail(id: string): Promise<SettlementRuleVo> {
    const rule = await this.findActiveById(id)
    return this.toVo(rule)
  }

  /**
   * 列表分页（管理端工作台）
   */
  async list(query: QuerySettlementRuleDto): Promise<PageResult<SettlementRuleVo>> {
    const qb = this.ruleRepo.createQueryBuilder('r').where('r.is_deleted = 0')
    if (query.scene !== undefined) qb.andWhere('r.scene = :sc', { sc: query.scene })
    if (query.targetType !== undefined) qb.andWhere('r.target_type = :tt', { tt: query.targetType })
    if (query.scopeType !== undefined) qb.andWhere('r.scope_type = :st', { st: query.scopeType })
    if (query.status !== undefined) qb.andWhere('r.status = :s', { s: query.status })
    if (query.ruleCode) {
      qb.andWhere('r.rule_code LIKE :code', { code: `%${query.ruleCode}%` })
    }
    qb.orderBy('r.priority', 'DESC')
      .addOrderBy('r.created_at', 'DESC')
      .skip(query.skip())
      .take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /* ==========================================================================
   * 二、matchRule —— 分账核心匹配（settlement.service 调用）
   * ========================================================================== */

  /**
   * 匹配单条规则（按 scene + targetType + scope 优先级）
   *
   * 算法：
   *   1. 取所有 status=1 + scene + targetType + valid 时段内的规则
   *   2. 内存过滤：scope 范围匹配
   *      - scope_type=3 单店：scope_value === shopId 命中
   *      - scope_type=2 城市：scope_value === cityCode 命中
   *      - scope_type=1 全局：永远命中
   *   3. 按 priority DESC、createdAt DESC 取第一条
   *
   * 注：scope_type=3 优先级隐性高于 2 高于 1（业务约定通过 priority 字段配合体现，
   *     建议：店铺规则 priority=200、城市规则=100、全局=0）
   *
   * 参数：input MatchRuleInput
   * 返回值：SettlementRule 或 null
   */
  async matchRule(input: MatchRuleInput): Promise<SettlementRule | null> {
    const now = new Date()
    const candidates = await this.ruleRepo
      .createQueryBuilder('r')
      .where('r.is_deleted = 0')
      .andWhere('r.status = 1')
      .andWhere('r.scene = :sc', { sc: input.scene })
      .andWhere('r.target_type = :tt', { tt: input.targetType })
      .andWhere(
        new Brackets((qb) =>
          qb.where('r.valid_from IS NULL').orWhere('r.valid_from <= :now', { now })
        )
      )
      .andWhere(
        new Brackets((qb) => qb.where('r.valid_to IS NULL').orWhere('r.valid_to > :now', { now }))
      )
      .orderBy('r.priority', 'DESC')
      .addOrderBy('r.created_at', 'DESC')
      .getMany()

    for (const r of candidates) {
      if (this.scopeMatch(r, input)) return r
    }
    return null
  }

  /**
   * 一次性查 3 条规则（merchant + rider + platform）
   * 用途：settlement.service.computeForOrder 单订单循环用
   * 返回值：{ merchant?, rider?, platform? } 各自匹配到的规则
   */
  async matchRulesForOrder(
    scene: SettlementRuleScene,
    cityCode: string | null,
    shopId: string | null
  ): Promise<{
    merchant: SettlementRule | null
    rider: SettlementRule | null
    platform: SettlementRule | null
  }> {
    const [merchant, rider, platform] = await Promise.all([
      this.matchRule({ scene, targetType: 1, cityCode, shopId }),
      this.matchRule({ scene, targetType: 2, cityCode, shopId }),
      this.matchRule({ scene, targetType: 3, cityCode, shopId })
    ])
    return { merchant, rider, platform }
  }

  /* ==========================================================================
   * 三、辅助
   * ========================================================================== */

  /**
   * Entity → VO
   */
  toVo(rule: SettlementRule): SettlementRuleVo {
    return {
      id: rule.id,
      ruleCode: rule.ruleCode,
      ruleName: rule.ruleName,
      scene: rule.scene as SettlementRuleScene,
      targetType: rule.targetType as SettlementTargetType,
      scopeType: rule.scopeType as SettlementScopeType,
      scopeValue: rule.scopeValue,
      rate: rule.rate,
      fixedFee: rule.fixedFee,
      minFee: rule.minFee,
      maxFee: rule.maxFee,
      priority: rule.priority,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      status: rule.status,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    }
  }

  /**
   * 找一条未删除的规则；找不到抛 BIZ_RESOURCE_NOT_FOUND
   */
  private async findActiveById(id: string): Promise<SettlementRule> {
    const r = await this.ruleRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!r) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '分账规则不存在')
    }
    return r
  }

  /**
   * scope 范围匹配
   * - scope_type=1 全局：true
   * - scope_type=2 城市：scope_value === cityCode 时 true
   * - scope_type=3 单店：scope_value === shopId 时 true
   */
  private scopeMatch(rule: SettlementRule, input: MatchRuleInput): boolean {
    if (rule.scopeType === SettlementScopeTypeEnum.GLOBAL) return true
    if (rule.scopeType === SettlementScopeTypeEnum.CITY) {
      return Boolean(input.cityCode) && rule.scopeValue === input.cityCode
    }
    if (rule.scopeType === SettlementScopeTypeEnum.SHOP) {
      return Boolean(input.shopId) && rule.scopeValue === input.shopId
    }
    return false
  }

  /**
   * scope_type 与 scope_value 一致性校验
   * - scope_type=1 全局：scope_value 必须为空
   * - scope_type=2/3：scope_value 必须非空
   */
  private assertScopeConsistency(scopeType: number, scopeValue: string | undefined): void {
    if (scopeType === SettlementScopeTypeEnum.GLOBAL) {
      if (scopeValue !== undefined && scopeValue !== null && scopeValue !== '') {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, '全局规则不允许填 scopeValue')
      }
      return
    }
    if (!scopeValue) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'scope_type=2/3 时必须填 scopeValue')
    }
  }

  /**
   * rate 必须 0~1 闭区间
   */
  private assertRateRange(rate: string): void {
    const n = new BigNumber(rate)
    if (n.isNaN() || n.lt(0) || n.gt(1)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'rate 必须在 0~1 闭区间')
    }
  }

  /**
   * 标准化 rate：4 位小数字符串
   */
  private normalizeRate(rate: string): string {
    return new BigNumber(rate).decimalPlaces(4, BigNumber.ROUND_HALF_UP).toFixed(4)
  }

  /**
   * 标准化金额：2 位小数字符串
   */
  private normalizeFee(fee: string): string {
    return new BigNumber(fee).decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2)
  }
}
