/**
 * @file order-sharding.helper.ts
 * @stage P4/T4.14（Sprint 3）
 * @desc 订单按月分表辅助工具：根据 createdAt 拼接物理表名
 * @author 单 Agent V2.0
 *
 * P2 04_order.sql 设计：
 *   - order_takeout_template / order_takeout_item_template / order_errand_template /
 *     order_status_log_template 为模板（永远不写入）
 *   - 物理分表按 createdAt 月份拼接：order_takeout_202604、order_errand_202605 ...
 *   - 存储过程 sp_create_order_monthly_tables(yyyymm) 幂等创建（每月 1 日 02:00 由
 *     monthly-table-job 触发预生成下月表）
 *
 * 业务侧用法（Sprint 3 各 Order Service）：
 *   const tbl = OrderShardingHelper.takeout(new Date())
 *   await dataSource.query(`INSERT INTO ${tbl} (...) VALUES (...)`, [...])
 *
 *   const orderRows = await dataSource
 *     .createQueryBuilder()
 *     .from(tbl, 'o')
 *     .select('*')
 *     .where('o.order_no = :no', { no })
 *     .getRawOne()
 *
 * 注意：
 *   - 物理表必须由运维侧 SQL（CALL sp_create_order_monthly_tables）预创建
 *   - 跨月查询（订单列表）需 UNION ALL 多张物理表（Service 层动态拼接）
 */

/** 4 类按月分表的逻辑表名 */
export type OrderShardLogicalTable =
  | 'order_takeout'
  | 'order_takeout_item'
  | 'order_errand'
  | 'order_status_log'

/**
 * 订单分表辅助工具
 * 用途：业务侧统一调用，避免散落 ${yyyymm} 拼接逻辑
 */
export class OrderShardingHelper {
  /**
   * 拼接物理表名
   * 参数：logicalTable 逻辑表名；date 业务时间（默认当前 北京时间）
   * 返回：物理表名（如 'order_takeout_202604'）
   */
  static tableName(logicalTable: OrderShardLogicalTable, date: Date = new Date()): string {
    return `${logicalTable}_${this.toYyyymm(date)}`
  }

  /**
   * 外卖主表
   */
  static takeout(date: Date = new Date()): string {
    return this.tableName('order_takeout', date)
  }

  /**
   * 外卖明细表
   */
  static takeoutItem(date: Date = new Date()): string {
    return this.tableName('order_takeout_item', date)
  }

  /**
   * 跑腿主表
   */
  static errand(date: Date = new Date()): string {
    return this.tableName('order_errand', date)
  }

  /**
   * 状态日志表
   */
  static statusLog(date: Date = new Date()): string {
    return this.tableName('order_status_log', date)
  }

  /**
   * 多月跨表查询时枚举从 fromDate 到 toDate（含两端）涉及的所有月份
   * 用途：用户/商户/骑手"近 N 个月订单列表"场景，service 层 UNION ALL
   * 参数：logicalTable 逻辑表；fromDate 起始；toDate 结束
   * 返回：物理表名数组（按时间升序）
   */
  static tableNamesBetween(
    logicalTable: OrderShardLogicalTable,
    fromDate: Date,
    toDate: Date
  ): string[] {
    if (toDate.getTime() < fromDate.getTime()) return []
    const result: string[] = []
    const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1)
    while (cursor.getTime() <= end.getTime()) {
      result.push(this.tableName(logicalTable, cursor))
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return result
  }

  /**
   * 从 order_no 反向解析创建月份
   * 订单号格式 18 位 [T|E][yyyyMMdd 8][shard 2][seq 6][checksum 1]
   * 参数：orderNo 订单号
   * 返回：物理表 yyyymm（如 '202604'）；订单号非法返回 null
   */
  static yyyymmFromOrderNo(orderNo: string): string | null {
    if (!orderNo || orderNo.length !== 18 || !/^[TE][0-9]{17}$/.test(orderNo)) return null
    const yyyy = orderNo.slice(1, 5)
    const mm = orderNo.slice(5, 7)
    return `${yyyy}${mm}`
  }

  /**
   * 物理分片号（与 P2 04_order.sql shard 字段一致；userId BigInt % 8）
   * 参数：userId 用户 ID 字符串
   * 返回：0~7（与 OrderNoGenerator 输入对齐）
   */
  static computeShard(userId: string): number {
    const last2 = userId.slice(-6)
    const n = Number.parseInt(last2, 10)
    if (!Number.isFinite(n)) return 0
    return n % 8
  }

  /**
   * 北京时间格式化 yyyymm（6 位）
   * 参数：date Date 实例
   * 返回：'yyyyMM'
   */
  private static toYyyymm(date: Date): string {
    const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
    const y = beijing.getUTCFullYear()
    const m = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
    return `${y}${m}`
  }
}
