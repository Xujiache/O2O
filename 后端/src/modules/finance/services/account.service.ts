/**
 * @file account.service.ts
 * @stage P4/T4.30（Sprint 5）
 * @desc 账户服务：getOrCreateAccount / earn / spend / freeze / unfreeze /
 *       listFlows + 5 类账户操作矩阵（全程乐观锁 CAS，最多 3 次重试）
 * @author 单 Agent V2.0
 *
 * 核心设计（DESIGN_P4 §七 + CONSENSUS_P4 §2.6 第 4 步）：
 *   - 所有余额变化必走 casUpdate：UPDATE account SET balance=?, frozen=?,
 *     total_income=?, total_expense=?, version=version+1 WHERE id=? AND version=?
 *   - affected=0 → 重读 + 重算 + 重试，最多 3 次；耗尽抛 SYSTEM_DB_ERROR("乐观锁冲突")
 *   - 同事务内 INSERT account_flow（flow_no 全局唯一）保证账户与流水强一致
 *   - 5 类账户操作：earn(入账) / spend(出账) / freeze(冻结) / unfreeze(解冻) / adjust(调整)
 *
 * 平台账户：owner_type=3 + owner_id="0"（PLATFORM_OWNER_ID 常量）
 *   - getOrCreatePlatformAccount() 自动创建；分账目标 target_type=3 时使用
 *   - 注：骑手 ID 为雪花字符串≥18 位，固定 "0" 不会撞号
 *
 * 金额运算：全部 BigNumber + .toFixed(2)；禁止 number；日志统一走 nestjs Logger
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { DataSource, type EntityManager, In, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Account, AccountFlow } from '@/entities'
import { SnowflakeId, generateBizNo } from '@/utils'
import { type AccountVo, type FlowQueryDto, type FlowVo } from '../dto/account.dto'
import {
  AccountOwnerTypeEnum,
  type AccountOwnerType,
  AccountStatusEnum,
  FlowBizTypeEnum,
  type FlowBizType,
  FlowDirectionEnum,
  PLATFORM_OWNER_ID
} from '../types/finance.types'

/** CAS 最大重试次数（单次 update 失败后重读重算，超过则抛） */
const CAS_MAX_RETRY = 3

/** 流水号生成前缀（biz-no.generator 单字符限制；补 14 位时间 + 序号 = 15 位） */
const FLOW_NO_PREFIX_CHAR = 'F'

/**
 * AccountService 共享操作上下文：调用方用以传 relatedNo / remark / opAdminId
 *
 * 字段：
 *   - relatedNo  关联业务单号（订单号 / 支付号 / 退款号 / 提现号 / 分账号）
 *   - remark     备注文案，写入 account_flow.remark
 *   - opAdminId  管理员 ID（biz_type=8 调账时必传；其他场景可传 null）
 */
export interface AccountOpOptions {
  relatedNo?: string | null
  remark?: string | null
  opAdminId?: string | null
}

/**
 * earn / spend 等操作返回值
 *
 * 字段：
 *   - account     操作完成后的最新 Account 实体（含新 version / balance）
 *   - flow        本次写入的 AccountFlow 实体（flowNo 已生成）
 */
export interface AccountOpResult {
  account: Account
  flow: AccountFlow
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name)

  constructor(
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(AccountFlow) private readonly flowRepo: Repository<AccountFlow>,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  /* ==========================================================================
   * 一、账户获取 / 创建
   * ========================================================================== */

  /**
   * 取或建账户（同主体仅一个账户，uk_owner 约束保证）
   *
   * 用途：商户/骑手/用户首次产生账户操作前调用；幂等
   * 参数：ownerType 1 用户 / 2 商户 / 3 骑手；ownerId 主体 ID
   * 返回值：Account 实体
   */
  async getOrCreateAccount(ownerType: AccountOwnerType, ownerId: string): Promise<Account> {
    const existing = await this.accountRepo.findOne({
      where: { ownerType, ownerId, isDeleted: 0 }
    })
    if (existing) return existing

    /* 幂等创建：依赖 uk_owner 唯一约束兜底；若并发重复，捕获后重读 */
    const now = new Date()
    const acc = this.accountRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      ownerType,
      ownerId,
      balance: '0.00',
      frozen: '0.00',
      totalIncome: '0.00',
      totalExpense: '0.00',
      version: 0,
      status: AccountStatusEnum.NORMAL,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    try {
      return await this.accountRepo.save(acc)
    } catch (err) {
      const refound = await this.accountRepo.findOne({
        where: { ownerType, ownerId, isDeleted: 0 }
      })
      if (refound) return refound
      throw err
    }
  }

  /**
   * 取/建平台账户（owner_type=3 + owner_id="0"）
   *
   * 用途：分账 target_type=3 时把平台留成入账到此账户
   * 返回值：Account 实体
   */
  async getOrCreatePlatformAccount(): Promise<Account> {
    return this.getOrCreateAccount(AccountOwnerTypeEnum.RIDER, PLATFORM_OWNER_ID)
  }

  /**
   * 通过主键查询账户（控制器/管理端用）
   *
   * 参数：accountId 账户 ID
   * 返回：Account 实体
   * 错误：找不到 → BIZ_RESOURCE_NOT_FOUND
   */
  async findById(accountId: string): Promise<Account> {
    const acc = await this.accountRepo.findOne({
      where: { id: accountId, isDeleted: 0 }
    })
    if (!acc) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '账户不存在')
    }
    return acc
  }

  /**
   * 通过主体查询账户（owner_type+owner_id），不创建
   * 参数：ownerType / ownerId
   * 返回：Account 或 null
   */
  async findByOwner(ownerType: AccountOwnerType, ownerId: string): Promise<Account | null> {
    return this.accountRepo.findOne({
      where: { ownerType, ownerId, isDeleted: 0 }
    })
  }

  /* ==========================================================================
   * 二、五类账户操作（全部走 casUpdate + 写流水）
   * ========================================================================== */

  /**
   * 入账（balance += amount，total_income += amount）
   *
   * 用途：分账、订单收入、奖励、充值
   * 参数：
   *   ownerType / ownerId  账户主体（自动 getOrCreate）
   *   amount               金额（元，2 位小数 string）
   *   bizType              FlowBizType（推荐 SETTLEMENT/ORDER_INCOME/REWARD/RECHARGE）
   *   options              relatedNo / remark / opAdminId
   * 返回值：AccountOpResult（最新账户 + 新流水）
   * 错误：amount<=0 → PARAM_INVALID
   */
  async earn(
    ownerType: AccountOwnerType,
    ownerId: string,
    amount: string,
    bizType: FlowBizType,
    options: AccountOpOptions = {}
  ): Promise<AccountOpResult> {
    const amt = this.assertPositiveAmount(amount, 'amount')
    const acc = await this.getOrCreateAccount(ownerType, ownerId)
    return this.casApplyDelta({
      accountId: acc.id,
      deltaBalance: amt,
      deltaFrozen: new BigNumber(0),
      deltaIncome: amt,
      deltaExpense: new BigNumber(0),
      direction: FlowDirectionEnum.IN,
      bizType,
      amount: amt,
      relatedNo: options.relatedNo ?? null,
      remark: options.remark ?? null,
      opAdminId: options.opAdminId ?? null
    })
  }

  /**
   * 出账（balance -= amount，total_expense += amount）
   *
   * 用途：余额支付、提现打款扣减、罚款
   * 参数同 earn；bizType 推荐 WITHDRAW / PENALTY / 余额支付时 ORDER_INCOME 反向
   * 错误：amount<=0 → PARAM_INVALID；balance < amount → BIZ_BALANCE_INSUFFICIENT
   */
  async spend(
    ownerType: AccountOwnerType,
    ownerId: string,
    amount: string,
    bizType: FlowBizType,
    options: AccountOpOptions = {}
  ): Promise<AccountOpResult> {
    const amt = this.assertPositiveAmount(amount, 'amount')
    const acc = await this.getOrCreateAccount(ownerType, ownerId)
    return this.casApplyDelta({
      accountId: acc.id,
      deltaBalance: amt.negated(),
      deltaFrozen: new BigNumber(0),
      deltaIncome: new BigNumber(0),
      deltaExpense: amt,
      direction: FlowDirectionEnum.OUT,
      bizType,
      amount: amt,
      relatedNo: options.relatedNo ?? null,
      remark: options.remark ?? null,
      opAdminId: options.opAdminId ?? null
    })
  }

  /**
   * 冻结（balance -= amount，frozen += amount；不写 total_*）
   *
   * 用途：提现申请时把申请金额从可用余额转入冻结
   * 注：本函数不落 account_flow（DESIGN：冻结不算实际收支；提现真正"出账"在 payout 阶段）
   *     但为保证审计可追溯，本期仍写一条 biz_type=8 调整 + remark "冻结"，
   *     direction=2 表示金额从可用减去
   * 错误：余额不足 → BIZ_BALANCE_INSUFFICIENT
   */
  async freeze(
    accountId: string,
    amount: string,
    options: AccountOpOptions = {}
  ): Promise<AccountOpResult> {
    const amt = this.assertPositiveAmount(amount, 'amount')
    return this.casApplyDelta({
      accountId,
      deltaBalance: amt.negated(),
      deltaFrozen: amt,
      deltaIncome: new BigNumber(0),
      deltaExpense: new BigNumber(0),
      direction: FlowDirectionEnum.OUT,
      bizType: FlowBizTypeEnum.ADJUST,
      amount: amt,
      relatedNo: options.relatedNo ?? null,
      remark: options.remark ?? '冻结',
      opAdminId: options.opAdminId ?? null
    })
  }

  /**
   * 解冻（balance += amount，frozen -= amount；不写 total_*）
   *
   * 用途：提现驳回 / 打款失败时把冻结金额还回可用
   */
  async unfreeze(
    accountId: string,
    amount: string,
    options: AccountOpOptions = {}
  ): Promise<AccountOpResult> {
    const amt = this.assertPositiveAmount(amount, 'amount')
    return this.casApplyDelta({
      accountId,
      deltaBalance: amt,
      deltaFrozen: amt.negated(),
      deltaIncome: new BigNumber(0),
      deltaExpense: new BigNumber(0),
      direction: FlowDirectionEnum.IN,
      bizType: FlowBizTypeEnum.ADJUST,
      amount: amt,
      relatedNo: options.relatedNo ?? null,
      remark: options.remark ?? '解冻',
      opAdminId: options.opAdminId ?? null
    })
  }

  /**
   * 提现打款实际出账（frozen -= amount，total_expense += amount）
   *
   * 用途：提现 status=4 已打款时调用；从 frozen 直接消减并计入累计支出
   *      不动 balance（balance 在 freeze 阶段已减过）
   * 错误：frozen 不足 → BIZ_DATA_CONFLICT（理论不会发生：apply 已冻结；防御）
   */
  async payoutFromFrozen(
    accountId: string,
    amount: string,
    options: AccountOpOptions = {}
  ): Promise<AccountOpResult> {
    const amt = this.assertPositiveAmount(amount, 'amount')
    return this.casApplyDelta({
      accountId,
      deltaBalance: new BigNumber(0),
      deltaFrozen: amt.negated(),
      deltaIncome: new BigNumber(0),
      deltaExpense: amt,
      direction: FlowDirectionEnum.OUT,
      bizType: FlowBizTypeEnum.WITHDRAW,
      amount: amt,
      relatedNo: options.relatedNo ?? null,
      remark: options.remark ?? '提现打款',
      opAdminId: options.opAdminId ?? null
    })
  }

  /**
   * 人工调账（管理端，biz_type=8）
   *
   * 用途：客服补偿、误扣回补；direction=1 加 / direction=2 减
   * 必传 opAdminId + remark；写流水留痕
   */
  async adjust(
    accountId: string,
    direction: 1 | 2,
    amount: string,
    options: AccountOpOptions
  ): Promise<AccountOpResult> {
    if (!options.opAdminId) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '调账必须提供 opAdminId')
    }
    if (!options.remark) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '调账必须提供 remark')
    }
    const amt = this.assertPositiveAmount(amount, 'amount')
    const isIn = direction === FlowDirectionEnum.IN
    return this.casApplyDelta({
      accountId,
      deltaBalance: isIn ? amt : amt.negated(),
      deltaFrozen: new BigNumber(0),
      deltaIncome: isIn ? amt : new BigNumber(0),
      deltaExpense: isIn ? new BigNumber(0) : amt,
      direction,
      bizType: FlowBizTypeEnum.ADJUST,
      amount: amt,
      relatedNo: options.relatedNo ?? null,
      remark: options.remark,
      opAdminId: options.opAdminId
    })
  }

  /* ==========================================================================
   * 三、账户流水查询
   * ========================================================================== */

  /**
   * 流水分页查询（按账户 ID）
   * 参数：accountId / query
   * 返回值：PageResult<FlowVo>
   */
  async listFlows(accountId: string, query: FlowQueryDto): Promise<PageResult<FlowVo>> {
    const qb = this.flowRepo
      .createQueryBuilder('f')
      .where('f.account_id = :id AND f.is_deleted = 0', { id: accountId })
    if (query.bizType !== undefined) {
      qb.andWhere('f.biz_type = :bt', { bt: query.bizType })
    }
    if (query.direction !== undefined) {
      qb.andWhere('f.direction = :dr', { dr: query.direction })
    }
    qb.orderBy('f.created_at', 'DESC')
      .addOrderBy('f.id', 'DESC')
      .skip(query.skip())
      .take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((f) => this.flowToVo(f)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 流水分页查询（按主体）
   * 用途：商户/骑手/用户端 GET /finance/flows
   */
  async listFlowsByOwner(
    ownerType: AccountOwnerType,
    ownerId: string,
    query: FlowQueryDto
  ): Promise<PageResult<FlowVo>> {
    const acc = await this.findByOwner(ownerType, ownerId)
    if (!acc) {
      return makePageResult<FlowVo>([], 0, query.page ?? 1, query.pageSize ?? 20)
    }
    return this.listFlows(acc.id, query)
  }

  /**
   * 通过 relatedNo（订单号/分账号/提现号 等）反查流水
   * 用途：客服定位 / 对账修复
   */
  async findFlowsByRelatedNo(relatedNo: string): Promise<AccountFlow[]> {
    return this.flowRepo.find({
      where: { relatedNo, isDeleted: 0 },
      order: { createdAt: 'DESC' }
    })
  }

  /**
   * 把多个账户实体批量映射成 VO（便于其他 service 复用）
   */
  toVo(account: Account): AccountVo {
    return {
      id: account.id,
      ownerType: account.ownerType as AccountOwnerType,
      ownerId: account.ownerId,
      balance: account.balance,
      frozen: account.frozen,
      totalIncome: account.totalIncome,
      totalExpense: account.totalExpense,
      status: account.status,
      version: account.version,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    }
  }

  /**
   * 流水实体 → VO（公开方法，供 controller / 上游 service 使用）
   */
  flowToVo(flow: AccountFlow): FlowVo {
    return {
      id: flow.id,
      flowNo: flow.flowNo,
      accountId: flow.accountId,
      ownerType: flow.ownerType as AccountOwnerType,
      ownerId: flow.ownerId,
      direction: flow.direction as 1 | 2,
      bizType: flow.bizType as FlowBizType,
      amount: flow.amount,
      balanceAfter: flow.balanceAfter,
      relatedNo: flow.relatedNo,
      remark: flow.remark,
      opAdminId: flow.opAdminId,
      createdAt: flow.createdAt
    }
  }

  /* ==========================================================================
   * 四、内部 CAS 引擎（核心）
   * ========================================================================== */

  /**
   * CAS 应用增量：账户金额变化 + 同事务写流水（最多 3 次重试）
   *
   * 流程：
   *   1) 事务内 SELECT account（取当前 version + balance + frozen + total_*）
   *   2) BigNumber 算新值 + 校验非负（balance / frozen 都 ≥ 0）
   *   3) UPDATE account SET balance=?, frozen=?, total_income=?, total_expense=?,
   *        version=version+1, updated_at=? WHERE id=? AND version=?
   *   4) affected=1 → INSERT account_flow（含 flowNo 唯一）→ 提交事务 → return
   *   5) affected=0 → 重试（事务回滚，下次循环重新打开新事务）
   *   6) 重试 CAS_MAX_RETRY 次仍失败 → SYSTEM_DB_ERROR("乐观锁冲突")
   *
   * 私有；外部应通过 earn / spend / freeze / unfreeze / adjust / payoutFromFrozen 调用
   */
  private async casApplyDelta(input: {
    accountId: string
    deltaBalance: BigNumber
    deltaFrozen: BigNumber
    deltaIncome: BigNumber
    deltaExpense: BigNumber
    direction: 1 | 2
    bizType: FlowBizType
    /** 流水写入用：始终正数 */
    amount: BigNumber
    relatedNo: string | null
    remark: string | null
    opAdminId: string | null
  }): Promise<AccountOpResult> {
    let lastErr: Error | null = null
    for (let attempt = 0; attempt < CAS_MAX_RETRY; attempt++) {
      try {
        const result = await this.dataSource.transaction(async (manager) =>
          this.tryCasOnce(manager, input)
        )
        return result
      } catch (err) {
        if (err instanceof CasMissError) {
          lastErr = err
          this.logger.warn(
            `[AccountService] CAS miss account=${input.accountId} attempt=${attempt + 1}/${CAS_MAX_RETRY}`
          )
          continue
        }
        throw err
      }
    }
    throw new BusinessException(
      BizErrorCode.SYSTEM_DB_ERROR,
      `账户乐观锁冲突，重试 ${CAS_MAX_RETRY} 次仍失败：${lastErr?.message ?? 'unknown'}`
    )
  }

  /**
   * CAS 单次尝试（事务内）
   *
   * - SELECT 当前账户（is_deleted=0）
   * - 校验 status=1 + 非冻结
   * - 算新值 + 非负校验
   * - UPDATE WHERE id=? AND version=?
   * - INSERT account_flow
   * - affected=0 抛 CasMissError 让外层 retry
   */
  private async tryCasOnce(
    manager: EntityManager,
    input: {
      accountId: string
      deltaBalance: BigNumber
      deltaFrozen: BigNumber
      deltaIncome: BigNumber
      deltaExpense: BigNumber
      direction: 1 | 2
      bizType: FlowBizType
      amount: BigNumber
      relatedNo: string | null
      remark: string | null
      opAdminId: string | null
    }
  ): Promise<AccountOpResult> {
    const acc = await manager.findOne(Account, {
      where: { id: input.accountId, isDeleted: 0 }
    })
    if (!acc) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '账户不存在')
    }
    if (acc.status !== AccountStatusEnum.NORMAL) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '账户已冻结，禁止操作')
    }

    const newBalance = new BigNumber(acc.balance).plus(input.deltaBalance)
    const newFrozen = new BigNumber(acc.frozen).plus(input.deltaFrozen)
    if (newBalance.lt(0)) {
      throw new BusinessException(BizErrorCode.BIZ_BALANCE_INSUFFICIENT, '账户余额不足')
    }
    if (newFrozen.lt(0)) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '账户冻结金额不足，无法解冻')
    }
    const newIncome = new BigNumber(acc.totalIncome).plus(input.deltaIncome)
    const newExpense = new BigNumber(acc.totalExpense).plus(input.deltaExpense)

    const now = new Date()
    const result = await manager
      .createQueryBuilder()
      .update(Account)
      .set({
        balance: newBalance.toFixed(2),
        frozen: newFrozen.toFixed(2),
        totalIncome: newIncome.toFixed(2),
        totalExpense: newExpense.toFixed(2),
        version: acc.version + 1,
        updatedAt: now
      })
      .where('id = :id AND version = :ver', { id: acc.id, ver: acc.version })
      .execute()

    if ((result.affected ?? 0) !== 1) {
      throw new CasMissError(`account ${acc.id} version=${acc.version} miss`)
    }

    /* 写流水：flowNo 全局唯一；用 generateBizNo('F') 取 15 位（前缀 F + 8 日期 + 6 序号） */
    const flowNo = generateBizNo(FLOW_NO_PREFIX_CHAR)
    const flow = manager.create(AccountFlow, {
      id: SnowflakeId.next(),
      tenantId: 1,
      flowNo,
      accountId: acc.id,
      ownerType: acc.ownerType,
      ownerId: acc.ownerId,
      direction: input.direction,
      bizType: input.bizType,
      amount: input.amount.toFixed(2),
      balanceAfter: newBalance.toFixed(2),
      relatedNo: input.relatedNo,
      remark: input.remark,
      opAdminId: input.opAdminId,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    await manager.save(flow)

    /* 同步把 acc 实体内存值刷新（回写给调用方使用） */
    acc.balance = newBalance.toFixed(2)
    acc.frozen = newFrozen.toFixed(2)
    acc.totalIncome = newIncome.toFixed(2)
    acc.totalExpense = newExpense.toFixed(2)
    acc.version = acc.version + 1
    acc.updatedAt = now
    return { account: acc, flow }
  }

  /**
   * 校验金额 > 0 + 转 BigNumber
   * 参数：amount 数字字符串；fieldName 用于错误消息
   * 返回值：BigNumber 实例
   * 错误：非合法数字 / 非正数 → PARAM_INVALID
   */
  private assertPositiveAmount(amount: string, fieldName: string): BigNumber {
    const n = new BigNumber(amount)
    if (n.isNaN() || !n.isFinite()) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `${fieldName} 必须为合法数字字符串`)
    }
    if (n.lte(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `${fieldName} 必须大于 0`)
    }
    return n
  }

  /**
   * 主体批量取账户（management 内部使用）
   * 参数：ownerType / ownerIds
   * 返回值：Map<ownerId, Account>
   */
  async findManyByOwners(
    ownerType: AccountOwnerType,
    ownerIds: string[]
  ): Promise<Map<string, Account>> {
    const ids = Array.from(new Set(ownerIds))
    if (ids.length === 0) return new Map()
    const rows = await this.accountRepo.find({
      where: { ownerType, ownerId: In(ids), isDeleted: 0 }
    })
    return new Map(rows.map((a) => [a.ownerId, a]))
  }
}

/**
 * CAS 失败专用错误（仅 AccountService 内部使用，外层 catch 后转 retry）
 */
class CasMissError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'CasMissError'
  }
}
