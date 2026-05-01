# P9 CI Pipeline Guide

> P9 Sprint 5 W5.D.4 — Jenkins CI/CD 流水线指南
> 维护人：Sprint 5 Agent D
> 适用范围：`部署/ci/Jenkinsfile` + `部署/ci/scripts/*.sh`

## § 1 流水线总览

完整 stage 列表（按执行顺序）：

| # | Stage | 触发条件 | 说明 |
| - | ----- | -------- | ---- |
| 1 | Checkout | 始终 | `checkout scm` |
| 2 | Install | 始终 | `corepack enable && pnpm install --frozen-lockfile` |
| 3 | Lint & Unit | 始终（并行） | Backend Lint / Backend Unit / Admin Build |
| 4 | Integration | `RUN_INTEGRATION=true` | docker-compose 全栈 e2e |
| 5 | Backend Integration Tests | 始终 | `jest -c jest-integration.config.js` |
| 6 | E2E | `RUN_E2E=true` | Playwright |
| 7 | Performance | `RUN_PERF=true` | k6 |
| 8 | Security Scan | `RUN_SECURITY=true` | trivy / npm audit |
| 9 | Build & Push | `RUN_DEPLOY=true` | docker build/push |
| 10 | **Upload Sourcemap** | `SENTRY_AUTH_TOKEN` 已注入 | Sentry releases 三段式 + 删 .map（4 端） |
| 11 | **Lighthouse** | `LIGHTHOUSE_URL` 已注入 | 性能门禁 + 报告归档 |
| 12 | Deploy Staging | `RUN_DEPLOY=true` | helm upgrade staging |
| 13 | Smoke Test | `RUN_DEPLOY=true` | smoke.sh staging |
| 14 | Approval | main + `RUN_DEPLOY=true` | 人工确认 |
| 15 | Deploy Production | main + `RUN_DEPLOY=true` | helm upgrade production |
| 16 | Post Smoke | main + `RUN_DEPLOY=true` | smoke.sh production |

> 注：本 Sprint 仅新增 / 调整 Stage 10 / Stage 11，其余沿用既有定义。

## § 2 Sourcemap 步骤（Stage 10）

### 2.1 触发条件

`when { expression { env.SENTRY_AUTH_TOKEN != null } }` —— 凭据缺失自动跳过。

### 2.2 环境变量（Jenkins Credentials 注入）

| 变量 | 必填 | 说明 |
| ---- | ---- | ---- |
| `SENTRY_AUTH_TOKEN` | 是 | Sentry 内部令牌（CI Secret） |
| `SENTRY_ORG`        | 是 | Sentry 组织 slug |
| `SENTRY_PROJECT`    | 是 | Sentry 项目 slug（按端切分时由调用方注入） |

**release 版本号**：取 Jenkins 内置 `${BUILD_NUMBER}`（流水线注入）。

### 2.3 执行步骤

每端独立调用 `upload-sourcemap.sh <BUNDLE_DIR> <RELEASE_VERSION>`：

```
bash 部署/ci/scripts/upload-sourcemap.sh ./管理后台/dist ${BUILD_NUMBER}
bash 部署/ci/scripts/upload-sourcemap.sh ./用户端/dist  ${BUILD_NUMBER}
bash 部署/ci/scripts/upload-sourcemap.sh ./商户端/dist  ${BUILD_NUMBER}
bash 部署/ci/scripts/upload-sourcemap.sh ./骑手端/dist  ${BUILD_NUMBER}
```

脚本内部使用 `@sentry/cli@^2` 三段式：

1. `sentry-cli releases new $RELEASE_VERSION`
2. `sentry-cli releases files $RELEASE_VERSION upload-sourcemaps ./dist --url-prefix '~/' --rewrite`
3. `sentry-cli releases finalize $RELEASE_VERSION`
4. `find ./dist -name '*.map' -type f -delete`（避免对外暴露源码）

### 2.4 vite sourcemap 状态

为支持本 stage，4 端 `vite.config.ts` 均已开启 `build.sourcemap = true`：

- `管理后台/vite.config.ts`
- `用户端/vite.config.ts`
- `商户端/vite.config.ts`
- `骑手端/vite.config.ts`

## § 3 Lighthouse 步骤（Stage 11）

### 3.1 触发条件

`when { expression { env.LIGHTHOUSE_URL != null } }` —— 未配置目标 URL 时跳过。

### 3.2 调用方式

```
bash 部署/ci/scripts/lighthouse.sh ${LIGHTHOUSE_URL} ./lighthouse-ci.json
```

### 3.3 阈值与门禁

| 项 | 默认值 | 行为 |
| -- | ------ | ---- |
| `PERF_THRESHOLD` | 50 | `score < 50` → `exit 1` 构建失败 |
| `--only-categories` | performance | 仅跑性能类目（节省时间） |
| `--chrome-flags` | `--headless --no-sandbox --disable-gpu` | CI 环境必备 |

### 3.4 关键指标

脚本始终打印 4 项核心指标：

- FCP（First Contentful Paint）
- LCP（Largest Contentful Paint）
- TBT（Total Blocking Time）
- CLS（Cumulative Layout Shift）

### 3.5 报告归档

`post.always` 中 `archiveArtifacts artifacts: 'lighthouse-ci.json'` —— 在 Jenkins build artifacts 页面可直接下载完整 JSON 报告。

### 3.6 vite preview 自动管理

当 `LIGHTHOUSE_URL` 含 `localhost:4173` 时，脚本自动：

1. `pnpm --filter 管理后台 preview --host 0.0.0.0 --port 4173 &`
2. `sleep 3` + `curl` 探活（最多 5 次重试）
3. 跑完 lighthouse 后通过 `trap cleanup EXIT` 杀掉 preview 进程

## § 4 真集群依赖（Jenkins Agent 预装清单）

| 工具 | 用途 | 安装提示 |
| ---- | ---- | -------- |
| `node` 18+ / `pnpm` | 构建 / preview | `corepack enable` |
| `chromium` 或 `google-chrome` | Lighthouse Chrome | `apt-get install chromium-browser` |
| `npx`（随 npm） | `npx lighthouse` | 随 node |
| `jq` | 解析 Lighthouse JSON | `apt-get install jq` |
| `curl` | preview 探活 | 默认 |
| `sentry-cli` v2 | sourcemap 上传 | `curl -sL https://sentry.io/get-cli/ \| bash` |
| `docker` / `helm` | 镜像与发布（既有 stage） | — |

> 脚本不会在运行时主动 `npm i -g`；缺工具直接报错，避免 CI 节点状态漂移。

## § 5 失败排查 Checklist

### 5.1 Upload Sourcemap 失败

- [ ] `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` 是否在 Jenkins Credentials 中正确绑定？
- [ ] CI agent 上 `sentry-cli --version` 是否可用？版本是否 `>= 2`？
- [ ] `<BUNDLE_DIR>` 是否真实存在（前置 `Build & Push` 是否成功）？
- [ ] vite 是否输出了 `.map` 文件？检查 `build.sourcemap === true`。
- [ ] `release new` 报 401 → token 失效；报 404 → org / project slug 拼写错误。

### 5.2 Lighthouse 失败

- [ ] `LIGHTHOUSE_URL` 配置是否正确？localhost preview 端口是否被占用？
- [ ] `npx lighthouse --version` 是否可用？
- [ ] chromium 是否已安装？`which chromium-browser || which google-chrome`。
- [ ] `--no-sandbox` 是否生效？容器内必须传该 flag。
- [ ] `jq` 是否可用？没有 jq 时脚本无法解析 score。
- [ ] performance score < 50 → 是构建合规失败，应排查首屏体积、第三方阻塞资源。
- [ ] preview 探活失败 → 查看 `/tmp/lighthouse-preview.log`，常见为 `manifest.json` 缺失或端口冲突。

### 5.3 通用排查

- [ ] `sh '...'` 步骤需保证 Jenkins agent 默认 shell 为 `bash`（脚本 shebang 已声明 `#!/usr/bin/env bash`）。
- [ ] `set -euo pipefail` 下任何子命令失败立即退出；先单独跑脚本定位行号。
- [ ] 中文目录（管理后台 / 用户端 / 商户端 / 骑手端）需 agent locale 支持 UTF-8（`LANG=C.UTF-8`）。
