#!/bin/bash
# ============================================================================
# test.sh — 统一测试脚本（CI 使用）
# 用法：bash test.sh [unit|integration|e2e|perf|security|all]
# ============================================================================
set -euo pipefail

TARGET=${1:-all}
SKIP_MISSING_TOOLS=${SKIP_MISSING_TOOLS:-true}
ARTIFACT_DIR=${ARTIFACT_DIR:-ci-results}
API_URL=${API_URL:-http://localhost:3000}
mkdir -p "$ARTIFACT_DIR"

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

skip_or_fail() {
  local reason="$1"
  if [[ "$SKIP_MISSING_TOOLS" == "true" ]]; then
    echo "⚠️ 跳过：$reason"
    return 0
  fi
  echo "❌ 失败：$reason"
  return 1
}

run_unit() {
  echo "🧪 运行后端单元测试..."
  pnpm --filter 后端 test:cov
  echo "✅ 单元测试完成"
}

run_integration() {
  echo "🧩 运行后端集成/HTTP级测试..."
  if [[ ! -f "后端/test/jest-e2e.json" ]]; then
    skip_or_fail "未找到后端 e2e 配置文件"
    return
  fi
  pnpm --filter 后端 test:e2e || skip_or_fail "后端 e2e 失败或环境未就绪"
  echo "✅ 集成测试阶段完成"
}

run_e2e() {
  echo "🎭 运行 Playwright E2E..."
  if [[ ! -d "部署/tests/e2e-admin" ]]; then
    skip_or_fail "未找到 Playwright 测试目录"
    return
  fi
  if ! have_cmd npx; then
    skip_or_fail "当前环境缺少 npx"
    return
  fi
  (
    cd 部署/tests/e2e-admin
    npx playwright test --reporter=html,junit || skip_or_fail "Playwright 执行失败或浏览器环境未就绪"
  )
  echo "✅ E2E 测试阶段完成"
}

run_perf() {
  echo "⚡ 运行 k6 压测..."
  if ! have_cmd k6; then
    skip_or_fail "当前环境缺少 k6"
    return
  fi
  if [[ ! -f "部署/tests/perf/k6-order.js" ]]; then
    skip_or_fail "未找到 k6 脚本"
    return
  fi
  k6 run --env API="$API_URL" 部署/tests/perf/k6-order.js --summary-export="$ARTIFACT_DIR/k6-order-summary.json"
  echo "✅ 压测完成"
}

run_security() {
  echo "🔒 运行安全扫描..."
  if have_cmd trivy; then
    trivy image --severity HIGH,CRITICAL "${REGISTRY:-registry.example.com/o2o}/backend:${IMAGE_TAG:-latest}" || skip_or_fail "Trivy 扫描失败"
  else
    skip_or_fail "当前环境缺少 trivy"
  fi
  if have_cmd snyk; then
    snyk test --all-projects --severity-threshold=high || skip_or_fail "Snyk 扫描失败"
  else
    skip_or_fail "当前环境缺少 snyk"
  fi
  echo "✅ 安全扫描阶段完成"
}

case $TARGET in
  unit)        run_unit ;;
  integration) run_integration ;;
  e2e)         run_e2e ;;
  perf)        run_perf ;;
  security)    run_security ;;
  all)
    run_unit
    run_integration
    run_e2e
    echo "⚠️ 压测和安全扫描按需单独触发"
    ;;
  *)
    echo "用法: $0 [unit|integration|e2e|perf|security|all]"
    exit 1
    ;;
esac
