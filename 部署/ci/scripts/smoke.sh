#!/bin/bash
# ============================================================================
# smoke.sh — 冒烟测试脚本
# 用法：bash smoke.sh <staging|production>
# 支持：SMOKE_BASE_URL / SMOKE_API_URL / SMOKE_ADMIN_URL 覆盖默认域名
# ============================================================================
set -euo pipefail

ENV=${1:-staging}
CURL_MAX_TIME=${CURL_MAX_TIME:-10}

case "$ENV" in
  staging)
    BASE_URL=${SMOKE_BASE_URL:-https://staging-api.o2o.com}
    API_URL=${SMOKE_API_URL:-$BASE_URL}
    ADMIN_URL=${SMOKE_ADMIN_URL:-https://staging-admin.o2o.com}
    ;;
  production)
    BASE_URL=${SMOKE_BASE_URL:-https://api.o2o.com}
    API_URL=${SMOKE_API_URL:-$BASE_URL}
    ADMIN_URL=${SMOKE_ADMIN_URL:-https://admin.o2o.com}
    ;;
  *)
    echo "Usage: $0 <staging|production>"
    exit 1
    ;;
esac

echo "🔥 冒烟测试: $ENV"
echo "   API:   $API_URL"
echo "   ADMIN: $ADMIN_URL"
PASS=0
FAIL=0

check() {
  local name=$1
  local url=$2
  local expected_status=${3:-200}
  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$CURL_MAX_TIME" "$url" || printf '000')
  if [ "$status" = "$expected_status" ]; then
    echo "  ✅ $name (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name (期望 $expected_status，实际 $status)"
    FAIL=$((FAIL + 1))
  fi
}

check_body_contains() {
  local name=$1
  local url=$2
  local needle=$3
  local tmp_file
  tmp_file=$(mktemp)
  if curl -sS --max-time "$CURL_MAX_TIME" "$url" >"$tmp_file"; then
    if grep -Fq "$needle" "$tmp_file"; then
      echo "  ✅ $name"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $name (响应未包含: $needle)"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "  ❌ $name (请求失败)"
    FAIL=$((FAIL + 1))
  fi
  rm -f "$tmp_file"
}

check "API Health" "$API_URL/health" 200
check "API Metrics" "$API_URL/metrics" 200
check "Swagger Docs" "$API_URL/docs" 200
check "User Me Unauthorized" "$API_URL/api/v1/me" 401
check "Admin Unauthorized" "$API_URL/api/v1/admin/users" 401
check "Auth Login Validation" "$API_URL/api/v1/auth/admin/login" 400
check_body_contains "Health Payload" "$API_URL/health" '"status"'
check_body_contains "Metrics Payload" "$API_URL/metrics" 'http_requests_total'
check "Admin Web Health" "$ADMIN_URL/health" 200
check "Admin Login Page" "$ADMIN_URL/login" 200
check_body_contains "Admin Login HTML" "$ADMIN_URL/login" '<!DOCTYPE html>'

echo ""
echo "========================================="
echo "结果: ✅ $PASS 通过  ❌ $FAIL 失败"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  echo "❌ 冒烟测试失败！"
  exit 1
fi

echo "✅ 冒烟测试全部通过！"
