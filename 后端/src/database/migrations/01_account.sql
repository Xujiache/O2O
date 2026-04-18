-- ============================================================================
-- 文件名 : 01_account.sql
-- 阶段   : P2 数据库设计 / T2.2 D1 账号与认证
-- 用途   : 创建 D1 领域 14 张表（用户/商户/骑手/管理员/RBAC/黑名单）
-- 依据   : DESIGN_P2_数据库设计.md §三 D1 / §四 user / §五 索引 / §九 加密
--          CONSENSUS_P2_数据库设计.md §2.1 设计原则 / §2.5 加密字段清单
-- 前置   : 已执行 00_init.sql；当前会话已 USE o2o_platform
-- 重复执行: 所有表 DROP TABLE IF EXISTS + CREATE，便于本地反复重建
--           （生产环境 migration 由专门工具按版本号顺序应用，不会跑 DROP）
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) user —— C 端用户主表
-- 对应 PRD §1.4 C端用户、§3.1.5 个人中心、§3.5.1.2 用户中心
-- 敏感字段：mobile / id_card / real_name 三组（详见 DESIGN §九）
-- ============================================================================
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID（多租户预留，默认 1）',
  `union_id`        VARCHAR(64)      NULL                    COMMENT '微信开放平台 unionId',
  `open_id_mp`      VARCHAR(64)      NULL                    COMMENT '微信小程序 openId',
  `nickname`        VARCHAR(64)      NULL                    COMMENT '昵称（可由用户编辑，明文存储）',
  `avatar_url`      VARCHAR(512)     NULL                    COMMENT '头像 URL（CDN/MinIO 地址）',
  `gender`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '性别：0 未知 / 1 男 / 2 女',
  `birthday`        DATE             NULL                    COMMENT '生日（用户可选填）',
  `mobile_enc`      VARBINARY(255)   NULL                    COMMENT '手机号 AES-256-GCM 密文',
  `mobile_hash`     CHAR(64)         NULL                    COMMENT '手机号 HMAC-SHA256 hex（等值检索）',
  `mobile_tail4`    VARCHAR(8)       NULL                    COMMENT '手机号末 4 位（脱敏展示）',
  `id_card_enc`     VARBINARY(255)   NULL                    COMMENT '身份证号 AES-256-GCM 密文',
  `id_card_hash`    CHAR(64)         NULL                    COMMENT '身份证号 HMAC-SHA256 hex',
  `real_name_enc`   VARBINARY(255)   NULL                    COMMENT '真实姓名 AES-256-GCM 密文',
  `is_realname`     TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否实名：0 未实名 / 1 已实名（PRD §3.1.5.1）',
  `enc_key_ver`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本号（详见 encryption.md 轮换策略）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '账号状态：0 封禁 / 1 正常 / 2 注销中',
  `reg_source`      TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '注册来源：1 微信小程序 / 2 H5 / 3 APP',
  `reg_ip`          VARBINARY(16)    NULL                    COMMENT '注册 IP（IPv4 4B / IPv6 16B 通用 VARBINARY）',
  `last_login_at`   DATETIME(3)      NULL                    COMMENT '最近登录时间',
  `last_login_ip`   VARBINARY(16)    NULL                    COMMENT '最近登录 IP',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删标记：0 正常 / 1 已删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间（软删）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_union_id`     (`union_id`)     COMMENT '微信 unionId 唯一（NULL 允许重复）',
  UNIQUE KEY `uk_open_id_mp`   (`open_id_mp`)   COMMENT '小程序 openId 唯一',
  UNIQUE KEY `uk_mobile_hash`  (`mobile_hash`)  COMMENT '手机号哈希唯一（等值检索/防重）',
  KEY `idx_status_tenant` (`status`,`tenant_id`) COMMENT '运营按状态/租户筛选',
  KEY `idx_created_at`    (`created_at`)        COMMENT '注册时间排序/范围查询'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='C 端用户主表（敏感字段加密存储）';


-- ============================================================================
-- 2) user_address —— 用户收货地址簿
-- 对应 PRD §3.1.5.2 地址管理
-- ============================================================================
DROP TABLE IF EXISTS `user_address`;
CREATE TABLE `user_address` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `user_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '所属用户 ID（逻辑外键 → user.id）',
  `receiver_name`   VARCHAR(64)      NOT NULL                COMMENT '收件人姓名（明文，单条地址簿）',
  `receiver_mobile_enc`   VARBINARY(255)  NOT NULL          COMMENT '收件人手机号 AES-256-GCM 密文',
  `receiver_mobile_hash`  CHAR(64)        NOT NULL          COMMENT '收件人手机号 HMAC-SHA256',
  `receiver_mobile_tail4` VARCHAR(8)      NOT NULL          COMMENT '收件人手机号末 4 位（脱敏）',
  `province_code`   CHAR(6)          NOT NULL                COMMENT '省级行政区划代码（region.code）',
  `city_code`       CHAR(6)          NOT NULL                COMMENT '市级行政区划代码',
  `district_code`   CHAR(6)          NOT NULL                COMMENT '区/县行政区划代码',
  `province_name`   VARCHAR(32)      NOT NULL                COMMENT '省名称冗余（避免每次 join）',
  `city_name`       VARCHAR(32)      NOT NULL                COMMENT '市名称冗余',
  `district_name`   VARCHAR(32)      NOT NULL                COMMENT '区/县名称冗余',
  `detail`          VARCHAR(255)     NOT NULL                COMMENT '详细地址（街道/楼栋/门牌；日志打印需脱敏）',
  `tag`             VARCHAR(16)      NULL                    COMMENT '地址标签：家/公司/学校/其他',
  `lng`             DECIMAL(10,7)    NULL                    COMMENT '经度（高德坐标系 GCJ-02）',
  `lat`             DECIMAL(10,7)    NULL                    COMMENT '纬度',
  `is_default`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否默认地址：0 否 / 1 是',
  `enc_key_ver`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删标记',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_default` (`user_id`,`is_default`,`is_deleted`) COMMENT '查用户默认地址 / 列表',
  KEY `idx_district_code` (`district_code`)                    COMMENT '按区域统计/聚合'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户收货地址簿';


-- ============================================================================
-- 3) merchant —— 商户主表
-- 对应 PRD §1.4 入驻商户、§3.2.1 登录与认证、§3.4.3 商户管理
-- ============================================================================
DROP TABLE IF EXISTS `merchant`;
CREATE TABLE `merchant` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `merchant_no`     VARCHAR(32)      NOT NULL                COMMENT '商户编号（人类可读：M+日期+序号）',
  `name`            VARCHAR(128)     NOT NULL                COMMENT '商户名称',
  `short_name`      VARCHAR(64)      NULL                    COMMENT '商户简称',
  `logo_url`        VARCHAR(512)     NULL                    COMMENT '商户 LOGO',
  `industry_code`   VARCHAR(32)      NOT NULL                COMMENT '行业分类编码（sys_dict dict_type=industry）',
  `legal_person`    VARCHAR(64)      NULL                    COMMENT '法定代表人姓名（明文，可联系人）',
  `legal_id_card_enc`   VARBINARY(255)  NULL                COMMENT '法人身份证 AES-256-GCM 密文',
  `legal_id_card_hash`  CHAR(64)        NULL                COMMENT '法人身份证 HMAC-SHA256',
  `mobile_enc`      VARBINARY(255)   NOT NULL                COMMENT '联系手机 AES-256-GCM',
  `mobile_hash`     CHAR(64)         NOT NULL                COMMENT '联系手机 HMAC-SHA256',
  `mobile_tail4`    VARCHAR(8)       NOT NULL                COMMENT '联系手机末 4 位',
  `email`           VARCHAR(128)     NULL                    COMMENT '联系邮箱',
  `province_code`   CHAR(6)          NOT NULL                COMMENT '注册省',
  `city_code`       CHAR(6)          NOT NULL                COMMENT '注册市',
  `district_code`   CHAR(6)          NOT NULL                COMMENT '注册区/县',
  `audit_status`    TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '入驻审核：0 待审核 / 1 通过 / 2 驳回 / 3 待补件',
  `audit_remark`    VARCHAR(255)     NULL                    COMMENT '审核备注（驳回原因等）',
  `audit_at`        DATETIME(3)      NULL                    COMMENT '审核时间',
  `audit_admin_id`  BIGINT UNSIGNED  NULL                    COMMENT '审核管理员 ID（→ admin.id）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '账号状态：0 封禁 / 1 正常 / 2 暂停营业',
  `enc_key_ver`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删标记',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_merchant_no` (`merchant_no`)             COMMENT '商户编号唯一',
  UNIQUE KEY `uk_mobile_hash` (`mobile_hash`)             COMMENT '联系手机唯一（防止重复入驻）',
  KEY `idx_audit_status`      (`audit_status`,`created_at`) COMMENT '运营审核工作台',
  KEY `idx_status_city`       (`status`,`city_code`)        COMMENT '城市筛选商户列表',
  KEY `idx_industry`          (`industry_code`)             COMMENT '行业分类聚合'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商户主表';


-- ============================================================================
-- 4) merchant_qualification —— 商户资质附件
-- 对应 PRD §3.2.1.2 资质认证（营业执照、食品经营许可证等）
-- ============================================================================
DROP TABLE IF EXISTS `merchant_qualification`;
CREATE TABLE `merchant_qualification` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `merchant_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '商户 ID（→ merchant.id）',
  `qual_type`       TINYINT UNSIGNED NOT NULL                COMMENT '资质类型：1 营业执照 / 2 食品经营许可证 / 3 法人身份证 / 4 其他',
  `cert_no`         VARCHAR(64)      NULL                    COMMENT '证件编号（如营业执照统一社会信用代码）',
  `cert_name`       VARCHAR(128)     NULL                    COMMENT '证件名称（实体名称，与营业执照一致）',
  `valid_from`      DATE             NULL                    COMMENT '生效起始日',
  `valid_to`        DATE             NULL                    COMMENT '到期日（NULL=长期有效）',
  `attach_url`      VARCHAR(1024)    NOT NULL                COMMENT '附件图片/PDF 的 MinIO URL（多张用逗号分隔，建议改 JSON）',
  `audit_status`    TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '审核状态：0 待审 / 1 通过 / 2 驳回',
  `audit_remark`    VARCHAR(255)     NULL                    COMMENT '审核备注',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_merchant_type` (`merchant_id`,`qual_type`)     COMMENT '查商户某类资质'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商户资质附件';


-- ============================================================================
-- 5) merchant_staff —— 商户子账号
-- 对应 PRD §3.2.1.3 子账号创建、权限分配
-- ============================================================================
DROP TABLE IF EXISTS `merchant_staff`;
CREATE TABLE `merchant_staff` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `merchant_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '所属商户 ID',
  `username`        VARCHAR(64)      NOT NULL                COMMENT '登录账号（商户内唯一）',
  `password_hash`   CHAR(60)         NOT NULL                COMMENT 'bcrypt 密码哈希（cost=10）',
  `name`            VARCHAR(64)      NULL                    COMMENT '员工姓名',
  `mobile_enc`      VARBINARY(255)   NULL                    COMMENT '手机号 AES-256-GCM',
  `mobile_hash`     CHAR(64)         NULL                    COMMENT '手机号 HMAC-SHA256',
  `mobile_tail4`    VARCHAR(8)       NULL                    COMMENT '手机号末 4 位',
  `role_code`       VARCHAR(64)      NOT NULL DEFAULT 'staff' COMMENT '角色编码（store_owner/store_clerk/store_finance）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 禁用 / 1 启用',
  `last_login_at`   DATETIME(3)      NULL                    COMMENT '最近登录时间',
  `enc_key_ver`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_merchant_username` (`merchant_id`,`username`) COMMENT '商户内账号唯一',
  KEY `idx_mobile_hash`             (`mobile_hash`)              COMMENT '按手机号检索员工'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商户子账号';


-- ============================================================================
-- 6) rider —— 骑手主表
-- 对应 PRD §1.4 平台骑手、§3.3.1 登录与认证、§3.4.4 骑手管理
-- ============================================================================
DROP TABLE IF EXISTS `rider`;
CREATE TABLE `rider` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `rider_no`        VARCHAR(32)      NOT NULL                COMMENT '骑手编号（R+日期+序号）',
  `name_enc`        VARBINARY(255)   NOT NULL                COMMENT '姓名 AES-256-GCM 密文',
  `name_tail`       VARCHAR(8)       NULL                    COMMENT '姓（脱敏展示，例：张*）',
  `mobile_enc`      VARBINARY(255)   NOT NULL                COMMENT '手机号 AES-256-GCM',
  `mobile_hash`     CHAR(64)         NOT NULL                COMMENT '手机号 HMAC-SHA256',
  `mobile_tail4`    VARCHAR(8)       NOT NULL                COMMENT '手机号末 4 位',
  `id_card_enc`     VARBINARY(255)   NOT NULL                COMMENT '身份证 AES-256-GCM',
  `id_card_hash`    CHAR(64)         NOT NULL                COMMENT '身份证 HMAC-SHA256',
  `gender`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '性别：0 未知 / 1 男 / 2 女',
  `birthday`        DATE             NULL                    COMMENT '生日',
  `bank_card_enc`   VARBINARY(255)   NULL                    COMMENT '提现银行卡 AES-256-GCM',
  `bank_card_tail4` VARCHAR(8)       NULL                    COMMENT '银行卡末 4 位',
  `bank_name`       VARCHAR(64)      NULL                    COMMENT '开户行名称（明文）',
  `avatar_url`      VARCHAR(512)     NULL                    COMMENT '头像 URL',
  `vehicle_type`    TINYINT UNSIGNED NULL                    COMMENT '配送工具：1 电动车 / 2 摩托车 / 3 自行车 / 4 步行',
  `vehicle_no`      VARCHAR(32)      NULL                    COMMENT '电动车车牌号',
  `service_city`    CHAR(6)          NOT NULL                COMMENT '服务城市编码',
  `level`           TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '骑手等级：1~5（sys_dict dict_type=rider_level）',
  `score`           DECIMAL(4,2)     NOT NULL DEFAULT 5.00   COMMENT '综合评分（0~5.00）',
  `audit_status`    TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '入驻审核：0 待审 / 1 通过 / 2 驳回 / 3 待补件',
  `audit_remark`    VARCHAR(255)     NULL                    COMMENT '审核备注',
  `audit_at`        DATETIME(3)      NULL                    COMMENT '审核时间',
  `audit_admin_id`  BIGINT UNSIGNED  NULL                    COMMENT '审核管理员 ID',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '账号状态：0 封禁 / 1 正常 / 2 离职',
  `online_status`   TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '在线状态：0 离线 / 1 在线 / 2 忙碌（实时刷新）',
  `enc_key_ver`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本',
  `last_online_at`  DATETIME(3)      NULL                    COMMENT '最近在线时间',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rider_no`     (`rider_no`)               COMMENT '骑手编号唯一',
  UNIQUE KEY `uk_mobile_hash`  (`mobile_hash`)            COMMENT '手机号唯一',
  UNIQUE KEY `uk_id_card_hash` (`id_card_hash`)           COMMENT '身份证号唯一（防止刷单）',
  KEY `idx_audit_status`       (`audit_status`,`created_at`) COMMENT '运营审核工作台',
  KEY `idx_city_status_online` (`service_city`,`status`,`online_status`) COMMENT '调度按城市筛在线骑手',
  KEY `idx_level`              (`level`)                  COMMENT '等级聚合'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='骑手主表';


-- ============================================================================
-- 7) rider_qualification —— 骑手资质附件
-- 对应 PRD §3.3.1.2 实名认证、健康证、从业资格
-- ============================================================================
DROP TABLE IF EXISTS `rider_qualification`;
CREATE TABLE `rider_qualification` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `rider_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '骑手 ID（→ rider.id）',
  `qual_type`       TINYINT UNSIGNED NOT NULL                COMMENT '资质类型：1 身份证 / 2 健康证 / 3 从业资格证 / 4 电动车行驶证 / 5 其他',
  `cert_no`         VARCHAR(64)      NULL                    COMMENT '证件编号',
  `valid_from`      DATE             NULL                    COMMENT '生效起始日',
  `valid_to`        DATE             NULL                    COMMENT '到期日',
  `attach_url`      VARCHAR(1024)    NOT NULL                COMMENT '附件 URL',
  `audit_status`    TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '审核状态',
  `audit_remark`    VARCHAR(255)     NULL                    COMMENT '审核备注',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_rider_type` (`rider_id`,`qual_type`)            COMMENT '查骑手某类资质'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='骑手资质附件';


-- ============================================================================
-- 8) rider_deposit —— 骑手保证金记录
-- 对应 PRD §3.3.1.3 保证金管理
-- ============================================================================
DROP TABLE IF EXISTS `rider_deposit`;
CREATE TABLE `rider_deposit` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `rider_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '骑手 ID',
  `op_type`         TINYINT UNSIGNED NOT NULL                COMMENT '操作类型：1 缴纳 / 2 补缴 / 3 扣除 / 4 退还',
  `amount`          DECIMAL(12,2)    NOT NULL                COMMENT '金额（正数表示发生额）',
  `balance_after`   DECIMAL(12,2)    NOT NULL                COMMENT '操作后保证金余额',
  `pay_no`          VARCHAR(64)      NULL                    COMMENT '关联支付/退款单号（payment_record/refund_record）',
  `reason`          VARCHAR(255)     NULL                    COMMENT '说明（违规扣除原因等）',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '操作管理员 ID（手动调整时填）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_rider_created` (`rider_id`,`created_at`)         COMMENT '骑手保证金时间线',
  KEY `idx_op_type`       (`op_type`,`created_at`)          COMMENT '按类型聚合统计'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='骑手保证金记录';


-- ============================================================================
-- 9) admin —— 平台管理员
-- 对应 PRD §1.4 平台管理员、§3.4.9.1 权限管理
-- ============================================================================
DROP TABLE IF EXISTS `admin`;
CREATE TABLE `admin` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `username`        VARCHAR(64)      NOT NULL                COMMENT '登录账号（全局唯一）',
  `password_hash`   CHAR(60)         NOT NULL                COMMENT 'bcrypt 哈希（cost=10）',
  `nickname`        VARCHAR(64)      NULL                    COMMENT '昵称/真实姓名',
  `avatar_url`      VARCHAR(512)     NULL                    COMMENT '头像',
  `mobile_enc`      VARBINARY(255)   NULL                    COMMENT '手机号 AES-256-GCM',
  `mobile_hash`     CHAR(64)         NULL                    COMMENT '手机号 HMAC-SHA256',
  `mobile_tail4`    VARCHAR(8)       NULL                    COMMENT '手机号末 4 位',
  `email`           VARCHAR(128)     NULL                    COMMENT '邮箱（明文）',
  `is_super`        TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否超管：0 否 / 1 是（超管不受 RBAC 限制）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 禁用 / 1 正常',
  `last_login_at`   DATETIME(3)      NULL                    COMMENT '最近登录时间',
  `last_login_ip`   VARBINARY(16)    NULL                    COMMENT '最近登录 IP',
  `enc_key_ver`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)                    COMMENT '管理员账号全局唯一',
  KEY `idx_status`         (`status`)                       COMMENT '状态筛选'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='平台管理员';


-- ============================================================================
-- 10) role —— 角色定义
-- 对应 PRD §3.4.9.1 角色创建
-- ============================================================================
DROP TABLE IF EXISTS `role`;
CREATE TABLE `role` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `role_code`       VARCHAR(64)      NOT NULL                COMMENT '角色编码（英文，例：super_admin/operation/finance/cs/risk）',
  `role_name`       VARCHAR(64)      NOT NULL                COMMENT '角色名称（中文展示）',
  `description`     VARCHAR(255)     NULL                    COMMENT '角色描述',
  `data_scope`      TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '数据范围：1 全部 / 2 本部门 / 3 本人 / 4 自定义',
  `sort`            INT              NOT NULL DEFAULT 0      COMMENT '排序权重（小→前）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 禁用 / 1 启用',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_code` (`role_code`)                   COMMENT '角色编码唯一'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色定义';


-- ============================================================================
-- 11) permission —— 权限点（菜单/按钮/接口三层）
-- 对应 PRD §3.4.9.1 权限分配
-- ============================================================================
DROP TABLE IF EXISTS `permission`;
CREATE TABLE `permission` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `parent_id`       BIGINT UNSIGNED  NOT NULL DEFAULT 0      COMMENT '父节点 ID（树形；0=根）',
  `resource_type`   TINYINT UNSIGNED NOT NULL                COMMENT '资源类型：1 菜单 / 2 按钮 / 3 接口',
  `resource_code`   VARCHAR(64)      NOT NULL                COMMENT '资源编码（菜单 path / 按钮 perm 串 / 接口 method:path）',
  `resource_name`   VARCHAR(64)      NOT NULL                COMMENT '资源名称（中文展示）',
  `action`          VARCHAR(32)      NULL                    COMMENT '动作（list/detail/create/update/delete/export 等；菜单可为空）',
  `icon`            VARCHAR(64)      NULL                    COMMENT '图标（菜单专用）',
  `sort`            INT              NOT NULL DEFAULT 0      COMMENT '排序',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 禁用 / 1 启用',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_resource_code` (`resource_code`,`resource_type`) COMMENT '同类型下编码唯一',
  KEY `idx_parent_type`         (`parent_id`,`resource_type`)     COMMENT '按父节点+类型加载子树'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='权限点（菜单/按钮/接口三层）';


-- ============================================================================
-- 12) admin_role —— 管理员↔角色 关联
-- ============================================================================
DROP TABLE IF EXISTS `admin_role`;
CREATE TABLE `admin_role` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `admin_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '管理员 ID',
  `role_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '角色 ID',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_role` (`admin_id`,`role_id`)          COMMENT '同一管理员同一角色仅一条',
  KEY `idx_role_id`          (`role_id`)                     COMMENT '反查角色下的管理员'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='管理员↔角色关联';


-- ============================================================================
-- 13) role_permission —— 角色↔权限 关联
-- ============================================================================
DROP TABLE IF EXISTS `role_permission`;
CREATE TABLE `role_permission` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `role_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '角色 ID',
  `permission_id`   BIGINT UNSIGNED  NOT NULL                COMMENT '权限 ID',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`role_id`,`permission_id`) COMMENT '同一角色同一权限仅一条',
  KEY `idx_permission_id`         (`permission_id`)           COMMENT '反查权限被哪些角色使用'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色↔权限关联';


-- ============================================================================
-- 14) blacklist —— 全局黑名单（用户/商户/骑手通用）
-- 对应 PRD §3.4.2.3 用户风控 / §3.4.3.4 商户风控 / §3.4.4.5 骑手风控
-- ============================================================================
DROP TABLE IF EXISTS `blacklist`;
CREATE TABLE `blacklist` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `target_type`     TINYINT UNSIGNED NOT NULL                COMMENT '主体类型：1 用户 / 2 商户 / 3 骑手 / 4 设备 / 5 IP',
  `target_id`       BIGINT UNSIGNED  NULL                    COMMENT '主体 ID（用户/商户/骑手时填）',
  `target_value`    VARCHAR(128)     NULL                    COMMENT '主体值（设备号/IP/手机号 hash 等）',
  `reason`          VARCHAR(255)     NOT NULL                COMMENT '加入黑名单原因',
  `evidence_url`    VARCHAR(1024)    NULL                    COMMENT '证据附件 URL',
  `level`           TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '严重等级：1 警告 / 2 限制 / 3 永久封禁',
  `expire_at`       DATETIME(3)      NULL                    COMMENT '过期时间（NULL=永久）',
  `op_admin_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '操作管理员 ID',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 已解除 / 1 生效中',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_target_status` (`target_type`,`target_id`,`status`)    COMMENT '主体生效查询',
  KEY `idx_target_value`  (`target_type`,`target_value`,`status`) COMMENT '设备/IP 黑名单查询',
  KEY `idx_expire_status` (`status`,`expire_at`)                  COMMENT '到期清理 Job'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='全局黑名单';

-- ============================================================================
-- END 01_account.sql —— 共 14 张表（user / user_address / merchant /
-- merchant_qualification / merchant_staff / rider / rider_qualification /
-- rider_deposit / admin / role / permission / admin_role / role_permission /
-- blacklist）
-- ============================================================================
