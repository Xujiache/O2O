-- ============================================================================
-- 文件名 : 07_marketing.sql
-- 阶段   : P2 数据库设计 / T2.8 D7 营销
-- 用途   : 创建 D7 领域 7 张表
--          coupon / user_coupon / promotion / red_packet /
--          user_point / user_point_flow / invite_relation
-- 依据   : DESIGN_P2_数据库设计.md §三 D7 / PRD §3.4.7 运营管理
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) coupon —— 优惠券模板
-- 对应 PRD §3.2.6.3 商户营销工具 / §3.4.7.1 平台优惠券
-- ============================================================================
DROP TABLE IF EXISTS `coupon`;
CREATE TABLE `coupon` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `coupon_code`         VARCHAR(64)      NOT NULL                COMMENT '券模板编码',
  `name`                VARCHAR(128)     NOT NULL                COMMENT '券名称（例：满 30 减 5）',
  `issuer_type`         TINYINT UNSIGNED NOT NULL                COMMENT '发券方：1 平台 / 2 商户',
  `issuer_id`           BIGINT UNSIGNED  NULL                    COMMENT '发券方 ID（issuer_type=2 时为 merchant.id）',
  `coupon_type`         TINYINT UNSIGNED NOT NULL                COMMENT '券类型：1 满减 / 2 折扣 / 3 立减 / 4 免运费',
  `discount_value`      DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '面额：满减/立减为元，折扣为 0~1（如 0.85=85 折）',
  `min_order_amount`    DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '订单最低金额（满减门槛）',
  `max_discount`        DECIMAL(8,2)     NULL                    COMMENT '最大优惠（折扣券封顶）',
  `scene`               TINYINT UNSIGNED NOT NULL                COMMENT '使用场景：1 外卖 / 2 跑腿 / 3 通用',
  `applicable_shops`    JSON             NULL                    COMMENT '适用店铺 ID 数组（NULL=全部）',
  `applicable_categories` JSON           NULL                    COMMENT '适用品类编码数组',
  `total_qty`           INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '总发放数量（0=不限）',
  `received_qty`        INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '已领取数量',
  `used_qty`            INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '已使用数量',
  `per_user_limit`      SMALLINT UNSIGNED NOT NULL DEFAULT 1     COMMENT '每人限领数量',
  `valid_type`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '有效期类型：1 固定时段 / 2 领取后 N 天',
  `valid_from`          DATETIME(3)      NULL                    COMMENT '固定时段起始（valid_type=1）',
  `valid_to`            DATETIME(3)      NULL                    COMMENT '固定时段结束',
  `valid_days`          SMALLINT UNSIGNED NULL                   COMMENT '领取后有效天数（valid_type=2）',
  `image_url`           VARCHAR(512)     NULL                    COMMENT '券面图',
  `description`         VARCHAR(500)     NULL                    COMMENT '使用说明',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 停用 / 1 启用 / 2 已下架',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coupon_code` (`coupon_code`)                                COMMENT '券编码唯一',
  KEY `idx_issuer`            (`issuer_type`,`issuer_id`,`status`)           COMMENT '发券方查券',
  KEY `idx_status_valid`      (`status`,`valid_from`,`valid_to`)             COMMENT '生效中的券（首页推荐）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='优惠券模板';


-- ============================================================================
-- 2) user_coupon —— 用户已领取的券
-- 对应 PRD §3.1.5.3 优惠券管理
-- ============================================================================
DROP TABLE IF EXISTS `user_coupon`;
CREATE TABLE `user_coupon` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `user_id`             BIGINT UNSIGNED  NOT NULL                COMMENT '用户 ID',
  `coupon_id`           BIGINT UNSIGNED  NOT NULL                COMMENT '券模板 ID',
  `coupon_code`         VARCHAR(64)      NOT NULL                COMMENT '券编码冗余（避免 join）',
  `valid_from`          DATETIME(3)      NOT NULL                COMMENT '生效起始',
  `valid_to`            DATETIME(3)      NOT NULL                COMMENT '失效时间',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 已过期 / 1 未使用 / 2 已使用 / 3 冻结（订单未支付）',
  `used_at`             DATETIME(3)      NULL                    COMMENT '使用时间',
  `used_order_no`       CHAR(18)         NULL                    COMMENT '使用订单号',
  `used_order_type`     TINYINT UNSIGNED NULL                    COMMENT '使用订单类型：1 外卖 / 2 跑腿',
  `discount_amount`     DECIMAL(8,2)     NULL                    COMMENT '实际抵扣金额',
  `received_source`     TINYINT UNSIGNED NULL                    COMMENT '领取来源：1 主动领 / 2 活动赠 / 3 邀请奖 / 4 客服补偿',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建（领取）时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_status_valid`  (`user_id`,`status`,`valid_to`)               COMMENT '用户可用券列表（按到期排）',
  KEY `idx_coupon_status`      (`coupon_id`,`status`)                        COMMENT '券模板核销聚合',
  KEY `idx_used_order`         (`used_order_no`)                             COMMENT '订单反查使用券'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户已领取的券';


-- ============================================================================
-- 3) promotion —— 满减/折扣/拼单等活动
-- 对应 PRD §3.2.4.5 优惠商品 / §3.4.7.2 营销活动
-- 不同活动类型用 rule_json 表达差异（避免列爆炸）
-- ============================================================================
DROP TABLE IF EXISTS `promotion`;
CREATE TABLE `promotion` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `promotion_code`  VARCHAR(64)      NOT NULL                COMMENT '活动编码',
  `name`            VARCHAR(128)     NOT NULL                COMMENT '活动名称',
  `promo_type`      TINYINT UNSIGNED NOT NULL                COMMENT '类型：1 满减 / 2 折扣 / 3 拼单 / 4 新人福利 / 5 限时秒杀',
  `issuer_type`     TINYINT UNSIGNED NOT NULL                COMMENT '发起方：1 平台 / 2 商户',
  `issuer_id`       BIGINT UNSIGNED  NULL                    COMMENT '发起方 ID',
  `scene`           TINYINT UNSIGNED NOT NULL                COMMENT '场景：1 外卖 / 2 跑腿 / 3 通用',
  `applicable_shops` JSON            NULL                    COMMENT '适用店铺 ID 数组',
  `applicable_products` JSON         NULL                    COMMENT '适用商品 ID 数组',
  `rule_json`       JSON             NOT NULL                COMMENT '规则 JSON（满减阶梯/折扣率/拼单人数等）',
  `total_qty`       INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '活动名额（0=不限）',
  `used_qty`        INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '已用名额',
  `per_user_limit`  SMALLINT UNSIGNED NOT NULL DEFAULT 1     COMMENT '每人限制次数',
  `valid_from`      DATETIME(3)      NOT NULL                COMMENT '生效起始',
  `valid_to`        DATETIME(3)      NOT NULL                COMMENT '失效时间',
  `priority`        INT              NOT NULL DEFAULT 0      COMMENT '优先级（多活动叠加时使用）',
  `is_stackable`    TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否可与其他活动/券叠加：0 否 / 1 是',
  `description`     VARCHAR(500)     NULL                    COMMENT '活动说明',
  `image_url`       VARCHAR(512)     NULL                    COMMENT '活动图片',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 草稿 / 1 启用 / 2 暂停 / 3 已结束',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_promotion_code`   (`promotion_code`)                       COMMENT '活动编码唯一',
  KEY `idx_status_valid`           (`status`,`valid_from`,`valid_to`)       COMMENT '生效中的活动',
  KEY `idx_issuer_promo_type`      (`issuer_type`,`issuer_id`,`promo_type`) COMMENT '发起方活动列表'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='营销活动（满减/折扣/拼单/秒杀）';


-- ============================================================================
-- 4) red_packet —— 红包
-- 对应 PRD §3.1.5.3 优惠券/红包 / §3.4.7.1 优惠券/红包创建
-- ============================================================================
DROP TABLE IF EXISTS `red_packet`;
CREATE TABLE `red_packet` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `packet_code`     VARCHAR(64)      NOT NULL                COMMENT '红包编码',
  `name`            VARCHAR(128)     NOT NULL                COMMENT '红包名称',
  `packet_type`     TINYINT UNSIGNED NOT NULL                COMMENT '类型：1 普通红包 / 2 拼手气 / 3 现金红包',
  `issuer_type`     TINYINT UNSIGNED NOT NULL                COMMENT '发放方：1 平台 / 2 商户',
  `issuer_id`       BIGINT UNSIGNED  NULL                    COMMENT '发放方 ID',
  `total_amount`    DECIMAL(12,2)    NOT NULL                COMMENT '总金额',
  `total_qty`       INT UNSIGNED     NOT NULL                COMMENT '总份数',
  `received_qty`    INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '已领取份数',
  `received_amount` DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '已领取金额',
  `min_amount`      DECIMAL(8,2)     NULL                    COMMENT '单份最小金额（拼手气）',
  `max_amount`      DECIMAL(8,2)     NULL                    COMMENT '单份最大金额',
  `target_user_ids` JSON             NULL                    COMMENT '指定用户 ID 数组（NULL=任意用户）',
  `valid_from`      DATETIME(3)      NOT NULL                COMMENT '生效起始',
  `valid_to`        DATETIME(3)      NOT NULL                COMMENT '失效时间',
  `wishing`         VARCHAR(255)     NULL                    COMMENT '红包祝福语',
  `image_url`       VARCHAR(512)     NULL                    COMMENT '红包封面图',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 草稿 / 1 进行中 / 2 已发完 / 3 已过期 / 4 已退款',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_packet_code`   (`packet_code`)                              COMMENT '红包编码唯一',
  KEY `idx_status_valid`        (`status`,`valid_to`)                        COMMENT '生效中红包',
  KEY `idx_issuer`              (`issuer_type`,`issuer_id`,`status`)         COMMENT '发放方红包列表'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='红包';


-- ============================================================================
-- 5) user_point —— 用户积分（每个用户一条余额记录）
-- 对应 PRD §3.1.5.3 积分管理
-- ============================================================================
DROP TABLE IF EXISTS `user_point`;
CREATE TABLE `user_point` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `user_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '用户 ID',
  `total_point`     INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '可用积分',
  `frozen_point`    INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '冻结积分（兑换处理中）',
  `total_earned`    INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '历史累计获得',
  `total_used`      INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '历史累计使用',
  `version`         INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '乐观锁版本号',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_id` (`user_id`)                       COMMENT '一个用户一条'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户积分余额';


-- ============================================================================
-- 6) user_point_flow —— 用户积分流水
-- ============================================================================
DROP TABLE IF EXISTS `user_point_flow`;
CREATE TABLE `user_point_flow` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `user_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '用户 ID',
  `direction`       TINYINT UNSIGNED NOT NULL                COMMENT '方向：1 增加 / 2 扣减',
  `biz_type`        TINYINT UNSIGNED NOT NULL                COMMENT '业务类型：1 下单 / 2 评价 / 3 签到 / 4 邀请 / 5 兑换 / 6 过期 / 7 调整',
  `point`           INT UNSIGNED     NOT NULL                COMMENT '本次发生积分（正数）',
  `balance_after`   INT UNSIGNED     NOT NULL                COMMENT '操作后余额',
  `related_no`      VARCHAR(64)      NULL                    COMMENT '关联业务单号',
  `expire_at`       DATETIME(3)      NULL                    COMMENT '该笔积分过期时间（仅 direction=1）',
  `remark`          VARCHAR(255)     NULL                    COMMENT '备注',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '操作管理员 ID（biz_type=7）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_created`     (`user_id`,`created_at`)            COMMENT '用户积分时间线',
  KEY `idx_user_biz`         (`user_id`,`biz_type`,`created_at`) COMMENT '用户按业务筛积分',
  KEY `idx_expire_direction` (`direction`,`expire_at`)           COMMENT '积分过期清理 Job'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户积分流水';


-- ============================================================================
-- 7) invite_relation —— 邀请关系
-- 对应 PRD §3.1.5.3 邀请有礼 / §3.4.7.2 邀请活动
-- 一名用户只能被一名用户邀请（防刷单）
-- ============================================================================
DROP TABLE IF EXISTS `invite_relation`;
CREATE TABLE `invite_relation` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `inviter_id`      BIGINT UNSIGNED  NOT NULL                COMMENT '邀请人用户 ID',
  `invitee_id`      BIGINT UNSIGNED  NOT NULL                COMMENT '被邀请人用户 ID',
  `invite_code`     VARCHAR(32)      NOT NULL                COMMENT '邀请码',
  `channel`         VARCHAR(64)      NULL                    COMMENT '邀请渠道：wechat_share / poster / sms',
  `reward_status`   TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '奖励状态：0 未完成 / 1 已完成（被邀请人首单完成） / 2 已发放',
  `reward_at`       DATETIME(3)      NULL                    COMMENT '奖励发放时间',
  `reward_remark`   VARCHAR(255)     NULL                    COMMENT '奖励说明（券 ID/积分数）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建（绑定）时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invitee`     (`invitee_id`)                COMMENT '一人仅被邀请一次',
  KEY `idx_inviter_status`    (`inviter_id`,`reward_status`,`created_at`) COMMENT '邀请人战绩列表',
  KEY `idx_invite_code`       (`invite_code`)               COMMENT '邀请码反查'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邀请关系';

-- ============================================================================
-- END 07_marketing.sql —— 共 7 张表
-- ============================================================================
