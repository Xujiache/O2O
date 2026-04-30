-- ============================================================================
-- migration 12: saga_state 表（Saga 状态持久化）
-- 依据：docs/P9_集成测试部署/P9_REMAINING_PUNCHLIST.md P9-P1-09
-- 目的：解决 Saga 状态仅在内存的风险（服务重启即丢失），把每步进度落库以便：
--       1) 服务崩溃后人工补偿（findStuckSagas 扫描 status=0 且 updated_at < now-Xmin）
--       2) 灾难恢复时回放历史 Saga 上下文（context_json）
-- ============================================================================

CREATE TABLE IF NOT EXISTS `saga_state` (
  `saga_id` VARCHAR(64) NOT NULL COMMENT 'Saga 实例 ID（雪花字符串）',
  `saga_type` VARCHAR(64) NOT NULL COMMENT 'Saga 类型：OrderPaidSaga / OrderCanceledSaga / RefundSucceedSaga / SettleSaga / ...',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 进行中 / 1 已完成 / 2 失败 / 3 补偿中',
  `step_idx` INT NOT NULL DEFAULT 0 COMMENT '当前步骤索引（从 0 开始；每步成功后 +1）',
  `context_json` JSON NOT NULL COMMENT 'Saga 上下文快照（事件 envelope / 中间结果）',
  `error_msg` VARCHAR(512) DEFAULT NULL COMMENT '失败原因（status=2 时填充）',
  `tenant_id` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '租户 ID（多租户预留）',
  `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '软删标记',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  `deleted_at` DATETIME(3) DEFAULT NULL COMMENT '软删时间',
  PRIMARY KEY (`saga_id`),
  KEY `idx_status_type` (`status`, `saga_type`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Saga 状态持久化（P9-P1-09）';
