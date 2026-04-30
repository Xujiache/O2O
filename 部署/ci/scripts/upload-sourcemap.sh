#!/bin/bash
# ============================================================================
# upload-sourcemap.sh — Sentry sourcemap 上传脚本（CI 阶段）
# 用法：
#   SENTRY_AUTH_TOKEN=xxx SENTRY_ORG=o2o ENV=staging bash 部署/ci/scripts/upload-sourcemap.sh
# 环境变量：
#   SENTRY_AUTH_TOKEN     必填，Sentry 内部令牌（CI Secret 注入）
#   SENTRY_ORG            必填，Sentry 组织 slug
#   SENTRY_PROJECT_BACKEND  可选，默认 o2o-backend
#   SENTRY_PROJECT_ADMIN    可选，默认 o2o-admin
#   RELEASE               可选，默认 git short HEAD
#   ADMIN_DIST            可选，默认 管理后台/dist
#   BACKEND_DIST          可选，默认 后端/dist
# ============================================================================
set -euo pipefail

: "${SENTRY_AUTH_TOKEN:?SENTRY_AUTH_TOKEN 必须设置}"
: "${SENTRY_ORG:?SENTRY_ORG 必须设置}"
SENTRY_PROJECT_BACKEND="${SENTRY_PROJECT_BACKEND:-o2o-backend}"
SENTRY_PROJECT_ADMIN="${SENTRY_PROJECT_ADMIN:-o2o-admin}"
ADMIN_DIST="${ADMIN_DIST:-管理后台/dist}"
BACKEND_DIST="${BACKEND_DIST:-后端/dist}"
RELEASE="${RELEASE:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"

export SENTRY_AUTH_TOKEN SENTRY_ORG

echo "==================================================="
echo "Sentry sourcemap 上传"
echo "  org      : $SENTRY_ORG"
echo "  release  : $RELEASE"
echo "  backend  : $SENTRY_PROJECT_BACKEND ← $BACKEND_DIST"
echo "  admin    : $SENTRY_PROJECT_ADMIN  ← $ADMIN_DIST"
echo "==================================================="

# 安装 sentry-cli（CI 环境，幂等）
if ! command -v sentry-cli >/dev/null 2>&1; then
  echo "→ 安装 @sentry/cli@^2"
  npm i -g @sentry/cli@^2
fi

# ----------- 管理后台 -----------
if [ -d "$ADMIN_DIST" ]; then
  echo "→ [admin] release new"
  sentry-cli releases new -p "$SENTRY_PROJECT_ADMIN" "$RELEASE"

  echo "→ [admin] upload-sourcemaps"
  sentry-cli releases files "$RELEASE" upload-sourcemaps "$ADMIN_DIST" \
    --url-prefix '~/' \
    --rewrite \
    -p "$SENTRY_PROJECT_ADMIN"

  echo "→ [admin] release finalize"
  sentry-cli releases finalize -p "$SENTRY_PROJECT_ADMIN" "$RELEASE"
else
  echo "⚠️  跳过 admin 上传：$ADMIN_DIST 不存在"
fi

# ----------- 后端 -----------
if [ -d "$BACKEND_DIST" ]; then
  echo "→ [backend] release new"
  sentry-cli releases new -p "$SENTRY_PROJECT_BACKEND" "$RELEASE"

  echo "→ [backend] upload-sourcemaps"
  sentry-cli releases files "$RELEASE" upload-sourcemaps "$BACKEND_DIST" \
    --url-prefix '~/' \
    --rewrite \
    -p "$SENTRY_PROJECT_BACKEND"

  echo "→ [backend] release finalize"
  sentry-cli releases finalize -p "$SENTRY_PROJECT_BACKEND" "$RELEASE"
else
  echo "⚠️  跳过 backend 上传：$BACKEND_DIST 不存在"
fi

echo ""
echo "✅ Sourcemap 上传完成（release=$RELEASE）"
