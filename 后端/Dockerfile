# ----------------------------------------------------------------------------
# O2O 后端 多阶段 Dockerfile（DESIGN_P1 §4 / T1.18）
# 阶段：deps（缓存依赖）→ builder（编译 TS）→ runner（精简运行时）
# 镜像基线：node:20-alpine（Node ≥ 20.19 满足 uni/nest 生态）
# 注意：在 monorepo 根目录执行构建，上下文需包含 pnpm-workspace.yaml 与 后端/
#       docker build -f 后端/Dockerfile -t o2o-server:0.1.0 .
# ----------------------------------------------------------------------------

# ===== 阶段 1：依赖缓存层 =====
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace
# 复制 workspace 根配置（最大化利用缓存）
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY pnpm-lock.yaml* ./
# 只拷贝后端 package 清单
COPY 后端/package.json 后端/
# 仅安装后端子项目依赖（production=false 以安装 nestjs-cli 等 devDeps 用于 build 阶段）
RUN pnpm install --filter ./后端... --frozen-lockfile=false

# ===== 阶段 2：编译层 =====
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace
# 带入 deps 阶段完整的 node_modules
COPY --from=deps /workspace /workspace
# 带入后端源码
COPY 后端 后端
# 编译
RUN pnpm --filter 后端 build
# 剪枝只保留 production 依赖（减小运行镜像体积）
#   --prod    仅保留 production 依赖（对齐官方 https://pnpm.io/cli/deploy#--prod--p）
#   --legacy  强制使用 pnpm 9 legacy deploy 实现，免去 inject-workspace-packages=true 配置要求
#             （对齐官方 https://pnpm.io/cli/deploy#--legacy；I-14 已核实该 flag 在 pnpm 10.x 中存在）
RUN pnpm --filter 后端 deploy --prod --legacy /deploy

# ===== 阶段 3：运行层 =====
FROM node:20-alpine AS runner
ENV NODE_ENV=production \
    APP_PORT=3000 \
    TZ=Asia/Shanghai
WORKDIR /app
# 最小安装：仅 node + tini（优雅 PID1）
RUN apk add --no-cache tini && \
    addgroup -S o2o && adduser -S o2o -G o2o
# 复制已剪枝的 prod 产物
COPY --from=builder --chown=o2o:o2o /deploy/dist ./dist
COPY --from=builder --chown=o2o:o2o /deploy/node_modules ./node_modules
COPY --from=builder --chown=o2o:o2o /deploy/package.json ./package.json
# 示例 env（真实部署通过 K8s Secret 挂载）
COPY --from=builder --chown=o2o:o2o /workspace/后端/.env.example ./.env.example
USER o2o
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
