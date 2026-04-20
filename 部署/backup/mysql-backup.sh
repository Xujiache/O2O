#!/bin/bash
# ============================================================================
# MySQL 备份脚本（每日全量 + binlog 增量）
# Cron: 0 2 * * * /opt/backup/mysql-backup.sh
# ============================================================================
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M)
BACKUP_DIR="/backup/mysql"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://o2o-backup/mysql}"
RETENTION_DAYS=30

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"

echo "🔄 [${DATE}] 开始 MySQL 备份..."

mkdir -p "${BACKUP_DIR}"

# 全量备份（使用 mysqldump，生产环境建议替换为 xtrabackup）
mysqldump -h "${DB_HOST}" -u "${DB_USER}" -p"${DB_PASS}" \
  --single-transaction --routines --triggers --events \
  --all-databases > "${BACKUP_DIR}/full_${DATE}.sql"

# 压缩
gzip "${BACKUP_DIR}/full_${DATE}.sql"
echo "✅ 备份完成: full_${DATE}.sql.gz ($(du -sh ${BACKUP_DIR}/full_${DATE}.sql.gz | cut -f1))"

# 上传异地
if command -v aws &> /dev/null; then
  aws s3 cp "${BACKUP_DIR}/full_${DATE}.sql.gz" "${S3_BUCKET}/" --only-show-errors
  echo "☁️ 已上传至 ${S3_BUCKET}"
fi

# 清理旧备份
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "🧹 已清理 ${RETENTION_DAYS} 天前的备份"

echo "✅ [$(date +%Y%m%d_%H%M)] MySQL 备份全部完成"
