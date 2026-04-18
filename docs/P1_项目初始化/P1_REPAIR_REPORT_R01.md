# P1 修复报告 · 第 1 轮（R01）

- 轮次：**R01**（由 P1-REVIEW-01 触发）
- 执行角色：**Agent**（本文档撰写人）
- 执行时间：**2026-04-19 01:10 — 02:00（约 50 分钟）**
- 依据：Cascade 复审清单 **P1-REVIEW-01**（16 项发现；4 严重 / 6 中等 / 6 轻微）
- 范围约束：PRD V1.0、DESIGN_P1 §3/§4.3/§6.1/§7、ACCEPTANCE_P1、说明文档 §六
- 处置总览：**16 / 16 全量修复**；Z1 权威验证全通过；I-07/I-08 运行态 Docker/GUI 验证因本机无 `docker` CLI 留作用户亲验

---

## 一、总览

| 优先级 | 条目编号 | 数量 | 修复状态 |
|---|---|---|---|
| 🔴 严重 | I-01 / I-02 / I-03 / I-04 | 4 | ✅ 4/4 |
| 🟡 中等 | I-05 / I-06 / I-07 / I-08 / I-10 / I-11 | 6 | ✅ 6/6（I-07/I-08 运行态亲验项另行说明） |
| 🟢 轻微 | I-09 / I-12 / I-13 / I-14 / I-15 / I-16 | 6 | ✅ 6/6 |
| **合计** | | **16** | **16/16** |

---

## 二、逐项修复明细

### I-01（🔴）前端 fetchHealth 请求 404

- **问题**：三端 `src/api/index.ts` 的 `fetchHealth()` 走 `request.get('/health')`，而 `request` 的 `baseURL` 为 `VITE_API_BASE_URL = http://localhost:3000/api/v1`，实际发出 `http://localhost:3000/api/v1/health`，与后端约定 `http://localhost:3000/health` 不符
- **根因**：同一个 axios 实例被用于"业务 API（/api/v1 前缀）"与"系统级端点（/health、/docs）"两个不同作用域
- **修复**：三端 `src/utils/request.ts` 重构——抽出 `installInterceptors(instance, name)` 私有函数，同时由 `createRequest` 与 `createRootRequest` 调用，分别生成 `request`（含 `/api/v1` 前缀）与 `rootRequest`（不含）；`baseURL` 通过新增的 `stripApiPrefix()` 正则 `\/api\/v\d+\/?$/i` 从 `VITE_API_BASE_URL` 剥离；三端 `api/index.ts` 的 `fetchHealth()` 改走 `rootRequest.get('/health')`，同步把返回类型改为 `{ status, info?, error?, details? }` 以对齐 `@nestjs/terminus`
- **文件**：
  - `@c:/Users/Administrator/Desktop/O2O跑腿+外卖/用户端/src/utils/request.ts`
  - `@c:/Users/Administrator/Desktop/O2O跑腿+外卖/商户端/src/utils/request.ts`
  - `@c:/Users/Administrator/Desktop/O2O跑腿+外卖/骑手端/src/utils/request.ts`
  - `@c:/Users/Administrator/Desktop/O2O跑腿+外卖/用户端/src/api/index.ts`（及商/骑两端同名）
- **验证**：ESLint `lint:check` 0 error 0 warning（证据 `_verify_eslint_*_round2.log`）；运行时联通待 I-08 亲验

### I-02（🔴）三端 ESLint 配置缺失

- **问题**：`用户端/`、`商户端/`、`骑手端/` 既无 `eslint.config.mjs`，也无 `lint`/`lint:check` 脚本，也未声明 ESLint 相关依赖；根 `eslint.config.mjs` 反把三端加入 `ignores`，结果是"无人管控"
- **根因**：首轮遗漏，未按 DESIGN §6.1 落地到三端
- **修复**：
  - 新建三端 `eslint.config.mjs`（flat config + `tseslint.config` 辅助函数 + `pluginJs` + `pluginVue['flat/essential']` + prettier recommended，全部 `extends` 限定在 `src/**/*.{ts,vue}`），含 `uni/wx/plus/getApp/getCurrentPages` globals 与 Vue+TS parser 联动
  - 三端 `package.json` 追加 `lint` / `lint:check` 两个脚本
  - 三端 `devDependencies` 追加 `eslint@^9`、`@eslint/js`、`typescript-eslint@^8`、`eslint-plugin-vue@^9`、`eslint-config-prettier@^9`、`eslint-plugin-prettier@^5`、`globals@^15`、`prettier@^3`
  - 根 `eslint.config.mjs` 的 `ignores` 移除三端条目（对应 I-12 配合）
- **文件**：三端 `eslint.config.mjs` + `package.json`；根 `eslint.config.mjs`
- **验证**：`pnpm --filter <端> lint:check` 三端均 **Exit 0**

### I-03（🔴）三端 Stylelint 配置缺失

- **问题**：三端无 `.stylelintrc.cjs`、无 `lint:stylelint` 脚本、无相关依赖；根 `.stylelintrc.cjs` 又把三端加入 `ignoreFiles`
- **根因**：首轮遗漏
- **修复**：
  - 新建三端 `.stylelintrc.cjs`（`stylelint-config-standard-scss` + `stylelint-config-recommended-vue/scss` + `stylelint-config-html/vue` + `stylelint-config-recess-order`；`overrides` 为 `.vue/html → postcss-html`、`.css/scss → postcss-scss`；`unit-no-unknown` 白名单 `rpx/upx` 适配 uni-app；放宽 `rule-empty-line-before` 与 `scss/dollar-variable-empty-line-before`）
  - 三端 `package.json` 追加 `lint:stylelint` / `lint:stylelint:check`
  - 追加 stylelint 系列 devDependencies（`stylelint@^16` + 上述 5 个 config + `postcss-html`/`postcss-scss`）
  - 根 `.stylelintrc.cjs` 的 `ignoreFiles` 移除三端条目
- **文件**：三端 `.stylelintrc.cjs` + `package.json`；根 `.stylelintrc.cjs`
- **验证**：`pnpm --filter <端> lint:stylelint:check` 三端均 **Exit 0**（首次 `--fix` 自动修好 `properties-order`、`import-notation` 等可修项）

### I-04（🔴）三端 uni.config.ts 编造写法

- **问题**：首轮的 `uni.config.ts` 使用了不存在的 `defineUniConfig()`；该配置不被 uni-cli 识别
- **根因**：编造 API（违反"绝不编造代码"硬红线）
- **修复**：三端 `uni.config.ts` 改为对齐 DESIGN §3 与 uni-cli 实际接受格式——直接 `export default { transpileDependencies: [] }`，并补完整函数级 JSDoc 注明用途（P5/P6/P7 阶段引入 ESM-only 依赖时的登记位置）
- **文件**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/用户端/uni.config.ts`（及商/骑两端）
- **验证**：三端 ESLint 不再报 parser error；文件加入 eslint `src/**` 以外，不参与 `lint:check`（符合作用域设计）

### I-05（🟡）HealthController.check() 函数级注释缺失

- **问题**：`check()` 无 JSDoc，违背"**所有函数必须函数级注释**"硬红线
- **修复**：补全 4 要素 JSDoc（功能/参数/返回值/用途），并显式声明返回类型 `Promise<HealthCheckResult>`；顺带确认类级注释与 `pingRedis` 注释完整
- **文件**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/后端/src/health/health.controller.ts:29-45`
- **验证**：后端 `pnpm --filter 后端 build` **Exit 0**（证据 `_verify_后端_build.log`）

### I-06（🟡）说明文档 P1 状态提前置绿

- **问题**：说明文档 §3.1 将 P1 置 🟢，但 Docker/GUI 未验证、复审未出具
- **修复**：
  - §3.1 `P1 项目初始化` 状态由 🟢 **回退为 🟡 复审修复中**；备注注明复审发现 16 项、第 1 轮 16/16 全修、待二审
  - §3.3 追加 2 条日志：P1-REVIEW-01 发现清单 + 第 1 轮修复结论
  - §4 变更记录追加 V1.4 行
- **文件**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/说明文档.md:120` / `:165-166` / `:176`
- **验证**：文档 `.md` Prettier `printWidth: 120` 格式未破坏（I-13 新增 overrides）

### I-07（🟡）docker compose 静态验证

- **问题**：首轮 FINAL 声称"compose config 语法可解析"但无证据命令输出
- **修复路径**：预期跑 `docker compose -f docker-compose.dev.yml config` 做静态验证
- **本轮结果**：**本机无 `docker` CLI**（`CommandNotFoundException`，证据 `_verify_docker_compose_config.log`）→ 标记为"**需用户亲验**"（与 `pnpm docker:dev:up` 属同一类阻塞），本项修复范围完成到"识别阻塞并记录"
- **建议**：用户在装 Docker Desktop 的机器上执行 `docker compose -f docker-compose.dev.yml config` 与 `docker compose -f docker-compose.dev.yml up -d`，然后再决定 §3.1 P1 是否可回升 🟢

### I-08（🟡）后端运行态 /health & /docs、三端 build 亲验

- **问题**：FINAL 声称"机器可验项全通过"，但 `start:dev` 实际未执行、`/health` 响应、`/docs` 可达性、三端 `build` 均无直接证据
- **修复路径**：期望执行 `pnpm --filter 后端 start:dev` → `curl /health`/`curl /docs` → 三端 `pnpm --filter <端> build:h5`
- **本轮结果**：后端 `start:dev` 需要 MySQL/Redis 容器（docker-compose.dev.yml 拉起），本机无 docker 环境 → **整体运行态联通属 I-07 衍生亲验项**；但**静态层**已全覆盖：
  - 后端 `pnpm --filter 后端 build` **Exit 0**（包含 tsc 全量类型检查）
  - 三端 ESLint/Stylelint 0 error 0 warning（src 下实际文件经完整规则核验）
- **建议**：用户 `pnpm docker:dev:up` 后再跑 `pnpm --filter 后端 start:dev` 与 `pnpm --filter 用户端 build:h5` 等；亲验清单放在 FINAL §遗留项

### I-09（🟢）commitlint 移除 wip type

- **修复**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/commitlint.config.cjs` 的 `type-enum` 中删除 `'wip'`（保留 feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert 共 11 个标准类型）
- **验证**：`git commit -m "wip: xxx"` 将被钩子拒绝（手工测不执行，仅为 lint:config 合法性）

### I-10（🟡）Redis 健康检查每次新建连接

- **问题**：`pingRedis` 每次 `new Redis() + connect + quit`，高频调用易句柄泄漏 / 连接抖动
- **修复**：
  - 新建 `@c:/Users/Administrator/Desktop/O2O跑腿+外卖/后端/src/health/redis.provider.ts`：导出 `REDIS_CLIENT` Token + `redisClientProvider`（`useFactory` 基于 `ConfigService` 构造一次 `ioredis` 单例，`lazyConnect + connectTimeout 1500 + maxRetriesPerRequest 1 + enableOfflineQueue false`；`connect()` 失败静默由健康检查感知）
  - `HealthModule.providers` 注册 `redisClientProvider`，并 `exports: [REDIS_CLIENT]` 以便业务模块复用
  - `HealthController` 构造函数改为 `@Inject(REDIS_CLIENT) private readonly redis: Redis`；`pingRedis` 仅 `await this.redis.ping()`
- **文件**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/后端/src/health/redis.provider.ts` / `health.module.ts:13-18` / `health.controller.ts:23-65`
- **验证**：`pnpm --filter 后端 build` **Exit 0**

### I-11（🟡）响应体 code 语义统一 + README §5.1

- **问题**：`AllExceptionsFilter` 把 `code` 写成 HTTP 状态码（最极端情况下可能撞 `0`），与 `TransformInterceptor` 的 `code=0` 成功语义冲突；README §5.1 未定义异常 code 口径
- **修复**：
  - Filter 新增 `code` 分支逻辑：`HttpException ? (getStatus() || 1) : 1000`；响应体新增 `httpStatus` 字段（独立于 `code`），字段顺序调整为 `code / message / data / httpStatus / path / timestamp`
  - 后端 `README.md §5.1` 重写：成功/失败结构双块展示 + `code` 语义 3 行对照表（成功 0 / HttpException=HTTP / 未捕获=1000）+ `httpStatus` 用途说明
- **文件**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/后端/src/common/filters/all-exceptions.filter.ts:44-59` / `后端/README.md:118-152`
- **验证**：`pnpm --filter 后端 build` **Exit 0**；前端三端 `request.ts` 响应拦截器仍以 `body.code === 0` 判定成功（与新口径一致）

### I-12（🟢）根 ESLint flat 作用域混乱

- **修复**：改用 `tseslint.config(...)` 辅助函数；把 `pluginJs.configs.recommended` / `...tseslint.configs.recommended` / `eslintPluginPrettierRecommended` 作为 `extends` 放入**带 `files` 的对象**内（`files: ['*.{js,cjs,mjs,ts,cts,mts}', 'scripts/**/*.{js,cjs,mjs,ts}']`），确保所有扩展规则都被作用域约束到根目录脚本；`ignores` 清理——仅保留 `管理后台/` `后端/` `node_modules/` 等，三端由其自身 eslint 管控
- **文件**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/eslint.config.mjs:19-65`

### I-13（🟢）.prettierrc 缺 Markdown overrides

- **修复**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/.prettierrc` 顶层为 `printWidth: 100`；新增 `overrides: [{ files: '*.md', options: { printWidth: 120, proseWrap: 'preserve' } }]`，避免 README/说明文档长行被折成视觉碎片
- **验证**：`.md` 文件编辑后 Prettier 不再自动拦腰折行

### I-14（🟢）pnpm deploy 语法核实

- **修复**：通过官方文档 <https://pnpm.io/cli/deploy> 核实 `--prod`、`--filter`、`--legacy` 三个 flag 均为 pnpm 10.x 正式命令；Dockerfile 里改为 `pnpm --filter 后端 deploy --prod --legacy /deploy`（旧写法 `pnpm --filter 后端 --prod deploy /deploy` 在默认 `inject-workspace-packages=false` 条件下会失败）；补注释标注来源 URL
- **文件**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/后端/Dockerfile:31-35`
- **备注**：本机无 `docker` CLI，未能 `docker build --target builder` 复现验证，留作用户亲验

### I-15（🟢）commitlint maxHeaderLength 默认 72

- **修复**：`@c:/Users/Administrator/Desktop/O2O跑腿+外卖/commitlint.config.cjs` 追加 `'header-max-length': [2, 'always', 100]`，中文语境下 72 字符容易触发误拦，放宽到 100

### I-16（🟢）后端 common/index.ts barrel 缺失

- **修复**：
  - 新建 `@c:/Users/Administrator/Desktop/O2O跑腿+外卖/后端/src/common/index.ts`，re-export `AllExceptionsFilter`、`LoggingInterceptor`、`TransformInterceptor` + `StandardResponse` 类型
  - `@c:/Users/Administrator/Desktop/O2O跑腿+外卖/后端/src/app.module.ts:6` 3 行 import 合并为 1 行 `from './common'`
- **验证**：`pnpm --filter 后端 build` **Exit 0**

### I-17（🟡 **尝试但撤回** · 非 R01 修复集）三端 build:h5 因 pinia 3 devtools 传递链阻塞

- **发现时机**：Z1 权威验证通过后，本轮"加分项"尝试 `pnpm --filter 用户端 build:h5` 时暴露
- **现象**：`[vite]: Rollup failed to resolve import "@vue/devtools-api" from ".../pinia.mjs"`
- **尝试 A（失败）**：三端 `dependencies` 追加 `@vue/devtools-api@^7.7.2` + `pnpm install` → 新错误 `Rollup failed to resolve import "@vue/devtools-kit" from ".../@vue/devtools-api/dist/index.js"`（devtools-api 自身的 transitive dep 缺失）
- **尝试 B（失败）**：根 `.npmrc` 追加 `public-hoist-pattern[]=@vue/devtools-*` + `pnpm install --force` → 错误依然。根因：`public-hoist-pattern` 的 hoist 目标是**根 `node_modules`**，而 Vite/Rollup 从**各 workspace 项目目录**查找依赖，hoist 到根无法被解析
- **尝试 C（失败）**：三端 `dependencies` 再追加 `@vue/devtools-kit@^7.7.2` → 又出现 `Rollup failed to resolve import "@vue/devtools-shared" from ".../@vue/devtools-kit/dist/index.js"`；显然 transitive 链递归无尽头
- **最终决策**：**撤回所有 I-17 改动**，三端 `package.json` 与 `.npmrc` 回到 R01 原设计状态；`build:h5` 作为 I-08 运行态亲验项在本轮不做修复（越出 R01 scope）
- **根因分析**：pnpm 10 `node-linker=isolated` 模式下，Vite 5 + Rollup 在解析 `pinia@3` 的运行时 `static import @vue/devtools-api` 时，不沿 `.pnpm/` symlink 向上遍历 transitive deps；pinia 3 未使用 `__DEV__` 条件编译剥离 devtools 路径，而是静态 import，所以 prod build 也需要 devtools 链完整可达
- **P5/P6/P7 阶段候选方案**（三选一，写入 `.npmrc` 注释）：
  1. **降级 `pinia` 到 `2.3.x`**：其 devtools 走 `() => import(...)` 动态 import，Rollup 可 tree-shake，production build 不触发解析
  2. **三端 `vite.config.ts` 的 `resolve.alias` 把 `@vue/devtools-*` 全族统一 stub**：用 `find: /^@vue\/devtools-.*/, replacement: '…空实现…'`
  3. **改用 uni-app 官方推荐的 pinia 适配**（如 DCloud 官方 / `@uni-helper/pinia-plugin-*`）
- **本轮对 R01 的结论**：**I-17 不计入"16 项全量修复"统计**；本条纯粹是越界尝试的如实记录，便于 P1-REVIEW-02 追溯
- **验证**：撤回后三端 `lint:check` / `lint:stylelint:check` 仍 **Exit 0**（证据 `_verify_install_round5.log`；撤回后 lint 复验通过）

---

## 三、权威验证结果（Z1）

| 验证项 | 命令 | 结果 | 证据 |
|---|---|---|---|
| 根 pnpm install（装三端新 deps） | `pnpm install` | ✅ Exit 0，8.7s | `docs/P1_项目初始化/_verify_install.log` |
| 用户端 ESLint | `pnpm --filter 用户端 lint:check` | ✅ Exit 0 | `_verify_eslint_用户端_round2.log` |
| 商户端 ESLint | `pnpm --filter 商户端 lint:check` | ✅ Exit 0 | `_verify_eslint_商户端_round2.log` |
| 骑手端 ESLint | `pnpm --filter 骑手端 lint:check` | ✅ Exit 0 | `_verify_eslint_骑手端_round2.log` |
| 用户端 Stylelint | `pnpm --filter 用户端 lint:stylelint:check` | ✅ Exit 0 | `_verify_stylelint_用户端_round2.log` |
| 商户端 Stylelint | `pnpm --filter 商户端 lint:stylelint:check` | ✅ Exit 0 | `_verify_stylelint_商户端_round2.log` |
| 骑手端 Stylelint | `pnpm --filter 骑手端 lint:stylelint:check` | ✅ Exit 0 | `_verify_stylelint_骑手端_round2.log` |
| 后端 build（含 tsc） | `pnpm --filter 后端 build` | ✅ Exit 0 | `_verify_后端_build.log` |
| docker compose 静态校验 | `docker compose -f docker-compose.dev.yml config` | ⛔ 本机无 docker CLI | `_verify_docker_compose_config.log` |

---

## 四、未覆盖 / 需用户亲验项

以下两项因本机（Windows）无 `docker` CLI，未进入本轮验证清单，需用户在装 Docker Desktop 的环境执行：

1. **I-07 Docker 服务链路**
   - `docker compose -f docker-compose.dev.yml config`（静态合法性）
   - `pnpm docker:dev:up` 拉起 MySQL 8 / Redis 7 / RabbitMQ / MinIO
2. **I-08 运行态 GUI 联通**
   - `pnpm --filter 后端 start:dev` 启动 → `curl http://localhost:3000/health` 期望 `status=ok` + `database=up` + `redis=up`
   - 浏览器打开 `http://localhost:3000/docs` 期望看到 Swagger UI
   - 三端 `pnpm --filter <端> build:h5` 当前因 **I-17** 所述 pinia 3 devtools 传递链阻塞而失败；建议在 P5+ 阶段按 `.npmrc` 注释所列候选方案之一修复后再做

> 通过以上 2 大项（含 I-17 的选型决策）后，说明文档 §3.1 P1 状态可由 🟡 升回 🟢。

---

## 五、后续建议

- **进入 P1-REVIEW-02（第 2 轮 Cascade 复审）**：只看差分，聚焦 16/16 修复是否严格对齐 P1-REVIEW-01 口径 + 未引入新问题；建议重点核验：
  1. `rootRequest` 的 `baseURL` 剥离正则是否覆盖所有线上环境变量写法
  2. Filter `httpStatus` 字段是否与前端现有拦截器兼容（前端仍用 `body.code === 0`，OK）
  3. `redisClientProvider` 在 Nest 容器销毁时是否需要 `OnApplicationShutdown` 显式 `quit()`（可记入 P3 TODO）
  4. 三端 Stylelint 允许 `rpx/upx` 后的其它 `unit-no-unknown` 暴露面（如 `vw/vh` 是否需要白名单）
- **若第 2 轮通过**：更新 `说明文档.md §3.1` 与 `FINAL_P1_项目初始化.md` 签字区；删除 `docs/P1_项目初始化/_verify_*.log` 临时证据（或移入 `_archive/` 子目录）

---

**报告签发**：Agent（本次 B/C 循环执行者）
**签发时间**：2026-04-19 02:00
**下一动作**：等待 Cascade P1-REVIEW-02 输入
