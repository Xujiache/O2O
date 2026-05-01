-- ============================================================================
-- migration 14: dlq_retry_log 表（DLQ 自动重试日志）
-- 依据：P9 Sprint 3 / W3.B.2 DLQ 自动重试 + 管理后台 dlq-monitor
-- 目的：把 BullMQ orchestration-dlq 的失败 job 持久化到关系库便于：
--       1) 管理后台分页查询 / 筛选
--       2) 重试策略：3 次指数退避（1min / 5min / 30min）
--       3) PERMANENT_FAILED 触发钉钉告警（webhook 由运维注入）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `dlq_retry_log` (
  `id` BIGINT NOT NULL COMMENT '主键（雪花字符串数值）',
  `saga_id` VARCHAR(64) NOT NULL COMMENT '原 saga 实例 ID',
  `saga_name` VARCHAR(64) NOT NULL COMMENT 'Saga 名（OrderPaidSaga / RefundSucceedSaga / ...）',
  `source` VARCHAR(32) NOT NULL COMMENT '事件源：order / payment / cron / manual',
  `event_name` VARCHAR(64) NOT NULL COMMENT '事件名：OrderPaid / RefundSucceed / ...',
  `failed_step` VARCHAR(64) DEFAULT NULL COMMENT '失败步骤名',
  `error` TEXT COMMENT '失败错误信息（首次落库时记录）',
  `body_json` JSON COMMENT '原始事件 body（用于人工或自动重试时复用）',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=PENDING 1=RETRY_OK 2=PERMANENT_FAILED 3=DISCARDED',
  `retry_count` INT NOT NULL DEFAULT 0 COMMENT '已重试次数',
  `next_retry_at` DATETIME DEFAULT NULL COMMENT '下次重试时刻（NULL 表示无需再试）',
  `last_error` TEXT COMMENT '最近一次失败原因（覆盖式）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_status_next_retry` (`status`, `next_retry_at`),
  KEY `idx_saga_id` (`saga_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DLQ 重试日志（P9 Sprint 3 / W3.B.2）';
