-- ============================================================================
-- 文件名 : 10_system.sql
-- 阶段   : P2 数据库设计 / T2.11 D10 系统运营
-- 用途   : 创建 D10 领域 8 张表
--          sys_dict / sys_config / operation_log / api_log /
--          banner / hot_search / file_meta / home_recommend
-- 依据   : DESIGN_P2_数据库设计.md §三 D10
--          注 1：DESIGN §三 D10 标题写"8 张" 但实际列出 7 张；本文件
--                按 PRD §3.4.6.2 / §3.1.1.4 业务需要，补 home_recommend
--                （首页推荐位）以满足"运营位/快捷入口/推荐"覆盖。
--          注 2：role 已在 01_account.sql，本文件不重复。
--          注 3：operation_log / api_log 在 DESIGN §六 标记为按月/按周分表，
--                本期先落"标准单表"，分表模板与维护 Job 在 jobs/monthly-table-job.md
--                中文档化（提示词 T2.16 说明可选延后）。
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) sys_dict —— 字典
-- 对应 PRD §3.4.9.2 字典管理
-- 一条记录代表"某 dict_type 下的某一项"；运营可在后台增删改
-- ============================================================================
DROP TABLE IF EXISTS `sys_dict`;
CREATE TABLE `sys_dict` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `dict_type`       VARCHAR(64)      NOT NULL                COMMENT '字典类型（分组键，如 order_takeout_status）',
  `dict_code`       VARCHAR(64)      NOT NULL                COMMENT '字典编码（在 type 下唯一，如 "20"）',
  `dict_label`      VARCHAR(128)     NOT NULL                COMMENT '展示标签（如 "已接单待出餐"）',
  `dict_value`      VARCHAR(255)     NULL                    COMMENT '字典值（备用，多与 code 等同）',
  `parent_code`     VARCHAR(64)      NULL                    COMMENT '父字典编码（树形场景，如行业大类→子类）',
  `extra`           JSON             NULL                    COMMENT '扩展属性（颜色/图标/css 类名等）',
  `sort`            INT              NOT NULL DEFAULT 0      COMMENT '排序',
  `is_system`       TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否系统内置：0 否（运营可改） / 1 是（禁改）',
  `description`     VARCHAR(255)     NULL                    COMMENT '说明',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 停用 / 1 启用',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_code`     (`dict_type`,`dict_code`)        COMMENT '同 type 下 code 唯一',
  KEY `idx_type_status_sort`    (`dict_type`,`status`,`sort`)    COMMENT '字典加载（按启用+排序）',
  KEY `idx_parent_code`         (`parent_code`)                  COMMENT '树形展开'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='字典';


-- ============================================================================
-- 2) sys_config —— 系统配置
-- 对应 PRD §3.4.9.4 系统设置（平台基础信息、支付参数、地图参数、推送参数等）
-- 敏感参数（API Key/Secret）建议存 KMS 或环境变量，本表只放可公开运维项
-- ============================================================================
DROP TABLE IF EXISTS `sys_config`;
CREATE TABLE `sys_config` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `config_group`    VARCHAR(64)      NOT NULL                COMMENT '配置分组（platform/payment/map/push/security）',
  `config_key`      VARCHAR(128)     NOT NULL                COMMENT '配置键',
  `config_value`    TEXT             NULL                    COMMENT '配置值（JSON 字符串或纯字符串）',
  `value_type`      VARCHAR(16)      NOT NULL DEFAULT 'string' COMMENT '值类型：string/number/boolean/json',
  `description`     VARCHAR(500)     NULL                    COMMENT '配置说明',
  `is_sensitive`    TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否敏感：0 否 / 1 是（前端不展示明文）',
  `is_system`       TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否系统内置',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '最近修改管理员 ID',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_key`  (`config_group`,`config_key`)   COMMENT '同分组下键唯一'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统配置';


-- ============================================================================
-- 3) operation_log —— 操作日志（管理后台）
-- 对应 PRD §3.4.9.1 操作日志查询 / §3.4.9.3 系统操作日志
-- 本期：单表；DESIGN §六：按月分表（12 月保留），延后 jobs/monthly-table-job.md 落实
-- ============================================================================
DROP TABLE IF EXISTS `operation_log`;
CREATE TABLE `operation_log` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `op_admin_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '操作管理员 ID',
  `op_admin_name`   VARCHAR(64)      NULL                    COMMENT '管理员姓名快照',
  `module`          VARCHAR(64)      NOT NULL                COMMENT '业务模块（user/merchant/order/...）',
  `action`          VARCHAR(64)      NOT NULL                COMMENT '动作（create/update/delete/audit/export）',
  `resource_type`   VARCHAR(64)      NULL                    COMMENT '资源类型',
  `resource_id`     VARCHAR(64)      NULL                    COMMENT '资源 ID',
  `description`     VARCHAR(500)     NULL                    COMMENT '操作描述（人类可读）',
  `request_method`  VARCHAR(8)       NULL                    COMMENT 'HTTP 方法',
  `request_url`     VARCHAR(500)     NULL                    COMMENT '请求路径',
  `request_params`  JSON             NULL                    COMMENT '请求参数（脱敏后）',
  `response_code`   INT              NULL                    COMMENT 'HTTP 状态码',
  `client_ip`       VARBINARY(16)    NULL                    COMMENT '客户端 IP',
  `user_agent`      VARCHAR(500)     NULL                    COMMENT 'User-Agent',
  `cost_ms`         INT UNSIGNED     NULL                    COMMENT '耗时（毫秒）',
  `is_success`      TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '是否成功：0 失败 / 1 成功',
  `error_msg`       VARCHAR(1000)    NULL                    COMMENT '失败信息',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_admin_created`        (`op_admin_id`,`created_at`)             COMMENT '管理员操作历史',
  KEY `idx_module_action_created` (`module`,`action`,`created_at`)        COMMENT '按模块/动作筛',
  KEY `idx_resource`             (`resource_type`,`resource_id`)          COMMENT '资源审计追溯',
  KEY `idx_created_at`           (`created_at`)                           COMMENT '按时间归档/清理'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='操作日志';


-- ============================================================================
-- 4) api_log —— 接口请求日志
-- 对应 PRD §3.4.9.3 接口请求日志
-- 本期：单表；DESIGN §六：按周分表（3 月保留），延后 jobs/monthly-table-job.md 落实
-- ============================================================================
DROP TABLE IF EXISTS `api_log`;
CREATE TABLE `api_log` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `trace_id`        VARCHAR(64)      NULL                    COMMENT '链路追踪 ID',
  `caller_type`     TINYINT UNSIGNED NOT NULL                COMMENT '调用方：1 用户 / 2 商户 / 3 骑手 / 4 管理员 / 5 系统',
  `caller_id`       BIGINT UNSIGNED  NULL                    COMMENT '调用方 ID',
  `terminal`        VARCHAR(32)      NULL                    COMMENT '终端：mp/h5/app/web/server',
  `method`          VARCHAR(8)       NOT NULL                COMMENT 'HTTP 方法',
  `path`            VARCHAR(500)     NOT NULL                COMMENT '请求路径',
  `query`           VARCHAR(2000)    NULL                    COMMENT '查询参数',
  `body_summary`    JSON             NULL                    COMMENT '请求体摘要（脱敏；仅关键字段）',
  `status_code`     INT              NOT NULL                COMMENT 'HTTP 状态码',
  `cost_ms`         INT UNSIGNED     NOT NULL                COMMENT '耗时（毫秒）',
  `response_size`   INT UNSIGNED     NULL                    COMMENT '响应大小（字节）',
  `error_code`      VARCHAR(64)      NULL                    COMMENT '业务错误码',
  `error_msg`       VARCHAR(1000)    NULL                    COMMENT '错误信息',
  `client_ip`       VARBINARY(16)    NULL                    COMMENT '客户端 IP',
  `user_agent`      VARCHAR(500)     NULL                    COMMENT 'User-Agent',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_path_status_created`     (`path`(191),`status_code`,`created_at`) COMMENT '按路径+状态分析（前缀索引）',
  KEY `idx_caller_created`          (`caller_type`,`caller_id`,`created_at`) COMMENT '调用方调用链',
  KEY `idx_status_cost`             (`status_code`,`cost_ms`)                COMMENT '慢接口/异常聚合',
  KEY `idx_trace_id`                (`trace_id`)                             COMMENT '链路追踪',
  KEY `idx_created_at`              (`created_at`)                           COMMENT '归档/清理'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='接口请求日志';


-- ============================================================================
-- 5) banner —— 首页轮播图
-- 对应 PRD §3.1.1.3 顶部 banner 轮播 / §3.4.6.2 banner 配置
-- ============================================================================
DROP TABLE IF EXISTS `banner`;
CREATE TABLE `banner` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `position`        VARCHAR(64)      NOT NULL                COMMENT '位置编码（user_home_top/merchant_login_top/...）',
  `title`           VARCHAR(128)     NOT NULL                COMMENT '标题',
  `image_url`       VARCHAR(512)     NOT NULL                COMMENT '图片 URL',
  `link_type`       TINYINT UNSIGNED NOT NULL                COMMENT '跳转类型：0 不跳 / 1 H5 / 2 小程序页 / 3 商品 / 4 店铺 / 5 活动',
  `link_value`      VARCHAR(512)     NULL                    COMMENT '跳转值（URL/path/ID）',
  `target_city`     JSON             NULL                    COMMENT '目标城市编码数组（NULL=全部）',
  `start_at`        DATETIME(3)      NOT NULL                COMMENT '展示起始',
  `end_at`          DATETIME(3)      NOT NULL                COMMENT '下线时间',
  `sort`            INT              NOT NULL DEFAULT 0      COMMENT '排序',
  `view_count`      INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '曝光次数',
  `click_count`     INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '点击次数',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 下架 / 1 上架',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_position_status_sort`   (`position`,`status`,`sort`)             COMMENT '按位置加载',
  KEY `idx_status_period`          (`status`,`start_at`,`end_at`)           COMMENT '生效中筛选'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='首页轮播图';


-- ============================================================================
-- 6) hot_search —— 热门搜索词
-- 对应 PRD §3.1.1.2 热门搜索推荐 / §3.4.6.2 热门搜索配置
-- ============================================================================
DROP TABLE IF EXISTS `hot_search`;
CREATE TABLE `hot_search` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `keyword`         VARCHAR(64)      NOT NULL                COMMENT '搜索关键词',
  `search_type`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '场景：1 外卖 / 2 跑腿 / 3 通用',
  `target_city`     CHAR(6)          NULL                    COMMENT '目标城市编码（NULL=全国）',
  `score`           INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '热度权重（运营手动+自动累加）',
  `is_pinned`       TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否置顶：0 否 / 1 是',
  `start_at`        DATETIME(3)      NULL                    COMMENT '生效起始',
  `end_at`          DATETIME(3)      NULL                    COMMENT '失效时间',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 下架 / 1 上架',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_type_city_status_score` (`search_type`,`target_city`,`status`,`score`) COMMENT '场景+城市热搜列表'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='热门搜索词';


-- ============================================================================
-- 7) file_meta —— 文件元数据
-- 对应 PRD §3.5.1.4 文件存储服务（图片/视频/凭证/导出文件统一登记）
-- 实际文件存 MinIO/OSS；本表存 URL+元信息+引用
-- ============================================================================
DROP TABLE IF EXISTS `file_meta`;
CREATE TABLE `file_meta` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `file_no`         VARCHAR(64)      NOT NULL                COMMENT '文件编号（业务侧引用）',
  `bucket`          VARCHAR(64)      NOT NULL                COMMENT 'MinIO/OSS bucket 名',
  `object_key`      VARCHAR(512)     NOT NULL                COMMENT '对象 key（路径）',
  `file_name`       VARCHAR(255)     NOT NULL                COMMENT '原始文件名',
  `file_size`       BIGINT UNSIGNED  NOT NULL                COMMENT '文件大小（字节）',
  `mime_type`       VARCHAR(64)      NOT NULL                COMMENT 'MIME 类型',
  `file_type`       TINYINT UNSIGNED NOT NULL                COMMENT '业务分类：1 图片 / 2 视频 / 3 PDF / 4 Excel / 5 其他',
  `width`           INT UNSIGNED     NULL                    COMMENT '图片/视频宽度',
  `height`          INT UNSIGNED     NULL                    COMMENT '图片/视频高度',
  `duration_s`      INT UNSIGNED     NULL                    COMMENT '视频/音频时长（秒）',
  `md5`             CHAR(32)         NULL                    COMMENT 'MD5（去重用）',
  `cdn_url`         VARCHAR(512)     NULL                    COMMENT 'CDN 直链',
  `uploader_type`   TINYINT UNSIGNED NOT NULL                COMMENT '上传方：1 用户 / 2 商户 / 3 骑手 / 4 管理员 / 5 系统',
  `uploader_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '上传方 ID',
  `biz_module`      VARCHAR(64)      NULL                    COMMENT '业务模块（avatar/qual/proof/invoice 等）',
  `biz_no`          VARCHAR(64)      NULL                    COMMENT '业务单号',
  `is_public`       TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '是否公开访问：0 私有（需签名 URL） / 1 公开',
  `expire_at`       DATETIME(3)      NULL                    COMMENT '清理过期时间（NULL=永久）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删（同时触发 OSS 异步清理）',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_no`             (`file_no`)                            COMMENT '业务文件号唯一',
  UNIQUE KEY `uk_bucket_object`       (`bucket`,`object_key`)                COMMENT 'OSS 对象唯一',
  KEY `idx_md5`                       (`md5`)                                COMMENT '去重',
  KEY `idx_uploader_module`           (`uploader_type`,`uploader_id`,`biz_module`) COMMENT '上传方文件列表',
  KEY `idx_biz`                       (`biz_module`,`biz_no`)                COMMENT '业务单号反查文件',
  KEY `idx_expire_at`                 (`expire_at`)                          COMMENT '过期清理 Job'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文件元数据';


-- ============================================================================
-- 8) home_recommend —— 首页推荐位/快捷入口（补足 D10 第 8 张）
-- 对应 PRD §3.1.1.3 快捷入口 / §3.1.1.4 推荐模块 / §3.4.6.2 运营位/快捷入口配置
-- ============================================================================
DROP TABLE IF EXISTS `home_recommend`;
CREATE TABLE `home_recommend` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `position`        VARCHAR(64)      NOT NULL                COMMENT '位置编码（user_home_quick/user_home_recommend_shop/...）',
  `title`           VARCHAR(128)     NOT NULL                COMMENT '展示标题',
  `subtitle`        VARCHAR(128)     NULL                    COMMENT '副标题',
  `icon_url`        VARCHAR(512)     NULL                    COMMENT '图标 URL',
  `image_url`       VARCHAR(512)     NULL                    COMMENT '主图 URL',
  `recommend_type`  TINYINT UNSIGNED NOT NULL                COMMENT '推荐类型：1 快捷入口 / 2 商家 / 3 商品 / 4 活动 / 5 自定义',
  `target_id`       BIGINT UNSIGNED  NULL                    COMMENT '推荐对象 ID（recommend_type=2/3/4 时）',
  `link_type`       TINYINT UNSIGNED NOT NULL                COMMENT '跳转类型：0 无 / 1 H5 / 2 小程序页 / 3 业务详情',
  `link_value`      VARCHAR(512)     NULL                    COMMENT '跳转值',
  `target_city`     JSON             NULL                    COMMENT '目标城市数组（NULL=全部）',
  `target_user_segment` JSON         NULL                    COMMENT '目标用户分群标签',
  `start_at`        DATETIME(3)      NULL                    COMMENT '展示起始',
  `end_at`          DATETIME(3)      NULL                    COMMENT '下线时间',
  `sort`            INT              NOT NULL DEFAULT 0      COMMENT '排序',
  `view_count`      INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '曝光数',
  `click_count`     INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '点击数',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 下架 / 1 上架',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_position_status_sort` (`position`,`status`,`sort`)               COMMENT '位置加载',
  KEY `idx_status_period`        (`status`,`start_at`,`end_at`)             COMMENT '生效中筛选'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='首页推荐位/快捷入口';

-- ============================================================================
-- END 10_system.sql —— 共 8 张表
-- ============================================================================
