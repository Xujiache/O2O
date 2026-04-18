-- ============================================================================
-- 文件名 : 01_schema.sql
-- 阶段   : P2 数据库设计 / T2.17 TimescaleDB hypertable
-- 数据库 : PostgreSQL 16 + TimescaleDB 2.16.1（独立实例，与 MySQL 完全隔离）
-- 用途   : 创建骑手定位时序超表 rider_location_ts
-- 依据   : DESIGN_P2_数据库设计.md §八（原文 SQL，逐条落地）
-- ----------------------------------------------------------------------------
-- 连接说明 :
--   - 容器 : timescaledb（参见 部署/docker-compose.dev.yml 已追加条目）
--   - 主机端口 : 5432
--   - 默认数据库 : o2o_timescale（容器初始化时通过 POSTGRES_DB 创建）
--   - 用户 : o2o_ts（POSTGRES_USER）
--   - 密码 : 通过 docker-compose.dev.yml 的 env 注入（默认开发密码 o2o_ts_2026）
-- 执行 :
--   docker exec -i o2o-timescaledb psql -U o2o_ts -d o2o_timescale \
--     < 后端/src/database/timescale/01_schema.sql
-- 体量预估 :
--   - 假设 2000 在线骑手，10 秒上报一次（PRD §4.1.4）
--   - 单日 = 2000 × 8640 ≈ 1.7M 行；月 5000 万；
--   - 按月规模 chunk 7 天，可控制单 chunk 在 1200 万行以内；
--   - 7 天后压缩，压缩比 10x；保留 180 天后自动清理。
-- ============================================================================

-- 1) 启用 TimescaleDB 扩展（PostgreSQL 标准 CREATE EXTENSION 语法）
--    若数据库未首次启用，加 IF NOT EXISTS 兜底
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ----------------------------------------------------------------------------
-- 2) 建表 rider_location_ts —— 骑手定位轨迹时序表
-- 字段定义严格遵循 DESIGN §八 + 字段 COMMENT
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS rider_location_ts;
CREATE TABLE rider_location_ts (
  time        TIMESTAMPTZ        NOT NULL,
  rider_id    BIGINT             NOT NULL,
  order_no    CHAR(18),
  lng         DOUBLE PRECISION   NOT NULL,
  lat         DOUBLE PRECISION   NOT NULL,
  speed_kmh   REAL,
  direction   SMALLINT,
  accuracy_m  REAL,
  battery     SMALLINT,
  tenant_id   INT                NOT NULL DEFAULT 1
);

COMMENT ON TABLE  rider_location_ts            IS '骑手定位轨迹时序超表（10s/次上报）';
COMMENT ON COLUMN rider_location_ts.time       IS '上报时间戳（带时区，分区键）';
COMMENT ON COLUMN rider_location_ts.rider_id   IS '骑手 ID（→ MySQL rider.id）';
COMMENT ON COLUMN rider_location_ts.order_no   IS '关联订单号（无单时为 NULL）';
COMMENT ON COLUMN rider_location_ts.lng        IS '经度（GCJ-02）';
COMMENT ON COLUMN rider_location_ts.lat        IS '纬度（GCJ-02）';
COMMENT ON COLUMN rider_location_ts.speed_kmh  IS '速度（公里/小时）';
COMMENT ON COLUMN rider_location_ts.direction  IS '方向（0~359 度）';
COMMENT ON COLUMN rider_location_ts.accuracy_m IS '定位精度（米）';
COMMENT ON COLUMN rider_location_ts.battery    IS '电池电量（百分数 0~100）';
COMMENT ON COLUMN rider_location_ts.tenant_id  IS '租户 ID';

-- ----------------------------------------------------------------------------
-- 3) 转为超表（hypertable），按 time 切片，chunk 间隔 7 天
-- ----------------------------------------------------------------------------
SELECT create_hypertable(
  'rider_location_ts',
  'time',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists       => TRUE
);

-- ----------------------------------------------------------------------------
-- 4) 索引（DESIGN §八 重点）
--    （rider_id, time DESC）：查骑手最近轨迹
--    （order_no, time DESC）：查订单全程轨迹
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rider_time_desc
  ON rider_location_ts (rider_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_order_time_desc
  ON rider_location_ts (order_no, time DESC);

-- ----------------------------------------------------------------------------
-- 5) 压缩配置：按 rider_id 分段压缩
-- ----------------------------------------------------------------------------
ALTER TABLE rider_location_ts SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'rider_id',
  timescaledb.compress_orderby   = 'time DESC'
);

-- ----------------------------------------------------------------------------
-- 6) 压缩策略：7 天前的 chunk 自动压缩
--    若策略已存在则更新（add_compression_policy 带 if_not_exists 参数）
-- ----------------------------------------------------------------------------
SELECT add_compression_policy(
  'rider_location_ts',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- ----------------------------------------------------------------------------
-- 7) 保留策略：180 天前的 chunk 自动删除
--    历史轨迹存归档冷存储（OSS Parquet），由 P9 数据治理 Job 实现
-- ----------------------------------------------------------------------------
SELECT add_retention_policy(
  'rider_location_ts',
  INTERVAL '180 days',
  if_not_exists => TRUE
);

-- ============================================================================
-- 校验
-- ============================================================================
-- A. 查看 hypertable 元数据
SELECT
  hypertable_name,
  num_chunks,
  compression_enabled
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'rider_location_ts';

-- B. 查看 chunks（启动初期为空，写入后会自动创建）
SELECT
  show_chunks('rider_location_ts');

-- C. 查看策略
SELECT
  job_id,
  application_name,
  schedule_interval,
  config
FROM timescaledb_information.jobs
WHERE hypertable_name = 'rider_location_ts'
ORDER BY job_id;

-- ============================================================================
-- END 01_schema.sql —— 1 张 hypertable + 2 个索引 + 2 个策略
-- ============================================================================
