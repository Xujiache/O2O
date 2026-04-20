#!/bin/bash
# ============================================================================
# test.sh — 统一测试脚本（CI 使用）
# 用法：bash test.sh [unit|e2e|perf|security|all]
# ============================================================================
set -euo pipefail

TARGET=${1:-all}

run_unit() {
  echo "🧪 运行后端单元测试..."
  pnpm --filter 后端 test:cov
  echo "✅ 单元测试完成"
}

run_e2e() {
  echo "🎭 运行 Playwright E2E..."
  cd 部署/tests/e2e-admin
  npx playwright test --reporter=html
  cd -
  echo "✅ E2E 测试完成"
}

run_perf() {
  echo "⚡ 运行 k6 压测..."
  k6 run --env API=${API_URL:-http://localhost:3000} 部署/tests/perf/k6-order.js --summary-export=k6-results.json
  echo "✅ 压测完成"
}

run_security() {
  echo "🔒 运行安全扫描..."
  # Trivy 镜像扫描
  trivy image --severity HIGH,CRITICAL ${REGISTRY:-registry.example.com/o2o}/backend:${IMAGE_TAG:-latest} || true
  # Snyk 依赖扫描
  snyk test --all-projects --severity-threshold=high || true
  echo "✅ 安全扫描完成"
}

case $TARGET in
  unit)     run_unit ;;
  e2e)      run_e2e ;;
  perf)     run_perf ;;
  security) run_security ;;
  all)
    run_unit
    run_e2e
    echo "⚠️ 压测和安全扫描需手动触发"
    ;;
  *)
    echo "用法: $0 [unit|e2e|perf|security|all]"
    exit 1
    ;;
esac
