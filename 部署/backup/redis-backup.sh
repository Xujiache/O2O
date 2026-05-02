#!/bin/sh
# ============================================================================
# Redis 备份脚本
# Cron: 0 */6 * * * /opt/backup/redis-backup.sh
# ============================================================================
set -eu

DATE=$(date +%Y%m%d_%H%M)
BACKUP_DIR="${BACKUP_DIR:-/backup/redis}"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://o2o-backup/redis}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASS="${REDIS_PASS:-${REDIS_PASSWORD:-}}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-/var/lib/redis}"
BGSAVE_TIMEOUT_SECONDS="${BGSAVE_TIMEOUT_SECONDS:-60}"
BACKUP_FILE="${BACKUP_DIR}/dump_${DATE}.rdb"
BACKUP_ARCHIVE="${BACKUP_FILE}.gz"
cleanup_required=1

cleanup_on_exit() {
  if [ "${cleanup_required}" = "1" ]; then
    rm -f "${BACKUP_FILE}" "${BACKUP_ARCHIVE}"
  fi
}
trap cleanup_on_exit EXIT INT TERM

echo "🔄 [${DATE}] 开始 Redis 备份..."
mkdir -p "${BACKUP_DIR}"

if [ -n "${REDIS_PASS}" ]; then
  export REDISCLI_AUTH="${REDIS_PASS}"
fi

redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" --no-auth-warning ping >/dev/null

# 若已有后台保存任务则等待完成，避免 BGSAVE 冲突
save_status=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" --no-auth-warning INFO persistence | tr -d '\r' | grep '^rdb_bgsave_in_progress:' | cut -d: -f2 || true)
if [ "${save_status:-0}" = "1" ]; then
  echo "ℹ️ 检测到已有 BGSAVE 任务，等待其完成..."
else
  redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" --no-auth-warning BGSAVE >/dev/null
fi

start_ts=$(date +%s)
while true; do
  save_status=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" --no-auth-warning INFO persistence | tr -d '\r' | grep '^rdb_bgsave_in_progress:' | cut -d: -f2 || true)
  if [ "${save_status:-0}" = "0" ]; then
    break
  fi
  now_ts=$(date +%s)
  if [ $((now_ts - start_ts)) -ge "${BGSAVE_TIMEOUT_SECONDS}" ]; then
    echo "❌ Redis BGSAVE 超时 (${BGSAVE_TIMEOUT_SECONDS}s)"
    exit 1
  fi
  sleep 1
done

src_dump="${REDIS_DATA_DIR}/dump.rdb"
if [ -f "${src_dump}" ]; then
  cp "${src_dump}" "${BACKUP_FILE}"
else
  redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" --no-auth-warning --rdb "${BACKUP_FILE}" >/dev/null
fi

gzip -f "${BACKUP_FILE}"
echo "✅ Redis 备份: $(basename "${BACKUP_ARCHIVE}")"

# 上传
if command -v aws >/dev/null 2>&1; then
  aws s3 cp "${BACKUP_ARCHIVE}" "${S3_BUCKET}/" --only-show-errors
  echo "☁️ 已上传至 ${S3_BUCKET}"
else
  echo "ℹ️ 未安装 aws CLI，跳过异地上传"
fi

# 清理旧备份
removed_count=$(find "${BACKUP_DIR}" -name "*.rdb.gz" -mtime +"${RETENTION_DAYS}" -print | wc -l | tr -d ' ')
if [ "${removed_count}" -gt 0 ]; then
  find "${BACKUP_DIR}" -name "*.rdb.gz" -mtime +"${RETENTION_DAYS}" -delete
fi
echo "🧹 已按 ${RETENTION_DAYS} 天保留策略完成清理（删除 ${removed_count} 个旧备份）"
cleanup_required=0
echo "✅ [$(date +%Y%m%d_%H%M)] Redis 备份完成"
