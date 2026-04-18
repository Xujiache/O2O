# 数据库备份与恢复 Runbook

> 阶段：P2 数据库设计 / T2.21
> 用途：保障 PRD §4.4.3「核心数据每日全量备份 + 增量备份，备份数据异地存储，
> 支持数据快速恢复」+ §4.4.2「故障恢复时间 ≤ 30 分钟，数据无丢失」
> 适用：MySQL 8 主库 / TimescaleDB（PostgreSQL）/ Redis 持久化数据

---

## 一、目标与指标

| 指标                        | 值                                    | 依据                  |
| --------------------------- | ------------------------------------- | --------------------- |
| **RPO**（数据恢复点目标）   | ≤ 1 小时                              | DESIGN §十 / PRD §4.4 |
| **RTO**（业务恢复时间目标） | ≤ 30 分钟                             | PRD §4.4.2            |
| 全量备份周期                | **每日 00:30**                        | PRD §4.4.3            |
| 增量备份周期                | **每小时整点**                        | DESIGN §十            |
| binlog 模式                 | **ROW**                               | DESIGN §十            |
| 异地复制                    | **同城双活 + 跨区域 1 副本**          | PRD §4.4.3            |
| 保留期                      | 全量 30 天 / 增量 7 天 / binlog 14 天 | 通行规范              |
| 演练频率                    | 每月 1 次                             | 内部 SRE 规范         |

---

## 二、MySQL 备份方案

### 2.1 binlog 配置（前置）

`部署/docker/mysql/conf.d/binlog.cnf`（生产部署时增量配置文件）：

```ini
[mysqld]
# 启用二进制日志
log-bin = mysql-bin
binlog_format = ROW
binlog_row_image = FULL
expire_logs_days = 14
max_binlog_size = 1G

# GTID 启用（便于 PITR 与主从切换）
gtid_mode = ON
enforce_gtid_consistency = ON

# server-id（主从需唯一）
server-id = 1

# innodb 配置
innodb_flush_log_at_trx_commit = 1
sync_binlog = 1
```

启用步骤（生产）：

```bash
# 1) 修改 conf 后滚动重启 MySQL
docker compose -f 部署/docker-compose.dev.yml restart mysql
# 2) 校验
docker exec -i o2o-mysql mysql -uroot -po2o_root_2026 -e "SHOW VARIABLES LIKE 'log_bin'; SHOW VARIABLES LIKE 'binlog_format'; SHOW VARIABLES LIKE 'gtid_mode';"
```

### 2.2 全量备份：xtrabackup

> 选型理由：
>
> - 物理备份，速度比 mysqldump 快 5~10 倍（百 GB 级数据）
> - 不锁表（InnoDB）
> - 支持增量
> - Percona 维护多年，工业级稳定

#### 2.2.1 容器化部署 xtrabackup

```bash
# 拉取镜像
docker pull percona/percona-xtrabackup:8.0

# 全量备份命令模板（每日 00:30 由 cron / K8s CronJob 触发）
docker run --rm \
  --network o2o-dev \
  -v o2o-mysql-data:/var/lib/mysql:ro \
  -v /backup/full/$(date +%Y%m%d):/backup \
  percona/percona-xtrabackup:8.0 \
  bash -c "xtrabackup --backup \
    --target-dir=/backup \
    --host=o2o-mysql \
    --user=root \
    --password='$MYSQL_ROOT_PASSWORD' \
    --datadir=/var/lib/mysql"
```

> ⚠️ 生产环境：xtrabackup 需直接访问数据文件，开发环境本配置仅 demo；
> 生产应直接在 MySQL 主机上跑 xtrabackup 二进制（非容器）+ 写入 NAS / OSS。

#### 2.2.2 备份产物

```
/backup/full/20260419/
  ├── ibdata1
  ├── o2o_platform/
  │   ├── user.ibd
  │   ├── ...
  ├── xtrabackup_checkpoints   # 增量基准
  ├── xtrabackup_info
  └── xtrabackup_binlog_info
```

### 2.3 增量备份（每小时）

```bash
# 假设 BASE 是当日全量目录
BASE=/backup/full/$(date +%Y%m%d)
INC=/backup/inc/$(date +%Y%m%d_%H)

docker run --rm \
  --network o2o-dev \
  -v o2o-mysql-data:/var/lib/mysql:ro \
  -v $BASE:/base:ro \
  -v $INC:/backup \
  percona/percona-xtrabackup:8.0 \
  bash -c "xtrabackup --backup \
    --target-dir=/backup \
    --incremental-basedir=/base \
    --host=o2o-mysql --user=root --password='$MYSQL_ROOT_PASSWORD' \
    --datadir=/var/lib/mysql"
```

### 2.4 备份上传 + 异地复制

```bash
# 1) 压缩 + 加密
tar czf - $BACKUP_DIR | gpg --encrypt -r backup@example.com -o backup.tgz.gpg

# 2) 上传到 OSS（同城）
ossutil cp backup.tgz.gpg oss://o2o-backup-cn-shanghai/mysql/$(date +%Y%m%d)/

# 3) 跨区域同步（异地，OSS bucket 复制功能）
ossutil cp oss://o2o-backup-cn-shanghai/mysql/$(date +%Y%m%d)/ \
           oss://o2o-backup-cn-shenzhen/mysql/$(date +%Y%m%d)/ -r --update
```

### 2.5 全量恢复

```bash
# 1) 准备目录
mkdir -p /restore && cd /restore

# 2) 下载 + 解密 + 解压
ossutil cp oss://o2o-backup-cn-shanghai/mysql/20260419/full.tgz.gpg .
gpg --decrypt full.tgz.gpg | tar xzf -

# 3) prepare
docker run --rm \
  -v $(pwd):/backup \
  percona/percona-xtrabackup:8.0 \
  xtrabackup --prepare --target-dir=/backup

# 4) 停 mysql，替换 datadir
docker compose -f 部署/docker-compose.dev.yml stop mysql
docker volume rm o2o-mysql-data
docker volume create o2o-mysql-data

# 5) copy back
docker run --rm \
  -v $(pwd):/backup:ro \
  -v o2o-mysql-data:/var/lib/mysql \
  percona/percona-xtrabackup:8.0 \
  xtrabackup --copy-back --target-dir=/backup --datadir=/var/lib/mysql

# 6) 启动 + 校验
docker compose -f 部署/docker-compose.dev.yml start mysql
docker exec -i o2o-mysql mysql -uroot -p$MYSQL_ROOT_PASSWORD -e \
  "USE o2o_platform; SHOW TABLES; SELECT COUNT(*) FROM user;"
```

### 2.6 PITR (Point-In-Time Recovery)

恢复到 `2026-04-19 14:30:00` 的精确时刻：

```bash
# 1) 先恢复最近一次全量（如 00:30 全量 + 14:00 增量）到时间点之前
xtrabackup --prepare --apply-log-only --target-dir=/full
xtrabackup --prepare --apply-log-only --target-dir=/full \
  --incremental-dir=/inc/14_00
xtrabackup --prepare --target-dir=/full
xtrabackup --copy-back --target-dir=/full --datadir=/var/lib/mysql

# 2) 启动 MySQL（不开网络监听，避免业务连接）
mysqld --skip-networking --skip-slave-start &

# 3) 重放 binlog 到指定时间
mysqlbinlog --start-datetime="2026-04-19 14:00:00" \
            --stop-datetime="2026-04-19 14:30:00" \
            mysql-bin.000123 mysql-bin.000124 \
  | mysql -uroot -p$MYSQL_ROOT_PASSWORD

# 4) 校验数据，开放业务流量
```

---

## 三、TimescaleDB（PostgreSQL）备份

### 3.1 全量：pg_basebackup

```bash
# 每日 01:00（错峰避开 MySQL 全量）
docker exec -i o2o-timescaledb pg_basebackup \
  -h localhost -U o2o_ts -D /backup/pg/$(date +%Y%m%d) \
  -F tar -z -P --wal-method=stream

# 校验
ls -lh /backup/pg/$(date +%Y%m%d)/
```

### 3.2 WAL 归档（增量）

`postgresql.conf` 增量配置（生产）：

```
wal_level = replica
archive_mode = on
archive_command = 'cp %p /pg_archive/%f'
max_wal_senders = 3
```

### 3.3 恢复

```bash
# 1) 停容器
docker compose stop timescaledb
docker volume rm o2o-timescaledb-data
docker volume create o2o-timescaledb-data

# 2) 解压全量
tar xzf /backup/pg/20260419/base.tar.gz \
  -C /var/lib/docker/volumes/o2o-timescaledb-data/_data/

# 3) 配置 recovery.signal + restore_command
echo "restore_command = 'cp /pg_archive/%f %p'" \
  > /var/lib/docker/volumes/o2o-timescaledb-data/_data/postgresql.auto.conf
touch /var/lib/docker/volumes/o2o-timescaledb-data/_data/recovery.signal

# 4) 启动 + 校验
docker compose start timescaledb
docker exec -i o2o-timescaledb psql -U o2o_ts -d o2o_timescale \
  -c "SELECT count(*) FROM rider_location_ts WHERE time > now() - interval '1 day';"
```

---

## 四、Redis 备份

### 4.1 持久化策略

`部署/docker-compose.dev.yml` 已启用 `--appendonly yes`，AOF 持续追加。

补充配置（生产建议在 redis.conf 中显式）：

```
# RDB 快照（兜底）：5 分钟内 1 次写 / 1 分钟 100 次写 / 30 秒 10000 次写
save 300 1
save 60 100
save 30 10000

# AOF
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

### 4.2 备份

```bash
# 1) 触发后台 BGSAVE 生成 dump.rdb
docker exec -i o2o-redis redis-cli -a o2o_redis_2026 BGSAVE
# 2) 拷贝
docker cp o2o-redis:/data/dump.rdb /backup/redis/$(date +%Y%m%d)/
docker cp o2o-redis:/data/appendonly.aof /backup/redis/$(date +%Y%m%d)/
# 3) 上传 OSS（同 MySQL）
```

### 4.3 恢复

```bash
docker compose stop redis
docker volume rm o2o-redis-data
docker volume create o2o-redis-data

docker run --rm \
  -v o2o-redis-data:/data \
  -v /backup/redis/20260419:/restore:ro \
  alpine sh -c "cp /restore/dump.rdb /data/ && cp /restore/appendonly.aof /data/"

docker compose start redis
```

---

## 五、备份产物管理

### 5.1 目录约定

```
/backup/
  ├── mysql/
  │   ├── full/YYYYMMDD/      # 每日全量
  │   ├── inc/YYYYMMDD_HH/    # 每小时增量
  │   └── binlog/             # binlog 归档
  ├── pg/
  │   ├── full/YYYYMMDD/
  │   └── wal/                # WAL 归档
  └── redis/YYYYMMDD/
```

### 5.2 OSS 桶约定

| 桶                             | 区域 | 用途           |
| ------------------------------ | ---- | -------------- |
| `oss://o2o-backup-cn-shanghai` | 主区 | 主备份（同城） |
| `oss://o2o-backup-cn-shenzhen` | 异地 | 灾备副本       |

存储类：备份文件 30 天后自动转归档存储（成本降低 70%）。

### 5.3 加密

- 所有备份产物**强制 GPG 加密**后再上传
- GPG 公钥下发到运维 Bastion 主机
- 私钥存放：HSM / KMS（仅 SRE Lead + CTO 双签可解）

---

## 六、自动化（K8s CronJob 模板）

```yaml
# 部署/k8s/cronjob-mysql-backup.yaml（P9 阶段落地）
apiVersion: batch/v1
kind: CronJob
metadata:
  name: mysql-full-backup
  namespace: o2o-prod
spec:
  schedule: '30 0 * * *' # 每日 00:30
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 7
  failedJobsHistoryLimit: 14
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: xtrabackup
              image: percona/percona-xtrabackup:8.0
              env:
                - name: MYSQL_ROOT_PASSWORD
                  valueFrom: { secretKeyRef: { name: mysql-secret, key: root-password } }
              command: ['/bin/bash', '/scripts/backup-full.sh']
              volumeMounts:
                - { name: backup-pvc, mountPath: /backup }
                - { name: scripts, mountPath: /scripts }
          volumes:
            - { name: backup-pvc, persistentVolumeClaim: { claimName: backup-pvc } }
            - { name: scripts, configMap: { name: backup-scripts } }
```

---

## 七、演练（强制）

### 7.1 演练频率

| 演练项               | 频率        | 目标                       |
| -------------------- | ----------- | -------------------------- |
| MySQL 全量恢复       | 每月 1 次   | RTO 验证                   |
| MySQL PITR           | 每季度 1 次 | RPO 验证（恢复到任意分钟） |
| TimescaleDB 全量恢复 | 每月 1 次   | RTO 验证                   |
| Redis 恢复           | 每季度 1 次 | 持久化有效性               |
| 跨区域切换           | 每年 1 次   | 灾备演练                   |

### 7.2 演练记录模板

```
演练日期：
演练人：
备份文件：oss://o2o-backup-cn-shanghai/mysql/20260419/...
恢复到：演练库 mysql-drill
恢复耗时：__ 分 __ 秒（目标 ≤ 30 分钟）
数据校验：
  - SELECT COUNT(*) FROM user      → 实际 vs 期望：__/__
  - SELECT COUNT(*) FROM order_takeout_202604 → __/__
通过/未通过：
后续行动：
```

---

## 八、监控告警

| 指标                     | 阈值                         | 告警方式        |
| ------------------------ | ---------------------------- | --------------- |
| 当日全量备份未完成       | 截止 02:00 仍无 success 标志 | 钉钉 + 短信     |
| 当小时增量备份未完成     | 整点后 15min 仍无 success    | 钉钉            |
| OSS 备份对象大小异常     | 同比变化 > 50%               | 邮件            |
| binlog 累积 > 10G 未归档 | 立即                         | 钉钉 + 电话     |
| 跨区域复制 lag > 1h      | 持续 30min                   | 钉钉            |
| 全量恢复演练失败         | 月度                         | 邮件 + 周会评审 |

---

## 九、本期 T2.21 完成证据

- [x] binlog 配置（ROW 模式）
- [x] 每日 00:30 全量（xtrabackup）
- [x] 每小时增量
- [x] 异地复制（OSS 同城 + 跨区域）
- [x] RPO ≤ 1h / RTO ≤ 30min 指标
- [x] 恢复演练步骤
- [x] 演练周期（月度+季度）
- [x] PITR 示例命令
- [x] TimescaleDB / Redis 备份补全
- [x] K8s CronJob 模板
- [x] 监控告警阈值
