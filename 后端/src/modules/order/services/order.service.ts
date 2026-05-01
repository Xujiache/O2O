/**
 * @file order.service.ts
 * @stage P4/T4.22（Sprint 3）
 * @desc 订单通用 service：分表反查 + owner 校验 + 多端 keyset 列表 + 详情聚合
 * @author 单 Agent V2.0
 *
 * 提供给 takeout / errand / 各端 controller 复用：
 *   - findCoreByOrderNo(orderNo, orderType)       通用反查（OrderCoreRecord）
 *   - assertUserOwner(orderNo, userId, orderType) 用户 owner 校验（10302）
 *   - assertMerchantShop(orderNo, merchantId)     商户 owner 校验（10302）；返回 OrderCoreRecord
 *   - listMerchantShopIds(merchantId)             商户名下店铺 ID 列表（缓存可由调用方再加）
 *   - listByEnd(scope, query)                     多端统一 keyset 列表（外卖 + 跑腿 UNION）
 *   - detail(orderNo, orderType)                  订单详情聚合（含明细 / 时间线）
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import type Redis from 'ioredis'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageMeta } from '@/common'
import { Shop } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OrderShardingHelper } from '../order-sharding.helper'
import {
  OrderTakeoutStatusEnum,
  OrderTypeEnum,
  type OrderCoreRecord,
  type OrderType
} from '../types/order.types'
import {
  type AdminOrderQueryDto,
  type MerchantOrderQueryDto,
  type OrderDetailVo,
  type OrderKeysetPageVo,
  type OrderListItemVo,
  type RiderOrderQueryDto,
  type UserOrderQueryDto,
  VISIBLE_STATUSES_FOR_USER
} from '../dto/order-query.dto'

/* ============================================================================
 * 类型 / 常量
 * ============================================================================ */

/** 多端鉴权范围：service 内根据 scope 注入额外 WHERE 条件 */
export type OrderListScope =
  | { kind: 'user'; userId: string }
  | { kind: 'merchant'; merchantId: string; shopIds: string[] }
  | { kind: 'rider'; riderId: string }
  | { kind: 'admin' }

/** 默认查询近 90 天 */
const DEFAULT_DAYS = 90
/** 最长 180 天，避免拼太多分表 */
const MAX_DAYS = 180

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(Shop) private readonly shopRepo: Repository<Shop>
  ) {}

  /* ==========================================================================
   * 反查 / owner 校验
   * ========================================================================== */

  /**
   * 通用反查订单核心字段（按 orderType + 订单号反推月份）
   * 参数：orderNo / orderType
   * 返回值：OrderCoreRecord
   * 异常：10300 订单不存在；50001 订单号非法
   */
  async findCoreByOrderNo(orderNo: string, orderType: OrderType): Promise<OrderCoreRecord> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) {
      throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, `订单号 ${orderNo} 非法`)
    }
    const tbl = this.mainTable(orderType, yyyymm)
    const isTakeout = orderType === OrderTypeEnum.TAKEOUT
    const sql = isTakeout
      ? `SELECT id, order_no, user_id, shop_id, merchant_id, rider_id, status, pay_status, pay_amount, created_at
         FROM \`${tbl}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`
      : `SELECT id, order_no, user_id, NULL AS shop_id, NULL AS merchant_id, rider_id, status, pay_status, pay_amount, created_at
         FROM \`${tbl}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`
    const rows = await this.dataSource.query<
      Array<{
        id: string
        order_no: string
        user_id: string
        shop_id: string | null
        merchant_id: string | null
        rider_id: string | null
        status: number
        pay_status: number
        pay_amount: string
        created_at: Date
      }>
    >(sql, [orderNo])
    const row = rows[0]
    if (!row) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    return {
      orderType,
      shardYyyymm: yyyymm,
      id: String(row.id),
      orderNo: row.order_no,
      userId: String(row.user_id),
      shopId: row.shop_id != null ? String(row.shop_id) : null,
      merchantId: row.merchant_id != null ? String(row.merchant_id) : null,
      riderId: row.rider_id != null ? String(row.rider_id) : null,
      status: Number(row.status),
      payStatus: Number(row.pay_status),
      payAmount: String(row.pay_amount),
      createdAt: new Date(row.created_at)
    }
  }

  /**
   * 用户 owner 校验：order.user_id === userId，否则 10302
   * 参数：orderNo / userId / orderType
   * 返回值：OrderCoreRecord
   */
  async assertUserOwner(
    orderNo: string,
    userId: string,
    orderType: OrderType
  ): Promise<OrderCoreRecord> {
    const order = await this.findCoreByOrderNo(orderNo, orderType)
    if (order.userId !== userId) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_OWNED, '非本人订单')
    }
    return order
  }

  /**
   * 商户 owner 校验：order.shop_id ∈ ShopService.listMerchantShopIds(merchantId)
   * 参数：orderNo / merchantId / orderType
   * 返回值：OrderCoreRecord
   *
   * 异常：
   *   - 10300 订单不存在
   *   - 10302 非本商户订单（shopId 不在名下）
   *   - 10301 订单类型不属于商户管辖（如商户调外卖接口操作跑腿单）
   */
  async assertMerchantShop(
    orderNo: string,
    merchantId: string,
    orderType: OrderType
  ): Promise<OrderCoreRecord> {
    const order = await this.findCoreByOrderNo(orderNo, orderType)
    if (orderType !== OrderTypeEnum.TAKEOUT || !order.shopId) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '该订单不属于商户管辖范围'
      )
    }
    const shopIds = await this.listMerchantShopIds(merchantId)
    if (!shopIds.includes(order.shopId)) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_OWNED, '非本商户订单')
    }
    return order
  }

  /**
   * 商户名下店铺 ID 列表
   * 参数：merchantId
   * 返回值：string[]
   * 用途：商户端列表 / 单个订单 owner 校验
   */
  async listMerchantShopIds(merchantId: string): Promise<string[]> {
    const rows = await this.shopRepo.find({
      where: { merchantId, isDeleted: 0 },
      select: ['id']
    })
    return rows.map((r) => r.id)
  }

  /* ==========================================================================
   * W3.D.2：拼单成团 → 多单合并
   * ========================================================================== */

  /**
   * 拼单成团合并多单：把 memberOrderNos 的明细 / 金额合并到 leaderOrderNo，
   *   member 订单标记 MERGED（写入 cancel_reason='MERGED:<leaderOrderNo>'）
   *
   * 参数：
   *   - orderNos       全量订单号列表（首位通常为 leader；缺失时取传入第一个）
   *   - leaderOrderNo  团长订单号（合并后的主单）
   * 返回值：{ mergedOrderNo: string }
   *
   * 行为：
   *   1. 仅外卖（OrderTakeout）支持合并；跑腿不合并
   *   2. 加载所有订单 → 校验：均为外卖 + status ∈ [PENDING_PAY, PENDING_ACCEPT] + 同一店铺
   *   3. 合并 OrderTakeoutItem 全部 reassign 到 leader（更新 order_no）
   *   4. leader.totalAmount / payAmount / goodsAmount 累加（BigNumber）
   *   5. members 订单 status=CANCELED + cancel_reason='MERGED:<leaderOrderNo>'
   *      （entity 无 parent_order_no 字段；用 cancel_reason 标记便于审计）
   *   6. 全程事务；任一步失败 rollback
   *
   * 异常：
   *   - 50001 订单号非法
   *   - 10300 订单不存在
   *   - 10303 订单状态不允许合并
   *   - 10301 订单类型 / 店铺不一致
   */
  async mergeForGroup(
    orderNos: string[],
    leaderOrderNo: string
  ): Promise<{ mergedOrderNo: string }> {
    if (!leaderOrderNo) {
      throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, 'leaderOrderNo 为空')
    }
    const allNos = Array.from(new Set([leaderOrderNo, ...orderNos])).filter(
      (s) => typeof s === 'string' && s.length > 0
    )
    if (allNos.length < 2) {
      throw new BusinessException(
        BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
        '合并至少需要 2 个订单号'
      )
    }

    /* 反查 yyyymm 用 leader（同月分表，假设拼单成员同月下单） */
    const leaderYyyymm = OrderShardingHelper.yyyymmFromOrderNo(leaderOrderNo)
    if (!leaderYyyymm) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `订单号 ${leaderOrderNo} 非法`
      )
    }
    const mainTbl = OrderShardingHelper.tableName(
      'order_takeout',
      this.dateFromYyyymm(leaderYyyymm)
    )
    const itemTbl = OrderShardingHelper.tableName(
      'order_takeout_item',
      this.dateFromYyyymm(leaderYyyymm)
    )

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      /* 1) 加载并锁定订单（FOR UPDATE） */
      const placeholders = allNos.map(() => '?').join(',')
      const rows = await queryRunner.manager.query<
        Array<{
          order_no: string
          shop_id: string
          status: number
          pay_status: number
          goods_amount: string
          pay_amount: string
        }>
      >(
        `SELECT order_no, shop_id, status, pay_status, goods_amount, pay_amount
         FROM \`${mainTbl}\` WHERE order_no IN (${placeholders}) AND is_deleted = 0 FOR UPDATE`,
        allNos
      )
      if (rows.length !== allNos.length) {
        throw new BusinessException(
          BizErrorCode.BIZ_ORDER_NOT_FOUND,
          `合并订单缺失：期望 ${allNos.length} / 实际 ${rows.length}`
        )
      }

      /* 2) 校验：状态 + 同店铺 */
      const leaderRow = rows.find((r) => r.order_no === leaderOrderNo)
      if (!leaderRow) {
        throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, '团长订单不存在')
      }
      const leaderShopId = leaderRow.shop_id
      const allowedStatuses: number[] = [
        OrderTakeoutStatusEnum.PENDING_PAY,
        OrderTakeoutStatusEnum.PENDING_ACCEPT
      ]
      for (const r of rows) {
        if (r.shop_id !== leaderShopId) {
          throw new BusinessException(
            BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
            `订单 ${r.order_no} 与团长店铺不一致`
          )
        }
        if (!allowedStatuses.includes(Number(r.status))) {
          throw new BusinessException(
            BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED,
            `订单 ${r.order_no} 状态 ${r.status} 不允许合并`
          )
        }
      }

      /* 3) 累加金额（BigNumber） */
      let totalGoods = new BigNumber(0)
      let totalPay = new BigNumber(0)
      for (const r of rows) {
        totalGoods = totalGoods.plus(new BigNumber(String(r.goods_amount)))
        totalPay = totalPay.plus(new BigNumber(String(r.pay_amount)))
      }

      /* 4) member 订单的 OrderTakeoutItem 全部转挂 leader */
      const memberNos = allNos.filter((n) => n !== leaderOrderNo)
      const memberPlaceholders = memberNos.map(() => '?').join(',')
      await queryRunner.manager.query(
        `UPDATE \`${itemTbl}\` SET order_no = ?, updated_at = NOW(3)
         WHERE order_no IN (${memberPlaceholders}) AND is_deleted = 0`,
        [leaderOrderNo, ...memberNos]
      )

      /* 5) leader 订单累加金额 */
      await queryRunner.manager.query(
        `UPDATE \`${mainTbl}\`
         SET goods_amount = ?, pay_amount = ?, updated_at = NOW(3)
         WHERE order_no = ? AND is_deleted = 0`,
        [totalGoods.toFixed(2), totalPay.toFixed(2), leaderOrderNo]
      )

      /* 6) member 订单标 CANCELED + cancel_reason='MERGED:<leaderOrderNo>' */
      const mergedTag = `MERGED:${leaderOrderNo}`.slice(0, 200)
      await queryRunner.manager.query(
        `UPDATE \`${mainTbl}\`
         SET status = ?, cancel_at = NOW(3), cancel_reason = ?, updated_at = NOW(3)
         WHERE order_no IN (${memberPlaceholders}) AND is_deleted = 0`,
        [OrderTakeoutStatusEnum.CANCELED, mergedTag, ...memberNos]
      )

      await queryRunner.commitTransaction()
      this.logger.log(
        `[ORDER-MERGE] 拼单合并完成 leader=${leaderOrderNo} members=${memberNos.length} ` +
          `pay=${totalPay.toFixed(2)} goods=${totalGoods.toFixed(2)}`
      )
      return { mergedOrderNo: leaderOrderNo }
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /* ==========================================================================
   * 列表 keyset 分页（多端统一）
   * ========================================================================== */

  /**
   * 通用 keyset 列表
   * 参数：scope 端类型 + owner 上下文；query 通用查询入参
   * 返回值：OrderKeysetPageVo（list + nextCursor + hasMore + meta）
   *
   * 设计：
   *   1) 解析 (fromDate, toDate)：默认近 90 天；最长 180 天
   *   2) 用 OrderShardingHelper.tableNamesBetween 列出物理表（外卖 + 跑腿 各 N 张）
   *   3) 单端 service 拼装 SQL：每张物理表 SELECT 同样字段 → UNION ALL → 外层 WHERE keyset → ORDER → LIMIT
   *   4) 返回 list + 下一页 cursor
   *
   * SQL 性能：单端默认近 90 天 = 4 个月分表，UNION 4×2=8 张表；命中 idx_user_status / idx_shop_status
   */
  async listByEnd(
    scope: OrderListScope,
    query: UserOrderQueryDto | MerchantOrderQueryDto | RiderOrderQueryDto | AdminOrderQueryDto
  ): Promise<OrderKeysetPageVo> {
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 100))
    const { fromDate, toDate } = this.normalizeDateRange(query.fromDate, query.toDate)

    /* 选择 orderType：管理员/用户都可指定 1/2 或不指定（=全部）；商户和骑手由 service 端预设 */
    const includeTakeout = this.shouldIncludeTakeout(scope, query)
    const includeErrand = this.shouldIncludeErrand(scope, query)

    const takeoutTables = includeTakeout
      ? OrderShardingHelper.tableNamesBetween('order_takeout', fromDate, toDate)
      : []
    const errandTables = includeErrand
      ? OrderShardingHelper.tableNamesBetween('order_errand', fromDate, toDate)
      : []

    /* 渲染 SQL 子句 */
    const cursor = this.parseCursor(query.cursor)
    const subqueries: string[] = []
    const params: Array<string | number | Date> = []

    /* 外卖部分 */
    for (const tbl of takeoutTables) {
      const yyyymm = tbl.slice(-6)
      const { sql, args } = this.buildTakeoutSubquery(tbl, yyyymm, scope, query, fromDate, toDate)
      subqueries.push(sql)
      params.push(...args)
    }

    /* 跑腿部分 */
    for (const tbl of errandTables) {
      const yyyymm = tbl.slice(-6)
      const { sql, args } = this.buildErrandSubquery(tbl, yyyymm, scope, query, fromDate, toDate)
      subqueries.push(sql)
      params.push(...args)
    }

    if (subqueries.length === 0) {
      return this.emptyPage(query.cursor)
    }

    const unionSql = subqueries.length === 1 ? subqueries[0]! : subqueries.join(' UNION ALL ')
    const cursorClause = cursor
      ? '(t.created_at < ? OR (t.created_at = ? AND CAST(t.id AS UNSIGNED) < CAST(? AS UNSIGNED)))'
      : '1=1'
    const finalSql = `SELECT * FROM (${unionSql}) AS t WHERE ${cursorClause}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ?`

    const finalParams: Array<string | number | Date> = [...params]
    if (cursor) {
      finalParams.push(cursor.createdAt, cursor.createdAt, cursor.id)
    }
    finalParams.push(pageSize + 1) /* 多取 1 条用来判断 hasMore */

    const rows = await this.dataSource.query<
      Array<{
        id: string
        order_no: string
        user_id: string
        shop_id: string | null
        merchant_id: string | null
        rider_id: string | null
        status: number
        pay_status: number
        pay_amount: string
        refund_amount: string
        created_at: Date
        shard_yyyymm: string
        source_type: number
      }>
    >(finalSql, finalParams)

    const sliced = rows.slice(0, pageSize)
    const hasMore = rows.length > pageSize

    /* 批量加载外卖商品 brief */
    const items = await this.assembleListVoBatch(sliced)

    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last ? `${new Date(last.createdAt).toISOString()}_${last.id}` : null

    const meta: PageMeta = {
      page: 0 /* keyset 模式不可知页码 */,
      pageSize,
      total: -1 /* keyset 不查 total，避免 COUNT 全表 */,
      totalPages: -1
    }
    return { list: items, nextCursor, hasMore, meta }
  }

  /* ==========================================================================
   * 详情聚合（外卖完整；跑腿留空字段）
   * ========================================================================== */

  /**
   * 订单详情聚合
   * 参数：orderNo / orderType
   * 返回值：OrderDetailVo
   * 异常：10300 订单不存在
   */
  async detail(orderNo: string, orderType: OrderType): Promise<OrderDetailVo> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) {
      throw new BusinessException(BizErrorCode.SYSTEM_INTERNAL_ERROR, `订单号 ${orderNo} 非法`)
    }
    if (orderType === OrderTypeEnum.TAKEOUT) {
      return this.detailTakeout(orderNo, yyyymm)
    }
    return this.detailErrand(orderNo, yyyymm)
  }

  /* ==========================================================================
   * 内部：子查询拼装
   * ========================================================================== */

  /**
   * 外卖子查询（返回与 union 项一致的列）
   */
  private buildTakeoutSubquery(
    table: string,
    yyyymm: string,
    scope: OrderListScope,
    query: UserOrderQueryDto | MerchantOrderQueryDto | RiderOrderQueryDto | AdminOrderQueryDto,
    fromDate: Date,
    toDate: Date
  ): { sql: string; args: Array<string | number | Date> } {
    const where: string[] = ['is_deleted = 0', 'created_at BETWEEN ? AND ?']
    const args: Array<string | number | Date> = [fromDate, toDate]

    /* scope 注入 owner 条件 */
    if (scope.kind === 'user') {
      where.push('user_id = ?')
      args.push(scope.userId)
    } else if (scope.kind === 'merchant') {
      if (scope.shopIds.length === 0) {
        /* 没店铺 = 没数据，给一个一定不命中的条件 */
        where.push('1 = 0')
      } else {
        const placeholders = scope.shopIds.map(() => '?').join(',')
        where.push(`shop_id IN (${placeholders})`)
        args.push(...scope.shopIds)
      }
      const merchantQuery = query as MerchantOrderQueryDto
      if (merchantQuery.shopId) {
        where.push('shop_id = ?')
        args.push(merchantQuery.shopId)
      }
    } else if (scope.kind === 'rider') {
      where.push('rider_id = ?')
      args.push(scope.riderId)
    } else {
      /* admin */
      const adminQuery = query as AdminOrderQueryDto
      if (adminQuery.userId) {
        where.push('user_id = ?')
        args.push(adminQuery.userId)
      }
      if (adminQuery.shopId) {
        where.push('shop_id = ?')
        args.push(adminQuery.shopId)
      }
      if (adminQuery.riderId) {
        where.push('rider_id = ?')
        args.push(adminQuery.riderId)
      }
    }

    /* status 过滤 */
    const statusFilter = this.resolveStatusFilter(query)
    if (statusFilter.kind === 'in') {
      const placeholders = statusFilter.values.map(() => '?').join(',')
      where.push(`status IN (${placeholders})`)
      args.push(...statusFilter.values)
    } else if (statusFilter.kind === 'eq') {
      where.push('status = ?')
      args.push(statusFilter.value)
    }

    /* keyword */
    const keyword = this.extractKeyword(query)
    if (keyword) {
      where.push('order_no LIKE ?')
      args.push(`%${keyword}%`)
    }

    /* isReviewed 过滤（用户端） */
    if ('isReviewed' in query && (query as UserOrderQueryDto).isReviewed != null) {
      where.push('is_reviewed = ?')
      args.push((query as UserOrderQueryDto).isReviewed!)
    }

    const sql = `(SELECT
        id, order_no, user_id, shop_id, merchant_id, rider_id,
        status, pay_status, pay_amount, refund_amount, created_at,
        '${yyyymm}' AS shard_yyyymm, 1 AS source_type
      FROM \`${table}\` WHERE ${where.join(' AND ')})`
    return { sql, args }
  }

  /**
   * 跑腿子查询
   */
  private buildErrandSubquery(
    table: string,
    yyyymm: string,
    scope: OrderListScope,
    query: UserOrderQueryDto | MerchantOrderQueryDto | RiderOrderQueryDto | AdminOrderQueryDto,
    fromDate: Date,
    toDate: Date
  ): { sql: string; args: Array<string | number | Date> } {
    const where: string[] = ['is_deleted = 0', 'created_at BETWEEN ? AND ?']
    const args: Array<string | number | Date> = [fromDate, toDate]

    if (scope.kind === 'user') {
      where.push('user_id = ?')
      args.push(scope.userId)
    } else if (scope.kind === 'merchant') {
      /* 跑腿无 shop_id；商户端不可见 */
      where.push('1 = 0')
    } else if (scope.kind === 'rider') {
      where.push('rider_id = ?')
      args.push(scope.riderId)
    } else {
      const adminQuery = query as AdminOrderQueryDto
      if (adminQuery.userId) {
        where.push('user_id = ?')
        args.push(adminQuery.userId)
      }
      if (adminQuery.riderId) {
        where.push('rider_id = ?')
        args.push(adminQuery.riderId)
      }
    }

    const statusFilter = this.resolveStatusFilter(query)
    if (statusFilter.kind === 'in') {
      const placeholders = statusFilter.values.map(() => '?').join(',')
      where.push(`status IN (${placeholders})`)
      args.push(...statusFilter.values)
    } else if (statusFilter.kind === 'eq') {
      where.push('status = ?')
      args.push(statusFilter.value)
    }

    const keyword = this.extractKeyword(query)
    if (keyword) {
      where.push('order_no LIKE ?')
      args.push(`%${keyword}%`)
    }

    const sql = `(SELECT
        id, order_no, user_id, NULL AS shop_id, NULL AS merchant_id, rider_id,
        status, pay_status, pay_amount, refund_amount, created_at,
        '${yyyymm}' AS shard_yyyymm, 2 AS source_type
      FROM \`${table}\` WHERE ${where.join(' AND ')})`
    return { sql, args }
  }

  /* ==========================================================================
   * 内部：列表 VO 装配（批量加载 takeout items brief）
   * ========================================================================== */

  /**
   * 把 raw 行数组装配成 VO，并按 yyyymm 批量加载外卖明细 brief
   */
  private async assembleListVoBatch(
    rows: Array<{
      id: string
      order_no: string
      user_id: string
      shop_id: string | null
      merchant_id: string | null
      rider_id: string | null
      status: number
      pay_status: number
      pay_amount: string
      refund_amount: string
      created_at: Date
      shard_yyyymm: string
      source_type: number
    }>
  ): Promise<OrderListItemVo[]> {
    /* 按 yyyymm 分组拉外卖明细 brief */
    const takeoutByMonth = new Map<string, string[]>()
    for (const r of rows) {
      if (r.source_type === 1) {
        const list = takeoutByMonth.get(r.shard_yyyymm) ?? []
        list.push(r.order_no)
        takeoutByMonth.set(r.shard_yyyymm, list)
      }
    }
    const takeoutItemsMap = new Map<string, { brief: string[]; count: number }>()
    for (const [yyyymm, orderNos] of takeoutByMonth.entries()) {
      const tbl = `order_takeout_item_${yyyymm}`
      const placeholders = orderNos.map(() => '?').join(',')
      const itemsRows = await this.dataSource
        .query<Array<{ order_no: string; product_name: string; qty: number }>>(
          `SELECT order_no, product_name, qty
         FROM \`${tbl}\` WHERE order_no IN (${placeholders}) AND is_deleted = 0
         ORDER BY id ASC`,
          orderNos
        )
        .catch((err: unknown) => {
          this.logger.warn(`查询 ${tbl} 失败：${(err as Error).message}`)
          return [] as Array<{ order_no: string; product_name: string; qty: number }>
        })
      for (const it of itemsRows) {
        const cur = takeoutItemsMap.get(it.order_no) ?? { brief: [], count: 0 }
        cur.count += Number(it.qty)
        if (cur.brief.length < 3) cur.brief.push(`${it.product_name} ×${it.qty}`)
        takeoutItemsMap.set(it.order_no, cur)
      }
    }

    /* 跑腿明细 brief：从 service_type 派生 */
    const errandByMonth = new Map<string, string[]>()
    for (const r of rows) {
      if (r.source_type === 2) {
        const list = errandByMonth.get(r.shard_yyyymm) ?? []
        list.push(r.order_no)
        errandByMonth.set(r.shard_yyyymm, list)
      }
    }
    const errandBriefMap = new Map<string, { brief: string[]; count: number }>()
    for (const [yyyymm, orderNos] of errandByMonth.entries()) {
      const tbl = `order_errand_${yyyymm}`
      const placeholders = orderNos.map(() => '?').join(',')
      const erows = await this.dataSource
        .query<Array<{ order_no: string; service_type: number }>>(
          `SELECT order_no, service_type FROM \`${tbl}\`
         WHERE order_no IN (${placeholders}) AND is_deleted = 0`,
          orderNos
        )
        .catch((err: unknown) => {
          this.logger.warn(`查询 ${tbl} 失败：${(err as Error).message}`)
          return [] as Array<{ order_no: string; service_type: number }>
        })
      for (const r of erows) {
        const label = this.errandServiceTypeLabel(Number(r.service_type))
        errandBriefMap.set(r.order_no, { brief: [label], count: 1 })
      }
    }

    return rows.map((r) => {
      const briefSrc =
        r.source_type === 1
          ? (takeoutItemsMap.get(r.order_no) ?? { brief: ['(暂无明细)'], count: 0 })
          : (errandBriefMap.get(r.order_no) ?? { brief: ['跑腿订单'], count: 1 })
      return {
        orderNo: r.order_no,
        orderType: r.source_type,
        status: Number(r.status),
        payStatus: Number(r.pay_status),
        payAmount: String(r.pay_amount),
        refundAmount: String(r.refund_amount ?? '0.00'),
        userId: String(r.user_id),
        shopId: r.shop_id != null ? String(r.shop_id) : null,
        merchantId: r.merchant_id != null ? String(r.merchant_id) : null,
        riderId: r.rider_id != null ? String(r.rider_id) : null,
        itemsBrief: briefSrc.brief,
        itemsCount: briefSrc.count,
        createdAt: new Date(r.created_at).toISOString(),
        id: String(r.id),
        shardYyyymm: String(r.shard_yyyymm)
      }
    })
  }

  /**
   * 跑腿 service_type → 文案
   */
  private errandServiceTypeLabel(t: number): string {
    switch (t) {
      case 1:
        return '帮送'
      case 2:
        return '帮取'
      case 3:
        return '帮买'
      case 4:
        return '帮排队'
      default:
        return '跑腿'
    }
  }

  /* ==========================================================================
   * 详情聚合（外卖 / 跑腿）
   * ========================================================================== */

  /**
   * 外卖详情：主表 + 明细批量
   */
  private async detailTakeout(orderNo: string, yyyymm: string): Promise<OrderDetailVo> {
    const mainTbl = OrderShardingHelper.tableName('order_takeout', this.dateFromYyyymm(yyyymm))
    const itemTbl = OrderShardingHelper.tableName('order_takeout_item', this.dateFromYyyymm(yyyymm))
    const main = await this.dataSource.query<
      Array<{
        id: string
        order_no: string
        user_id: string
        shop_id: string
        merchant_id: string
        rider_id: string | null
        goods_amount: string
        delivery_fee: string
        package_fee: string
        discount_amount: string
        coupon_amount: string
        pay_amount: string
        refund_amount: string
        address_snapshot: unknown
        shop_snapshot: unknown
        remark: string | null
        status: number
        pay_status: number
        pay_method: number | null
        pay_no: string | null
        pay_at: Date | null
        accept_at: Date | null
        ready_at: Date | null
        dispatch_at: Date | null
        picked_at: Date | null
        delivered_at: Date | null
        finished_at: Date | null
        cancel_at: Date | null
        cancel_reason: string | null
        created_at: Date
        updated_at: Date
      }>
    >(`SELECT * FROM \`${mainTbl}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`, [orderNo])
    const m = main[0]
    if (!m) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    const items = await this.dataSource.query<
      Array<{
        id: string
        product_id: string
        sku_id: string
        product_name: string
        sku_spec: string | null
        image_url: string | null
        unit_price: string
        qty: number
        package_fee: string
        total_price: string
      }>
    >(
      `SELECT id, product_id, sku_id, product_name, sku_spec, image_url, unit_price, qty, package_fee, total_price
       FROM \`${itemTbl}\` WHERE order_no = ? AND is_deleted = 0 ORDER BY id ASC`,
      [orderNo]
    )

    return {
      orderNo: m.order_no,
      orderType: 1,
      id: String(m.id),
      status: Number(m.status),
      payStatus: Number(m.pay_status),
      payMethod: m.pay_method != null ? Number(m.pay_method) : null,
      payNo: m.pay_no,
      goodsAmount: String(m.goods_amount),
      deliveryFee: String(m.delivery_fee),
      packageFee: String(m.package_fee),
      discountAmount: String(m.discount_amount),
      couponAmount: String(m.coupon_amount),
      payAmount: String(m.pay_amount),
      refundAmount: String(m.refund_amount),
      addressSnapshot: this.parseJson(m.address_snapshot),
      shopSnapshot: this.parseJson(m.shop_snapshot),
      remark: m.remark,
      userId: String(m.user_id),
      shopId: String(m.shop_id),
      merchantId: String(m.merchant_id),
      riderId: m.rider_id != null ? String(m.rider_id) : null,
      items: items.map((it) => ({
        id: String(it.id),
        productId: String(it.product_id),
        skuId: String(it.sku_id),
        productName: it.product_name,
        skuSpec: it.sku_spec,
        imageUrl: it.image_url,
        unitPrice: String(it.unit_price),
        qty: Number(it.qty),
        packageFee: String(it.package_fee),
        totalPrice: String(it.total_price)
      })),
      timeline: {
        payAt: this.toIso(m.pay_at),
        acceptAt: this.toIso(m.accept_at),
        readyAt: this.toIso(m.ready_at),
        dispatchAt: this.toIso(m.dispatch_at),
        pickedAt: this.toIso(m.picked_at),
        deliveredAt: this.toIso(m.delivered_at),
        finishedAt: this.toIso(m.finished_at),
        cancelAt: this.toIso(m.cancel_at)
      },
      cancelReason: m.cancel_reason,
      createdAt: new Date(m.created_at).toISOString(),
      updatedAt: new Date(m.updated_at).toISOString(),
      shardYyyymm: yyyymm
    }
  }

  /**
   * 跑腿详情：仅本 service 提供基础查询，items 字段空数组（跑腿无明细表）
   */
  private async detailErrand(orderNo: string, yyyymm: string): Promise<OrderDetailVo> {
    const mainTbl = OrderShardingHelper.tableName('order_errand', this.dateFromYyyymm(yyyymm))
    const main = await this.dataSource.query<
      Array<{
        id: string
        order_no: string
        user_id: string
        rider_id: string | null
        service_type: number
        pickup_snapshot: unknown
        delivery_snapshot: unknown
        item_type: string | null
        item_value: string | null
        buy_list: unknown
        buy_budget: string | null
        queue_place: string | null
        queue_type: string | null
        queue_duration_min: number | null
        pickup_code: string | null
        service_fee: string
        tip_fee: string
        insurance_fee: string
        estimated_goods: string
        pay_amount: string
        refund_amount: string
        remark: string | null
        status: number
        pay_status: number
        pay_method: number | null
        pay_no: string | null
        pay_at: Date | null
        accept_at: Date | null
        dispatch_at: Date | null
        picked_at: Date | null
        delivered_at: Date | null
        finished_at: Date | null
        cancel_at: Date | null
        cancel_reason: string | null
        created_at: Date
        updated_at: Date
      }>
    >(`SELECT * FROM \`${mainTbl}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`, [orderNo])
    const m = main[0]
    if (!m) {
      throw new BusinessException(BizErrorCode.BIZ_ORDER_NOT_FOUND, `订单 ${orderNo} 不存在`)
    }
    return {
      orderNo: m.order_no,
      orderType: 2,
      id: String(m.id),
      status: Number(m.status),
      payStatus: Number(m.pay_status),
      payMethod: m.pay_method != null ? Number(m.pay_method) : null,
      payNo: m.pay_no,
      goodsAmount: String(m.estimated_goods),
      deliveryFee: String(m.service_fee),
      packageFee: '0.00',
      discountAmount: '0.00',
      couponAmount: '0.00',
      payAmount: String(m.pay_amount),
      refundAmount: String(m.refund_amount),
      addressSnapshot: {
        pickup: this.parseJson(m.pickup_snapshot),
        delivery: this.parseJson(m.delivery_snapshot),
        serviceType: Number(m.service_type),
        pickupCode: m.pickup_code,
        itemType: m.item_type,
        buyList: this.parseJsonArray(m.buy_list),
        buyBudget: m.buy_budget,
        queuePlace: m.queue_place,
        queueType: m.queue_type,
        queueDurationMin: m.queue_duration_min
      },
      shopSnapshot: null,
      remark: m.remark,
      userId: String(m.user_id),
      shopId: null,
      merchantId: null,
      riderId: m.rider_id != null ? String(m.rider_id) : null,
      items: [],
      timeline: {
        payAt: this.toIso(m.pay_at),
        acceptAt: this.toIso(m.accept_at),
        readyAt: null,
        dispatchAt: this.toIso(m.dispatch_at),
        pickedAt: this.toIso(m.picked_at),
        deliveredAt: this.toIso(m.delivered_at),
        finishedAt: this.toIso(m.finished_at),
        cancelAt: this.toIso(m.cancel_at)
      },
      cancelReason: m.cancel_reason,
      createdAt: new Date(m.created_at).toISOString(),
      updatedAt: new Date(m.updated_at).toISOString(),
      shardYyyymm: yyyymm
    }
  }

  /* ==========================================================================
   * 内部：辅助
   * ========================================================================== */

  private mainTable(orderType: OrderType, yyyymm: string): string {
    if (orderType === OrderTypeEnum.TAKEOUT) {
      return OrderShardingHelper.tableName('order_takeout', this.dateFromYyyymm(yyyymm))
    }
    return OrderShardingHelper.tableName('order_errand', this.dateFromYyyymm(yyyymm))
  }

  private dateFromYyyymm(yyyymm: string): Date {
    const y = Number(yyyymm.slice(0, 4))
    const m = Number(yyyymm.slice(4, 6))
    return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
  }

  /**
   * 解析 cursor `${createdAtIso}_${id}`
   * 返回值：null 时表示无效或未传
   */
  private parseCursor(cursor?: string): { createdAt: Date; id: string } | null {
    if (!cursor) return null
    const idx = cursor.lastIndexOf('_')
    if (idx <= 0) return null
    const ts = cursor.slice(0, idx)
    const id = cursor.slice(idx + 1)
    const dt = new Date(ts)
    if (Number.isNaN(dt.getTime())) return null
    if (!id) return null
    return { createdAt: dt, id }
  }

  /**
   * 默认查询近 90 天；最长 180 天；toDate 不能早于 fromDate
   */
  private normalizeDateRange(
    fromDateStr: string | undefined,
    toDateStr: string | undefined
  ): { fromDate: Date; toDate: Date } {
    const now = new Date()
    let toDate = toDateStr ? new Date(toDateStr) : now
    if (Number.isNaN(toDate.getTime())) toDate = now
    let fromDate = fromDateStr
      ? new Date(fromDateStr)
      : new Date(toDate.getTime() - DEFAULT_DAYS * 24 * 3600 * 1000)
    if (Number.isNaN(fromDate.getTime())) {
      fromDate = new Date(toDate.getTime() - DEFAULT_DAYS * 24 * 3600 * 1000)
    }
    if (fromDate.getTime() > toDate.getTime()) {
      const tmp = fromDate
      fromDate = toDate
      toDate = tmp
    }
    const maxMs = MAX_DAYS * 24 * 3600 * 1000
    if (toDate.getTime() - fromDate.getTime() > maxMs) {
      fromDate = new Date(toDate.getTime() - maxMs)
    }
    return { fromDate, toDate }
  }

  private shouldIncludeTakeout(scope: OrderListScope, query: { orderType?: number }): boolean {
    if (scope.kind === 'merchant') return true
    if (query.orderType === undefined) return true
    return query.orderType === OrderTypeEnum.TAKEOUT
  }

  private shouldIncludeErrand(scope: OrderListScope, query: { orderType?: number }): boolean {
    if (scope.kind === 'merchant') return false
    if (query.orderType === undefined) return true
    return query.orderType === OrderTypeEnum.ERRAND
  }

  private resolveStatusFilter(
    query: UserOrderQueryDto | MerchantOrderQueryDto | RiderOrderQueryDto | AdminOrderQueryDto
  ): { kind: 'in'; values: number[] } | { kind: 'eq'; value: number } | { kind: 'none' } {
    const adminQuery = query as AdminOrderQueryDto
    if (adminQuery.statuses && adminQuery.statuses.length > 0) {
      return { kind: 'in', values: adminQuery.statuses }
    }
    if (typeof query.status === 'number') {
      return { kind: 'eq', value: query.status }
    }
    /* 默认按用户可见状态集 */
    return { kind: 'in', values: [...VISIBLE_STATUSES_FOR_USER] }
  }

  private extractKeyword(query: object): string | null {
    const candidate = (query as { keyword?: string }).keyword
    if (!candidate || candidate.trim() === '') return null
    return candidate.trim()
  }

  private toIso(d: Date | null): string | null {
    return d ? new Date(d).toISOString() : null
  }

  /**
   * mysql2 JSON 列：driver 已返回对象，对象类列（addressSnapshot / shopSnapshot）专用
   * 入参非 object 时返回 null
   */
  private parseJson(v: unknown): Record<string, unknown> | null {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
        return null
      } catch {
        return null
      }
    }
    if (typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>
    }
    return null
  }

  /**
   * 数组类 JSON 列（如 buy_list）专用
   */
  private parseJsonArray(v: unknown): unknown[] | null {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v) as unknown
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return Array.isArray(v) ? v : null
  }

  private emptyPage(_cursor?: string): OrderKeysetPageVo {
    const meta: PageMeta = { page: 0, pageSize: 20, total: 0, totalPages: 0 }
    return { list: [], nextCursor: null, hasMore: false, meta }
  }
}
