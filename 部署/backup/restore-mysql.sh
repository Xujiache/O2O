#!/bin/bash
# ============================================================================
# MySQL 恢复脚本
# 用法：bash restore-mysql.sh <backup_file.sql.gz>
# ============================================================================
set -euo pipefail

BACKUP_FILE=${1:-""}
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "用法: $0 <backup_file.sql.gz>"
  echo "可用备份:"
  ls -la /backup/mysql/*.sql.gz 2>/dev/null || echo "  （无本地备份，请先从 S3 下载）"
  exit 1
fi

echo "⚠️  即将恢复数据库！此操作会覆盖当前数据！"
echo "备份文件: ${BACKUP_FILE}"
read -p "确认继续? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "已取消"
  exit 0
fi

echo "🔄 开始恢复..."

# 解压并导入
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | mysql -h "${DB_HOST}" -u "${DB_USER}" -p"${DB_PASS}"
else
  mysql -h "${DB_HOST}" -u "${DB_USER}" -p"${DB_PASS}" < "$BACKUP_FILE"
fi

echo "✅ 数据库恢复完成！"
echo "请验证数据完整性："
echo "  mysql -h ${DB_HOST} -u ${DB_USER} -p -e 'SHOW DATABASES; USE o2o_platform; SHOW TABLES;'"
