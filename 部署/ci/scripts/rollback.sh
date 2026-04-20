#!/bin/bash
# ============================================================================
# rollback.sh — 快速回滚脚本
# 用法：bash rollback.sh <staging|production> [revision]
# ============================================================================
set -euo pipefail

ENV=${1:-staging}
REVISION=${2:-""}
RELEASE="o2o"

case $ENV in
  staging)    NS="o2o-staging" ;;
  production) NS="o2o-production" ;;
  *)          echo "Usage: $0 <staging|production> [revision]"; exit 1 ;;
esac

echo "🔄 回滚: $ENV (namespace: $NS)"

# 显示历史
echo "📋 最近 5 次发布历史："
helm history $RELEASE -n $NS --max 5

if [ -z "$REVISION" ]; then
  echo ""
  echo "⏪ 回滚到上一版本..."
  helm rollback $RELEASE -n $NS --wait --timeout 3m
else
  echo ""
  echo "⏪ 回滚到版本 $REVISION..."
  helm rollback $RELEASE "$REVISION" -n $NS --wait --timeout 3m
fi

echo ""
echo "✅ 回滚完成！当前状态："
helm status $RELEASE -n $NS

# 冒烟测试
echo ""
echo "🔥 执行回滚后冒烟测试..."
bash "$(dirname "$0")/smoke.sh" "$ENV"
