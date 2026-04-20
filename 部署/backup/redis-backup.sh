#!/bin/bash
# ============================================================================
# Redis 备份脚本
# Cron: 0 */6 * * * /opt/backup/redis-backup.sh
# ============================================================================
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M)
BACKUP_DIR="/backup/redis"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://o2o-backup/redis}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASS="${REDIS_PASSWORD:-}"

echo "🔄 [${DATE}] 开始 Redis 备份..."
mkdir -p "${BACKUP_DIR}"

# 触发 BGSAVE
redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASS}" BGSAVE
sleep 5

# 复制 dump.rdb
cp /var/lib/redis/dump.rdb "${BACKUP_DIR}/dump_${DATE}.rdb" 2>/dev/null || \
  redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASS}" --rdb "${BACKUP_DIR}/dump_${DATE}.rdb"

gzip "${BACKUP_DIR}/dump_${DATE}.rdb"
echo "✅ Redis 备份: dump_${DATE}.rdb.gz"

# 上传
if command -v aws &> /dev/null; then
  aws s3 cp "${BACKUP_DIR}/dump_${DATE}.rdb.gz" "${S3_BUCKET}/" --only-show-errors
fi

# 清理 7 天前
find "${BACKUP_DIR}" -name "*.rdb.gz" -mtime +7 -delete
echo "✅ [$(date +%Y%m%d_%H%M)] Redis 备份完成"
