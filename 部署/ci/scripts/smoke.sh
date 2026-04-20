#!/bin/bash
# ============================================================================
# smoke.sh — 冒烟测试脚本
# 用法：bash smoke.sh <staging|production>
# ============================================================================
set -euo pipefail

ENV=${1:-staging}

case $ENV in
  staging)    BASE_URL="https://staging-api.o2o.com" ;;
  production) BASE_URL="https://api.o2o.com" ;;
  *)          echo "Usage: $0 <staging|production>"; exit 1 ;;
esac

echo "🔥 冒烟测试: $ENV ($BASE_URL)"
PASS=0
FAIL=0

check() {
  local name=$1 url=$2 expected_status=${3:-200}
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")
  if [ "$status" = "$expected_status" ]; then
    echo "  ✅ $name (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name (期望 $expected_status，实际 $status)"
    FAIL=$((FAIL + 1))
  fi
}

# 1. 健康检查
check "Health Check"      "$BASE_URL/health"

# 2. Swagger 文档
check "Swagger Docs"      "$BASE_URL/docs"        301

# 3. API 版本前缀
check "API Prefix"        "$BASE_URL/api/v1"       404

# 4. 认证接口（应返回 401）
check "Auth Guard"        "$BASE_URL/api/v1/user/profile" 401

echo ""
echo "========================================="
echo "结果: ✅ $PASS 通过  ❌ $FAIL 失败"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  echo "❌ 冒烟测试失败！"
  exit 1
fi

echo "✅ 冒烟测试全部通过！"
