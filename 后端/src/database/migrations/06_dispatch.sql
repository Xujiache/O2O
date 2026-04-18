-- ============================================================================
-- 文件名 : 06_dispatch.sql
-- 阶段   : P2 数据库设计 / T2.7 D6 配送调度
-- 用途   : 创建 D6 领域 7 张表
--          dispatch_record / transfer_record / abnormal_report /
--          rider_preference / delivery_track_summary /
--          rider_attendance / rider_reward
-- 依据   : DESIGN_P2_数据库设计.md §三 D6
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) dispatch_record —— 派单记录
-- 对应 PRD §3.5.2.4 配送调度服务（智能派单算法 / 抢单 / 转单）
-- 一笔订单可能产生多条派单尝试（被拒/超时未应答→重新派）
-- ============================================================================
DROP TABLE IF EXISTS `dispatch_record`;
CREATE TABLE `dispatch_record` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `dispatch_mode`   TINYINT UNSIGNED NOT NULL                COMMENT '派单模式：1 系统智能派 / 2 抢单 / 3 人工指派',
  `rider_id`        BIGINT UNSIGNED  NULL                    COMMENT '目标骑手 ID（抢单/系统派后填）',
  `score`           DECIMAL(8,4)     NULL                    COMMENT '匹配分数（智能派单算法输出）',
  `distance_m`      INT UNSIGNED     NULL                    COMMENT '骑手到取件点距离（米）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 派单中 / 1 已接受 / 2 拒绝 / 3 超时未应答 / 4 取消',
  `accepted_at`     DATETIME(3)      NULL                    COMMENT '骑手接受时间',
  `responded_at`    DATETIME(3)      NULL                    COMMENT '骑手应答时间（接受/拒绝）',
  `reject_reason`   VARCHAR(255)     NULL                    COMMENT '拒绝原因（status=2）',
  `expire_at`       DATETIME(3)      NULL                    COMMENT '应答超时时间',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '人工指派管理员 ID（dispatch_mode=3）',
  `extra`           JSON             NULL                    COMMENT '扩展信息（候选列表/算法版本等）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_created`        (`order_no`,`created_at`)                  COMMENT '订单派单序列',
  KEY `idx_rider_status_created` (`rider_id`,`status`,`created_at`)         COMMENT '骑手派单历史',
  KEY `idx_status_expire`        (`status`,`expire_at`)                     COMMENT '超时清理 Job'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='派单记录';


-- ============================================================================
-- 2) transfer_record —— 转单记录
-- 对应 PRD §3.3.2.3 转单申请 / §3.4.4.3 转单管理
-- ============================================================================
DROP TABLE IF EXISTS `transfer_record`;
CREATE TABLE `transfer_record` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `from_rider_id`   BIGINT UNSIGNED  NOT NULL                COMMENT '原骑手 ID',
  `to_rider_id`     BIGINT UNSIGNED  NULL                    COMMENT '转入骑手 ID（接单后填）',
  `reason_code`     VARCHAR(64)      NOT NULL                COMMENT '原因编码（→ sys_dict transfer_reason）',
  `reason_detail`   VARCHAR(500)     NULL                    COMMENT '原因详情',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 申请中 / 1 已转出 / 2 已驳回 / 3 已取消',
  `audit_admin_id`  BIGINT UNSIGNED  NULL                    COMMENT '审核管理员 ID',
  `audit_at`        DATETIME(3)      NULL                    COMMENT '审核时间',
  `audit_remark`    VARCHAR(255)     NULL                    COMMENT '审核备注',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_no`             (`order_no`)                                  COMMENT '订单转单历史',
  KEY `idx_from_rider_status`    (`from_rider_id`,`status`,`created_at`)       COMMENT '原骑手转单历史',
  KEY `idx_status_created`       (`status`,`created_at`)                       COMMENT '运营审核工作台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='转单记录';


-- ============================================================================
-- 3) abnormal_report —— 异常上报
-- 对应 PRD §3.3.3.3 骑手异常处理 / §3.2.3.4 商户异常上报
-- ============================================================================
DROP TABLE IF EXISTS `abnormal_report`;
CREATE TABLE `abnormal_report` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`        CHAR(18)         NULL                    COMMENT '订单号（可空：与订单无关的异常）',
  `order_type`      TINYINT UNSIGNED NULL                    COMMENT '订单类型：1 外卖 / 2 跑腿',
  `reporter_type`   TINYINT UNSIGNED NOT NULL                COMMENT '上报方：1 用户 / 2 商户 / 3 骑手',
  `reporter_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '上报方 ID',
  `abnormal_type`   VARCHAR(64)      NOT NULL                COMMENT '异常类型编码（→ sys_dict abnormal_type）',
  `description`     VARCHAR(1000)    NOT NULL                COMMENT '异常描述',
  `evidence_urls`   JSON             NULL                    COMMENT '证据图片/视频 URL 数组',
  `lng`             DECIMAL(10,7)    NULL                    COMMENT '上报时经度',
  `lat`             DECIMAL(10,7)    NULL                    COMMENT '上报时纬度',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 待处理 / 1 处理中 / 2 已解决 / 3 已驳回',
  `handle_admin_id` BIGINT UNSIGNED  NULL                    COMMENT '处理管理员 ID',
  `handle_at`       DATETIME(3)      NULL                    COMMENT '处理时间',
  `handle_result`   VARCHAR(1000)    NULL                    COMMENT '处理结果说明',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_no`              (`order_no`)                                COMMENT '订单异常列表',
  KEY `idx_reporter_status`       (`reporter_type`,`reporter_id`,`status`)    COMMENT '上报方查异常',
  KEY `idx_status_type_created`   (`status`,`abnormal_type`,`created_at`)     COMMENT '运营按类型筛'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='异常上报';


-- ============================================================================
-- 4) rider_preference —— 骑手接单偏好
-- 对应 PRD §3.3.2.2 派单规则设置（接单范围、订单类型偏好）
-- ============================================================================
DROP TABLE IF EXISTS `rider_preference`;
CREATE TABLE `rider_preference` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `rider_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '骑手 ID',
  `accept_mode`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '接单模式：1 系统派单 / 2 抢单 / 3 派单+抢单',
  `accept_radius_m` INT UNSIGNED     NOT NULL DEFAULT 3000   COMMENT '接单半径（米）',
  `accept_takeout`  TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '是否接外卖：0 否 / 1 是',
  `accept_errand`   TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '是否接跑腿：0 否 / 1 是',
  `errand_types`    JSON             NULL                    COMMENT '接受的跑腿类型数组（[1,2,3,4]）',
  `accept_max_concurrent` SMALLINT UNSIGNED NOT NULL DEFAULT 5 COMMENT '同时配送最大数',
  `voice_enabled`   TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '语音播报：0 关 / 1 开',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rider_id` (`rider_id`)                     COMMENT '一个骑手一条偏好'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='骑手接单偏好';


-- ============================================================================
-- 5) delivery_track_summary —— 配送轨迹摘要
-- 详细轨迹点存 TimescaleDB rider_location_ts；本表存订单级聚合摘要，便于
-- 后台快速展示（PRD §3.4.4.3 配送轨迹查询、§3.4.5.2 配送轨迹）
-- ============================================================================
DROP TABLE IF EXISTS `delivery_track_summary`;
CREATE TABLE `delivery_track_summary` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`            CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`          TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `rider_id`            BIGINT UNSIGNED  NOT NULL                COMMENT '骑手 ID',
  `pickup_lng`          DECIMAL(10,7)    NULL                    COMMENT '取件点经度',
  `pickup_lat`          DECIMAL(10,7)    NULL                    COMMENT '取件点纬度',
  `delivery_lng`        DECIMAL(10,7)    NULL                    COMMENT '送达点经度',
  `delivery_lat`        DECIMAL(10,7)    NULL                    COMMENT '送达点纬度',
  `total_distance_m`    INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '总配送距离（米）',
  `total_duration_s`    INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '总配送时长（秒）',
  `pickup_at`           DATETIME(3)      NULL                    COMMENT '取件完成时间',
  `delivered_at`        DATETIME(3)      NULL                    COMMENT '送达时间',
  `is_on_time`          TINYINT UNSIGNED NULL                    COMMENT '是否准时：0 否 / 1 是 / NULL 未结算',
  `delay_s`             INT              NULL                    COMMENT '延迟秒数（负数=提前送达）',
  `track_first_chunk_id` BIGINT          NULL                    COMMENT 'TimescaleDB 第一段 chunk 引用（仅用于审计）',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no`             (`order_no`)                  COMMENT '一笔订单一条摘要',
  KEY `idx_rider_delivered`            (`rider_id`,`delivered_at`)   COMMENT '骑手配送时间线',
  KEY `idx_on_time`                    (`is_on_time`,`created_at`)   COMMENT '准时率统计'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='配送轨迹摘要';


-- ============================================================================
-- 6) rider_attendance —— 骑手考勤
-- 对应 PRD §3.3.5.1 考勤管理（上下班打卡、在线时长统计、请假申请）
-- ============================================================================
DROP TABLE IF EXISTS `rider_attendance`;
CREATE TABLE `rider_attendance` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `rider_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '骑手 ID',
  `att_date`        DATE             NOT NULL                COMMENT '考勤日期',
  `clock_in_at`     DATETIME(3)      NULL                    COMMENT '上班打卡时间',
  `clock_in_lng`    DECIMAL(10,7)    NULL                    COMMENT '上班打卡经度',
  `clock_in_lat`    DECIMAL(10,7)    NULL                    COMMENT '上班打卡纬度',
  `clock_out_at`    DATETIME(3)      NULL                    COMMENT '下班打卡时间',
  `clock_out_lng`   DECIMAL(10,7)    NULL                    COMMENT '下班打卡经度',
  `clock_out_lat`   DECIMAL(10,7)    NULL                    COMMENT '下班打卡纬度',
  `online_seconds`  INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '在线时长（秒）',
  `delivered_count` INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '当日配送单量',
  `is_leave`        TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否请假：0 否 / 1 是',
  `leave_reason`    VARCHAR(255)     NULL                    COMMENT '请假原因',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rider_date`     (`rider_id`,`att_date`)   COMMENT '一人一天一条',
  KEY `idx_att_date`             (`att_date`)              COMMENT '按日期聚合'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='骑手考勤';


-- ============================================================================
-- 7) rider_reward —— 骑手奖励/罚款流水
-- 对应 PRD §3.3.5.3 等级与奖惩 / §3.4.4.4 奖惩管理
-- ============================================================================
DROP TABLE IF EXISTS `rider_reward`;
CREATE TABLE `rider_reward` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `rider_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '骑手 ID',
  `reward_type`     TINYINT UNSIGNED NOT NULL                COMMENT '类型：1 奖励 / 2 罚款 / 3 补贴 / 4 等级升降',
  `reason_code`     VARCHAR(64)      NOT NULL                COMMENT '原因编码（→ sys_dict reward_reason）',
  `reason_detail`   VARCHAR(500)     NULL                    COMMENT '原因详情',
  `amount`          DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '金额（reward_type=4 时为 0）',
  `score_delta`     INT              NOT NULL DEFAULT 0      COMMENT '积分变化（评分/等级用）',
  `related_order_no` CHAR(18)        NULL                    COMMENT '关联订单号',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '操作管理员 ID（系统自动则为 NULL）',
  `flow_no`         VARCHAR(32)      NULL                    COMMENT '关联账户流水号（金额到账后填）',
  `is_appealed`     TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否申诉：0 否 / 1 是',
  `appeal_status`   TINYINT UNSIGNED NULL                    COMMENT '申诉状态：0 申诉中 / 1 同意 / 2 驳回',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_rider_type_created`    (`rider_id`,`reward_type`,`created_at`)  COMMENT '骑手奖惩历史',
  KEY `idx_appeal_status`         (`is_appealed`,`appeal_status`)          COMMENT '申诉工作台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='骑手奖励/罚款流水';

-- ============================================================================
-- END 06_dispatch.sql —— 共 7 张表
-- ============================================================================
