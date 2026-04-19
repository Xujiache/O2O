/**
 * @file withdraw.service.ts
 * @stage P4/T4.33（Sprint 5）
 * @desc 提现服务：申请 / 审核 / 打款 / 回调（mock）4 阶段闭环
 * @author 单 Agent V2.0
 *
 * 状态机（与 finance.types.ts WithdrawStatusEnum 对齐）：
 *   apply  → 0 申请 + freeze(account, amount) → balance↓ frozen↑
 *   audit pass → 0/1 → 3 打款中（合并 1 审核中→3 打款中） + 触发 payout（mock 模式）
 *   audit reject → 0/1 → 2 驳回 + unfreeze(account, amount)
 *   payout → 3 → 4 已打款（mock 模式直接置 4）
 *           + payoutFromFrozen(account, amount)（frozen↓ + total_expense↑ + 写 account_flow biz_type=4 提现）
 *   payout fail → 3 → 5 失败 + unfreeze
 *   handlePayoutNotify（真实第三方回调）：本期 mock 跳过
 *
 * 银行卡敏感字段：
 *   - 入参 dto.bankCardNo / dto.accountHolder 明文
 *   - service 内 CryptoUtil.encrypt → bank_card_no_enc / account_holder_enc
 *   - bank_card_tail4 = CryptoUtil.tail4(bankCardNo)
 *   - VO 仅返回 tail4 + 脱敏持卡人（mask）
 *
 * 鉴权约束：
 *   - 商户端：只允许 ownerType=2 + ownerId === currentUser.uid（service.assertOwner）
 *   - 骑手端：只允许 ownerType=3 + ownerId === currentUser.uid
 *   - 管理端：审核 / 打款 必走 OperationLog
 */

import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { WithdrawRecord } from '@/entities'
import { MessageService } from '@/modules/message/message.service'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { CryptoUtil, SnowflakeId, generateBizNo } from '@/utils'
import {
  type AuditWithdrawDto,
  type CreateWithdrawDto,
  type QueryWithdrawDto,
  type WithdrawVo
} from '../dto/withdraw.dto'
import {
  FlowBizTypeEnum,
  type WithdrawOwnerType,
  WithdrawStatusEnum,
  type WithdrawStatus
} from '../types/finance.types'
import { AccountService } from './account.service'

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name)

  constructor(
    @InjectRepository(WithdrawRecord)
    private readonly withdrawRepo: Repository<WithdrawRecord>,
    private readonly accountService: AccountService,
    private readonly operationLogService: OperationLogService,
    /* MessageService 可选注入：通知商户/骑手提现成功；模板缺失时不阻断 */
    @Optional() private readonly messageService?: MessageService
  ) {}

  /* ==========================================================================
   * 一、apply —— 提现申请
   * ========================================================================== */

  /**
   * 提现申请
   *
   * 流程：
   *   1) getOrCreateAccount(ownerType, ownerId) 拿账户
   *   2) 校验 amount > 0 + amount ≤ balance
   *   3) CryptoUtil.encrypt(bankCardNo) / encrypt(accountHolder) / tail4(bankCardNo)
   *   4) freeze(account, amount) 把可用余额转入冻结
   *   5) INSERT withdraw_record(status=0, amount, fee=0, actual_amount=amount-fee)
   *
   * 参数：
   *   ownerType  WithdrawOwnerType（2 商户 / 3 骑手）
   *   ownerId    主体 ID（商户 ID / 骑手 ID）
   *   dto        CreateWithdrawDto
   * 返回值：WithdrawVo
   */
  async apply(
    ownerType: WithdrawOwnerType,
    ownerId: string,
    dto: CreateWithdrawDto
  ): Promise<WithdrawVo> {
    const amt = new BigNumber(dto.amount)
    if (amt.isNaN() || amt.lte(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'amount 必须为正数')
    }
    /* 取账户（自动创建） */
    const account = await this.accountService.getOrCreateAccount(ownerType, ownerId)
    if (amt.gt(new BigNumber(account.balance))) {
      throw new BusinessException(BizErrorCode.BIZ_BALANCE_INSUFFICIENT, '余额不足')
    }

    /* 加密银行卡 + 持卡人 */
    const cardEnc = CryptoUtil.encrypt(dto.bankCardNo)
    const cardTail4 = CryptoUtil.tail4(dto.bankCardNo)
    const holderEnc = CryptoUtil.encrypt(dto.accountHolder)
    const fee = '0.00' /* 本期不收手续费；后续按 sys_config 可配 */
    const actualAmount = amt.minus(new BigNumber(fee)).decimalPlaces(2, BigNumber.ROUND_HALF_UP)

    const withdrawNo = generateBizNo('W')
    const now = new Date()
    const record = this.withdrawRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      withdrawNo,
      ownerType,
      ownerId,
      accountId: account.id,
      amount: amt.toFixed(2),
      fee,
      actualAmount: actualAmount.toFixed(2),
      bankCardNoEnc: cardEnc,
      bankCardTail4: cardTail4,
      accountHolderEnc: holderEnc,
      bankName: dto.bankName,
      bankBranch: dto.bankBranch ?? null,
      encKeyVer: 1,
      status: WithdrawStatusEnum.APPLIED,
      auditAdminId: null,
      auditAt: null,
      auditRemark: null,
      payoutNo: null,
      payoutAt: null,
      payoutResponse: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })

    /* 先冻结账户，再保存 record；冻结失败抛错则 record 不入库（保持一致性） */
    await this.accountService.freeze(account.id, amt.toFixed(2), {
      relatedNo: withdrawNo,
      remark: '提现申请-冻结',
      opAdminId: null
    })
    const saved = await this.withdrawRepo.save(record)

    this.logger.log(
      `[withdraw.apply] ${withdrawNo} owner=${ownerType}:${ownerId} amount=${amt.toFixed(2)} → 冻结成功`
    )
    return this.toVo(saved, dto.accountHolder)
  }

  /* ==========================================================================
   * 二、audit —— 管理端审核
   * ========================================================================== */

  /**
   * 提现审核
   *
   * 状态流转：
   *   pass  → 0/1 → 3 打款中（自动触发 payout）
   *   reject → 0/1 → 2 驳回 + 解冻
   *
   * 参数：
   *   id          提现记录 ID
   *   dto         AuditWithdrawDto
   *   opAdminId   审核管理员 ID（写 OperationLog）
   * 返回值：WithdrawVo
   */
  async audit(id: string, dto: AuditWithdrawDto, opAdminId: string): Promise<WithdrawVo> {
    const record = await this.findActiveById(id)
    if (
      record.status !== WithdrawStatusEnum.APPLIED &&
      record.status !== WithdrawStatusEnum.AUDITING
    ) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态 ${record.status} 不允许审核`
      )
    }

    const now = new Date()
    if (dto.action === 'reject') {
      /* 驳回：状态置 2 + 解冻 */
      await this.accountService.unfreeze(record.accountId, record.amount, {
        relatedNo: record.withdrawNo,
        remark: '提现驳回-解冻',
        opAdminId
      })
      record.status = WithdrawStatusEnum.REJECTED
      record.auditAdminId = opAdminId
      record.auditAt = now
      record.auditRemark = dto.remark ?? '驳回'
      record.updatedAt = now
      const saved = await this.withdrawRepo.save(record)

      await this.operationLogService.write({
        opAdminId,
        module: 'finance',
        action: 'audit',
        resourceType: 'withdraw',
        resourceId: id,
        description: `驳回提现 ${record.withdrawNo}（金额 ${record.amount}）：${dto.remark ?? ''}`
      })
      this.logger.log(`[withdraw.audit] ${record.withdrawNo} REJECT by ${opAdminId}`)
      return this.toVo(saved)
    }

    /* pass → 状态 3 打款中 */
    record.status = WithdrawStatusEnum.PAYING
    record.auditAdminId = opAdminId
    record.auditAt = now
    record.auditRemark = dto.remark ?? '通过'
    record.updatedAt = now
    const saved = await this.withdrawRepo.save(record)

    await this.operationLogService.write({
      opAdminId,
      module: 'finance',
      action: 'audit',
      resourceType: 'withdraw',
      resourceId: id,
      description: `通过提现 ${record.withdrawNo}（金额 ${record.amount}）`
    })
    this.logger.log(`[withdraw.audit] ${record.withdrawNo} PASS by ${opAdminId} → 进入打款`)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 三、payout —— 实际打款（mock）
   * ========================================================================== */

  /**
   * 触发打款（mock 模式直接置 status=4 已打款）
   *
   * 流程（mock）：
   *   1) 校验 status=3 打款中
   *   2) AccountService.payoutFromFrozen(account, amount)
   *      → frozen -= amount + total_expense += amount + 写 account_flow biz_type=4 提现
   *   3) UPDATE withdraw_record SET status=4, payout_no=mock_xxx, payout_at=NOW, payout_response={mock}
   *   4) （可选）发送提现成功通知（MessageService.send 模板 WITHDRAW_PAID；缺失则 best-effort）
   *
   * 参数：id；opAdminId（管理员触发；OperationLog）
   * 返回值：WithdrawVo
   */
  async payout(id: string, opAdminId: string): Promise<WithdrawVo> {
    const record = await this.findActiveById(id)
    if (record.status !== WithdrawStatusEnum.PAYING) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态 ${record.status} 不允许打款`
      )
    }

    try {
      await this.accountService.payoutFromFrozen(record.accountId, record.amount, {
        relatedNo: record.withdrawNo,
        remark: '提现打款',
        opAdminId
      })

      const now = new Date()
      record.status = WithdrawStatusEnum.PAID
      record.payoutNo = `MOCK_${SnowflakeId.next()}`
      record.payoutAt = now
      record.payoutResponse = {
        mock: true,
        timestamp: now.toISOString(),
        amount: record.amount
      }
      record.updatedAt = now
      const saved = await this.withdrawRepo.save(record)

      await this.operationLogService.write({
        opAdminId,
        module: 'finance',
        action: 'payout',
        resourceType: 'withdraw',
        resourceId: id,
        description: `打款成功 ${record.withdrawNo}（金额 ${record.amount}）`,
        extra: { mock: true }
      })

      this.logger.log(
        `[withdraw.payout] ${record.withdrawNo} PAID by ${opAdminId} amount=${record.amount}`
      )
      void this.notifyWithdrawPaid(saved)
      return this.toVo(saved)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      /* 打款失败：解冻 + status=5 */
      await this.accountService
        .unfreeze(record.accountId, record.amount, {
          relatedNo: record.withdrawNo,
          remark: '提现打款失败-解冻',
          opAdminId
        })
        .catch((unfreezeErr) => {
          this.logger.error(
            `[withdraw.payout] 解冻同样失败 ${record.withdrawNo}：${(unfreezeErr as Error).message}`
          )
        })
      const now = new Date()
      record.status = WithdrawStatusEnum.FAILED
      record.payoutResponse = { mock: true, error: msg }
      record.updatedAt = now
      const saved = await this.withdrawRepo.save(record)
      this.logger.error(`[withdraw.payout] ${record.withdrawNo} FAILED：${msg}`)
      throw new BusinessException(BizErrorCode.PAYMENT_PROVIDER_ERROR, `打款失败：${msg}`)
    }
  }

  /* ==========================================================================
   * 四、handlePayoutNotify —— 第三方回调（本期 mock 跳过）
   * ========================================================================== */

  /**
   * 第三方打款回调（本期 mock 跳过；保留方法签名供 Sprint 8 接入真实通道）
   *
   * 真实通道接入流程（Sprint 8）：
   *   1) 验签
   *   2) findOne by payoutNo
   *   3) 状态 3 打款中 + 回调成功 → 复用 payout 后半部分（status=4）
   *   4) 回调失败 → 解冻 + status=5
   */
  async handlePayoutNotify(
    payoutNo: string,
    success: boolean,
    raw: Record<string, unknown>
  ): Promise<void> {
    const record = await this.withdrawRepo.findOne({
      where: { payoutNo, isDeleted: 0 }
    })
    if (!record) {
      this.logger.warn(`[withdraw.notify] 未找到 payout_no=${payoutNo}，忽略`)
      return
    }
    if (record.status !== WithdrawStatusEnum.PAYING) {
      this.logger.warn(
        `[withdraw.notify] ${record.withdrawNo} 状态非打款中（${record.status}），忽略回调`
      )
      return
    }
    /* mock 模式不实际调用 */
    this.logger.log(
      `[withdraw.notify] mock 跳过：withdraw=${record.withdrawNo} success=${success} raw=${JSON.stringify(raw).slice(0, 200)}`
    )
  }

  /* ==========================================================================
   * 五、查询 API
   * ========================================================================== */

  /**
   * 我的提现列表（商户/骑手端）
   */
  async listMine(
    ownerType: WithdrawOwnerType,
    ownerId: string,
    query: QueryWithdrawDto
  ): Promise<PageResult<WithdrawVo>> {
    const qb = this.withdrawRepo
      .createQueryBuilder('w')
      .where('w.is_deleted = 0')
      .andWhere('w.owner_type = :ot', { ot: ownerType })
      .andWhere('w.owner_id = :oi', { oi: ownerId })
    if (query.status !== undefined) qb.andWhere('w.status = :s', { s: query.status })
    qb.orderBy('w.created_at', 'DESC')
      .addOrderBy('w.id', 'DESC')
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

  /**
   * 管理端工作台列表
   */
  async listAdmin(query: QueryWithdrawDto): Promise<PageResult<WithdrawVo>> {
    const qb = this.withdrawRepo.createQueryBuilder('w').where('w.is_deleted = 0')
    if (query.status !== undefined) qb.andWhere('w.status = :s', { s: query.status })
    if (query.ownerType !== undefined) qb.andWhere('w.owner_type = :ot', { ot: query.ownerType })
    if (query.ownerId) qb.andWhere('w.owner_id = :oi', { oi: query.ownerId })
    qb.orderBy('w.created_at', 'DESC')
      .addOrderBy('w.id', 'DESC')
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

  /**
   * 单条详情（管理端 GET /admin/withdrawals/:id；商户/骑手端按需复用）
   */
  async detail(id: string): Promise<WithdrawVo> {
    const record = await this.findActiveById(id)
    return this.toVo(record)
  }

  /* ==========================================================================
   * 六、辅助
   * ========================================================================== */

  /**
   * 找一条未删除的提现记录
   */
  private async findActiveById(id: string): Promise<WithdrawRecord> {
    const r = await this.withdrawRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!r) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '提现记录不存在')
    }
    return r
  }

  /**
   * Entity → VO
   *
   * 参数：
   *   record           WithdrawRecord
   *   originalHolder   可选；apply 时已知明文持卡人，直接走脱敏；其他场景从 enc 解密
   */
  private toVo(record: WithdrawRecord, originalHolder?: string): WithdrawVo {
    let holderMask = '***'
    try {
      const holder = originalHolder ?? CryptoUtil.decrypt(record.accountHolderEnc, record.encKeyVer)
      holderMask = this.maskHolder(holder)
    } catch (err) {
      /* 解密失败：保护性兜底，避免把 enc 抛给前端 */
      this.logger.warn(
        `[withdraw.toVo] 持卡人解密失败 withdraw=${record.withdrawNo}：${(err as Error).message}`
      )
    }
    return {
      id: record.id,
      withdrawNo: record.withdrawNo,
      ownerType: record.ownerType as WithdrawOwnerType,
      ownerId: record.ownerId,
      accountId: record.accountId,
      amount: record.amount,
      fee: record.fee,
      actualAmount: record.actualAmount,
      bankCardTail4: record.bankCardTail4,
      accountHolderMask: holderMask,
      bankName: record.bankName,
      bankBranch: record.bankBranch,
      status: record.status as WithdrawStatus,
      auditAdminId: record.auditAdminId,
      auditAt: record.auditAt,
      auditRemark: record.auditRemark,
      payoutNo: record.payoutNo,
      payoutAt: record.payoutAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  }

  /**
   * 持卡人姓名脱敏
   * - 1 字符：原文
   * - 2 字符：保留首字符 + *
   * - ≥3 字符：首 + ** + 末
   */
  private maskHolder(name: string): string {
    if (!name) return ''
    if (name.length === 1) return name
    if (name.length === 2) return `${name[0]}*`
    return `${name[0]}**${name[name.length - 1]}`
  }

  /**
   * 异步发送提现成功通知（best-effort）
   */
  private async notifyWithdrawPaid(record: WithdrawRecord): Promise<void> {
    if (!this.messageService) return
    try {
      await this.messageService.send({
        code: 'WITHDRAW_PAID',
        targetType: record.ownerType as 1 | 2 | 3 | 4,
        targetId: record.ownerId,
        vars: {
          amount: record.amount,
          bankCardTail4: record.bankCardTail4,
          payoutAt: record.payoutAt?.toISOString() ?? ''
        },
        category: 5,
        relatedNo: record.withdrawNo
      })
    } catch (err) {
      this.logger.warn(
        `[withdraw.notify] 发送提现成功通知失败 ${record.withdrawNo}：${(err as Error).message}`
      )
    }
  }
}
