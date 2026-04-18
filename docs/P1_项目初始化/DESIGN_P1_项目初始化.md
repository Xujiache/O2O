# DESIGN_P1_项目初始化

> 本文件为 P1 阶段**详细设计**，描述目录、配置、脚本、Docker 编排的落地细节。

---

## 一、整体架构图

```
┌──────────────────────────────────────────────────────────┐
│                    O2O 平台 monorepo                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐    │
│  │ 用户端   │ │ 商户端   │ │ 骑手端   │ │ 管理后台  │    │
│  │ (小程序) │ │ (APP)    │ │ (APP)    │ │ (Web)     │    │
│  └─────┬────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘    │
│        │           │            │             │          │
│        └───────────┼────────────┴─────────────┘          │
│                    │ HTTPS + WS                          │
│              ┌─────▼──────┐                              │
│              │ 后端 Nest  │                              │
│              │ 模块化单体 │                              │
│              └─────┬──────┘                              │
│  ┌──────┬──────────┼──────────┬──────┬────────┐          │
│  │MySQL │ Redis    │ RabbitMQ │MinIO │ 第三方 │          │
│  └──────┴──────────┴──────────┴──────┴────────┘          │
└──────────────────────────────────────────────────────────┘
```

---

## 二、pnpm-workspace 设计

### 2.1 `pnpm-workspace.yaml`

```yaml
packages:
  - '用户端'
  - '商户端'
  - '骑手端'
  - '管理后台'
  - '后端'
```

### 2.2 根 `package.json`

```json
{
  "name": "o2o-platform",
  "private": true,
  "engines": { "node": ">=20.19.0", "pnpm": ">=8.8.0" },
  "scripts": {
    "dev:user": "pnpm --filter 用户端 dev",
    "dev:merchant": "pnpm --filter 商户端 dev",
    "dev:rider": "pnpm --filter 骑手端 dev",
    "dev:admin": "pnpm --filter 管理后台 dev",
    "dev:server": "pnpm --filter 后端 start:dev",
    "build:all": "pnpm -r build",
    "lint": "pnpm -r lint",
    "docker:dev:up": "docker compose -f 部署/docker-compose.dev.yml up -d",
    "docker:dev:down": "docker compose -f 部署/docker-compose.dev.yml down"
  },
  "devDependencies": {
    "husky": "^9.1.5",
    "lint-staged": "^15.5.2",
    "@commitlint/cli": "^19.4.1",
    "@commitlint/config-conventional": "^19.4.1",
    "cz-git": "^1.11.1",
    "commitizen": "^4.3.0"
  }
}
```

---

## 三、三端 uni-app 骨架设计

每端（用户端/商户端/骑手端）结构一致：

```
用户端/
├── src/
│   ├── pages/                    # 页面（PRD §3.1 六大模块占位）
│   │   ├── index/                # 首页模块
│   │   ├── takeout/              # 外卖点餐模块
│   │   ├── errand/               # 跑腿模块
│   │   ├── order/                # 订单模块
│   │   ├── user/                 # 个人中心
│   │   └── pay/                  # 支付
│   ├── components/
│   ├── api/
│   ├── store/                    # Pinia
│   ├── utils/
│   ├── static/
│   ├── App.vue
│   ├── main.ts
│   ├── manifest.json             # uni-app 平台配置
│   ├── pages.json
│   └── uni.scss
├── env/                          # .env.development / .env.production
├── package.json
├── tsconfig.json
├── vite.config.ts
├── uni.config.ts
└── README.md
```

### 3.1 uni-app 关键依赖

```json
{
  "dependencies": {
    "@dcloudio/uni-app": "3.0.0-alpha-xxxx",
    "@dcloudio/uni-mp-weixin": "3.0.0-alpha-xxxx",
    "@dcloudio/uni-app-plus": "3.0.0-alpha-xxxx",
    "vue": "^3.5.0",
    "pinia": "^3.0.3",
    "uview-plus": "^3.3.0"
  }
}
```

### 3.2 三端 manifest.json 目标平台

| 端 | target |
|---|---|
| 用户端 | `mp-weixin` |
| 商户端 | `app-plus` (iOS + Android) + 兼容 `mp-weixin`（PRD §3.2 原话） |
| 骑手端 | `app-plus` (iOS + Android) |

---

## 四、后端 NestJS 骨架设计

### 4.1 目录结构

```
后端/
├── src/
│   ├── main.ts                   # 启动入口
│   ├── app.module.ts             # 根模块
│   ├── config/                   # 配置中心（dotenv + joi 校验）
│   ├── common/                   # 过滤器、拦截器、守卫、装饰器
│   ├── modules/                  # 业务模块占位
│   │   ├── auth/                 # P3 统一认证
│   │   ├── user/                 # P3 用户中心
│   │   ├── message/              # P3 消息推送
│   │   ├── file/                 # P3 文件存储
│   │   ├── map/                  # P3 地图定位
│   │   ├── order/                # P4 订单
│   │   ├── product/              # P4 商品
│   │   ├── shop/                 # P4 商户
│   │   ├── dispatch/             # P4 配送调度
│   │   ├── payment/              # P4 支付
│   │   ├── finance/              # P4 财务
│   │   ├── marketing/            # P4 营销
│   │   └── review/               # P4 评价售后
│   ├── database/                 # TypeORM 数据源、迁移
│   ├── queues/                   # BullMQ/RabbitMQ 消费者
│   └── health/                   # 健康检查
├── test/
├── .env
├── .env.development
├── .env.production
├── Dockerfile
├── nest-cli.json
├── package.json
├── tsconfig.json
└── README.md
```

### 4.2 核心依赖

```json
{
  "dependencies": {
    "@nestjs/core": "^10.4.0",
    "@nestjs/common": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/typeorm": "^10.0.2",
    "@nestjs/swagger": "^7.4.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/cache-manager": "^2.2.2",
    "@nestjs/bullmq": "^10.2.0",
    "@nestjs/terminus": "^10.2.3",
    "typeorm": "^0.3.20",
    "mysql2": "^3.11.0",
    "ioredis": "^5.4.0",
    "cache-manager": "^5.7.0",
    "cache-manager-ioredis-yet": "^2.1.1",
    "bullmq": "^5.12.0",
    "amqplib": "^0.10.4",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "joi": "^17.13.3",
    "rxjs": "^7.8.1",
    "reflect-metadata": "^0.2.2",
    "minio": "^8.0.0"
  }
}
```

### 4.3 启动健康检查

`GET /health` → `{ status: "ok", uptime: xxx, db: "up", redis: "up" }`

---

## 五、开发依赖 Docker Compose 设计

`部署/docker-compose.dev.yml` 关键服务：

```yaml
version: "3.9"
services:
  mysql:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: o2o_root_2026
      MYSQL_DATABASE: o2o_platform
    volumes: ["mysql-data:/var/lib/mysql"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: ["redis-server","--requirepass","o2o_redis_2026"]
    volumes: ["redis-data:/data"]

  rabbitmq:
    image: rabbitmq:3.13-management
    ports: ["5672:5672","15672:15672"]
    environment:
      RABBITMQ_DEFAULT_USER: o2o
      RABBITMQ_DEFAULT_PASS: o2o_rmq_2026

  minio:
    image: minio/minio:latest
    ports: ["9000:9000","9001:9001"]
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: o2o
      MINIO_ROOT_PASSWORD: o2o_minio_2026
    volumes: ["minio-data:/data"]

volumes:
  mysql-data:
  redis-data:
  minio-data:
```

---

## 六、代码规范与 Git Hooks 设计

### 6.1 规范栈

- **ESLint 9**（flat config）+ `typescript-eslint`
- **Prettier 3**：单引号、无分号（对齐管理后台已有配置）
- **Stylelint 16** + `stylelint-config-standard-scss` + `stylelint-config-recommended-vue`
- **commitlint** + `@commitlint/config-conventional`
- **husky** + `lint-staged`

### 6.2 Hooks

- `pre-commit`：`lint-staged`
- `commit-msg`：`commitlint --edit $1`

### 6.3 Conventional Commits type 列表

`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`

---

## 七、环境变量分层设计

每端 `.env.development` 与 `.env.production` 至少包含：

```bash
# 公共
APP_NAME=o2o-xxx
APP_VERSION=0.1.0

# 后端 API
API_BASE_URL=http://localhost:3000/api/v1
WS_BASE_URL=ws://localhost:3000/ws

# 地图
MAP_AK=xxxxxxxxxx
MAP_PROVIDER=amap   # amap|bmap
```

后端额外：

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=o2o_root_2026
DB_NAME=o2o_platform
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASS=o2o_redis_2026
JWT_SECRET=<64+ 随机串>
JWT_EXPIRES_IN=7200
RABBITMQ_URL=amqp://o2o:o2o_rmq_2026@localhost:5672
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=o2o
MINIO_SECRET_KEY=o2o_minio_2026
WECHAT_MP_APPID=
WECHAT_MP_SECRET=
WECHAT_PAY_MCHID=
WECHAT_PAY_APIV3_KEY=
ALIPAY_APPID=
ALIPAY_PRIVATE_KEY=
SMS_AK=
SMS_SK=
PUSH_PROVIDER=jpush  # jpush|getui
```

---

## 八、README 文档骨架

根 `README.md` 至少包含：

- 项目介绍（引用 PRD）
- 目录导航
- 环境要求（Node 20+、pnpm 8.8+、Docker）
- 启动步骤
  1. `pnpm install`
  2. `pnpm docker:dev:up`
  3. `pnpm dev:server` / `pnpm dev:admin` / `pnpm dev:user` …
- 规范与流程
- 常见问题

---

## 九、设计验收点

- 每一项设计都可落地到具体文件（见 TASK_P1_项目初始化.md）
- 目录、配置、脚本、Compose 可直接复制运行
- 无偏离 PRD §5 技术栈规范
