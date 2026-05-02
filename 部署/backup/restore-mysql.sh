#!/bin/bash
# ============================================================================
# MySQL 恢复脚本
# 用法：bash restore-mysql.sh <backup_file.sql.gz>
# ============================================================================
set -euo pipefail

BACKUP_FILE=${1:-""}
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
MYSQL_DATABASE="${MYSQL_DATABASE:-o2o_platform}"

if [ -z "$BACKUP_FILE" ]; then
  echo "用法: $0 <backup_file.sql.gz>"
  echo "可用备份:"
  ls -la /backup/mysql/*.sql.gz 2>/dev/null || echo "  （无本地备份，请先从 S3 下载）"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ 备份文件不存在: $BACKUP_FILE"
  exit 1
fi

mysql_cmd=(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}")
if [ -n "${DB_PASS}" ]; then
  mysql_cmd+=("-p${DB_PASS}")
fi

echo "⚠️  即将恢复数据库！此操作会覆盖当前数据！"
echo "备份文件: ${BACKUP_FILE}"
read -r -p "确认继续? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "已取消"
  exit 0
fi

echo "🔄 开始恢复..."
"${mysql_cmd[@]}" -e 'SELECT 1' >/dev/null

# 解压并导入
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | "${mysql_cmd[@]}"
else
  "${mysql_cmd[@]}" < "$BACKUP_FILE"
fi

echo "✅ 数据库恢复完成！"
echo "请验证数据完整性："
echo "  mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p -e 'SHOW DATABASES; USE ${MYSQL_DATABASE}; SHOW TABLES;'"
