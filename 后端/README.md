# 后端（O2O · NestJS 10 + TypeScript）

> 平台服务端。对应 **PRD §3.5**：认证 / 用户 / 消息 / 文件 / 地图（§3.5.1 基础服务）+ 订单 / 商品 / 商户 / 派单 / 支付 / 财务 / 营销 / 评价（§3.5.2 业务服务）+ 管理后台聚合 / 数据大盘 / 客服风控。

---

## 一、目录结构（DESIGN_P1 §4.1）

```
后端/
├── src/
│   ├── main.ts                         # 启动入口（Swagger / 全局管道 / CORS / 版本化）
│   ├── app.module.ts                   # 根模块
│   ├── config/
│   │   ├── configuration.ts            # 分组配置工厂
│   │   └── env.validation.ts           # joi 环境变量 Schema
│   ├── common/
│   │   ├── filters/all-exceptions.filter.ts      # 统一异常 → { code, message, data, timestamp }
│   │   └── interceptors/
│   │       ├── transform.interceptor.ts          # 响应体包装
│   │       └── logging.interceptor.ts            # 请求日志
│   ├── database/database.module.ts     # TypeORM + MySQL 8 异步初始化
│   ├── queues/queues.module.ts         # BullMQ（Redis 连接）
│   ├── health/
│   │   ├── health.module.ts
│   │   └── health.controller.ts        # GET /health，探 db + redis
│   └── modules/                        # 16 个业务占位（P3-P4 阶段填充）
│       ├── auth/  user/  message/  file/  map/
│       ├── order/ product/ shop/ dispatch/ payment/
│       ├── finance/ marketing/ review/
│       └── admin/ stats/ customer/
├── test/jest-e2e.json
├── .env.example / .env.development / .env.production
├── .dockerignore
├── Dockerfile
├── nest-cli.json
├── package.json
├── tsconfig.json / tsconfig.build.json
└── README.md
```

---

## 二、启动与构建

> 必须先在仓库根目录执行 `pnpm install`。

```bash
# 开发（热更新）
pnpm --filter 后端 start:dev
# 或
pnpm dev:server

# 生产构建 + 运行
pnpm --filter 后端 build
pnpm --filter 后端 start:prod

# 调试（可挂 Chrome DevTools 9229 端口）
pnpm --filter 后端 start:debug

# 单测 / e2e 测试
pnpm --filter 后端 test
pnpm --filter 后端 test:e2e
pnpm --filter 后端 test:cov

# 格式化 / Lint
pnpm --filter 后端 format
pnpm --filter 后端 lint
```

启动成功后：

- Swagger：<http://localhost:3000/docs>
- 健康检查：<http://localhost:3000/health>（返回 terminus 标准格式）
- API 前缀：`http://localhost:3000/api/v1`（URI 版本：`/v1/*`）

---

## 三、依赖（DESIGN_P1 §4.2 锁定版本）

| 类别 | 依赖 | 版本 |
|---|---|---|
| NestJS 核心 | `@nestjs/{core,common,platform-express}` | ^10.4.0 |
| 配置 | `@nestjs/config` + `joi` | ^3.2 / ^17.13 |
| TypeORM | `@nestjs/typeorm` + `typeorm` + `mysql2` | ^10.0 / ^0.3 / ^3.11 |
| 缓存 | `@nestjs/cache-manager` + `cache-manager-ioredis-yet` + `ioredis` | - |
| 队列 | `@nestjs/bullmq` + `bullmq` | ^10 / ^5.12 |
| 消息 | `amqplib` | ^0.10 |
| 鉴权 | `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` | - |
| 文档 | `@nestjs/swagger` | ^7.4 |
| 校验 | `class-validator` + `class-transformer` | - |
| 健康 | `@nestjs/terminus` | ^10.2 |
| 存储 | `minio` | ^8.0 |

---

## 四、环境变量

复制 `.env.example` → `.env.development`（与 `.env.production`），填入：

| 分组 | 变量 | 必填 |
|---|---|---|
| 应用 | `NODE_ENV` / `APP_PORT` / `APP_PREFIX` | 否 |
| MySQL | `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | ✅ |
| Redis | `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASS` / `REDIS_DB` | ✅ |
| JWT | `JWT_SECRET`（≥16 位） / `JWT_EXPIRES_IN` | ✅ |
| RabbitMQ | `RABBITMQ_URL` | P3+ |
| MinIO | `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` | P3+ |
| 第三方 | `WECHAT_*` / `ALIPAY_*` / `SMS_*` / `PUSH_*` / `MAP_*` | P3+ |
| 日志 | `LOG_LEVEL`（`error`/`warn`/`info`/`debug`/`verbose`） | 否 |

`src/config/env.validation.ts`（joi）会在启动时强校验，关键变量缺失或类型错误会直接退出。

---

## 五、全局约定

### 5.1 响应体结构（拦截器自动包装 / 异常过滤器统一输出）

**成功**（由 `TransformInterceptor` 自动包装 Controller 返回值）：

```json
{
  "code": 0,
  "message": "ok",
  "data": <业务数据>,
  "timestamp": 1710000000000
}
```

**失败**（由 `AllExceptionsFilter` 统一输出；I-11 口径）：

```json
{
  "code": <非 0 业务错误码>,
  "message": "具体错误描述",
  "data": null,
  "httpStatus": <HTTP 状态码>,
  "path": "/api/v1/xxx",
  "timestamp": 1710000000000
}
```

`code` 语义约定：

| 异常来源 | `code` 取值 | 说明 |
|---|---|---|
| 成功 | `0` | 由 `TransformInterceptor` 固定写入 |
| `HttpException`（含业务主动抛出的 4xx/5xx） | `HTTP 状态码`（当状态码为 0 时兜底 `1`） | 如 404→`404`、400→`400`；绝不与 `0`（成功）混淆 |
| 未捕获异常（含 Node 内部错误 / 代码 Bug） | `1000`（兜底） | 同时 HTTP 返回 500；前端可识别为"服务端未处理异常" |

`httpStatus` 字段独立于 `code`，供前端在日志上报、埋点、重试策略中使用；前端业务判定仍以 `code === 0` 为"成功"。

### 5.2 API 版本
URI 版本：默认 `v1`，例：`GET /api/v1/orders`。Controller 中用 `@Version('2')` 叠加。

### 5.3 CORS
开发环境放开所有 origin；生产由网关层（Nginx / K8s Ingress）控制，关闭应用层 CORS。

### 5.4 日志
使用 Nest 内置 Logger（`LoggingInterceptor` 输出 `[METHOD] URL +Xms`）。P3+ 可切换到 Pino / Winston + 结构化日志。

---

## 六、Docker 构建

```bash
# 在仓库根目录执行（上下文需包含 pnpm-workspace.yaml）
docker build -f 后端/Dockerfile -t o2o-server:0.1.0 .

# 运行（需自行链接 MySQL / Redis 网络）
docker run --rm -p 3000:3000 --env-file 后端/.env.production o2o-server:0.1.0
```

Dockerfile 多阶段：
1. `deps`：仅装依赖（最大化缓存）
2. `builder`：`nest build` + `pnpm deploy --prod` 剪枝
3. `runner`：`node:20-alpine` + `tini` + 非 root 用户 + HealthCheck

---

## 七、常见问题

- **启动失败 `Config validation error: "JWT_SECRET" length must be >= 16`** — 补齐 `.env.development`。
- **`database: down`** — 确认 `pnpm docker:dev:up` 已拉起 MySQL，或改 `DB_*` 为真实地址。
- **`redis: down`** — 检查 `REDIS_PASS` 是否与 `docker-compose.dev.yml` 一致（默认 `o2o_redis_2026`）。
- **Swagger 404** — `app.setGlobalPrefix` 已排除 `/docs`，确保路径不要拼 `/api/v1`。
- **TypeORM 连不上 MySQL 8**：DESIGN 已使用 `caching_sha2_password` 作为默认认证插件；确认 `mysql2` 依赖已安装。
