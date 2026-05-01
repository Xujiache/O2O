#!/usr/bin/env bash
# ============================================================================
# lighthouse.sh — Lighthouse CI 性能门禁脚本
# P9 Sprint 5 W5.D.2
#
# 用法：
#   bash 部署/ci/scripts/lighthouse.sh [URL] [OUT_JSON]
#
# 参数：
#   $1  URL       测试目标 URL（默认 http://localhost:4173）
#   $2  OUT_JSON  Lighthouse JSON 报告输出路径（默认 ./lighthouse-ci.json）
#
# 行为：
#   1. 启动管理后台 vite preview（端口 4173），探活成功后跑 lighthouse
#   2. 仅 performance 类目；headless / no-sandbox 适配 CI
#   3. 解析 categories.performance.score * 100；< 50 -> exit 1（构建失败）
#   4. 打印 FCP / LCP / TBT / CLS 关键指标
#   5. 无论成败 kill preview server
#
# 假设：CI agent 已安装 chromium（或 google-chrome）/ npm（npx）/ jq / pnpm / curl
# ============================================================================
set -euo pipefail

URL="${1:-http://localhost:4173}"
OUT="${2:-./lighthouse-ci.json}"
PREVIEW_PORT="${PREVIEW_PORT:-4173}"
PERF_THRESHOLD="${PERF_THRESHOLD:-50}"

PREVIEW_PID=""

cleanup() {
  if [ -n "$PREVIEW_PID" ] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    echo "[lighthouse] -> 关闭 preview server (pid=$PREVIEW_PID)"
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==================================================="
echo "[lighthouse] Lighthouse CI"
echo "  url       : $URL"
echo "  out       : $OUT"
echo "  threshold : >= $PERF_THRESHOLD"
echo "==================================================="

# ----------- 仅当目标是本地 preview 端口时启动 preview server -----------
if echo "$URL" | grep -q "localhost:${PREVIEW_PORT}"; then
  echo "[lighthouse] -> 启动 vite preview (port=$PREVIEW_PORT)"
  pnpm --filter 管理后台 preview --host 0.0.0.0 --port "$PREVIEW_PORT" >/tmp/lighthouse-preview.log 2>&1 &
  PREVIEW_PID=$!

  # 等待 3s 启动
  sleep 3

  # 探活
  for i in 1 2 3 4 5; do
    if curl -fsS -o /dev/null "$URL"; then
      echo "[lighthouse] -> preview 探活成功 (attempt=$i)"
      break
    fi
    if [ "$i" = "5" ]; then
      echo "[lighthouse] ERROR preview 探活失败（5 次重试）" >&2
      cat /tmp/lighthouse-preview.log >&2 || true
      exit 1
    fi
    sleep 2
  done
fi

# ----------- 运行 Lighthouse -----------
echo "[lighthouse] -> 运行 lighthouse"
npx lighthouse "$URL" \
  --only-categories=performance \
  --chrome-flags='--headless --no-sandbox --disable-gpu' \
  --output=json \
  --output-path="$OUT" \
  --quiet

# ----------- 解析 score / 关键指标 -----------
SCORE_RAW=$(jq -r '.categories.performance.score' "$OUT")
SCORE=$(awk -v s="$SCORE_RAW" 'BEGIN { printf "%.0f", s * 100 }')

FCP=$(jq -r '.audits["first-contentful-paint"].displayValue // "n/a"' "$OUT")
LCP=$(jq -r '.audits["largest-contentful-paint"].displayValue // "n/a"' "$OUT")
TBT=$(jq -r '.audits["total-blocking-time"].displayValue // "n/a"' "$OUT")
CLS=$(jq -r '.audits["cumulative-layout-shift"].displayValue // "n/a"' "$OUT")

echo "==================================================="
echo "[lighthouse] 报告摘要"
echo "  performance score : $SCORE / 100"
echo "  FCP               : $FCP"
echo "  LCP               : $LCP"
echo "  TBT               : $TBT"
echo "  CLS               : $CLS"
echo "==================================================="

# ----------- 阈值判定 -----------
if [ "$SCORE" -lt "$PERF_THRESHOLD" ]; then
  echo "[lighthouse] FAIL  performance score=$SCORE 低于阈值 $PERF_THRESHOLD" >&2
  exit 1
fi

echo "[lighthouse] OK    performance score=$SCORE 通过阈值 $PERF_THRESHOLD"
