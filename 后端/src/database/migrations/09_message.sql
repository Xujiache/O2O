-- ============================================================================
-- 文件名 : 09_message.sql
-- 阶段   : P2 数据库设计 / T2.10 D9 消息通知
-- 用途   : 创建 D9 领域 4 张表
--          message_template / message_inbox / push_record / notice
-- 依据   : DESIGN_P2_数据库设计.md §三 D9
--          PRD §3.1.6.2 消息通知 / §3.4.7.3 消息推送 / §3.5.1.3 消息推送服务
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) message_template —— 消息/订阅消息模板
-- 通道：1 站内信 / 2 微信小程序订阅消息 / 3 短信 / 4 APP 推送 / 5 站内推送
-- ============================================================================
DROP TABLE IF EXISTS `message_template`;
CREATE TABLE `message_template` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `template_code`   VARCHAR(64)      NOT NULL                COMMENT '模板编码（业务侧引用）',
  `template_name`   VARCHAR(128)     NOT NULL                COMMENT '模板名称',
  `channel`         TINYINT UNSIGNED NOT NULL                COMMENT '通道：1 站内信 / 2 微信订阅 / 3 短信 / 4 APP 推送',
  `target_type`     TINYINT UNSIGNED NOT NULL                COMMENT '目标用户类型：1 用户 / 2 商户 / 3 骑手 / 4 管理员',
  `biz_scene`       VARCHAR(64)      NOT NULL                COMMENT '业务场景（如 order_paid/order_canceled/refund_succeeded）',
  `external_template_id` VARCHAR(128) NULL                   COMMENT '外部模板 ID（微信订阅模板 ID/短信签名 ID）',
  `title_template`  VARCHAR(255)     NULL                    COMMENT '标题模板（占位符 {var}）',
  `content_template` TEXT            NOT NULL                COMMENT '内容模板（占位符 {var}）',
  `var_schema`      JSON             NULL                    COMMENT '变量定义 JSON（变量名/类型/示例值）',
  `priority`        TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '优先级：1 普通 / 2 重要 / 3 紧急',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 停用 / 1 启用',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_code`     (`template_code`)                          COMMENT '模板编码唯一',
  KEY `idx_channel_scene_status`    (`channel`,`biz_scene`,`status`)           COMMENT '业务侧按场景+通道选模板'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='消息/订阅消息模板';


-- ============================================================================
-- 2) message_inbox —— 站内信收件箱（按租户单表，体量可控；超量再月分表）
-- 对应 PRD §3.1.6.2 小程序内消息中心 / §3.2.6.2 商户消息中心 / §3.3.6.1 骑手消息中心
-- ============================================================================
DROP TABLE IF EXISTS `message_inbox`;
CREATE TABLE `message_inbox` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `receiver_type`   TINYINT UNSIGNED NOT NULL                COMMENT '收件方类型：1 用户 / 2 商户 / 3 骑手 / 4 管理员',
  `receiver_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '收件方 ID',
  `category`        TINYINT UNSIGNED NOT NULL                COMMENT '消息分类：1 订单 / 2 活动 / 3 账户 / 4 系统 / 5 客服',
  `title`           VARCHAR(255)     NOT NULL                COMMENT '标题',
  `content`         TEXT             NOT NULL                COMMENT '内容（已渲染）',
  `link_url`        VARCHAR(512)     NULL                    COMMENT '点击跳转地址（小程序 path / H5 url）',
  `related_type`    TINYINT UNSIGNED NULL                    COMMENT '关联业务类型（外卖/跑腿/退款 等）',
  `related_no`      VARCHAR(64)      NULL                    COMMENT '关联业务单号',
  `is_read`         TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否已读：0 未读 / 1 已读',
  `read_at`         DATETIME(3)      NULL                    COMMENT '已读时间',
  `template_id`     BIGINT UNSIGNED  NULL                    COMMENT '关联模板 ID',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删（用户删除）',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_receiver_read_created` (`receiver_type`,`receiver_id`,`is_read`,`created_at`) COMMENT '收件箱列表（未读优先）',
  KEY `idx_receiver_category`     (`receiver_type`,`receiver_id`,`category`,`created_at`) COMMENT '按分类筛选',
  KEY `idx_related_no`            (`related_no`)                                         COMMENT '业务单号反查消息'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站内信收件箱';


-- ============================================================================
-- 3) push_record —— 外部推送记录（微信订阅/短信/APP 推送）
-- ============================================================================
DROP TABLE IF EXISTS `push_record`;
CREATE TABLE `push_record` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `request_id`      VARCHAR(64)      NOT NULL                COMMENT '幂等请求 ID（业务侧生成）',
  `channel`         TINYINT UNSIGNED NOT NULL                COMMENT '通道：2 微信订阅 / 3 短信 / 4 APP 推送',
  `provider`        VARCHAR(32)      NOT NULL                COMMENT '服务商：wechat_mp / aliyun_sms / jpush / getui',
  `template_id`     BIGINT UNSIGNED  NULL                    COMMENT '消息模板 ID',
  `template_code`   VARCHAR(64)      NULL                    COMMENT '模板编码（冗余）',
  `target_type`     TINYINT UNSIGNED NOT NULL                COMMENT '目标类型：1 用户 / 2 商户 / 3 骑手',
  `target_id`       BIGINT UNSIGNED  NOT NULL                COMMENT '目标 ID',
  `target_address`  VARCHAR(255)     NOT NULL                COMMENT '目标地址（openId / mobile_hash / device_token）',
  `vars_json`       JSON             NULL                    COMMENT '渲染变量 JSON',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 待发 / 1 发送中 / 2 成功 / 3 失败 / 4 渠道驳回',
  `attempts`        TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '尝试次数（失败重试）',
  `external_msg_id` VARCHAR(128)     NULL                    COMMENT '外部消息 ID（服务商返回）',
  `error_code`      VARCHAR(64)      NULL                    COMMENT '失败代码',
  `error_msg`       VARCHAR(500)     NULL                    COMMENT '失败描述',
  `sent_at`         DATETIME(3)      NULL                    COMMENT '发送完成时间',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_request_id`            (`request_id`)                                  COMMENT '幂等请求 ID 唯一',
  KEY `idx_target_status_created`       (`target_type`,`target_id`,`status`,`created_at`) COMMENT '目标推送历史',
  KEY `idx_status_attempts_created`     (`status`,`attempts`,`created_at`)              COMMENT '失败重试 Job 扫描',
  KEY `idx_channel_provider_status`     (`channel`,`provider`,`status`)                 COMMENT '通道+服务商成功率统计'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='外部推送记录';


-- ============================================================================
-- 4) notice —— 平台公告/通知
-- 对应 PRD §3.1.1.5 公告栏 / §3.4.6.2 公告管理 / §3.4.7.3 全平台定向消息
-- ============================================================================
DROP TABLE IF EXISTS `notice`;
CREATE TABLE `notice` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `notice_no`       VARCHAR(32)      NOT NULL                COMMENT '公告编号',
  `title`           VARCHAR(255)     NOT NULL                COMMENT '公告标题',
  `summary`         VARCHAR(500)     NULL                    COMMENT '摘要（首页滚动展示用）',
  `content`         TEXT             NOT NULL                COMMENT '公告内容（富文本）',
  `cover_url`       VARCHAR(512)     NULL                    COMMENT '封面图',
  `notice_type`     TINYINT UNSIGNED NOT NULL                COMMENT '类型：1 平台公告 / 2 活动通知 / 3 系统维护 / 4 服务变更',
  `target_terminal` JSON             NOT NULL                COMMENT '展示端数组：["user","merchant","rider","admin"]',
  `target_city`     JSON             NULL                    COMMENT '目标城市编码数组（NULL=全部）',
  `target_user_segment` JSON         NULL                    COMMENT '用户分群标签数组（如 ["new_user","vip"]）',
  `priority`        TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '优先级：1 普通 / 2 重要 / 3 弹窗强提醒',
  `start_at`        DATETIME(3)      NOT NULL                COMMENT '展示起始时间',
  `end_at`          DATETIME(3)      NOT NULL                COMMENT '下线时间',
  `view_count`      INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '查看次数（运营冗余）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 草稿 / 1 已发布 / 2 已下架',
  `publisher_admin_id` BIGINT UNSIGNED NULL                  COMMENT '发布管理员 ID',
  `published_at`    DATETIME(3)      NULL                    COMMENT '发布时间',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notice_no`           (`notice_no`)                          COMMENT '公告编号唯一',
  KEY `idx_status_start_end`          (`status`,`start_at`,`end_at`)         COMMENT '生效中公告（首页拉取）',
  KEY `idx_priority_published`        (`priority`,`published_at`)            COMMENT '弹窗强提醒优先'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='平台公告/通知';

-- ============================================================================
-- END 09_message.sql —— 共 4 张表
-- ============================================================================
