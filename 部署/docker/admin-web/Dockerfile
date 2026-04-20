# ============================================================================
# O2O 管理后台 Dockerfile（多阶段构建）
# 依据 docs/P9_集成测试部署/DESIGN_P9_集成测试部署.md §三
# ============================================================================

# ── Stage 1: Builder ──
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# 先只复制包管理相关文件
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY 管理后台/package.json ./管理后台/

RUN pnpm install --filter 管理后台... --frozen-lockfile

COPY 管理后台/ ./管理后台/

# 构建生产版本
RUN pnpm --filter 管理后台 build

# ── Stage 2: Runner（Nginx）──
FROM nginx:1.27-alpine AS runner

# 时区
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 复制构建产物到 nginx 静态目录
COPY --from=builder /app/管理后台/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY 部署/docker/nginx/conf.d/admin.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
