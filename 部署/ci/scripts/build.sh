#!/bin/bash
# ============================================================================
# build.sh — 统一构建脚本（CI 使用）
# 用法：bash build.sh [backend|admin|all]
# ============================================================================
set -euo pipefail

REGISTRY=${REGISTRY:-registry.example.com/o2o}
TAG=${IMAGE_TAG:-$(git rev-parse --short HEAD)}
TARGET=${1:-all}

echo "🏗️ 构建镜像 (registry=${REGISTRY}, tag=${TAG})"

build_backend() {
  echo "📦 构建后端..."
  docker build \
    -t "${REGISTRY}/backend:${TAG}" \
    -f 部署/docker/backend/Dockerfile \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    .
  echo "✅ 后端镜像: ${REGISTRY}/backend:${TAG}"
}

build_admin() {
  echo "📦 构建管理后台..."
  docker build \
    -t "${REGISTRY}/admin:${TAG}" \
    -f 部署/docker/admin-web/Dockerfile \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    .
  echo "✅ 管理后台镜像: ${REGISTRY}/admin:${TAG}"
}

case $TARGET in
  backend)  build_backend ;;
  admin)    build_admin ;;
  all)
    build_backend
    build_admin
    ;;
  *)
    echo "用法: $0 [backend|admin|all]"
    exit 1
    ;;
esac

echo ""
echo "📋 已构建镜像:"
docker images | grep "${REGISTRY}" | head -10
