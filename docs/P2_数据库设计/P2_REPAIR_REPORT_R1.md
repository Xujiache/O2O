# P2-REVIEW-01 修复报告 R1

> 阶段：P2 数据库设计 / P2-REVIEW-01 第 1 轮修复
> 修复日期：2026-04-19
> 执行 Agent：员工 A（修复轮次 R1）
> 修复任务：4 项 P1（I-01 ~ I-04），全部 ✅
> 不修复项：4 项 P2 建议（I-05 ~ I-08，按提示词允许跳过）

---

## 一、本轮修复结论

| 编号 | 问题 | 修复结论 | 文件改动 |
| --- | --- | --- | --- |
| I-01 | redis-keys.md §二 标题 42 → 47 | ✅ | `后端/src/database/redis-keys.md:28` |
| I-02 | T2.16 Job .ts 占位 + build 不破 | ✅ | 新增 `后端/src/database/jobs/order-shard-job.ts` + 安装 `@nestjs/schedule@^4.1.2` |
| I-03 | 三处权限点数字 87 → 92 | ✅ | `seeds/03_rbac.sql` + `README.md` + `P2_COMPLETION_REPORT.md` 两处 + 顺手修 `说明文档.md` + `TODO_P2_数据库设计.md` 共 6 处 |
| I-04 | jobs/monthly-table-job.md 移除 dayjs | ✅ | `后端/src/database/jobs/monthly-table-job.md` 共 4 处全部清除 |

---

## 二、逐项修复详情

### I-01 修复：redis-keys.md §二 标题数字

#### 根因
首版生成时按"分组上限估算"写了 42，与实际表内 K01~K47 编号 + §七"实 47 项"不一致；漏校。

#### 修复方式
单 token 替换：

```diff
- ## 二、Key 全量场景表（**42 项**）
+ ## 二、Key 全量场景表（**47 项**）
```

#### 自验证
1. 编号自数：`K01~K47` 出现的编号 `47` 个，分组合计 `A 5+B 5+C 4+D 1+E 5+F 4+G 4+H 3+I 4+J 4+K 3+L 5 = 47` ✓
2. grep '42 项' 0 命中 ✓
3. 三处一致：§二 标题 47 / K47 末项存在 / §七 "实 47 项" ✓

```
[I-01 自验证]
  K01~K47 出现的编号数: 47 (期望 47)
  [OK] no '42 项'
  47:  ## 二、Key 全量场景表（**47 项**）
  115: | K47 | `stat:order:{yyyymmdd}` | ...
  171: ## 七、核对清单（ACCEPTANCE §四 验收）
  173: - [x] 全量场景 ≥ 40 项（实 47 项）
```

---

### I-02 修复：T2.16 Job 占位 .ts + build 不破

#### 根因
首版只交付 `jobs/monthly-table-job.md` 设计文档，未落地 `.ts` 占位文件，目录结构与提示词期望不完全对齐。

#### 修复方式

1) **新增依赖**（合法扩展，与 T2.17 追加 timescaledb 同性质）：

```bash
pnpm --filter 后端 add @nestjs/schedule@^4.1.0
# → 实际锁定 @nestjs/schedule@^4.1.2，与 NestJS 10 兼容
```

`后端/package.json` 单行 diff：

```diff
+    "@nestjs/schedule": "^4.1.2",
```

> 注：pnpm 自动展开了 jest.moduleFileExtensions 行内数组格式，已**手动恢复**为 P1 原格式（`["js","json","ts"]` 行内）。最终 package.json 总 diff 只有 1 行新增。

2) **新增文件** `后端/src/database/jobs/order-shard-job.ts`（74 行），关键结构：

```typescript
/**
 * @file order-shard-job.ts
 * @stage P2/T2.16 占位
 * @desc 月分表自动维护 Job 占位
 * @todo P3 完整实现（接入分布式锁 + Sentry 告警 + 钉钉通知 + 失败重试）
 * @design 详见 ./monthly-table-job.md
 * @author 员工 A 修复轮次 R1（P2-REVIEW-01）
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import type { DataSource } from 'typeorm'

@Injectable()
export class OrderShardJob {
  private readonly logger = new Logger(OrderShardJob.name)
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Cron('0 0 2 1 * *', { name: 'order-shard-job', timeZone: 'Asia/Shanghai' })
  async handleMonthly(): Promise<void> {
    // TODO[P3]: 接入分布式锁 lock:job:monthly-table:{yyyymm} + Sentry 上报 + 钉钉告警
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

满足提示词全部 7 项细节：
- ✅ 文件头 6 行注释（@file/@stage/@desc/@todo/@design/@author）
- ✅ 4 个 import 全部就位（`@nestjs/common` Injectable+Logger / `@nestjs/schedule` Cron / `@nestjs/typeorm` InjectDataSource / `typeorm` DataSource）
- ✅ 不依赖 dayjs，用 `new Date()` + `String(month).padStart(2,'0')`
- ✅ class `OrderShardJob` + `@Cron('0 0 2 1 * *', { name, timeZone: 'Asia/Shanghai' })` + `handleMonthly()` + `createForMonth(yyyymm)`
- ✅ 两个方法都有 `// TODO[P3]: 接入分布式锁 lock:job:monthly-table:{yyyymm} + Sentry 上报 + 钉钉告警` 注释
- ✅ `createForMonth` 体内 `this.ds.query('CALL sp_create_order_monthly_tables(?)', [yyyymm])`
- ✅ 未注册到任何 Module（保留给 P3）

#### 自验证

1) `pnpm --filter 后端 build` Exit 0：

```
> 后端@0.1.0 build C:\Users\Administrator\Desktop\O2O跑腿+外卖\后端
> nest build
exit=0
```

2) 编译产物存在：
```
后端/dist/database/jobs/order-shard-job.d.ts        256 bytes
后端/dist/database/jobs/order-shard-job.js         2656 bytes
后端/dist/database/jobs/order-shard-job.js.map     1321 bytes
```

3) ReadLints 0 错 0 警告 ✓

---

### I-03 修复：03_rbac.sql + README + COMPLETION_REPORT 三处权限点数字一致性

#### 根因
首版凭印象在多处分别写了"87 permission"、"95 权限点"、"菜单 43"等数字，未做"实数 = 文档数"自检；实际数 = 92（顶级 10 + 二级 38 + 按钮 28 + 接口 16）。

#### 修复方式

**自数实际值**（PowerShell 正则匹配 `(\(\s*\d+,\s*1,\s*<parent_id>,\s*<resource_type>,\s*'`）：

```
顶级菜单 (parent_id=0, type=1): 10
二级菜单 (parent_id>0, type=1): 38
按钮     (type=2):              28
接口     (type=3):              16
合计:                           92
```

**5 个文件 6 处修改**（提示词只要求 3 处，但提示词同时要求"全仓库 grep 87 应 0 命中"，故顺带改 说明文档 + TODO_P2 共 2 处）：

1) `后端/src/database/seeds/03_rbac.sql:238-240`
   ```diff
   - -- END 03_rbac.sql —— 5 角色 / 95 权限点（顶级菜单 10 + 二级菜单 33 +
   - -- 按钮 28 + 接口 16 ≈ 87 条 permission；运营/财务/客服/风控四角色合计
   + -- END 03_rbac.sql —— 5 角色 / 92 权限点（顶级菜单 10 + 二级菜单 38 +
   + -- 按钮 28 + 接口 16 = 92 条 permission；运营/财务/客服/风控四角色合计
   ```

2) `后端/src/database/README.md:31`
   ```diff
   - │   ├── 03_rbac.sql                 # 角色 + 权限点（5 角色 / 87 permission / ~120 关联）
   + │   ├── 03_rbac.sql                 # 角色 + 权限点（5 角色 / 92 permission / ~120 关联）
   ```

3) `docs/P2_数据库设计/P2_COMPLETION_REPORT.md:28`
   ```diff
   - | T2.14 | role / permission seed（5 角色 / 87 权限） | P2 | ...
   + | T2.14 | role / permission seed（5 角色 / 92 权限） | P2 | ...
   ```

4) `docs/P2_数据库设计/P2_COMPLETION_REPORT.md:291`
   ```diff
   - | 5 默认角色 + 三层权限 | ✅ 5 角色 / 87 permission（菜单 43 + 按钮 28 + 接口 16）|
   + | 5 默认角色 + 三层权限 | ✅ 5 角色 / 92 permission（菜单 48[顶级 10 + 二级 38] + 按钮 28 + 接口 16）|
   ```

5) `说明文档.md:169`
   ```diff
   - ... / RBAC 5 角色 87 权限 / ...
   + ... / RBAC 5 角色 92 权限 / ...
   ```

6) `docs/P2_数据库设计/TODO_P2_数据库设计.md:34`
   ```diff
   - - [x] **T2.14 ...** ... 5 角色 / 87 permission（菜单 43 + 按钮 28 + 接口 16）/ ~120 关联
   + - [x] **T2.14 ...** ... 5 角色 / 92 permission（菜单 48[顶级 10 + 二级 38] + 按钮 28 + 接口 16）/ ~120 关联
   ```

#### 自验证

```
[I-03] 全仓库 grep '87 permission|87 权限|permission 87|95 权限点' （应 0 命中）：
  [OK] 0 命中

[I-03] 全仓库 grep '92 permission|92 权限|5 角色 / 92'（应 ≥ 5 处）：
  03_rbac.sql:238  -- END 03_rbac.sql —— 5 角色 / 92 权限点（顶级菜单 10 + 二级菜单 38 +
  03_rbac.sql:239  -- 按钮 28 + 接口 16 = 92 条 permission;运营/财务/客服/风控四角色合计
  README.md:31     │   ├── 03_rbac.sql ... 5 角色 / 92 permission / ~120 关联）
  P2_COMPLETION_REPORT.md:28   | T2.14 ... 5 角色 / 92 权限 ...
  P2_COMPLETION_REPORT.md:292  | 5 默认角色 ... 92 permission（菜单 48[顶级 10 + 二级 38] + 按钮 28 + 接口 16）
  TODO_P2_数据库设计.md:34    - [x] T2.14 ... 5 角色 / 92 permission（菜单 48[顶级 10 + 二级 38] + ...）
  说明文档.md:169  | 2026-04-19 | P2 数据库设计 ... RBAC 5 角色 92 权限 ...
  count: 7
```

---

### I-04 修复：monthly-table-job.md 移除 dayjs 依赖

#### 根因
首版示例代码用 `dayjs().add(1,'month').format('YYYYMM')`，引入了未安装的第三方依赖（与 P1 R01 I-04 `defineUniConfig` 同款问题：示例代码不应依赖未在 package.json 中的库）。

#### 修复方式

`后端/src/database/jobs/monthly-table-job.md` 4 处变更：

1) **第 88 行 ASCII 图入参**：
   ```diff
   - │ 入参：next_yyyymm = dayjs().add(1,'M').format('YYYYMM')│
   + │ 入参：next_yyyymm = 由 new Date() + padStart(2,'0') 计算    │
   ```

2) **§3.2 整段示例代码块**（约 40 行）：
   - 删 `import dayjs from 'dayjs'`
   - 删 `import { Cron, CronExpression } from '@nestjs/schedule'` → 改为 `import { Cron } from '@nestjs/schedule'`（与 R1 实落 .ts 文件保持一致）
   - 类名 `MonthlyTableJob` → `OrderShardJob`（同步实落文件）
   - `dayjs().add(1, 'month').format('YYYYMM')` → 替换为：
     ```typescript
     const now = new Date()
     const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
     const nextYyyymm = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}`
     ```
   - 在两个方法体内补 `// TODO[P3]: 接入分布式锁 ...` 注释

3) **代码块上方说明行**（提示词要求）：
   ```diff
   + > 本占位代码不依赖任何第三方库；P3 如要替换为日期库（如 Day.js / date-fns）请先 `pnpm --filter 后端 add <pkg>`。
   ```

4) **代码块下方原"P2 不创建"说明**改为反映 R1 已创建占位文件的事实：
   ```diff
   - > 该文件**本期 P2 不创建**；仅作为 P3 实现的标准模板。
   + > P2-REVIEW-01 R1 已在 `后端/src/database/jobs/order-shard-job.ts` 落地占位实现，
   + > 通过 `pnpm --filter 后端 build` Exit 0 校验；P3 阶段补完整逻辑（分布式锁 / 告警 / 重试 / Module 注册）。
   ```

#### 自验证

```
[I-04] grep 'dayjs' 限定在 P2 目标文件（应 0 命中）：
  [OK] 0 命中（P2 目标文件内）

文件全仓 grep 仅剩 lock 文件中的间接依赖（管理后台/pnpm-lock.yaml + pnpm-lock.yaml + 管理后台/package-lock.json），均为 P1 阶段已存在的 transitive dependency，与本次修复无关。
```

---

## 三、回归检查（确保 4 项修复不引入新问题）

| 检查项 | 命令/方法 | 结果 |
| --- | --- | --- |
| pnpm --filter 后端 build | `pnpm --filter 后端 build` | **Exit 0** ✓ |
| 后端 dist 产物完整 | 检查 `dist/database/jobs/order-shard-job.{js,d.ts,js.map}` | 3 个产物均生成 ✓ |
| 70 张表静态校验仍 [OK] | 同 P2_COMPLETION_REPORT §四 5 项校验 | 全部 [OK] ✓ |
| package.json diff 仅 1 行新增 | `git diff 后端/package.json` | 仅 `+ "@nestjs/schedule": "^4.1.2",` ✓ |
| ReadLints 后端目录 | `ReadLints` | 0 错 0 警告 ✓ |
| pnpm-lock.yaml 仅含合法依赖图 | `git diff --stat pnpm-lock.yaml` | +132/-15 全部为 @nestjs/schedule + transitive deps ✓ |

### 后端 build 完整输出
```
> 后端@0.1.0 build C:\Users\Administrator\Desktop\O2O跑腿+外卖\后端
> nest build

exit=0
```

### 70 张表静态校验
```
70 张表总数核对：实际 70 (期望 70) [OK]
```

### package.json diff（最终干净）
```
diff --git a/后端/package.json b/后端/package.json
index b21a2a3..99fb51e 100644
--- a/后端/package.json
+++ b/后端/package.json
@@ -29,6 +29,7 @@
     "@nestjs/jwt": "^10.2.0",
     "@nestjs/passport": "^10.0.3",
     "@nestjs/platform-express": "^10.4.0",
+    "@nestjs/schedule": "^4.1.2",
     "@nestjs/swagger": "^7.4.0",
     "@nestjs/terminus": "^10.2.3",
     "@nestjs/typeorm": "^10.0.2",
```

---

## 四、追加的 Δ9 偏差行

`docs/P2_数据库设计/P2_COMPLETION_REPORT.md §三` 表末追加：

```
| Δ9 | T2.16 Job 实现 | 提示词要求 .ts 完整实现 | 占位 .ts + 设计 .md，编码归 P3 | NestJS Cron 完整逻辑（分布式锁/告警/重试）需依赖 P3 基础设施；P2 仅占位保证目录结构对齐提示词 + build 不破 |
```

---

## 五、TODO_P2 末尾变更记录

```
| 2026-04-19 | P2-REVIEW-01 第 1 轮修复完成（I-01~I-04 共 4 项 P1） | 员工 A（修复轮次 R1） |
```

---

## 六、git status 总览（修复后干净）

```
 M docs/P2_数据库设计/TODO_P2_数据库设计.md   ← 追加 R1 完成行 + I-03 数字
 M pnpm-lock.yaml                              ← @nestjs/schedule 依赖图
 M 后端/package.json                           ← +1 行 @nestjs/schedule
 M 说明文档.md                                 ← I-03 数字 87 → 92
 M 部署/docker-compose.dev.yml                 ← P2 阶段已有变更，本轮无再改动
?? .cursor/                                    ← IDE 自身配置（与 P2/R1 无关）
?? docs/P2_数据库设计/P2_COMPLETION_REPORT.md ← P2 阶段已有，本轮 §三 追加 Δ9 + I-03 数字
?? 后端/src/database/README.md                ← P2 阶段已有，本轮 I-03 数字
?? 后端/src/database/encryption.md            ← P2 阶段已有
?? 后端/src/database/erd/                     ← P2 阶段已有 10 份
?? 后端/src/database/jobs/                    ← R1 新增 order-shard-job.ts；md 文件 I-04 修
?? 后端/src/database/migrations/              ← P2 阶段已有 11 个
?? 后端/src/database/redis-keys.md            ← I-01 数字
?? 后端/src/database/seeds/                   ← P2 阶段已有 4 个；03_rbac.sql 末尾 I-03 数字
?? 后端/src/database/timescale/               ← P2 阶段已有
?? 部署/runbooks/                             ← P2 阶段已有
```

---

## 七、自愿处理项（提示词允许跳过的 4 项 P2 建议）

本轮**未顺手处理** I-05 ~ I-08，原因：

- 严守"修复过程禁止引入新问题 + 范围扩散"原则
- 4 项均为 P2 建议，不影响验收
- 留待下一轮（P2-REVIEW-02 如有），或后续阶段顺手处理

如需顺手处理，请在下一轮提示词中追加。

---

## 八、签字

| 角色 | 签字 | 日期 |
| --- | --- | --- |
| 修复 Agent | 员工 A（R1） | 2026-04-19 |
| Cascade 复审 | （待审） | — |
| 用户验证 | （待审） | — |

---

## 九、给 Cascade 复审的关注点

1. **I-02 新增依赖合理性**：`@nestjs/schedule@^4.1.2` 是 NestJS 10 的官方调度模块，P3/P4 业务必装；本轮提前装+占位与 T2.17 追加 timescaledb 同性质（合法 P1 之上扩展）。如复审认为该依赖不应在 P2 安装，则修复方式可改为：
   - 删 `@nestjs/schedule` 依赖
   - `order-shard-job.ts` 用 `// @ts-expect-error - imported in P3` 抑制 import 报错
   - 但这样 build 又会报错 → **本方式不可行**
   - **结论**：本轮安装 `@nestjs/schedule` 是满足"必须能通过 pnpm build"前置条件的唯一方案
2. **I-03 修了 6 处而非 3 处**：因为提示词要求"全仓库 grep 87 应 0 命中"，故顺带把 `说明文档.md` + `TODO_P2_数据库设计.md` 也改了。请确认这是合理范围扩展而非超纲。
3. **I-04 monthly-table-job.md 顺带把代码示例同步到 R1 实落文件版本**（类名 `MonthlyTableJob` → `OrderShardJob`、import 减为 4 个、加 TODO 注释、加路径说明）。属于文档自洽（避免示例代码与实落文件矛盾），如认为超纲请告知。
