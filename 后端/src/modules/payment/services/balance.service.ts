/**
 * @file balance.service.ts
 * @stage P4/T4.26（Sprint 4）
 * @desc 余额支付：账户 CAS 扣减 + account_flow 出账 + payment_record 直接成功
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 重要分工说明（与 Subagent 4 Finance Account 共享 entity）：
 *   - Account / AccountFlow entity 与 Finance 模块共享，由 Sprint 5 Finance 模块完整管理
 *   - 本期 Sprint 4 PaymentModule 直接 TypeOrmModule.forFeature(Account, AccountFlow)
 *     在事务中操作；不调用 Finance Service（避免循环依赖）
 *   - 风险点：双方对账户的写入语义需对齐（version CAS + 流水号唯一）
 *
 * 余额支付流程：
 *   1) 查 Account WHERE owner_type=1 AND owner_id=userId
 *   2) 校验 status=1 + balance >= amount，否则 BIZ_BALANCE_INSUFFICIENT 10402
 *   3) 事务 QueryRunner：
 *      a) UPDATE account SET balance=balance-amount, total_expense=total_expense+amount,
 *                              version=version+1
 *         WHERE id=? AND version=? AND balance>=amount
 *         affectedRows=0 → SYSTEM_DB_ERROR（CAS 冲突，由调用方重试）
 *      b) INSERT account_flow（direction=2 出账, biz_type=1 订单收入对应支出, related_no=orderNo）
 *      c) INSERT payment_record（pay_method=3, status=2 直接成功, pay_at=now）
 *   4) 失败回滚 + 抛业务异常
 *
 * 退款回流（refundByBalance）：
 *   1) 查 Account（同上）
 *   2) 事务 QueryRunner：
 *      a) UPDATE account SET balance=balance+amount, total_income=total_income+amount,
 *                              version=version+1 (CAS only on version)
 *      b) INSERT account_flow（direction=1 入账, biz_type=2 订单退款）
 *
 * 设计参考：DESIGN_P4 §七 + 任务 §6.3
 *
 * 重试策略：CAS 冲突在本期不自动重试；返回 SYSTEM_DB_ERROR，调用方决定是否重试。
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Account, AccountFlow, PaymentRecord } from '@/entities'
import { SnowflakeId, generateBizNo } from '@/utils'
import { PayMethod, PayStatus } from '../types/payment.types'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 账户主体类型：用户 */
const OWNER_TYPE_USER = 1

/** 账户状态：正常 */
const ACCOUNT_STATUS_NORMAL = 1

/** 账户流水方向：1 入账 / 2 出账 */
const FLOW_DIRECTION_OUT = 2
const FLOW_DIRECTION_IN = 1

/** 账户流水业务类型：1 订单收入 / 2 订单退款 */
const FLOW_BIZ_TYPE_ORDER_PAY = 1
const FLOW_BIZ_TYPE_ORDER_REFUND = 2

/* ============================================================================
 * mysql2 OkPacket（仅取 affectedRows）
 * ============================================================================ */

interface UpdateResultPacket {
  affectedRows?: number
}

/* ============================================================================
 * 出参
 * ============================================================================ */

/**
 * 余额支付结果
 *
 * 字段：
 *   - payNo            生成的支付单号
 *   - paymentRecordId  支付记录主键
 *   - balanceAfter     扣减后余额
 *   - flowNo           账户流水号
 */
export interface BalancePayResult {
  payNo: string
  paymentRecordId: string
  balanceAfter: string
  flowNo: string
}

/**
 * 余额退款结果
 *
 * 字段：
 *   - flowNo        账户流水号
 *   - balanceAfter  加回后余额
 */
export interface BalanceRefundResult {
  flowNo: string
  balanceAfter: string
}

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>
  ) {}

  /**
   * 余额支付
   * 参数：
   *   payNo     已生成的平台支付单号（28 位；调用方传入）
   *   orderNo   订单号
   *   orderType 1 外卖 / 2 跑腿
   *   userId    付款用户 ID
   *   amount    金额（string）
   * 返回值：BalancePayResult
   * 错误：
   *   - BIZ_RESOURCE_NOT_FOUND 10010：账户不存在
   *   - BIZ_OPERATION_FORBIDDEN 10012：账户冻结
   *   - BIZ_BALANCE_INSUFFICIENT 10402：余额不足
   *   - SYSTEM_DB_ERROR 50003：CAS 冲突
   */
  async payByBalance(
    payNo: string,
    orderNo: string,
    orderType: number,
    userId: string,
    amount: string
  ): Promise<BalancePayResult> {
    const amountBn = new BigNumber(amount)
    if (!amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `余额支付金额非法：${amount}`)
    }

    /* 预查（不加锁） */
    const preAccount = await this.accountRepo.findOne({
      where: { ownerType: OWNER_TYPE_USER, ownerId: userId, isDeleted: 0 }
    })
    if (!preAccount) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        `用户账户不存在 userId=${userId}`
      )
    }
    if (preAccount.status !== ACCOUNT_STATUS_NORMAL) {
      throw new BusinessException(
        BizErrorCode.BIZ_OPERATION_FORBIDDEN,
        `账户已冻结 userId=${userId}`
      )
    }
    if (new BigNumber(preAccount.balance).isLessThan(amountBn)) {
      throw new BusinessException(
        BizErrorCode.BIZ_BALANCE_INSUFFICIENT,
        `余额不足：当前 ${preAccount.balance}，需 ${amount}`
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      const accountRepo = queryRunner.manager.getRepository(Account)
      const flowRepo = queryRunner.manager.getRepository(AccountFlow)
      const payRepo = queryRunner.manager.getRepository(PaymentRecord)

      /* 行锁 select for update */
      const account = await accountRepo.findOne({
        where: { id: preAccount.id, isDeleted: 0 },
        lock: { mode: 'pessimistic_write' }
      })
      if (!account) {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '账户不存在（事务内）')
      }
      if (account.status !== ACCOUNT_STATUS_NORMAL) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '账户已冻结（事务内）')
      }
      const currentBalance = new BigNumber(account.balance)
      if (currentBalance.isLessThan(amountBn)) {
        throw new BusinessException(
          BizErrorCode.BIZ_BALANCE_INSUFFICIENT,
          `余额不足（事务内）：当前 ${account.balance}，需 ${amount}`
        )
      }

      /* CAS UPDATE */
      const newBalance = currentBalance.minus(amountBn).toFixed(2)
      const newTotalExpense = new BigNumber(account.totalExpense).plus(amountBn).toFixed(2)
      const sql =
        'UPDATE account SET balance = ?, total_expense = ?, version = version + 1 ' +
        'WHERE id = ? AND version = ? AND balance >= ? AND is_deleted = 0'
      const updateRaw: unknown = await queryRunner.manager.query(sql, [
        newBalance,
        newTotalExpense,
        account.id,
        account.version,
        amount
      ])
      const packet = updateRaw as UpdateResultPacket
      if ((packet.affectedRows ?? 0) !== 1) {
        throw new BusinessException(BizErrorCode.SYSTEM_DB_ERROR, `账户 CAS 冲突 userId=${userId}`)
      }

      /* 写流水 */
      const flowNo = generateBizNo('F')
      const flow = flowRepo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        flowNo,
        accountId: account.id,
        ownerType: OWNER_TYPE_USER,
        ownerId: userId,
        direction: FLOW_DIRECTION_OUT,
        bizType: FLOW_BIZ_TYPE_ORDER_PAY,
        amount,
        balanceAfter: newBalance,
        relatedNo: orderNo,
        remark: `余额支付 订单 ${orderNo}`,
        opAdminId: null
      })
      await flowRepo.save(flow)

      /* 写支付记录（直接 SUCCESS） */
      const now = new Date()
      const paymentEntity = payRepo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        payNo,
        outTradeNo: payNo,
        orderNo,
        orderType,
        userId,
        amount,
        payMethod: PayMethod.BALANCE,
        channel: 'balance',
        status: PayStatus.SUCCESS,
        payAt: now,
        clientIp: null,
        deviceInfo: null,
        notifyUrl: null,
        rawRequest: { source: 'balance', orderNo },
        rawResponse: { synchronous: true, flowNo, balanceAfter: newBalance },
        errorCode: null,
        errorMsg: null
      })
      await payRepo.save(paymentEntity)

      await queryRunner.commitTransaction()

      this.logger.log(
        `[BALANCE] payByBalance ok payNo=${payNo} userId=${userId} amount=${amount} balanceAfter=${newBalance}`
      )

      return {
        payNo,
        paymentRecordId: paymentEntity.id,
        balanceAfter: newBalance,
        flowNo
      }
    } catch (err) {
      try {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
      } catch (rollbackErr) {
        this.logger.error(
          `[BALANCE] rollback 失败 payNo=${payNo}：${(rollbackErr as Error).message}`
        )
      }
      throw err
    } finally {
      try {
        await queryRunner.release()
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * 余额退款（用于 RefundService 在余额支付场景下加回余额）
   * 参数：
   *   userId   退款用户 ID
   *   amount   退款金额（string）
   *   refundNo 退款单号（写入 account_flow.related_no）
   *   orderNo  订单号（写入 remark）
   * 返回值：BalanceRefundResult
   * 错误：BIZ_RESOURCE_NOT_FOUND / SYSTEM_DB_ERROR
   *
   * 注意：本方法假设外层无事务；内部自管 QueryRunner。若调用方已开事务请使用 refundByBalanceWithRunner。
   */
  async refundToBalance(
    userId: string,
    amount: string,
    refundNo: string,
    orderNo: string
  ): Promise<BalanceRefundResult> {
    const amountBn = new BigNumber(amount)
    if (!amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `余额退款金额非法：${amount}`)
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      const accountRepo = queryRunner.manager.getRepository(Account)
      const flowRepo = queryRunner.manager.getRepository(AccountFlow)

      const account = await accountRepo.findOne({
        where: { ownerType: OWNER_TYPE_USER, ownerId: userId, isDeleted: 0 },
        lock: { mode: 'pessimistic_write' }
      })
      if (!account) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          `用户账户不存在 userId=${userId}`
        )
      }

      const newBalance = new BigNumber(account.balance).plus(amountBn).toFixed(2)
      const newTotalIncome = new BigNumber(account.totalIncome).plus(amountBn).toFixed(2)
      const sql =
        'UPDATE account SET balance = ?, total_income = ?, version = version + 1 ' +
        'WHERE id = ? AND version = ? AND is_deleted = 0'
      const updateRaw: unknown = await queryRunner.manager.query(sql, [
        newBalance,
        newTotalIncome,
        account.id,
        account.version
      ])
      const packet = updateRaw as UpdateResultPacket
      if ((packet.affectedRows ?? 0) !== 1) {
        throw new BusinessException(BizErrorCode.SYSTEM_DB_ERROR, `账户 CAS 冲突 userId=${userId}`)
      }

      const flowNo = generateBizNo('F')
      const flow = flowRepo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        flowNo,
        accountId: account.id,
        ownerType: OWNER_TYPE_USER,
        ownerId: userId,
        direction: FLOW_DIRECTION_IN,
        bizType: FLOW_BIZ_TYPE_ORDER_REFUND,
        amount,
        balanceAfter: newBalance,
        relatedNo: refundNo,
        remark: `余额退款 订单 ${orderNo}`,
        opAdminId: null
      })
      await flowRepo.save(flow)

      await queryRunner.commitTransaction()

      this.logger.log(
        `[BALANCE] refundToBalance ok refundNo=${refundNo} userId=${userId} amount=${amount} balanceAfter=${newBalance}`
      )

      return { flowNo, balanceAfter: newBalance }
    } catch (err) {
      try {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
      } catch (rollbackErr) {
        this.logger.error(
          `[BALANCE] refund rollback 失败 refundNo=${refundNo}：${(rollbackErr as Error).message}`
        )
      }
      throw err
    } finally {
      try {
        await queryRunner.release()
      } catch {
        /* ignore */
      }
    }
  }
}
