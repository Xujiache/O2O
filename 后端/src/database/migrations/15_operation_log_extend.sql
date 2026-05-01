-- ============================================================================
-- 文件名 : 15_operation_log_extend.sql
-- 阶段   : P9 Sprint 3 / W3.D.1
-- 用途   : operation_log 扩字段：补 trace_id（链路追踪 ID）
-- 依据   : OperationLogInterceptor 自 X-Trace-Id header 透传
-- 注意   :
--   1) 现表（10_system.sql）已含字段：op_admin_id / module / action / resource_type
--      / resource_id / request_method / request_url / request_params(JSON)
--      / is_success / error_msg / client_ip(VARBINARY(16)) / user_agent / cost_ms
--      / created_at —— 与 OperationLogInterceptor 字段一一对齐
--   2) 仅需补 trace_id（VARCHAR(64) NULL）+ 索引
--   3) 重跑幂等：检测 information_schema 后再 ALTER
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) operation_log + trace_id 列（不存在才加）
-- ============================================================================
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'operation_log'
    AND column_name = 'trace_id'
);

SET @ddl = IF(
  @col_exists = 0,
  'ALTER TABLE `operation_log` ADD COLUMN `trace_id` VARCHAR(64) NULL COMMENT ''链路追踪 ID'' AFTER `error_msg`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- 2) operation_log + idx_trace_id 索引（不存在才加）
-- ============================================================================
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'operation_log'
    AND index_name = 'idx_trace_id'
);

SET @ddl_idx = IF(
  @idx_exists = 0,
  'ALTER TABLE `operation_log` ADD KEY `idx_trace_id` (`trace_id`)',
  'SELECT 1'
);
PREPARE stmt2 FROM @ddl_idx;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ============================================================================
-- 校验
-- ============================================================================
SELECT
  COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'operation_log'
  AND column_name = 'trace_id';

-- ============================================================================
-- END 15_operation_log_extend.sql
-- ============================================================================
