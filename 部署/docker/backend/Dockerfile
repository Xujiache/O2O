# ============================================================================
# O2O 后端 Dockerfile（多阶段构建）
# 依据 docs/P9_集成测试部署/DESIGN_P9_集成测试部署.md §二
# ============================================================================
# syntax=docker/dockerfile:1.7

# ── Stage 1: Builder ──
FROM node:20-alpine AS builder
WORKDIR /app

# 启用 corepack 以使用 pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# 先只复制包管理相关文件，利用 Docker 缓存
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY 后端/package.json ./后端/

# 安装依赖（仅后端 workspace）
RUN pnpm install --filter 后端... --frozen-lockfile --prod=false

# 复制后端源码
COPY 后端/ ./后端/

# 编译 TypeScript → dist/
RUN pnpm --filter 后端 build

# 清理 devDependencies，只保留生产依赖
RUN pnpm install --filter 后端... --frozen-lockfile --prod

# ── Stage 2: Runner ──
FROM node:20-alpine AS runner
WORKDIR /app

# 安全：使用非 root 用户
RUN addgroup -S app && adduser -S app -G app

# 时区
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 从 builder 复制产物
COPY --from=builder --chown=app:app /app/后端/dist ./dist
COPY --from=builder --chown=app:app /app/后端/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/后端/package.json ./

USER app
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
