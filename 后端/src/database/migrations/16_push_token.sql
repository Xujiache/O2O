-- ============================================================================
-- 文件名 : 16_push_token.sql
-- 阶段   : P9 Sprint 5 / W5.E.3
-- 用途   : push_token 表 —— 三端（用户/商户/骑手）推送 token 注册
-- 依据   : Sprint 5 Agent E push-token 服务（registration_id + 心跳 + 不活跃清理）
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `push_token` (
  `id` BIGINT NOT NULL COMMENT '主键（雪花字符串数值）',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户/商户/骑手 ID',
  `user_type` TINYINT NOT NULL COMMENT '1 user / 2 merchant / 3 rider',
  `platform` VARCHAR(16) NOT NULL COMMENT 'ios | android | mp',
  `registration_id` VARCHAR(128) NOT NULL COMMENT '极光 registrationId / 小程序 openId 衍生 token',
  `device_id` VARCHAR(128) DEFAULT NULL COMMENT '设备唯一标识（plus.device.uuid 或前端生成）',
  `app_version` VARCHAR(32) DEFAULT NULL COMMENT '客户端应用版本号',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `last_active_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近活跃时间（心跳更新）',
  `is_deleted` TINYINT NOT NULL DEFAULT 0 COMMENT '0 有效 / 1 已注销 / 2 不活跃清理',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_platform_device` (`user_id`, `user_type`, `platform`, `device_id`),
  KEY `idx_registration` (`registration_id`),
  KEY `idx_last_active` (`last_active_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='三端推送 token（P9 Sprint 5 / W5.E.3）';
