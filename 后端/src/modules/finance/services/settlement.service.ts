/**
 * @file settlement.service.ts
 * @stage P4/T4.32（Sprint 5）
 * @desc 分账核心服务：computeForOrder + execute（实际入账）
 * @author 单 Agent V2.0
 *
 * 5 步流程（CONSENSUS_P4 §2.6）：
 *   1. 读取有效 settlement_rule（按 priority DESC + scope 范围匹配）
 *   2. 计算商户 / 骑手 / 平台 应得金额
 *   3. 写 settlement_record status=0 待结算（uk_settlement_no 全局唯一）
 *   4. 执行（内部账户转账）：调 AccountService.earn(...)（version CAS） +
 *      回填 status=1 + flow_no + settle_at
 *   5. 失败 → status=2 + error_msg + 等人工补
 *
 * 幂等约定：
 *   - 同一订单同一 target_type 仅允许一条 active settlement_record
 *     （uk 不在 SQL 设置，但 service 内查重并跳过；status=3 已撤销时允许新建）
 *
 * 金额规则：
 *   - settle_amount = clamp( base_amount * rate + fixed_fee, [min_fee, max_fee] )
 *   - 全部 BigNumber + .toFixed(2)；负值 → 0；超过 base_amount 时 → base_amount（防御）
 *
 * 注：本 service 只负责"算 + 写 + 执行"；定时调度由 settlement-cron.service 触发
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { DataSource, In, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { SettlementRecord, SettlementRule } from '@/entities'
import { OrderShardingHelper } from '@/modules/order/order-sharding.helper'
import {
  OrderTakeoutStatusEnum,
  OrderErrandStatusEnum,
  OrderTypeEnum,
  type OrderType
} from '@/modules/order/types/order.types'
import { SnowflakeId, generateBizNo } from '@/utils'
import { type QuerySettlementRecordDto, type SettlementRecordVo } from '../dto/settlement.dto'
import {
  AccountOwnerTypeEnum,
  type AccountOwnerType,
  FlowBizTypeEnum,
  PLATFORM_OWNER_ID,
  SettlementRecordStatusEnum,
  SettlementSceneEnum,
  type SettleStatus,
  type SettlementRuleScene,
  type SettlementTargetType,
  SettlementTargetTypeEnum
} from '../types/finance.types'
import { AccountService } from './account.service'
import { SettlementRuleService } from './settlement-rule.service'

/**
 * 分账输入：单订单核心信息（service 上层先从 order_takeout / order_errand 拼出）
 *
 * 字段语义：
 *   - orderNo / orderType  18 位订单号 + 1 外卖 / 2 跑腿
 *   - merchantId           外卖必填；跑腿 null
 *   - riderId              派单成功后必有；缺失会跳过骑手分账
 *   - shopId               外卖必填；跑腿 null
 *   - cityCode             外卖：从 shopSnapshot.cityCode 取；跑腿：可选（addressSnapshot.cityCode）
 *   - payAmount            订单实付金额（DECIMAL(12,2) 字符串）
 *   - finishedAt           订单完成时间（用于 settle_at 计算 + 跨月校验）
 */
export interface SettlementInput {
  orderNo: string
  orderType: OrderType
  merchantId: string | null
  riderId: string | null
  shopId: string | null
  cityCode: string | null
  payAmount: string
  finishedAt: Date
}

/**
 * computeForOrder 返回值
 *
 * 字段：
 *   - records   本次新建的 settlement_record 列表（status=0）
 *   - skipped   跳过原因（已存在 / 缺规则 / 缺主体）
 */
export interface ComputeResult {
  records: SettlementRecord[]
  skippedReasons: string[]
}

/**
 * 单订单分账"算 + 写 + 执行"汇总结果（runForOrder 返回）
 */
export interface RunForOrderResult {
  orderNo: string
  created: number
  executed: number
  failed: number
  skipped: number
}

/** 单批跨月查询订单时的最大分页 */
const ORDER_SCAN_PAGE_SIZE = 500

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name)

  constructor(
    @InjectRepository(SettlementRecord)
    private readonly recordRepo: Repository<SettlementRecord>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ruleService: SettlementRuleService,
    private readonly accountService: AccountService
  ) {}

  /* ==========================================================================
   * 一、computeForOrder —— 单订单生成 1~3 条 settlement_record（status=0）
   * ========================================================================== */

  /**
   * 为一笔订单生成 1~3 条分账记录（不入账，仅写 status=0 待执行）
   *
   * 流程：
   *   1) 查重：order_no + target_type 已有 status IN (0,1) 的记录 → 跳过对应 target
   *   2) 一次性匹配 3 条规则（merchant/rider/platform）
   *   3) 对命中的 target：
   *      - 校验 target 主体存在（merchant/rider 主体 ID 必须有；platform 用 PLATFORM_OWNER_ID）
   *      - 计算 settle_amount = clamp(base*rate+fixed_fee, [min, max])
   *      - 跳过 settle_amount<=0 的记录
   *      - INSERT settlement_record(status=0, settlement_no=generateBizNo)
   *
   * 参数：input SettlementInput
   * 返回值：ComputeResult（records: 新建的 + skippedReasons: 文本数组）
   */
  async computeForOrder(input: SettlementInput): Promise<ComputeResult> {
    const skipped: string[] = []
    const created: SettlementRecord[] = []

    /* 1) 查重：同订单同 target 已存在 active 记录 → 跳过 */
    const existing = await this.recordRepo.find({
      where: {
        orderNo: input.orderNo,
        status: In([SettlementRecordStatusEnum.PENDING, SettlementRecordStatusEnum.EXECUTED]),
        isDeleted: 0
      }
    })
    const existingTargets = new Set(existing.map((r) => r.targetType))

    /* 2) 匹配规则（scene = orderType） */
    const scene = input.orderType as SettlementRuleScene
    const matched = await this.ruleService.matchRulesForOrder(scene, input.cityCode, input.shopId)

    /* 3) 三角色循环 */
    const baseAmount = new BigNumber(input.payAmount)
    const now = new Date()

    /* merchant 分账（仅外卖 + 有 merchantId） */
    if (
      scene === SettlementSceneEnum.TAKEOUT &&
      input.merchantId &&
      !existingTargets.has(SettlementTargetTypeEnum.MERCHANT)
    ) {
      if (!matched.merchant) {
        skipped.push(
          `merchant: 无匹配规则 (scene=${scene}, city=${input.cityCode}, shop=${input.shopId})`
        )
      } else {
        const settleAmt = this.computeAmount(baseAmount, matched.merchant)
        if (settleAmt.lte(0)) {
          skipped.push(`merchant: 计算金额≤0 跳过`)
        } else {
          created.push(
            this.buildRecord({
              orderNo: input.orderNo,
              orderType: input.orderType,
              targetType: SettlementTargetTypeEnum.MERCHANT,
              targetId: input.merchantId,
              rule: matched.merchant,
              baseAmount,
              settleAmount: settleAmt,
              now
            })
          )
        }
      }
    }

    /* rider 分账（外卖 + 跑腿都需要；前提有 riderId） */
    if (input.riderId && !existingTargets.has(SettlementTargetTypeEnum.RIDER)) {
      if (!matched.rider) {
        skipped.push(`rider: 无匹配规则 (scene=${scene})`)
      } else {
        const settleAmt = this.computeAmount(baseAmount, matched.rider)
        if (settleAmt.lte(0)) {
          skipped.push(`rider: 计算金额≤0 跳过`)
        } else {
          created.push(
            this.buildRecord({
              orderNo: input.orderNo,
              orderType: input.orderType,
              targetType: SettlementTargetTypeEnum.RIDER,
              targetId: input.riderId,
              rule: matched.rider,
              baseAmount,
              settleAmount: settleAmt,
              now
            })
          )
        }
      }
    }

    /* platform 分账（外卖 + 跑腿都需要；target_id 写 NULL） */
    if (!existingTargets.has(SettlementTargetTypeEnum.PLATFORM)) {
      if (!matched.platform) {
        skipped.push(`platform: 无匹配规则 (scene=${scene})`)
      } else {
        const settleAmt = this.computeAmount(baseAmount, matched.platform)
        if (settleAmt.lte(0)) {
          skipped.push(`platform: 计算金额≤0 跳过`)
        } else {
          created.push(
            this.buildRecord({
              orderNo: input.orderNo,
              orderType: input.orderType,
              targetType: SettlementTargetTypeEnum.PLATFORM,
              targetId: null,
              rule: matched.platform,
              baseAmount,
              settleAmount: settleAmt,
              now
            })
          )
        }
      }
    }

    if (created.length > 0) {
      await this.recordRepo.save(created)
    }

    return { records: created, skippedReasons: skipped }
  }

  /* ==========================================================================
   * 二、execute —— 单条记录实际入账（账户 CAS）
   * ========================================================================== */

  /**
   * 执行单条分账记录（入账 + 回填 status）
   *
   * 流程：
   *   1) 校验 status=0 / record 未删
   *   2) 算入账主体：
   *      - target_type=1 商户 → owner_type=2 / owner_id=record.targetId
   *      - target_type=2 骑手 → owner_type=3 / owner_id=record.targetId
   *      - target_type=3 平台 → owner_type=3 / owner_id=PLATFORM_OWNER_ID
   *   3) AccountService.earn(...) → 拿 flow.flowNo
   *   4) UPDATE settlement_record SET status=1, settle_at=NOW, flow_no=flowNo
   *   5) earn 抛错 → UPDATE status=2 + error_msg；不抛二次让 cron 继续下一条
   *
   * 参数：record 一条 status=0 的 settlement_record
   * 返回值：执行后的 record（已回写 status / settleAt / flowNo / errorMsg）
   */
  async execute(record: SettlementRecord): Promise<SettlementRecord> {
    if (record.status !== SettlementRecordStatusEnum.PENDING) {
      this.logger.warn(
        `[execute] 跳过非待执行记录 ${record.settlementNo}（status=${record.status}）`
      )
      return record
    }

    const ownerInfo = this.resolveOwnerForTarget(record.targetType, record.targetId)
    if (!ownerInfo) {
      record.status = SettlementRecordStatusEnum.FAILED
      record.errorMsg = `targetType=${record.targetType} targetId 缺失`
      record.updatedAt = new Date()
      return this.recordRepo.save(record)
    }

    try {
      const opResult = await this.accountService.earn(
        ownerInfo.ownerType,
        ownerInfo.ownerId,
        record.settleAmount,
        FlowBizTypeEnum.SETTLEMENT,
        {
          relatedNo: record.settlementNo,
          remark: `订单 ${record.orderNo} 分账（target=${record.targetType}）`,
          opAdminId: null
        }
      )
      record.status = SettlementRecordStatusEnum.EXECUTED
      record.settleAt = new Date()
      record.flowNo = opResult.flow.flowNo
      record.errorMsg = null
      record.updatedAt = new Date()
      const saved = await this.recordRepo.save(record)
      this.logger.log(
        `[execute] OK settlement=${record.settlementNo} order=${record.orderNo} target=${record.targetType} amount=${record.settleAmount}`
      )
      return saved
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      record.status = SettlementRecordStatusEnum.FAILED
      record.errorMsg = msg.slice(0, 255)
      record.updatedAt = new Date()
      const saved = await this.recordRepo.save(record)
      this.logger.error(
        `[execute] FAIL settlement=${record.settlementNo} order=${record.orderNo} target=${record.targetType} err=${msg}`
      )
      return saved
    }
  }

  /* ==========================================================================
   * 二·B、reverseForOrder —— 退款成功后反向分账（P9 Sprint 3 / W3.B.1）
   * ========================================================================== */

  /**
   * 反向分账：RefundSucceed 事件触发时调用
   *
   * 业务语义：
   *   - 已正向分账（status=EXECUTED）的 settlement_record 必须把对应资金从
   *     商户 / 骑手 / 平台账户回收，落 OUT 流水（biz_type=REFUND_REVERSE）
   *   - 反向后该 record 状态置为 REVERSED（已撤销）
   *
   * 入参：
   *   - orderNo       原订单号
   *   - refundAmount  退款金额（保留参数；当前实现按 record 全额反向，未来可扩展按比例反向）
   *
   * 返回值：{ reversed: 成功反向数, failed: 反向失败数 }
   *
   * 行为：
   *   1) 查 status=EXECUTED 的所有 active settlement_record
   *   2) 逐条：accountService.refund(targetOwner, settle_amount, REFUND_REVERSE) +
   *      UPDATE settlement_record SET status=REVERSED + 记录反向 flow_no
   *   3) 部分失败：不抛错，记 logger.error，继续后续；最终汇总 reversed/failed
   *
   * 注意：
   *   - 全程 BigNumber，不使用 number 算金额
   *   - account.refund 内部走 spend 失败时会抛（balance 不足等），单条失败不影响其他
   */
  async reverseForOrder(
    orderNo: string,
    refundAmount: string
  ): Promise<{ reversed: number; failed: number }> {
    /* refundAmount 当前未按比例切分使用：保留入参以便将来扩展（部分退款 → 部分反向）
       BigNumber 对完全非数字字符串会抛异常，因此用 try/catch 包裹 */
    let refundAmtValid = false
    try {
      const refundAmt = new BigNumber(refundAmount)
      refundAmtValid = !refundAmt.isNaN() && refundAmt.isFinite() && refundAmt.gt(0)
    } catch {
      refundAmtValid = false
    }
    if (!refundAmtValid) {
      this.logger.warn(
        `[reverseForOrder] refundAmount 非法 order=${orderNo} amount=${refundAmount}`
      )
      return { reversed: 0, failed: 0 }
    }

    const records = await this.recordRepo.find({
      where: {
        orderNo,
        status: SettlementRecordStatusEnum.EXECUTED,
        isDeleted: 0
      }
    })

    if (records.length === 0) {
      this.logger.log(`[reverseForOrder] 无需反向 order=${orderNo}（无 EXECUTED 记录）`)
      return { reversed: 0, failed: 0 }
    }

    let reversed = 0
    let failed = 0

    for (const record of records) {
      try {
        const ownerInfo = this.resolveOwnerForTarget(record.targetType, record.targetId)
        if (!ownerInfo) {
          this.logger.error(
            `[reverseForOrder] 解析 owner 失败 settlement=${record.settlementNo} target=${record.targetType}/${record.targetId}`
          )
          failed += 1
          continue
        }

        /* 反向金额：BigNumber 复用 record.settleAmount（已 .toFixed(2)） */
        const reverseAmount = new BigNumber(record.settleAmount).toFixed(2)

        const opResult = await this.accountService.refund(
          ownerInfo.ownerType,
          ownerInfo.ownerId,
          reverseAmount,
          FlowBizTypeEnum.REFUND_REVERSE,
          {
            relatedNo: record.settlementNo,
            remark: `订单 ${orderNo} 退款反向分账（target=${record.targetType}）`,
            opAdminId: null
          }
        )

        record.status = SettlementRecordStatusEnum.REVERSED
        record.errorMsg = `REFUND_REVERSE flow=${opResult.flow.flowNo}`.slice(0, 255)
        record.updatedAt = new Date()
        await this.recordRepo.save(record)

        reversed += 1
        this.logger.log(
          `[reverseForOrder] OK settlement=${record.settlementNo} order=${orderNo} target=${record.targetType} amount=${reverseAmount} flow=${opResult.flow.flowNo}`
        )
      } catch (err) {
        failed += 1
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.error(
          `[reverseForOrder] FAIL settlement=${record.settlementNo} order=${orderNo} target=${record.targetType} err=${msg}`
        )
        /* 失败不阻断后续，继续下一条 */
      }
    }

    this.logger.log(
      `[reverseForOrder] DONE order=${orderNo} total=${records.length} reversed=${reversed} failed=${failed}`
    )
    return { reversed, failed }
  }

  /**
   * 单订单"算 + 立即执行"完整闭环（cron + admin run-once 复用）
   *
   * 步骤：
   *   1. computeForOrder → 拿到 records[]
   *   2. for each record: execute(record)
   *   3. 汇总 created / executed / failed / skipped
   */
  async runForOrder(input: SettlementInput): Promise<RunForOrderResult> {
    const compute = await this.computeForOrder(input)
    let executed = 0
    let failed = 0
    for (const r of compute.records) {
      const res = await this.execute(r)
      if (res.status === SettlementRecordStatusEnum.EXECUTED) executed += 1
      else if (res.status === SettlementRecordStatusEnum.FAILED) failed += 1
    }
    return {
      orderNo: input.orderNo,
      created: compute.records.length,
      executed,
      failed,
      skipped: compute.skippedReasons.length
    }
  }

  /* ==========================================================================
   * 三、订单扫描（被 cron 调用）
   * ========================================================================== */

  /**
   * 扫描"昨天 finished_at"的所有订单（外卖 + 跑腿）→ 分页 SettlementInput[]
   *
   * 入参：targetDay yyyyMMdd 字符串 / 或 Date 实例（推荐：Date）
   *       本函数取该日 00:00:00 ~ 次日 00:00:00 的订单
   * 返回：跨月订单数组（finished_at 在 today 0 点 ~ tomorrow 0 点）
   *
   * 注：order_takeout / order_errand 是按 created_at 月份分表；
   *     finished_at 可能跨月（订单在月末下单、次月初完成）。
   *     为简化本期实现：我们按 finished_at 月份反向枚举近 60 天分表（覆盖最大跨月场景）。
   *     单批最多 500 条；上层循环调用直到耗尽。
   */
  async listFinishedOrdersOf(targetDay: Date, offset = 0): Promise<SettlementInput[]> {
    const beginAt = this.toDayStart(targetDay)
    const endAt = new Date(beginAt.getTime() + 24 * 3600 * 1000)

    /* 跨月扫描：finished_at 可能跨过 created_at 所在月份；
       业务约定订单生命周期不会超过 60 天 → 取 [beginAt-60d, endAt] 月份范围 */
    const fromCreated = new Date(beginAt.getTime() - 60 * 24 * 3600 * 1000)
    const takeoutTables = OrderShardingHelper.tableNamesBetween('order_takeout', fromCreated, endAt)
    const errandTables = OrderShardingHelper.tableNamesBetween('order_errand', fromCreated, endAt)

    const takeoutInputs = await this.scanTakeoutOrders(takeoutTables, beginAt, endAt, offset)
    const errandInputs = await this.scanErrandOrders(errandTables, beginAt, endAt, offset)
    return [...takeoutInputs, ...errandInputs]
  }

  /**
   * 扫外卖分表：finished_at 在 [beginAt, endAt) 且 status=55 已完成
   * 跨表 UNION ALL，单批 500 条
   */
  private async scanTakeoutOrders(
    tables: string[],
    beginAt: Date,
    endAt: Date,
    offset: number
  ): Promise<SettlementInput[]> {
    if (tables.length === 0) return []
    const existingTables = await this.filterExistingTables(tables)
    if (existingTables.length === 0) return []

    const unionSql = existingTables
      .map(
        (t) => `
        SELECT order_no, shop_id, merchant_id, rider_id, pay_amount, finished_at, shop_snapshot
        FROM ${t}
        WHERE status = ${OrderTakeoutStatusEnum.FINISHED}
          AND finished_at >= ? AND finished_at < ?
          AND is_deleted = 0
      `
      )
      .join(' UNION ALL ')
    const sql = `${unionSql} ORDER BY finished_at ASC LIMIT ? OFFSET ?`
    /* 每张表 2 个 ?；末尾 LIMIT/OFFSET 2 个 ? */
    const params: unknown[] = []
    for (let i = 0; i < existingTables.length; i++) {
      params.push(beginAt, endAt)
    }
    params.push(ORDER_SCAN_PAGE_SIZE, offset)

    const rows = await this.dataSource.query<
      Array<{
        order_no: string
        shop_id: string
        merchant_id: string
        rider_id: string | null
        pay_amount: string
        finished_at: Date
        shop_snapshot: { cityCode?: string } | string | null
      }>
    >(sql, params)

    return rows.map((r) => {
      const snapshot = this.parseJson<{ cityCode?: string }>(r.shop_snapshot)
      return {
        orderNo: r.order_no,
        orderType: OrderTypeEnum.TAKEOUT as OrderType,
        merchantId: r.merchant_id,
        riderId: r.rider_id,
        shopId: r.shop_id,
        cityCode: snapshot?.cityCode ?? null,
        payAmount: r.pay_amount,
        finishedAt: r.finished_at
      }
    })
  }

  /**
   * 扫跑腿分表
   */
  private async scanErrandOrders(
    tables: string[],
    beginAt: Date,
    endAt: Date,
    offset: number
  ): Promise<SettlementInput[]> {
    if (tables.length === 0) return []
    const existingTables = await this.filterExistingTables(tables)
    if (existingTables.length === 0) return []

    const unionSql = existingTables
      .map(
        (t) => `
        SELECT order_no, rider_id, pay_amount, finished_at, pickup_snapshot, delivery_snapshot
        FROM ${t}
        WHERE status = ${OrderErrandStatusEnum.FINISHED}
          AND finished_at >= ? AND finished_at < ?
          AND is_deleted = 0
      `
      )
      .join(' UNION ALL ')
    const sql = `${unionSql} ORDER BY finished_at ASC LIMIT ? OFFSET ?`
    const params: unknown[] = []
    for (let i = 0; i < existingTables.length; i++) {
      params.push(beginAt, endAt)
    }
    params.push(ORDER_SCAN_PAGE_SIZE, offset)

    const rows = await this.dataSource.query<
      Array<{
        order_no: string
        rider_id: string | null
        pay_amount: string
        finished_at: Date
        pickup_snapshot: { cityCode?: string } | string | null
        delivery_snapshot: { cityCode?: string } | string | null
      }>
    >(sql, params)

    return rows.map((r) => {
      const pickup = this.parseJson<{ cityCode?: string }>(r.pickup_snapshot)
      const delivery = this.parseJson<{ cityCode?: string }>(r.delivery_snapshot)
      return {
        orderNo: r.order_no,
        orderType: OrderTypeEnum.ERRAND as OrderType,
        merchantId: null,
        riderId: r.rider_id,
        shopId: null,
        cityCode: pickup?.cityCode ?? delivery?.cityCode ?? null,
        payAmount: r.pay_amount,
        finishedAt: r.finished_at
      }
    })
  }

  /**
   * 过滤数据库中实际存在的物理表（避免 1146 Table doesn't exist）
   */
  private async filterExistingTables(tables: string[]): Promise<string[]> {
    if (tables.length === 0) return []
    const rows = await this.dataSource.query<Array<{ TABLE_NAME: string }>>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => '?').join(',')})`,
      tables
    )
    const existing = new Set(rows.map((r) => r.TABLE_NAME))
    return tables.filter((t) => existing.has(t))
  }

  /* ==========================================================================
   * 四、查询 API（管理端工作台）
   * ========================================================================== */

  /**
   * 分账记录分页查询（管理端 GET /admin/settlement-records）
   */
  async list(query: QuerySettlementRecordDto): Promise<PageResult<SettlementRecordVo>> {
    const qb = this.recordRepo.createQueryBuilder('r').where('r.is_deleted = 0')
    if (query.orderNo) qb.andWhere('r.order_no = :no', { no: query.orderNo })
    if (query.orderType !== undefined) qb.andWhere('r.order_type = :ot', { ot: query.orderType })
    if (query.targetType !== undefined) qb.andWhere('r.target_type = :tt', { tt: query.targetType })
    if (query.targetId) qb.andWhere('r.target_id = :ti', { ti: query.targetId })
    if (query.status !== undefined) qb.andWhere('r.status = :s', { s: query.status })
    qb.orderBy('r.created_at', 'DESC')
      .addOrderBy('r.id', 'DESC')
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
   * Entity → VO
   */
  toVo(record: SettlementRecord): SettlementRecordVo {
    return {
      id: record.id,
      settlementNo: record.settlementNo,
      orderNo: record.orderNo,
      orderType: record.orderType,
      targetType: record.targetType as SettlementTargetType,
      targetId: record.targetId,
      ruleId: record.ruleId,
      baseAmount: record.baseAmount,
      rate: record.rate,
      fixedFee: record.fixedFee,
      settleAmount: record.settleAmount,
      status: record.status as SettleStatus,
      settleAt: record.settleAt,
      flowNo: record.flowNo,
      errorMsg: record.errorMsg,
      createdAt: record.createdAt
    }
  }

  /* ==========================================================================
   * 五、内部工具
   * ========================================================================== */

  /**
   * 拼装 settlement_record 实体（不入库）
   */
  private buildRecord(input: {
    orderNo: string
    orderType: OrderType
    targetType: SettlementTargetType
    targetId: string | null
    rule: SettlementRule
    baseAmount: BigNumber
    settleAmount: BigNumber
    now: Date
  }): SettlementRecord {
    return this.recordRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      settlementNo: generateBizNo('S'),
      orderNo: input.orderNo,
      orderType: input.orderType,
      targetType: input.targetType,
      targetId: input.targetId,
      ruleId: input.rule.id,
      baseAmount: input.baseAmount.toFixed(2),
      rate: input.rule.rate,
      fixedFee: input.rule.fixedFee,
      settleAmount: input.settleAmount.toFixed(2),
      status: SettlementRecordStatusEnum.PENDING,
      settleAt: null,
      flowNo: null,
      errorMsg: null,
      isDeleted: 0,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null
    })
  }

  /**
   * 计算分账金额：clamp(base*rate + fixed, [min, max])
   * - 同时夹到 [0, base]，避免负值或超过订单金额
   */
  private computeAmount(base: BigNumber, rule: SettlementRule): BigNumber {
    const rate = new BigNumber(rule.rate)
    const fixed = new BigNumber(rule.fixedFee)
    let amount = base.multipliedBy(rate).plus(fixed)
    /* 钳制 min / max */
    if (rule.minFee) {
      const min = new BigNumber(rule.minFee)
      if (amount.lt(min)) amount = min
    }
    if (rule.maxFee) {
      const max = new BigNumber(rule.maxFee)
      if (amount.gt(max)) amount = max
    }
    /* 防御：不超过 base，不小于 0 */
    if (amount.gt(base)) amount = base
    if (amount.lt(0)) amount = new BigNumber(0)
    return amount.decimalPlaces(2, BigNumber.ROUND_HALF_UP)
  }

  /**
   * 解析 target → 入账账户主体
   * - 1 商户 → ownerType=2 / ownerId=targetId
   * - 2 骑手 → ownerType=3 / ownerId=targetId
   * - 3 平台 → ownerType=3 / ownerId=PLATFORM_OWNER_ID
   */
  private resolveOwnerForTarget(
    targetType: number,
    targetId: string | null
  ): { ownerType: AccountOwnerType; ownerId: string } | null {
    if (targetType === SettlementTargetTypeEnum.PLATFORM) {
      return { ownerType: AccountOwnerTypeEnum.RIDER, ownerId: PLATFORM_OWNER_ID }
    }
    if (!targetId) return null
    if (targetType === SettlementTargetTypeEnum.MERCHANT) {
      return { ownerType: AccountOwnerTypeEnum.MERCHANT, ownerId: targetId }
    }
    if (targetType === SettlementTargetTypeEnum.RIDER) {
      return { ownerType: AccountOwnerTypeEnum.RIDER, ownerId: targetId }
    }
    return null
  }

  /**
   * 取某天 00:00:00（Asia/Shanghai 业务时区，依赖 mysql 配置 timezone=+08:00）
   *
   * 注：JS Date 内部以 UTC 存储；不再做 +8 修正，让上层调用方传入业务"日"
   * 即可。本期 cron 在 02:00 触发取昨天，时间偏差容差 ≤ 12 小时不影响业务。
   */
  private toDayStart(d: Date): Date {
    const r = new Date(d.getTime())
    r.setHours(0, 0, 0, 0)
    return r
  }

  /**
   * 安全 JSON 解析（适配 mysql2 driver 偶尔返回字符串而非对象的边角场景）
   */
  private parseJson<T>(input: T | string | null): T | null {
    if (input === null || input === undefined) return null
    if (typeof input === 'string') {
      try {
        return JSON.parse(input) as T
      } catch {
        return null
      }
    }
    return input
  }
}
