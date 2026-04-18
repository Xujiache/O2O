# O2O 外卖 + 跑腿 一体化平台

> 同城本地生活即时配送 O2O 平台。覆盖 **外卖点餐 + 同城跑腿** 双业务线，
> 打通用户下单、商户接单出餐、骑手配送、平台运营管控、财务结算全闭环。
>
> 基准文档：[O2O外卖+跑腿一体化平台 需求规格说明书.md](./O2O外卖+跑腿一体化平台%20需求规格说明书.md)（PRD V1.0）

---

## 一、目录导航

```
O2O跑腿+外卖/
├── O2O外卖+跑腿一体化平台 需求规格说明书.md   # PRD（唯一基准）
├── 说明文档.md                                # 项目全生命周期管理载体
├── docs/                                      # 9 阶段 × 7 份 = 63 份过程文档
│   ├── P1_项目初始化/  P2_数据库设计/  P3_后端基础服务/
│   ├── P4_后端业务服务/ P5_用户端开发/  P6_商户端开发/
│   ├── P7_骑手端开发/  P8_管理后台开发/ P9_集成测试部署/
├── 用户端/          # uni-app 微信小程序（PRD §3.1）
├── 商户端/          # uni-app iOS+Android APP & 小程序（PRD §3.2）
├── 骑手端/          # uni-app iOS+Android APP（PRD §3.3）
├── 管理后台/        # Vue3 + Vite + Element Plus（PRD §3.4，已就位）
├── 后端/            # NestJS 10 + TypeScript（PRD §3.5）
├── 部署/            # Docker / K8s / CI/CD
│   ├── docker-compose.dev.yml
│   └── docker/{mysql,redis,rabbitmq,minio}/
├── pnpm-workspace.yaml
├── package.json
├── .npmrc
├── .editorconfig / .prettierrc / .gitignore / .gitattributes
├── eslint.config.mjs / .stylelintrc.cjs
├── commitlint.config.cjs
└── .husky/  pre-commit  commit-msg
```

---

## 二、技术栈（严格对齐 PRD §5）

| 端 / 模块 | 技术栈 | 部署目标 |
|---|---|---|
| 用户端 | uni-app + Vue3 + Pinia + uView Plus | 微信小程序 |
| 商户端 | uni-app + Vue3 + Pinia + uView Plus | iOS / Android APP + 微信小程序 |
| 骑手端 | uni-app + Vue3 + Pinia + uView Plus | iOS / Android APP |
| 管理后台 | Vue3 + Vite + Element Plus + Pinia + Vue Router | Web |
| 后端 | **NestJS 10 + TypeScript**（PRD 明确允许） | Linux 容器 |
| 数据库 | MySQL 8.0 / Redis 7 / 时序库存轨迹 | 独立集群 |
| 中间件 | RabbitMQ 3.13 / MinIO / Redisson | 独立集群 |
| 容器化 | Docker + K8s + Nginx + Jenkins + Prometheus + Grafana | 私有云 |

---

## 三、环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20.19.0 | 与 uni-app Vite 3.x、NestJS 10.x 兼容 |
| pnpm | ≥ 8.8.0 | workspace 管理（本仓库使用 10.x 亦可） |
| Git | 任意现代版本 | - |
| Docker Desktop | ≥ 24 | 开发环境依赖编排 |
| HBuilderX 或 微信开发者工具 | 最新稳定版 | 前端预览（uni-app、小程序） |
| Android Studio / Xcode | 按端需要 | 商户端 / 骑手端 真机调试与打包 |

`.npmrc` 已开启 `engine-strict=true`，Node / pnpm 版本不达标将直接报错。

---

## 四、启动流程（首次拉起项目）

```bash
# 1. 根目录安装全部依赖（5 端 workspace 并行）
pnpm install

# 2. 拉起开发依赖（MySQL / Redis / RabbitMQ / MinIO）
pnpm docker:dev:up

# 3. 后端（Swagger http://localhost:3000/docs ；/health 探活）
pnpm dev:server

# 4. 各前端（在对应端二次安装过或一次 install 后即可）
pnpm dev:user       # 用户端 → 微信开发者工具导入 用户端/unpackage/dist/dev/mp-weixin
pnpm dev:merchant   # 商户端 → HBuilderX / 模拟器 运行 app-plus
pnpm dev:rider      # 骑手端 → HBuilderX / 模拟器 运行 app-plus
pnpm dev:admin      # 管理后台 → 浏览器自动打开 http://localhost:xxxx（登录 Super / 123456）

# 5. 关闭依赖
pnpm docker:dev:down
```

> **默认凭据仅供开发使用**，详见各端 `.env.*` 与 `部署/docker-compose.dev.yml`。
> 生产环境必须覆盖密码、密钥，并由 K8s Secret 注入。

### 4.1 默认服务访问信息（开发）

| 服务 | 地址 | 凭据 |
|---|---|---|
| MySQL | `localhost:3306` | `root / o2o_root_2026`，库 `o2o_platform` |
| Redis | `localhost:6379` | 密码 `o2o_redis_2026` |
| RabbitMQ MGMT | `http://localhost:15672` | `o2o / o2o_rmq_2026` |
| MinIO Console | `http://localhost:9001` | `o2o / o2o_minio_2026` |
| 后端 API | `http://localhost:3000/api/v1` | - |
| 后端 Swagger | `http://localhost:3000/docs` | - |
| 后端 Health | `http://localhost:3000/health` | - |

---

## 五、规范与流程

### 5.1 代码规范
- **编辑器**：`.editorconfig`（UTF-8 + LF + 2 空格）
- **Prettier**：单引号、无分号、行宽 100；根配置为全局基线
- **ESLint 9**（flat config）：根 `eslint.config.mjs` 覆盖根级脚本，各子项目有自身 `eslint.config.*`
- **Stylelint 16**：根 `.stylelintrc.cjs`（standard / recommended-scss / recess-order）
- **函数级注释**：所有函数必须包含 *功能 / 参数 / 返回值 / 用途* 四要素

### 5.2 Git 提交规范（Conventional Commits）
- `type` 枚举：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `revert` / `chore` / `wip`
- `scope` 建议：`用户端` / `商户端` / `骑手端` / `管理后台` / `后端` / `部署` / `docs` / `workspace`
- 交互式提交：`pnpm commit`（基于 cz-git，支持 emoji + 中文提示）
- 钩子：
  - `pre-commit`：`lint-staged` 仅对变更文件执行 prettier 修复
  - `commit-msg`：`commitlint` 强校验 header

### 5.3 阶段协作流程
本仓库按 `docs/P[1-9]_*` 的 6A 工作流推进：**ALIGNMENT → CONSENSUS → DESIGN → TASK → ACCEPTANCE → FINAL**（+ `TODO` 动态清单）。
协作细则详见 [`说明文档.md §六`](./说明文档.md)。

---

## 六、常见问题

### Q1 `pnpm install` 报 Node 版本不匹配
升级 Node 到 ≥ 20.19.0（推荐用 [Volta](https://volta.sh/) 或 nvm-windows）。

### Q2 安装 uni-app 依赖失败或拉包慢
根 `.npmrc` 已设置 `registry=https://registry.npmmirror.com/`。若被企业代理拦截，改为官方源 `https://registry.npmjs.org/`。

### Q3 Windows 中文路径导致 `uni` CLI 异常
1. 避免路径超 260 字符；
2. 使用 PowerShell 7+ 或 Terminal，不要在 cmd.exe 下启动；
3. 必要时把仓库迁移到纯英文路径做 CI 验证。

### Q4 管理后台 `pnpm --filter 管理后台 dev` 找不到 package
确认 `管理后台/package.json` 的 `name` 为 `管理后台`（本仓库已做 workspace 集成修改）。

### Q5 后端 `pnpm start:dev` 启动失败提示 `JWT_SECRET`
复制 `后端/.env.example` 为 `后端/.env.development` 并填入 16+ 位随机串（joi 校验）。

### Q6 docker compose 启动 MySQL 健康检查久未 healthy
首次启动需初始化 data 目录（30-60s）。检查本地 3306 端口是否被占用：`netstat -ano | findstr :3306`。

### Q7 lint-staged 或 commitlint 未触发
1. 根目录重新 `pnpm install` 会自动执行 `husky` 安装 hooks；
2. 确认 `.husky/pre-commit` 与 `.husky/commit-msg` 存在且有执行权限；
3. Windows 可能需要 `git config --get core.hooksPath` 为 `.husky`。

---

## 七、阶段路线图

| 阶段 | 任务 | 核心交付物 | 文档目录 |
|---|---|---|---|
| P1 | 项目初始化 | 各端脚手架、规范、容器化骨架 | `docs/P1_项目初始化/` |
| P2 | 数据库设计 | ER 图、建表脚本、Redis Key、时序库 | `docs/P2_数据库设计/` |
| P3 | 后端基础服务 | Auth/User/Message/File/Map | `docs/P3_后端基础服务/` |
| P4 | 后端业务服务 | 订单/商品/商户/派单/支付/财务/营销/评价 | `docs/P4_后端业务服务/` |
| P5 | 用户端开发 | 微信小程序完整包 | `docs/P5_用户端开发/` |
| P6 | 商户端开发 | iOS+Android APP | `docs/P6_商户端开发/` |
| P7 | 骑手端开发 | iOS+Android APP（定位上报） | `docs/P7_骑手端开发/` |
| P8 | 管理后台开发 | 10 大管理模块 | `docs/P8_管理后台开发/` |
| P9 | 集成测试部署 | 上线包、测试报告、运维手册 | `docs/P9_集成测试部署/` |

---

## 八、License & 保密等级

- 保密等级：**内部公开**（PRD §文档信息）
- 代码版权：O2O 平台研发团队
- 第三方依赖遵循各自 LICENSE（MIT / Apache-2.0 / BSD 为主）
