#!/usr/bin/env bash
# ============================================================================
# upload-sourcemap.sh — Sentry sourcemap 上传脚本（CI 阶段）
# P9 Sprint 5 W5.D.1：完善真上传 + 上传后删除 .map
#
# 用法：
#   bash 部署/ci/scripts/upload-sourcemap.sh <BUNDLE_DIR> <RELEASE_VERSION>
#
# 参数：
#   $1  BUNDLE_DIR        前端构建产物目录（例：./管理后台/dist）
#   $2  RELEASE_VERSION   release 版本号（CI 通常用 BUILD_NUMBER）
#
# 环境变量（CI Secret 注入）：
#   SENTRY_AUTH_TOKEN   Sentry 内部令牌（必填，缺则跳过+warn）
#   SENTRY_ORG          Sentry 组织 slug（必填，缺则跳过+warn）
#   SENTRY_PROJECT      Sentry 项目 slug（必填，缺则跳过+warn）
#
# 假设：CI agent 已安装 sentry-cli（@sentry/cli@^2 风格 CLI）
# ============================================================================
set -euo pipefail

BUNDLE_DIR="${1:-}"
RELEASE_VERSION="${2:-}"

if [ -z "$BUNDLE_DIR" ] || [ -z "$RELEASE_VERSION" ]; then
  echo "[upload-sourcemap] 用法：$0 <BUNDLE_DIR> <RELEASE_VERSION>" >&2
  exit 2
fi

# ----------- 环境变量校验：缺失则跳过（warn，不阻塞流水线） -----------
if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ] || [ -z "${SENTRY_PROJECT:-}" ]; then
  echo "[upload-sourcemap] WARN  SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT 未配置，跳过上传"
  echo "[upload-sourcemap] WARN  bundle=$BUNDLE_DIR release=$RELEASE_VERSION"
  exit 0
fi

# ----------- 产物目录校验 -----------
if [ ! -d "$BUNDLE_DIR" ]; then
  echo "[upload-sourcemap] WARN  bundle 目录不存在：$BUNDLE_DIR，跳过"
  exit 0
fi

# ----------- sentry-cli 可用性校验（不主动安装；CI agent 已装） -----------
if ! command -v sentry-cli >/dev/null 2>&1; then
  echo "[upload-sourcemap] ERROR sentry-cli 未安装，请在 CI agent 预装 @sentry/cli@^2" >&2
  exit 3
fi

export SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT

echo "==================================================="
echo "[upload-sourcemap] Sentry releases 上传"
echo "  org      : $SENTRY_ORG"
echo "  project  : $SENTRY_PROJECT"
echo "  release  : $RELEASE_VERSION"
echo "  bundle   : $BUNDLE_DIR"
echo "==================================================="

# ----------- @sentry/cli v2 三段式：new -> upload-sourcemaps -> finalize -----------
echo "[upload-sourcemap] -> releases new"
sentry-cli releases new "$RELEASE_VERSION"

echo "[upload-sourcemap] -> releases files upload-sourcemaps"
sentry-cli releases files "$RELEASE_VERSION" upload-sourcemaps "$BUNDLE_DIR" \
  --url-prefix '~/' \
  --rewrite

echo "[upload-sourcemap] -> releases finalize"
sentry-cli releases finalize "$RELEASE_VERSION"

# ----------- 上传完毕：从产物目录删除所有 .map 文件，避免对外暴露 -----------
echo "[upload-sourcemap] -> 清理 .map 文件（防止对外泄露）"
DELETED_COUNT=$(find "$BUNDLE_DIR" -name '*.map' -type f | wc -l | tr -d ' ')
find "$BUNDLE_DIR" -name '*.map' -type f -delete
echo "[upload-sourcemap] 已删除 .map 文件数：$DELETED_COUNT"

echo "[upload-sourcemap] OK    release=$RELEASE_VERSION 上传完成"
