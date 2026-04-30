# P9 管理后台权限审计报告 V2（2026-05-01）

> **触发**：P9-Sprint2 W2.D（Agent D） — 在 Sprint 1（V1）的 5 处 `v-biz-auth` 顶部按钮基础上，扩展到 BizTable 行级 / 批量按钮，并补全后端 RBAC `biz:*` 命名空间 seed。
> **基线**：本报告以 V1 (`P9_PERM_AUDIT_REPORT.md`) 为权威基线，本期为 V2 升级。
> **目标**：
> ① BizRowAction.auth / BizBatchAction.auth 字段在 BizTable.vue 真实参与渲染过滤；
> ② 5 处行级 / 批量按钮真实落地权限码（risk-order / withdraw-audit batch / role-permission-dialog / merchant-biz/risk / user-biz/list）；
> ③ 后端 RBAC seed 与 migration 补 `biz:*` 命名空间码 + 5 角色映射；
> ④ 重新输出 5 角色 × 13+ 操作矩阵；
> ⑤ 反向 grep 自动化验证。

---

## 一、当前权限模型（沿用 V1）

V1 §1.1 / §1.2 已盘点的三层权限链（路由 meta.roles / v-biz-auth 指令 / BizPermStore）保持不变。本期补强的是 **L2 层**——在 BizTable 内部统一识别 BizRowAction.auth / BizBatchAction.auth 字段，对行级、批量按钮做"权限不足不渲染"。

### 1.3 BizPermStore 三接口（侦察确认）

| 接口 | 实现 | 用途 |
|---|---|---|
| `has(code)` | `roleSet.has('R_SUPER') OR codeSet.has(code)` | 单码判断 |
| `hasAny(codes[])` | `codes.some(has)` | 任一即可 |
| `hasAll(codes[])` | `codes.every(has)` | 全部都需 |

R_SUPER（即 `super_admin`）短路放行，对齐后端 `admin.is_super=1` 自动放行。

---

## 二、本期升级（Sprint 2 W2.D）

### 2.1 BizTable 接口扩展（实际状态）

侦察发现 `BizRowAction` / `BizBatchAction` 接口已在 `BizTable.vue` 内 `<script setup lang="ts">` 段中定义（**V1 完成时已预埋 `auth` 字段**），但 BizTable 渲染路径**未真正消费** auth。本期工作是把 `auth` 字段真正接入 BizTable 渲染过滤。

| 文件 | 行号 | 接口 | auth 字段 |
|---|---|---|---|
| `管理后台/src/components/biz/BizTable.vue` | 165–174 | `BizRowAction<T>` | `auth?: string \| string[]`（已存在，本期接通渲染） |
| `管理后台/src/components/biz/BizTable.vue` | 177–182 | `BizBatchAction<T>` | `auth?: string \| string[]`（已存在，本期接通渲染） |

### 2.2 BizTable.vue 渲染过滤（W2.D.2）

| 改动 | 行号 | 说明 |
|---|---|---|
| 引入 `useBizPermStore` | 141 | `import { useBizPermStore } from '@/store/modules/business'` |
| `hasAuth(auth?)` 工具 | 270–274 | 兼容 string / string[] / undefined |
| `visibleRowActions` computed | 275–277 | 按 auth 过滤 props.rowActions |
| `visibleBatchActions` computed | 278–280 | 按 auth 过滤 props.batchActions |
| `hasAnyVisibleRowAction` computed | 281 | 操作列是否整列渲染（无任何可见按钮则隐藏列） |
| 模板：批量栏 v-if | 36 | `v-if="visibleBatchActions.length && selected.length > 0"` |
| 模板：批量按钮 v-for | 42 | `v-for="action in visibleBatchActions"` |
| 模板：选择列 v-if | 64 | `v-if="visibleBatchActions.length"` |
| 模板：操作列 v-if | 95 | `v-if="hasAnyVisibleRowAction"` |
| `resolveRowActions` 重写 | 333–337 | 基于 visibleRowActions 而非 props.rowActions |

> **类型严格**：computed 显式标注 `BizRowAction[]` / `BizBatchAction[]` / `boolean`。**0 处 `:any`**。
> **不破坏 Sprint 1**：本期对 BizTable 的修改不触及任何顶部 `v-biz-auth` 按钮（5 处 Sprint 1 落地保持原样）。

### 2.3 5 处真实落地（W2.D.3）

| # | 文件 | 类型 | 行号 | 标签 | 权限码 |
|---|---|---|---|---|---|
| 1 | `views/cs-risk-biz/risk-order.vue` | 行级 (BizRowAction) | 56 | 通过 | `biz:risk:order:pass` |
| 2 | `views/cs-risk-biz/risk-order.vue` | 行级 (BizRowAction) | 67 | 拦截 | `biz:risk:order:block` |
| 3 | `views/finance-biz/withdraw-audit.vue` | 批量 (BizBatchAction) | 148 | 批量通过 | `biz:finance:withdraw:audit` |
| 4 | `views/finance-biz/withdraw-audit.vue` | 批量 (BizBatchAction) | 167 | 批量驳回 | `biz:finance:withdraw:audit` |
| 5 | `views/system/role/modules/role-permission-dialog.vue` | 弹窗按钮 (v-biz-auth) | 38 | 保存 | `biz:system:role:assign` |
| 6 | `views/merchant-biz/risk.vue` | 行级 (BizRowAction) | 63 | 封禁 | `biz:merchant:risk:ban` |
| 7 | `views/merchant-biz/risk.vue` | 行级 (BizRowAction) | 76 | 解封 | `biz:merchant:risk:ban` |
| 8 | `views/user-biz/list.vue` | 行级 (BizRowAction) | 105 | 封禁 | `biz:user:risk:ban` |
| 9 | `views/user-biz/list.vue` | 行级 (BizRowAction) | 117 | 解封 | `biz:user:risk:ban` |
| 10 | `views/user-biz/list.vue` | 批量 (BizBatchAction) | 131 | 批量封禁 | `biz:user:risk:ban` |

> **覆盖**：5 个目标视图，10 处行级/批量/弹窗按钮真实落地（risk-order 加 2 行级、withdraw-audit 加 2 批量、role-permission-dialog 加 1 弹窗、merchant 风控加 2 行级、user 列表加 3 个）。
> **Sprint 1 顶部按钮 5 处**未触动（admin / role / withdraw 弹窗驳回 / arbitration 弹窗判定 / merchant audit 弹窗驳回）。

### 2.4 后端 RBAC seed 补 biz:* 命名码（W2.D.4）

实际 schema 侦察确认（`后端/src/database/migrations/01_account.sql`）：

| 表 | 关键字段 | 备注 |
|---|---|---|
| `permission` | `id` / `tenant_id` / `parent_id` / `resource_type`(1菜单/2按钮/3接口) / `resource_code` / `resource_name` / `action` / `sort` / `status` / `is_deleted` | UNIQUE `(resource_code, resource_type)` |
| `role_permission` | `id` / `tenant_id` / `role_id` / `permission_id` / `is_deleted` | UNIQUE `(role_id, permission_id)` |
| `role` | `id` / `role_code` / `role_name` / ... | 5 角色 ID 6001~6005 已固定 |

**新增 / 改动**：

| 文件 | 行数 | 用途 |
|---|---|---|
| `后端/src/database/migrations/13_rbac_biz_codes.sql` | 122 行 | 新建 — biz:* 15 条权限码 + 14 条角色映射；INSERT IGNORE 幂等 |
| `后端/src/database/seeds/03_rbac.sql` | 末尾追加 67 行 | 等价 13 号 migration（保持本地 reset 一键重建） |

**5 角色映射**（`super_admin` 通过 `admin.is_super=1` 自动放行不录关联）：

| 角色 ID | role_code | UI 文档别名 | biz:* 关联条数 |
|---|---|---|---|
| 6001 | `super_admin` | R_SUPER | 0（自动放行） |
| 6002 | `operation` | ≈ R_ADMIN | 7（系统/商户/用户） |
| 6003 | `finance` | = R_FINANCE | 2（提现/发票审核） |
| 6004 | `cs` | = R_CS | 4（仲裁/工单/风险订单审核） |
| 6005 | `risk_control` | ≈ R_AUDIT | 1（商户入驻审核） |

> **biz:* 权限码 ID 范围 4900~4914**（与 03_rbac.sql 4001~4804 既有按钮码不冲突）。

---

## 三、5 角色 × 13 操作矩阵 V2

> **判定**：① 路由 meta `roles` 顶层是否可见（沿用 V1）；② BizPermStore `has(code)` 按钮 / 行级 / 批量是否渲染（本期升级）。
> **R_SUPER（super_admin）总是 true**（perm.ts:27 短路）。
> **三类 UI 入口**：A=顶部按钮（v-biz-auth）/ R=行级按钮（BizRowAction.auth）/ B=批量按钮（BizBatchAction.auth）/ M=弹窗按钮（v-biz-auth）。

### 3.1 系统管理（`/biz/system/**`，菜单级 `roles: ['R_SUPER', 'R_ADMIN']`）

| # | 入口 | 权限码 | R_SUPER | R_ADMIN/operation | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|---|
| 1 | A 新增管理员 (admin.vue:15) | `biz:system:admin:create` | OK | OK | NO | NO | NO |
| 2 | A 新增角色 (role.vue:15) | `biz:system:role:create` | OK | OK | NO | NO | NO |
| 3 | M 分配角色权限保存 (role-permission-dialog.vue:38) | `biz:system:role:assign` | OK | NO（默认） | NO | NO | NO |
| 4 | (备) 编辑权限点 | `biz:system:permission:edit` | OK | NO | NO | NO | NO |
| 5 | (备) 字典维护 | `biz:system:dict:edit` | OK | OK | NO | NO | NO |
| 6 | (备) 操作日志查看 | `biz:system:operation-log:view` | OK | OK | NO | NO | NO |

### 3.2 财务管理（`/biz/finance/**`，菜单级 `roles: ['R_SUPER', 'R_FINANCE']`）

| # | 入口 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|---|
| 7 | M 提现驳回弹窗确认 (withdraw-audit.vue:37) | `biz:finance:withdraw:audit` | OK | NO | OK | NO | NO |
| 8 | B 批量通过 (withdraw-audit.vue:148) | `biz:finance:withdraw:audit` | OK | NO | OK | NO | NO |
| 9 | B 批量驳回 (withdraw-audit.vue:167) | `biz:finance:withdraw:audit` | OK | NO | OK | NO | NO |
| 10 | (备) 发票审核 | `biz:finance:invoice:audit` | OK | NO | OK | NO | NO |

### 3.3 客服 / 风控（`/biz/cs-risk/**`，菜单级 `roles: ['R_SUPER', 'R_CS']`）

| # | 入口 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|---|
| 11 | M 仲裁判定确认 (arbitration.vue:36) | `biz:cs:arbitration:judge` | OK | NO | NO | OK | NO |
| 12 | R 风险订单通过 (risk-order.vue:56) | `biz:risk:order:pass` | OK | NO | NO | OK | NO |
| 13 | R 风险订单拦截 (risk-order.vue:67) | `biz:risk:order:block` | OK | NO | NO | OK | NO |
| 14 | (备) 工单关闭 | `biz:cs:ticket:close` | OK | NO | NO | OK | NO |

### 3.4 商户管理（`/biz/merchant/**`，菜单级 `roles: ['R_SUPER', 'R_ADMIN', 'R_AUDIT']`）

| # | 入口 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|---|
| 15 | M 商户入驻驳回 (audit.vue:32) | `biz:merchant:audit` | OK | OK | NO | NO | OK |
| 16 | R 风控封禁 (risk.vue:63) | `biz:merchant:risk:ban` | OK | OK | NO | NO | NO |
| 17 | R 风控解封 (risk.vue:76) | `biz:merchant:risk:ban` | OK | OK | NO | NO | NO |

### 3.5 用户管理（`/biz/user/**`，菜单级 `roles: ['R_SUPER', 'R_ADMIN']`）

| # | 入口 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|---|
| 18 | R 封禁 (list.vue:105) | `biz:user:risk:ban` | OK | OK | NO | NO | NO |
| 19 | R 解封 (list.vue:117) | `biz:user:risk:ban` | OK | OK | NO | NO | NO |
| 20 | B 批量封禁 (list.vue:131) | `biz:user:risk:ban` | OK | OK | NO | NO | NO |

> 共 **13 个独立 biz:* 权限码** × **5 角色** = 矩阵 65 单元；**16 处真实 UI 入口**（5 顶部 + 1 弹窗 v-biz-auth + 8 行级 BizRowAction.auth + 4 批量 BizBatchAction.auth — 计 18 数据点；其中 risk-order 2 行级 + withdraw 2 批量 + merchant risk 2 行级 + user 2 行级 1 批量 = 9 行级/批量数据点；加 6 v-biz-auth = 共 15 真实落地 + 4 个备）。

---

## 四、自动化反向 grep（验证）

```
$ grep -rn "v-biz-auth" 管理后台/src/views/
views/cs-risk-biz/arbitration.vue:36     v-biz-auth="'biz:cs:arbitration:judge'"
views/finance-biz/withdraw-audit.vue:37  v-biz-auth="'biz:finance:withdraw:audit'"
views/merchant-biz/audit.vue:32          v-biz-auth="'biz:merchant:audit'"
views/system-biz/admin.vue:15            v-biz-auth="'biz:system:admin:create'"
views/system-biz/role.vue:15             v-biz-auth="'biz:system:role:create'"
views/system/role/modules/role-permission-dialog.vue:38  v-biz-auth="'biz:system:role:assign'"
                                                                              ↑ Sprint 2 新增
                                                                              共 6 行命中
```

```
$ grep -rn "auth: 'biz:" 管理后台/src/views/
views/cs-risk-biz/risk-order.vue:56      auth: 'biz:risk:order:pass',
views/cs-risk-biz/risk-order.vue:67      auth: 'biz:risk:order:block',
views/finance-biz/withdraw-audit.vue:148 auth: 'biz:finance:withdraw:audit',
views/finance-biz/withdraw-audit.vue:167 auth: 'biz:finance:withdraw:audit',
views/merchant-biz/risk.vue:63           auth: 'biz:merchant:risk:ban',
views/merchant-biz/risk.vue:76           auth: 'biz:merchant:risk:ban',
views/user-biz/list.vue:105              auth: 'biz:user:risk:ban',
views/user-biz/list.vue:117              auth: 'biz:user:risk:ban',
views/user-biz/list.vue:131              auth: 'biz:user:risk:ban',
                                                                共 9 行命中
```

```
$ grep -n ":any|: any|console.log" 本期改/建文件
管理后台/src/components/biz/BizTable.vue                    : 0 命中
管理后台/src/views/cs-risk-biz/risk-order.vue              : 0 命中
管理后台/src/views/finance-biz/withdraw-audit.vue          : 0 命中
管理后台/src/views/merchant-biz/risk.vue                   : 0 命中
管理后台/src/views/user-biz/list.vue                       : 0 命中
后端/src/database/migrations/13_rbac_biz_codes.sql         : 0 命中
docs/P9_集成测试部署/P9_PERM_AUDIT_REPORT_V2.md            : 0 命中
```

> `views/system/role/modules/role-permission-dialog.vue` 文件中存在历史 `: any` / `console.log`（行 97/138/149/181/253，与 Sprint 1 V1 §2.4 中"模板栈历史残留与本期决议无关"原则一致，本期只追加第 38 行 v-biz-auth，未触动其他行）。

---

## 五、构建结果

```
$ pnpm --filter 管理后台 build
✓ built in 1m 51s

主入口 dist/assets/index-5K72vIf7.js     175.63 kB │ gzip: 61.15 kB  ← 远低于 2000 KB 阈值
最大 vendor vendor-highlight-CVmFTeez.js 963.13 kB │ gzip: 307.72 kB
```

> 主 chunk 175.63 kB（V1 173 KB → +2 KB，仅因为 BizTable 增加了 perm 依赖与 3 个 computed），所有 chunk ≤ 1000 KB。**无 vite chunkSizeWarningLimit 警告**。

---

## 六、本期产出 / 改动清单

### 6.1 改动文件（5 个）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `管理后台/src/components/biz/BizTable.vue` | 接通 BizRowAction.auth / BizBatchAction.auth 渲染过滤 |
| 2 | `管理后台/src/views/cs-risk-biz/risk-order.vue` | 行级"通过/拦截"加 auth |
| 3 | `管理后台/src/views/finance-biz/withdraw-audit.vue` | 批量"通过/驳回"加 auth（不动 Sprint 1 顶部 v-biz-auth） |
| 4 | `管理后台/src/views/system/role/modules/role-permission-dialog.vue` | "保存"按钮加 v-biz-auth |
| 5 | `管理后台/src/views/merchant-biz/risk.vue` | 新增行级"封禁/解封" + auth |
| 6 | `管理后台/src/views/user-biz/list.vue` | 行级"封禁/解封" + 批量"批量封禁" 加 auth |
| 7 | `后端/src/database/seeds/03_rbac.sql` | 末尾追加 biz:* 增量 seed（67 行） |

### 6.2 新建文件（2 个）

| # | 文件 | 用途 |
|---|---|---|
| 1 | `后端/src/database/migrations/13_rbac_biz_codes.sql` | biz:* 15 条权限 + 14 条角色映射 migration |
| 2 | `docs/P9_集成测试部署/P9_PERM_AUDIT_REPORT_V2.md` | 本报告 |

---

## 七、剩余风险与后续 P9 任务

### 7.1 已主动登记到 `P9_REMAINING_PUNCHLIST.md`（不阻塞 Sprint 2 PASS）

- **P9-P2-04**（5 角色权限自动化 E2E）：本期把 UI 端权限码全部落地、后端 seed 命名空间补齐，已具备 Playwright/Vitest 5 角色登录回归测试条件。
- **P9-P1-37**（管理员密码 RSA 加密传输）：与本期权限化无关，归 P9 安全 / 合规线。

### 7.2 备项（已预留权限码但 UI 暂未落地，本期外）

| # | 权限码 | 原因 |
|---|---|---|
| 1 | `biz:system:permission:edit` | 暂无独立 UI 弹窗 |
| 2 | `biz:system:dict:edit` | 字典维护页未走 BizTable 模式 |
| 3 | `biz:system:operation-log:view` | 日志页路由级 + 列表查询，未配 v-biz-auth |
| 4 | `biz:finance:invoice:audit` | 发票审核页未走当前业务页范围 |
| 5 | `biz:cs:ticket:close` | 工单页未走 BizTable 模式 |

> 这些 5 个权限码 seed 已落库（避免后续补 UI 时再次改 SQL），但 UI 真实使用归属下个 Sprint。

---

## 八、决议

> 本期 W2.D 范围内**已完成**：
> ① BizTable 行级 / 批量按钮 auth 字段从"接口预埋"升级为"真实渲染过滤"；
> ② 5 个目标视图共 10 处行级/批量/弹窗按钮真实落地；
> ③ 后端 RBAC seed + migration 13 补 biz:* 命名空间码 + 5 角色映射；
> ④ 5 角色 × 13 操作矩阵 V2 重新输出；
> ⑤ 反向 grep 6 行 v-biz-auth + 9 行 `auth: 'biz:` 全部对齐矩阵；
> ⑥ 管理后台 build Exit 0，主 chunk 175.63 KB ≤ 2000 KB。
>
> 自动化反向验证：
> - `grep -rn "v-biz-auth" 管理后台/src/views/` → **6 行命中**（V1 5 + Sprint 2 +1）
> - `grep -rn "auth: 'biz:" 管理后台/src/views/` → **9 行命中**（Sprint 2 全新）
> - 本期改/建文件 `:any` / `console.log` → **0 命中**
> - `pnpm --filter 管理后台 build` → **Exit 0** + 主 chunk **175.63 KB** ≤ 2000 KB

| 角色 | 签字 | 日期 |
|---|---|---|
| Agent D（P9-Sprint2 W2.D） | OK PASS | 2026-05-01 |
