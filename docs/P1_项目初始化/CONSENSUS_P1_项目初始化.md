# CONSENSUS_P1_项目初始化

> 本文件为 P1 阶段**方案共识**，锁定范围、技术、交付标准、风险。经此共识后进入详细设计。

---

## 一、需求范围共识

### 1.1 in-scope（本阶段必做）

1. 在项目根目录下建立 5 端工作区（pnpm workspace）
   - `用户端/`（uni-app，微信小程序 target）
   - `商户端/`（uni-app，iOS + Android APP target）
   - `骑手端/`（uni-app，iOS + Android APP target）
   - `管理后台/`（已就位，不重建，仅补齐 workspace 配置）
   - `后端/`（NestJS 单仓多模块 monolith）
2. 统一代码规范：ESLint 9 + Prettier 3 + Stylelint 16 + commitlint + husky
3. 统一提交规范：Conventional Commits + cz-git
4. 环境变量分层：`.env` / `.env.development` / `.env.production`
5. Dockerfile + docker-compose（含 MySQL / Redis / RabbitMQ / MinIO 开发依赖）
6. 项目级 README、各端 README
7. Git 初始化与 `.gitignore`

### 1.2 out-of-scope（本阶段不做）

- 任何业务功能代码
- 数据库建表
- 第三方 SDK 接入
- K8s 部署清单（留到 P9）
- CI 流水线细节（P9 完善，仅留骨架）

---

## 二、技术方案共识

### 2.1 目录结构锁定

```
O2O跑腿+外卖/
├── pnpm-workspace.yaml         # workspace 清单
├── package.json                # 根 package，集中脚本与 devDeps
├── .editorconfig
├── .gitignore
├── .gitattributes
├── README.md
├── 说明文档.md
├── O2O外卖+跑腿一体化平台 需求规格说明书.md
├── docs/                       # 9 阶段文档
├── 用户端/                     # uni-app + Vue3 + Pinia + uView Plus
├── 商户端/                     # uni-app + Vue3 + Pinia + uView Plus
├── 骑手端/                     # uni-app + Vue3 + Pinia + uView Plus
├── 管理后台/                   # art-design-pro 精简版（已有）
├── 后端/                       # NestJS 10 + TypeScript + TypeORM + Redis
└── 部署/
    ├── docker/
    │   ├── mysql/
    │   ├── redis/
    │   ├── rabbitmq/
    │   └── minio/
    ├── docker-compose.dev.yml
    └── docker-compose.prod.yml
```

### 2.2 关键版本（锁定）

| 组件 | 版本 |
|---|---|
| Node.js | ≥ 20.19.0 |
| pnpm | ≥ 8.8.0 |
| Vue | 3.5.x |
| uni-app | 最新稳定版（HBuilderX CLI 或 Vite 模板） |
| uView Plus | 3.x |
| NestJS | 10.x |
| TypeScript | 5.6.x |
| MySQL | 8.0 |
| Redis | 7.x |
| RabbitMQ | 3.13 |
| MinIO | 最新 LTS |

### 2.3 ADR（架构决策记录）

- **ADR-001 后端选 NestJS**：与前端技术栈统一、开发效率最高，PRD 明确允许
- **ADR-002 monorepo + pnpm workspace**：共享类型、版本统一、提交原子性
- **ADR-003 后端 monolith-first**：先单体多模块，P3 阶段按业务边界物理拆分
- **ADR-004 开发环境用 Docker Compose**：5 个依赖服务一键拉起，减少环境差异
- **ADR-005 提交规范统一 Conventional Commits**：便于自动生成 CHANGELOG

---

## 三、交付标准共识

### 3.1 功能交付

- [ ] 5 端工作区齐全，`pnpm install` 无错误
- [ ] 每端可独立 `pnpm dev` 启动空页面
- [ ] 后端可 `pnpm start:dev`，`GET /health` 返回 `{status:"ok"}`
- [ ] `pnpm lint` 在根目录可一次校验全部子项目
- [ ] `git commit` 触发 husky + commitlint 校验
- [ ] `docker compose -f 部署/docker-compose.dev.yml up -d` 一键拉起基础依赖

### 3.2 文档交付

- [ ] 根 README.md：项目说明、启动方式、目录导航
- [ ] 各端 README.md：环境准备、启动、打包、常见问题
- [ ] `说明文档.md`：已就位，进度记录同步更新

### 3.3 规范交付

- [ ] ESLint + Prettier + Stylelint 配置在根目录统一，子项目继承
- [ ] `.editorconfig` 统一 LF + UTF-8 + 2 空格
- [ ] husky + lint-staged 本地提交前自动检查
- [ ] commitlint 校验 Conventional Commits

---

## 四、风险识别与应对

| 风险 | 等级 | 应对措施 |
|---|---|---|
| Windows 路径中含中文导致脚本异常 | 中 | 所有脚本使用正斜杠 + 双引号包裹路径；必要时用 cross-env |
| uni-app CLI 模板与 HBuilderX 模板差异 | 中 | 统一采用 Vite + uni-app CLI 官方模板 |
| NestJS 与 pnpm workspace 依赖提升冲突 | 中 | 配置 `.npmrc` `shamefully-hoist=false`，各子项目独立锁定 |
| 管理后台既有配置与根 lint 冲突 | 低 | 根 lint 设置 ignorePatterns，管理后台沿用自身配置 |
| Docker Desktop 在 Windows 上 CPU/内存占用 | 低 | 开发文档提示资源分配建议，或按需启动单个服务 |

---

## 五、共识结论

- 范围、技术、标准、风险已锁定
- 进入 `DESIGN` 阶段，输出目录结构、配置文件、Dockerfile 细节设计
