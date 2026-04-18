# 月分表自动维护 Job 设计文档

> 阶段：P2 数据库设计 / T2.16 月分表自动维护 Job
> 用途：保障 `order_takeout_*`、`order_takeout_item_*`、`order_errand_*`、
> `order_status_log_*` 四类按月分表，每月 1 日 02:00 之前完成"下月物理表预创建"，避免月初下单写入到尚未存在的表导致 `1146 Table doesn't exist` 错误。
> 范围：仅 P2 落 **设计 + SQL 片段 + 调度方案对比**；NestJS 调度具体编码归属 P3。

---

## 一、问题背景

`后端/src/database/migrations/04_order.sql` 已落地：

- 三张模板表（`*_template`）
- 存储过程 `sp_create_order_monthly_tables(p_yyyymm CHAR(6))`
- 初始化时主动 `CALL` 生成当月（202604）+ 下月（202605）共 8 张物理分表

但项目持续运行后，每次进入新月之前，必须**幂等地**为下个月预生成分表。
本文档对比两种实现路径，选定 **方案 B（NestJS Cron）** 作为主路径，**方案 A（MySQL Event Scheduler）** 作为运维兜底。

---

## 二、方案 A：MySQL Event Scheduler（兜底）

### 2.1 启用与建事件

```sql
-- 1) 全局启用事件调度（默认关闭）
SET GLOBAL event_scheduler = ON;
-- 持久化（容器重启后生效）：在 my.cnf 加 event-scheduler=ON

-- 2) 创建事件：每月 1 日 02:00 执行
DROP EVENT IF EXISTS `evt_create_order_monthly_tables`;

DELIMITER $$
CREATE EVENT `evt_create_order_monthly_tables`
  ON SCHEDULE EVERY 1 MONTH
    STARTS '2026-05-01 02:00:00'
  ON COMPLETION PRESERVE
  ENABLE
  COMMENT '每月 1 日 02:00 创建下月订单分表，避免月初写入失败'
DO
BEGIN
  -- 计算下个月：当前 yyyymm + 1（跨年时进位由 DATE_FORMAT 处理）
  DECLARE next_yyyymm CHAR(6);
  SET next_yyyymm = DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y%m');

  -- 调用已就位的存储过程
  CALL sp_create_order_monthly_tables(next_yyyymm);
END$$
DELIMITER ;

-- 3) 校验事件
SHOW EVENTS WHERE Name = 'evt_create_order_monthly_tables';
```

### 2.2 优点

- **零外部依赖**：仅需 MySQL 自身，部署最简单
- 数据库内部执行，不受 NestJS 进程崩溃影响
- 适合极简或运维人手紧张的场景

### 2.3 缺点

- **可观测性差**：事件失败时只能查 `mysql.event_history`（5.7 之后已弃用）或
  `performance_schema.events_statements_history`，监控告警接入难
- **集群/MGR 场景需注意**：单机 master 上启用，若用 MySQL Group Replication
  需要保证只有 primary 启用避免重复执行
- 时区敏感：`STARTS` 时间字符串依赖 MySQL 服务器时区配置
- 备份/迁移时事件不会自动跟随
- 调试不便（无法本地重放）

---

## 三、方案 B：NestJS Cron（**选定主方案**）

### 3.1 总体设计

```
┌─────────────────────────────┐
│ NestJS Cron Job (每月 1 日 02:00) │
└─────────────┬───────────────┘
              │
              ▼ EXECUTE
┌─────────────────────────────────────────────┐
│ DataSource.query                            │
│   CALL sp_create_order_monthly_tables(?)    │
│ 入参：next_yyyymm = 由 new Date() + padStart(2,'0') 计算    │
└─────────────┬───────────────────────────────┘
              │
              ├─ 成功 → 写 operation_log（module=db, action=create_monthly_tables）
              ├─ 失败 → throw + Sentry 上报 + 钉钉告警
              └─ 超过 60s 未完成 → 主动 kill + 告警
```

### 3.2 NestJS 实现占位（P3 完成）

> 本占位代码不依赖任何第三方库；P3 如要替换为日期库（如 Day.js / date-fns）请先 `pnpm --filter 后端 add <pkg>`。

```typescript
// 实际占位文件：后端/src/database/jobs/order-shard-job.ts（P2-REVIEW-01 R1 已创建）
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import type { DataSource } from 'typeorm'

/**
 * 月分表预创建 Job
 * 功能：每月 1 日 02:00 自动调用 sp_create_order_monthly_tables 生成下月 4 张分表
 * 参数：无（cron 触发；手动重跑用 createForMonth(yyyymm)）
 * 返回值：void
 * 用途：避免月初下单时目标分表尚未存在导致 1146 错误
 */
@Injectable()
export class OrderShardJob {
  private readonly logger = new Logger(OrderShardJob.name)

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // 每月 1 日 02:00（Asia/Shanghai；NestJS @Cron 显式 timeZone 参数）
  @Cron('0 0 2 1 * *', { name: 'order-shard-job', timeZone: 'Asia/Shanghai' })
  async handleMonthly(): Promise<void> {
    // TODO[P3]: 接入分布式锁 lock:job:monthly-table:{yyyymm} + Sentry 上报 + 钉钉告警

    // 计算下月 yyyymm，不依赖第三方日期库（避免引入额外运行时依赖）
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextYyyymm = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}`

    await this.createForMonth(nextYyyymm)
  }

  async createForMonth(yyyymm: string): Promise<void> {
    // TODO[P3]: 接入分布式锁 lock:job:monthly-table:{yyyymm} + Sentry 上报 + 钉钉告警
    this.logger.log(`Creating monthly tables for ${yyyymm}`)
    try {
      await this.ds.query('CALL sp_create_order_monthly_tables(?)', [yyyymm])
      this.logger.log(`OK: monthly tables for ${yyyymm}`)
    } catch (err) {
      this.logger.error(`FAILED: monthly tables for ${yyyymm}`, err as Error)
      throw err
    }
  }
}
```

> P2-REVIEW-01 R1 已在 `后端/src/database/jobs/order-shard-job.ts` 落地占位实现，
> 通过 `pnpm --filter 后端 build` Exit 0 校验；P3 阶段补完整逻辑（分布式锁 / 告警 / 重试 / Module 注册）。

### 3.3 优点

- **可监控**：日志、指标（Prometheus）、告警全链路
- **可重放**：暴露管理后台「手动创建分表」按钮，即 `createForMonth('202608')`
- **集群安全**：用 `@nestjs/schedule` + 分布式锁（`lock:job:monthly-table:{yyyymm}`，TTL 5min）保证多副本仅一个执行
- **CI/CD 友好**：随代码版本管理，灰度可控
- 时区显式（`timeZone: 'Asia/Shanghai'`）

### 3.4 缺点

- 强依赖应用进程存活；故有方案 A 兜底（DBA 评估后启用与否）
- 实现成本略高于纯 SQL 事件

---

## 四、对比与决策

| 维度        | 方案 A: MySQL Event | 方案 B: NestJS Cron     |
| ----------- | ------------------- | ----------------------- |
| 部署难度    | 极低                | 低                      |
| 监控可视化  | ❌ 弱               | ✅ 强（日志/指标/告警） |
| 集群安全    | 主从需手动协调      | ✅ 分布式锁兜底         |
| 可重放      | ❌ 需 DBA 手动 CALL | ✅ 管理后台按钮         |
| 与业务耦合  | ❌ 数据库内孤岛     | ✅ 与业务代码同生命周期 |
| 备份迁移    | ❌ 需单独导出 EVENT | ✅ 跟随代码 git 入库    |
| 时区/夏令时 | 一般                | ✅ 显式 timeZone 参数   |

**决策**：

- **主路径（线上默认）**：方案 B（NestJS Cron + 分布式锁）
- **兜底路径（容灾用）**：方案 A 默认 **不启用**；如出现 NestJS 全集群停机超过
  24h 仍未恢复，由 DBA 手动 `SET GLOBAL event_scheduler = ON;` + 创建事件保住下月数据
- **手动应急**：任何时候 DBA / 运维都可以登录 MySQL 直接执行
  `CALL sp_create_order_monthly_tables('YYYYMM');` 手动补建

---

## 五、附：手动创建/重建命令速查

```sql
-- 1) 创建指定月分表（幂等：已存在不会报错）
CALL sp_create_order_monthly_tables('202607');

-- 2) 一次性补建未来 6 个月
CALL sp_create_order_monthly_tables('202607');
CALL sp_create_order_monthly_tables('202608');
CALL sp_create_order_monthly_tables('202609');
CALL sp_create_order_monthly_tables('202610');
CALL sp_create_order_monthly_tables('202611');
CALL sp_create_order_monthly_tables('202612');

-- 3) 校验（应至少看到 4 张目标月表）
SHOW TABLES LIKE 'order_takeout_202607';
SHOW TABLES LIKE 'order_takeout_item_202607';
SHOW TABLES LIKE 'order_errand_202607';
SHOW TABLES LIKE 'order_status_log_202607';
```

---

## 六、归档（操作日志/接口日志）月/周分表延伸

`operation_log`（按月）、`api_log`（按周）也属于"按时间分表"范畴。本期 P2 暂以
单表落地（10_system.sql），不阻塞业务；后续若日志体量增长，可参照同样的方法：

1. 新增 `operation_log_template` / `api_log_template` 模板表
2. 新增 `sp_create_log_monthly_tables` / `sp_create_log_weekly_tables` 存储过程
3. 在 NestJS Cron 中追加调度任务（与本文件同套机制）

详细设计待 P9 数据治理阶段评估后追加。

---

## 七、本期 T2.16 完成证据

- 主方案对比与选定：✅ 本文档 §四
- 方案 A SQL 片段（兜底）：✅ §2.1
- 方案 B NestJS 实现占位（P3 落地）：✅ §3.2
- 手动应急命令：✅ §五
