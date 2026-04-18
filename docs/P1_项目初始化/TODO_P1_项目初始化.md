# TODO_P1_项目初始化

> 本文件为 P1 阶段**动态待办清单**，每完成一项立即勾选并补充结果说明。
> 与 `TASK_P1_项目初始化.md` 一一对应。

---

## 一、进行中

> 当前唯一正在执行的任务写在此处（遵循"每次一项"原则）。

- [ ] P1-REVIEW-01 第 2 轮复审（待 Cascade）—— 第 1 轮 16/16 问题已由 Agent 全部修复（2026-04-19），正在等待二审裁定是否可将说明文档 §3.1 P1 由 🟡 升回 🟢
- [x] P1 全部 22 项已完成 —— 2026-04-19 交付《P1 阶段完成报告》

---

## 二、待办（按依赖顺序）

### M1.1 仓库与规范

- [x] T1.1 初始化 Git 仓库、`.gitignore`、`.gitattributes`
- [x] T1.2 创建 `pnpm-workspace.yaml` 与根 `package.json`
- [x] T1.3 根目录 `.editorconfig`、`.prettierrc`、`eslint.config.mjs`、`.stylelintrc.cjs`
- [x] T1.4 配置 husky + lint-staged + commitlint + cz-git

### M1.2 前端四端骨架

- [x] T1.5 用户端 uni-app 脚手架（target: mp-weixin）
- [x] T1.6 商户端 uni-app 脚手架（target: app-plus + mp-weixin）
- [x] T1.7 骑手端 uni-app 脚手架（target: app-plus）
- [x] T1.8 三端安装 uView Plus + Pinia + axios 封装
- [x] T1.9 三端环境变量分层（.env.dev / .env.prod）
- [x] T1.10 管理后台纳入 workspace

### M1.3 后端骨架与依赖

- [x] T1.11 NestJS 后端脚手架
- [x] T1.12 后端安装 TypeORM + Redis + Swagger + JWT + Bull + Joi
- [x] T1.13 后端 `config/` 模块 + 环境变量校验（joi）
- [x] T1.14 后端 `main.ts` 全局管道/过滤器/拦截器/Swagger
- [x] T1.15 后端 `/health` 健康检查（db/redis）
- [x] T1.16 后端 `modules/` 16 个业务占位目录
- [x] T1.17 `部署/docker-compose.dev.yml`
- [x] T1.18 后端 `Dockerfile`（多阶段构建）

### M1.4 文档与联调收尾

- [x] T1.19 根 README.md 编写
- [x] T1.20 各端 README.md 编写（用户/商户/骑手/后端 + 管理后台 README_WORKSPACE）
- [x] T1.21 首次完整联通测试（机器可验部分全通过：install / build / husky / commitlint）
- [x] T1.22 更新 `说明文档.md` 进度记录

---

## 三、已完成

> 格式：`- [x] T1.x <任务> - <完成时间> - <结果说明>`

- [x] T1.1 仓库与忽略规则 - 2026-04-19 00:00 - 根 `.gitignore`、`.gitattributes` 就位；Git 仓库复用已有
- [x] T1.2 workspace 基座 - 2026-04-19 00:05 - `pnpm-workspace.yaml`（5 个 package）、根 `package.json`（含全部端脚本）、`.npmrc`（含 `@dcloudio:registry` 定向）
- [x] T1.3 代码规范 - 2026-04-19 00:08 - `.editorconfig`、`.prettierrc`、`.prettierignore`、`eslint.config.mjs`、`.stylelintrc.cjs`
- [x] T1.4 Git Hooks 与 commit 规范 - 2026-04-19 00:10 - `commitlint.config.cjs`（cz-git）、`.husky/pre-commit`、`.husky/commit-msg`（pnpm install 时自动激活 `.husky/_`）
- [x] T1.5 用户端脚手架 - 2026-04-19 00:15 - `用户端/` uni-app Vue3 + Vite，6 页面对应 PRD §3.1，target=mp-weixin
- [x] T1.6 商户端脚手架 - 2026-04-19 00:22 - `商户端/` 同上，target=app-plus+mp-weixin，manifest 声明蓝牙/推送模块
- [x] T1.7 骑手端脚手架 - 2026-04-19 00:28 - `骑手端/` 同上，target=app-plus，manifest 声明定位/后台/语音/相机权限
- [x] T1.8 三端 uView Plus + Pinia + axios - 2026-04-19 00:28 - 随 T1.5-T1.7 一次性注入依赖与 axios 拦截器封装
- [x] T1.9 三端 env 分层 - 2026-04-19 00:28 - 各端 `env/.env.development`、`env/.env.production`，vite.config.ts `envDir` 指向 env/
- [x] T1.10 管理后台入 workspace - 2026-04-19 00:32 - 仅将 `管理后台/package.json` 的 `name` 由 `art-design-pro` → `管理后台`，其它字段零改动
- [x] T1.11 NestJS 后端脚手架 - 2026-04-19 00:35 - `后端/` 完整骨架（nest-cli.json、tsconfig、main.ts、app.module.ts、test/）
- [x] T1.12 后端依赖清单 - 2026-04-19 00:35 - 严格对齐 DESIGN §4.2 版本锁定
- [x] T1.13 config + joi - 2026-04-19 00:40 - `src/config/configuration.ts` + `env.validation.ts`（必填校验、长度校验）
- [x] T1.14 main.ts 全局 - 2026-04-19 00:43 - 全局异常过滤器/响应体转换/日志拦截器/ValidationPipe/CORS/Swagger `/docs`
- [x] T1.15 /health - 2026-04-19 00:45 - Terminus TypeOrmHealthIndicator + 自实现 Redis pingCheck
- [x] T1.16 16 模块占位 - 2026-04-19 00:48 - auth/user/message/file/map/order/product/shop/dispatch/payment/finance/marketing/review/admin/stats/customer
- [x] T1.17 docker-compose.dev.yml - 2026-04-19 00:50 - MySQL8 / Redis7 / RabbitMQ3.13 / MinIO + 自定义 network `o2o-dev` + healthcheck
- [x] T1.18 后端 Dockerfile - 2026-04-19 00:52 - `deps → builder → runner` 三阶段，基于 `node:20-alpine`，含 tini + HealthCheck + 非 root 用户
- [x] T1.19 根 README - 2026-04-19 00:55 - 启动流程、默认凭据、规范与流程、常见问题 7 项、阶段路线图
- [x] T1.20 各端 README - 2026-04-19 00:58 - 5 份（用户/商户/骑手 + 后端 + 管理后台 README_WORKSPACE）
- [x] T1.21 首次联通测试 - 2026-04-19 01:02 - `pnpm install` 42.1s ✅；`pnpm --filter 后端 build` ✅（`dist/main.js` 2.2KB 等）；husky `.husky/_` 自动生成 ✅；commitlint 合法/非法消息测试均符合预期 ✅
- [x] T1.22 文档进度更新 - 2026-04-19 01:05 - 说明文档.md §3.1 / §3.3 与 FINAL_P1 验收表

---

## 四、阻塞

| 任务 | 阻塞原因 | 责任人 | 预计解除 |
|---|---|---|---|
| - | - | - | - |

---

## 五、变更记录

| 日期 | 变更内容 | 变更人 |
|---|---|---|
| 2026-04-18 | 初建清单，依据 TASK_P1 拆解生成 | 架构组 |
| 2026-04-19 | P1 全部 22 项任务执行完成，逐项勾选并在 `已完成` 区追加时间戳与证据 | 架构组 |
