#!/bin/bash
# ============================================================================
# MySQL 备份脚本（每日全量 + binlog 增量）
# Cron: 0 2 * * * /opt/backup/mysql-backup.sh
# ============================================================================
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M)
BACKUP_DIR="${BACKUP_DIR:-/backup/mysql}"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://o2o-backup/mysql}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
MYSQLDUMP_EXTRA_OPTS="${MYSQLDUMP_EXTRA_OPTS:-}"

BACKUP_FILE="${BACKUP_DIR}/full_${DATE}.sql"
BACKUP_ARCHIVE="${BACKUP_FILE}.gz"

mysql_cmd=(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}")
mysqldump_cmd=(mysqldump -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}")
if [ -n "${DB_PASS}" ]; then
  mysql_cmd+=("-p${DB_PASS}")
  mysqldump_cmd+=("-p${DB_PASS}")
fi

cleanup_on_error() {
  rm -f "${BACKUP_FILE}" "${BACKUP_ARCHIVE}"
}
trap cleanup_on_error ERR

echo "🔄 [${DATE}] 开始 MySQL 备份..."
mkdir -p "${BACKUP_DIR}"

"${mysql_cmd[@]}" -e 'SELECT 1' >/dev/null

# 全量备份（使用 mysqldump，生产环境建议替换为 xtrabackup）
# shellcheck disable=SC2206
extra_opts=( ${MYSQLDUMP_EXTRA_OPTS} )
"${mysqldump_cmd[@]}" \
  --single-transaction --quick --routines --triggers --events \
  --set-gtid-purged=OFF \
  "${extra_opts[@]}" \
  --all-databases > "${BACKUP_FILE}"

gzip -f "${BACKUP_FILE}"
size=$(du -sh "${BACKUP_ARCHIVE}" | cut -f1)
echo "✅ 备份完成: $(basename "${BACKUP_ARCHIVE}") (${size})"

# 上传异地
if command -v aws >/dev/null 2>&1; then
  aws s3 cp "${BACKUP_ARCHIVE}" "${S3_BUCKET}/" --only-show-errors
  echo "☁️ 已上传至 ${S3_BUCKET}"
else
  echo "ℹ️ 未安装 aws CLI，跳过异地上传"
fi

# 清理旧备份
removed_count=$(find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +"${RETENTION_DAYS}" -print | wc -l | tr -d ' ')
if [ "${removed_count}" -gt 0 ]; then
  find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete
fi
echo "🧹 已按 ${RETENTION_DAYS} 天保留策略完成清理（删除 ${removed_count} 个旧备份）"

echo "✅ [$(date +%Y%m%d_%H%M)] MySQL 备份全部完成"
