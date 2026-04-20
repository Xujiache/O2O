#!/bin/bash
# ============================================================================
# notify.sh — 部署通知（企业微信 / 钉钉）
# 用法：bash notify.sh <success|failure>
# ============================================================================
set -euo pipefail

STATUS=${1:-unknown}
WEBHOOK_URL=${NOTIFY_WEBHOOK_URL:-""}

if [ -z "$WEBHOOK_URL" ]; then
  echo "⚠️ NOTIFY_WEBHOOK_URL 未配置，跳过通知"
  exit 0
fi

BRANCH=${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")}
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_NUM=${BUILD_NUMBER:-"local"}
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$STATUS" = "success" ]; then
  ICON="✅"
  COLOR="info"
  TITLE="O2O 部署成功"
else
  ICON="❌"
  COLOR="warning"
  TITLE="O2O 部署失败"
fi

# 企业微信 markdown 格式
PAYLOAD=$(cat <<EOF
{
  "msgtype": "markdown",
  "markdown": {
    "content": "${ICON} **${TITLE}**\n> 分支: ${BRANCH}\n> 提交: ${COMMIT}\n> 构建: #${BUILD_NUM}\n> 时间: ${TIMESTAMP}"
  }
}
EOF
)

curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$WEBHOOK_URL"

echo "${ICON} 通知已发送"
