# 管理后台 · Workspace 集成说明

> `管理后台/` 目录沿用 **art-design-pro 精简版** 原始骨架，P1 阶段仅为纳入 monorepo 做了最小必要调整，
> 未修改业务代码、路由、组件、Pinia store、路由守卫。本文件为 workspace 集成指引，与仓库原有 `README.md`（或 `README.zh-CN.md`）并存互补。

---

## 一、技术栈（对齐 PRD §5）

Vue3 + Vite + TypeScript + Element Plus + Pinia + Vue Router + Tailwind CSS 4 + Echarts + i18n。

完整依赖清单见本目录 `package.json`。

---

## 二、workspace 集成变更清单

| 变更 | 原值 | 现值 | 原因 |
|---|---|---|---|
| `package.json` 的 `name` | `art-design-pro` | `管理后台` | 供根 `pnpm --filter 管理后台 dev` 过滤命中 |

> 其余字段（`scripts`、`dependencies`、`devDependencies`、`lint-staged`、`.husky/`、`.prettierrc`、`.stylelintrc.cjs`、`eslint.config.mjs`、`commitlint.config.cjs`、`.env.*`、`vite.config.ts`、`tsconfig.json` 等）**原封保留**。

---

## 三、启动

```bash
# 根目录一次 pnpm install 后，任选其一
pnpm --filter 管理后台 dev
pnpm dev:admin

# 生产构建（沿用原项目命令）
pnpm --filter 管理后台 build
pnpm --filter 管理后台 serve
```

默认登录凭据：`Super / 123456`（原项目 mock 账号）。

---

## 四、与根规范的关系

- 根 `eslint.config.mjs` / `.stylelintrc.cjs` 已将 `管理后台/**` 加入 `ignorePatterns`，**子项目继续使用本目录原有 lint 规则**，避免与 auto-import 等插件规则冲突。
- 根 `.prettierrc` 与本目录 `.prettierrc` 完全同风格（单引号、无分号、行宽 100），格式化结果一致。
- 根 `.husky/pre-commit` 调用 `pnpm exec lint-staged`（基于 `package.json#lint-staged` 配置，仅作用于变更文件）。本目录 `.husky/` 保持不变，作为历史参考。

---

## 五、常见问题

- **`pnpm --filter 管理后台 dev` 报 `No projects matched the filters`** — 根目录重新 `pnpm install` 以刷新 workspace 索引；或改用路径过滤 `pnpm --filter ./管理后台 dev`。
- **auto-import.d.ts 缺失**：sto 项目自动生成，首次 `pnpm dev` 或 `pnpm build` 后自动出现在 `src/types/import/`，已加入根 `.gitignore`。
- **Vite 端口冲突**：在 `vite.config.ts` 中调整 `server.port`。
