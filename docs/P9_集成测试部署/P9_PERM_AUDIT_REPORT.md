# P9 管理后台权限审计报告（2026-05-01）

> **触发**：W1.B.2 / L8-05 / P8-R1R2-I03 — 复审发现 `BizAuth.vue` 组件 + `v-biz-auth` 指令在 `views/*-biz/**/*.vue` 0 引用，存在权限越权风险。
> **目标**：① 厘清当前权限模型；② 输出 5 角色 × 关键页面权限矩阵；③ 至少 5 处高权限按钮真用 `v-biz-auth`；④ 登记后续 P9 自动化 E2E 任务。

---

## 一、当前权限模型（已盘点）

### 1.1 三层权限链

| 层 | 实现 | 文件 |
|---|---|---|
| L1 路由 / 菜单 | `meta.roles: ['R_SUPER', 'R_ADMIN', ...]` + `MenuProcessor` 过滤 | `router/modules/business/*.ts` + `router/core/MenuProcessor.ts:70` |
| L2 页面元素（指令） | `v-biz-auth="'code'"` 指令 → 权限不足直接 `removeChild` | `directives/business/biz-auth.ts:25-35` |
| L2 页面元素（组件） | `<BizAuth code="..." />` slot 包裹 | `components/biz/BizAuth.vue` |
| L3 数据来源 | `useBizPermStore`（codes / roles），登录后 `systemApi.permissions()` 拉取，`R_SUPER` 角色全通过 | `store/modules/business/perm.ts:25-29` |

### 1.2 关键判定（参考 P8 复审 §G.3）

> 路由 meta 仅用 `roles` 维度（R_SUPER / R_ADMIN / R_FINANCE / R_CS / R_AUDIT），**未使用** `auth: ['perm:code']` 模式。
> `BizPermStore` 加载 `codes`（细粒度权限码）后通过 `has` / `hasAny` / `hasAll` 接口供组件使用 — 但前期所有 `views/*-biz/**/*.vue` **未真正调用**此接口。
> 这意味着：在 R_ADMIN 等中间角色登录时，所有顶层菜单可见，但其下高危按钮（管理员创建 / 提现批准 / 仲裁判定 / 商户驳回 / 角色创建）也无遮挡 — **存在水平越权风险**。

---

## 二、本期落地：5 处高权限按钮包裹 `v-biz-auth`

| # | 文件 | 行号 | 按钮 | 权限码 | 真实危害 |
|---|---|---|---|---|---|
| 1 | `views/system-biz/admin.vue` | 15 | 新增管理员 | `biz:system:admin:create` | 创建低权限管理员账号水平越权 |
| 2 | `views/system-biz/role.vue` | 15 | 新增角色 | `biz:system:role:create` | 自定义角色绕过 RBAC |
| 3 | `views/finance-biz/withdraw-audit.vue` | 37 | 确认驳回（提现） | `biz:finance:withdraw:audit` | 误驳回 / 恶意驳回提现 |
| 4 | `views/cs-risk-biz/arbitration.vue` | 36 | 仲裁判定确认 | `biz:cs:arbitration:judge` | 越权判定退款 |
| 5 | `views/merchant-biz/audit.vue` | 32 | 商户入驻驳回 | `biz:merchant:audit` | 越权驳回商户 |

> 反向验证：`grep -rn "v-biz-auth" 管理后台/src/views/` 命中 5 行（与上表一致）。
> 构建验证：`pnpm --filter 管理后台 build` Exit 0（1m 9s）；`vendor-*` chunk + 主 chunk 全部 ≤ 1000 KB。

---

## 三、5 角色 × 关键页面权限矩阵

> **5 角色**：R_SUPER（超管）/ R_ADMIN（运营）/ R_FINANCE（财务）/ R_CS（客服）/ R_AUDIT（审核员）
> **判定依据**：① 路由 meta `roles`（顶层是否可见）+ ② BizPermStore `has(code)`（按钮是否可点击）。
> **R_SUPER 总是 true**（perm.ts:27 短路）。

### 3.1 系统管理（`/biz/system/**`，菜单级 `roles: ['R_SUPER', 'R_ADMIN']`）

| 关键操作 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|
| 新增管理员 | `biz:system:admin:create` | ✅ | ✅(若发码) | ❌ | ❌ | ❌ |
| 新增角色 | `biz:system:role:create` | ✅ | ✅(若发码) | ❌ | ❌ | ❌ |
| 编辑权限点 | `biz:system:permission:edit` | ✅ | ❌(默认) | ❌ | ❌ | ❌ |
| 字典维护 | `biz:system:dict:edit` | ✅ | ✅(若发码) | ❌ | ❌ | ❌ |
| 系统配置 | `biz:system:config:edit` | ✅ | ❌(默认) | ❌ | ❌ | ❌ |
| 操作日志查看 | `biz:system:operation-log:view` | ✅ | ✅(若发码) | ❌ | ❌ | ❌ |

### 3.2 财务管理（`/biz/finance/**`，菜单级 `roles: ['R_SUPER', 'R_FINANCE']`）

| 关键操作 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|
| 提现审核驳回 | `biz:finance:withdraw:audit` | ✅ | ❌(默认) | ✅(若发码) | ❌ | ❌ |
| 提现审核通过 | `biz:finance:withdraw:audit` | ✅ | ❌(默认) | ✅(若发码) | ❌ | ❌ |
| 发票审核 | `biz:finance:invoice:audit` | ✅ | ❌ | ✅(若发码) | ❌ | ❌ |
| 分账规则编辑 | `biz:finance:settlement-rule:edit` | ✅ | ❌ | ✅(若发码) | ❌ | ❌ |
| 对账下载 | `biz:finance:reconciliation:export` | ✅ | ❌ | ✅(若发码) | ❌ | ❌ |

### 3.3 客服 / 风控（`/biz/cs-risk/**`，菜单级 `roles: ['R_SUPER', 'R_CS']`）

| 关键操作 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|
| 仲裁判定 | `biz:cs:arbitration:judge` | ✅ | ❌ | ❌ | ✅(若发码) | ❌ |
| 风险订单拦截 | `biz:risk:order:block` | ✅ | ❌ | ❌ | ✅(若发码) | ❌ |
| 工单关闭 | `biz:cs:ticket:close` | ✅ | ❌ | ❌ | ✅(若发码) | ❌ |

### 3.4 商户管理（`/biz/merchant/**`，菜单级 `roles: ['R_SUPER', 'R_ADMIN', 'R_AUDIT']`）

| 关键操作 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|
| 商户入驻驳回 | `biz:merchant:audit` | ✅ | ✅(若发码) | ❌ | ❌ | ✅(若发码) |
| 商户入驻通过 | `biz:merchant:audit` | ✅ | ✅(若发码) | ❌ | ❌ | ✅(若发码) |
| 店铺公告审核 | `biz:merchant:shop-notice:audit` | ✅ | ✅(若发码) | ❌ | ❌ | ✅(若发码) |
| 商户封禁 | `biz:merchant:risk:ban` | ✅ | ✅(若发码) | ❌ | ❌ | ❌ |

### 3.5 用户管理（`/biz/user/**`，菜单级 `roles: ['R_SUPER', 'R_ADMIN']`）

| 关键操作 | 权限码 | R_SUPER | R_ADMIN | R_FINANCE | R_CS | R_AUDIT |
|---|---|---|---|---|---|---|
| 用户封禁 / 解封 | `biz:user:risk:ban` | ✅ | ✅(若发码) | ❌ | ❌ | ❌ |
| 用户钱包调账 | `biz:user:wallet:adjust` | ✅ | ❌ | ✅(若发码) | ❌ | ❌ |

> ✅ = 角色 + 权限码双满足；❌(默认) = 默认 RBAC seed 未发该角色权限码；❌ = 顶层菜单 / 路由 meta 已限制。

---

## 四、剩余风险与后续 P9 任务

### 4.1 已主动登记到 `P9_REMAINING_PUNCHLIST.md`

| 编号 | 项 | 优先级 |
|---|---|---|
| P9-P2-04 | 5 角色权限自动化 E2E（Playwright / Vitest） | P2 |
| P9-P1-37 | 管理员密码 RSA 加密传输（L8-10） | P1 |

### 4.2 本期未覆盖（建议下期）

| # | 文件 / 模块 | 待补 v-biz-auth 行级按钮 | 备注 |
|---|---|---|---|
| 1 | `cs-risk-biz/risk-order.vue` | 行级 "通过 / 拦截" 配置在 `BizRowAction` 中（非 template button），需扩展 `BizRowAction` 类型增加 `auth` 字段 | 影响 BizTable 整体 |
| 2 | `finance-biz/withdraw-audit.vue` | "批量通过 / 批量驳回" `BizBatchAction` 同上 | 同上 |
| 3 | `system-biz/role.vue` | 角色 "授权"（已有 `role-permission-dialog.vue` 子组件） | 可在子组件 confirm 按钮加 `v-biz-auth="'biz:system:role:assign'"` |
| 4 | `merchant-biz/risk.vue` | 商户封禁 / 解封 | 沿用 `biz:merchant:risk:ban` |
| 5 | `user-biz/list.vue` | 用户封禁 / 解封 | 沿用 `biz:user:risk:ban` |
| 6 | 后端真实 RBAC seed | `03_rbac.sql` 5 角色 × N 权限码补 `biz:*` 命名空间码 | 当前 seed 主要为业务行为码，UI 层 `biz:*` 命名需对齐 |

### 4.3 BizTable 行 / 批量按钮的权限化建议（P2 期）

```ts
// types/biz-table.ts（建议扩展）
interface BizRowAction {
  label: string
  type?: ButtonType
  auth?: string | string[]  // 新增：权限码（v-biz-auth 风格）
  hidden?: (row: unknown) => boolean
  onClick: (row: unknown) => void | Promise<void>
}
```

`BizTable.vue` 内对 `auth` 字段调用 `useBizPermStore().has(action.auth)` 进行渲染过滤。

---

## 五、决议

> 本期 W1.B.2 范围内**已完成**：① 厘清模型；② 在 5 个最高危按钮真用 `v-biz-auth`；③ 输出 5 角色矩阵；④ 后续 BizTable 行级 / 批量按钮权限化、5 角色 E2E 自动化、RBAC seed 命名对齐已登记 `P9_REMAINING_PUNCHLIST.md`。
>
> 自动化反向验证：
> - `grep -rn "v-biz-auth" 管理后台/src/views` → 5 行命中（与上表一致）
> - `pnpm --filter 管理后台 build` → Exit 0，主 chunk 173 KB（远低于 2000 KB 阈值）

| 角色 | 签字 | 日期 |
|---|---|---|
| 单 Agent（V2.0） | ✅ Sprint 1 W1.B.2 | 2026-05-01 |
