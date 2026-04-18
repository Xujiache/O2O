-- ============================================================================
-- 文件名 : 03_shop_product.sql
-- 阶段   : P2 数据库设计 / T2.4 D3 店铺与商品
-- 用途   : 创建 D3 领域 7 张表（店铺/营业时段/分类/商品/SKU/套餐/收藏）
-- 依据   : DESIGN_P2_数据库设计.md §三 D3（"8 张" 与列出 7 张数量歧义；以
--          DESIGN §三 列出的 7 张为准，README.md 中专章说明）
--          §四（product 与 sku 一对多；stock_qty 放 SKU 表）
--          §五（shop(city_code,status)；product(shop_id,status,sort) 索引重点）
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) shop —— 店铺
-- 对应 PRD §3.2.2 店铺管理 / §3.1.2.2 商家详情
-- ============================================================================
DROP TABLE IF EXISTS `shop`;
CREATE TABLE `shop` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `merchant_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '所属商户 ID（→ merchant.id）',
  `name`                VARCHAR(128)     NOT NULL                COMMENT '店铺名称',
  `short_name`          VARCHAR(64)      NULL                    COMMENT '店铺简称',
  `logo_url`            VARCHAR(512)     NULL                    COMMENT '店铺 LOGO',
  `cover_url`           VARCHAR(512)     NULL                    COMMENT '店铺封面图',
  `industry_code`       VARCHAR(32)      NOT NULL                COMMENT '行业分类编码（→ sys_dict industry）',
  `province_code`       CHAR(6)          NOT NULL                COMMENT '省级行政区划',
  `city_code`           CHAR(6)          NOT NULL                COMMENT '市级行政区划',
  `district_code`       CHAR(6)          NOT NULL                COMMENT '区/县行政区划',
  `address`             VARCHAR(255)     NOT NULL                COMMENT '门店详细地址',
  `lng`                 DECIMAL(10,7)    NOT NULL                COMMENT '门店经度（GCJ-02）',
  `lat`                 DECIMAL(10,7)    NOT NULL                COMMENT '门店纬度',
  `contact_mobile_enc`  VARBINARY(255)   NOT NULL                COMMENT '门店电话 AES-256-GCM',
  `contact_mobile_hash` CHAR(64)         NOT NULL                COMMENT '门店电话 HMAC-SHA256',
  `contact_mobile_tail4` VARCHAR(8)      NOT NULL                COMMENT '门店电话末 4 位',
  `business_hours_summary` VARCHAR(128)  NULL                    COMMENT '营业时间摘要（例：每天 09:00-22:00；详情见 shop_business_hour）',
  `min_order_amount`    DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '起送价',
  `base_delivery_fee`   DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '基础配送费',
  `packaging_fee`       DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '默认打包费（商品级可覆盖）',
  `delivery_distance_max` INT UNSIGNED   NOT NULL DEFAULT 5000   COMMENT '最大配送距离（米）',
  `avg_prepare_min`     SMALLINT UNSIGNED NOT NULL DEFAULT 15    COMMENT '平均出餐时长（分钟，PRD §3.1.2.1 展示）',
  `score`               DECIMAL(4,2)     NOT NULL DEFAULT 5.00   COMMENT '综合评分（0~5.00）',
  `score_count`         INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '评分人数',
  `monthly_sales`       INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '月销量冗余（凌晨 Job 重算）',
  `auto_accept`         TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '自动接单：0 关 / 1 开',
  `announcement`        VARCHAR(500)     NULL                    COMMENT '店铺公告',
  `business_status`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '营业状态：0 打烊 / 1 营业中 / 2 临时歇业（运营自动+商户手动联合）',
  `audit_status`        TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '信息审核：0 待审 / 1 通过 / 2 驳回（变更敏感字段触发）',
  `audit_remark`        VARCHAR(255)     NULL                    COMMENT '审核备注',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '账号状态：0 封禁 / 1 正常',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_city_status`        (`city_code`,`status`)                COMMENT '【DESIGN §五重点】城市+状态筛选',
  KEY `idx_merchant`           (`merchant_id`)                       COMMENT '商户查名下店铺',
  KEY `idx_district_business`  (`district_code`,`business_status`,`score`) COMMENT '区域+营业中+评分排序',
  KEY `idx_industry_status`    (`industry_code`,`business_status`)   COMMENT '行业筛选',
  KEY `idx_audit_status`       (`audit_status`,`created_at`)         COMMENT '运营审核工作台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='店铺主表';


-- ============================================================================
-- 2) shop_business_hour —— 店铺营业时段
-- 对应 PRD §3.2.2.1 营业时间编辑 / §3.2.2.2 自动按营业时间启停
-- 一家店一周可有多条记录（例：周一二关，周三-日 09:00-22:00 → 5 条；
-- 跨天 02:00 收摊：拆为 当日 09:00-23:59 + 次日 00:00-02:00 两条）
-- ============================================================================
DROP TABLE IF EXISTS `shop_business_hour`;
CREATE TABLE `shop_business_hour` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `shop_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '所属店铺 ID',
  `day_of_week`     TINYINT UNSIGNED NOT NULL                COMMENT '周几：1=周一 ... 7=周日；0=每天通用',
  `open_time`       TIME             NOT NULL                COMMENT '开门时间',
  `close_time`      TIME             NOT NULL                COMMENT '关门时间（同日；跨日请拆为两条）',
  `is_active`       TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '是否生效：0 临时禁用 / 1 启用',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_shop_day` (`shop_id`,`day_of_week`,`is_active`) COMMENT '查店铺当日营业时段'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='店铺营业时段';


-- ============================================================================
-- 3) product_category —— 商品分类（店铺自有）
-- 对应 PRD §3.2.4.1 分类管理
-- ============================================================================
DROP TABLE IF EXISTS `product_category`;
CREATE TABLE `product_category` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `shop_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '所属店铺 ID',
  `parent_id`       BIGINT UNSIGNED  NOT NULL DEFAULT 0      COMMENT '父分类 ID（0=根；只支持二级）',
  `name`            VARCHAR(64)      NOT NULL                COMMENT '分类名称',
  `icon_url`        VARCHAR(512)     NULL                    COMMENT '分类图标',
  `sort`            INT              NOT NULL DEFAULT 0      COMMENT '排序权重（小→前）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 下架 / 1 上架',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_shop_parent_sort` (`shop_id`,`parent_id`,`sort`) COMMENT '店铺分类树展示',
  KEY `idx_shop_status`      (`shop_id`,`status`)            COMMENT '店铺启用分类筛选'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商品分类（店铺自有）';


-- ============================================================================
-- 4) product —— 商品主表
-- 对应 PRD §3.2.4 商品管理 / §3.1.2.3 商品管理
-- 与 product_sku 一对多；库存（stock_qty）放 SKU 表
-- ============================================================================
DROP TABLE IF EXISTS `product`;
CREATE TABLE `product` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `shop_id`             BIGINT UNSIGNED  NOT NULL                COMMENT '所属店铺 ID',
  `category_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '所属分类 ID（→ product_category.id）',
  `name`                VARCHAR(128)     NOT NULL                COMMENT '商品名称',
  `brief`               VARCHAR(255)     NULL                    COMMENT '简介（一句话卖点）',
  `description`         TEXT             NULL                    COMMENT '详细描述（商家富文本/纯文本）',
  `main_image_url`      VARCHAR(512)     NULL                    COMMENT '主图 URL',
  `image_urls`          JSON             NULL                    COMMENT '商品图片数组（最多 8 张，JSON）',
  `price`               DECIMAL(10,2)    NOT NULL                COMMENT '默认价格（无 SKU 时使用；有 SKU 时为最低价冗余）',
  `original_price`      DECIMAL(10,2)    NULL                    COMMENT '划线原价',
  `packaging_fee`       DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '商品级打包费（覆盖店铺默认）',
  `min_order_qty`       SMALLINT UNSIGNED NOT NULL DEFAULT 1     COMMENT '起购数量',
  `limit_per_order`     SMALLINT UNSIGNED NOT NULL DEFAULT 0     COMMENT '单笔限购（0=不限）',
  `has_sku`             TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否多规格：0 单规格 / 1 多规格',
  `product_type`        TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '商品类型：1 普通 / 2 套餐 / 3 特价',
  `tags`                JSON             NULL                    COMMENT '标签数组（例：["招牌","辣"]）',
  `monthly_sales`       INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '月销量冗余',
  `total_sales`         INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '累计销量',
  `score`               DECIMAL(4,2)     NOT NULL DEFAULT 5.00   COMMENT '商品评分',
  `score_count`         INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '评分人数',
  `is_recommend`        TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否推荐：0 否 / 1 是',
  `is_new`              TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否新品',
  `audit_status`        TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '审核：0 待审 / 1 通过 / 2 驳回（敏感品类触发）',
  `audit_remark`        VARCHAR(255)     NULL                    COMMENT '审核备注',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '上架状态：0 下架 / 1 上架 / 2 售罄',
  `sort`                INT              NOT NULL DEFAULT 0      COMMENT '排序权重',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_shop_status_sort`   (`shop_id`,`status`,`sort`)              COMMENT '【DESIGN §五重点】店铺商品列表（上架排序）',
  KEY `idx_shop_category_sort` (`shop_id`,`category_id`,`sort`)         COMMENT '店铺分类下商品列表',
  KEY `idx_shop_recommend`     (`shop_id`,`is_recommend`,`status`)      COMMENT '店铺推荐位',
  KEY `idx_audit_status`       (`audit_status`,`created_at`)            COMMENT '审核工作台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商品主表';


-- ============================================================================
-- 5) product_sku —— 商品 SKU（多规格 + 库存归位）
-- 单规格商品也建一条 default SKU，避免应用层判空分支
-- ============================================================================
DROP TABLE IF EXISTS `product_sku`;
CREATE TABLE `product_sku` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `product_id`      BIGINT UNSIGNED  NOT NULL                COMMENT '商品 ID（→ product.id）',
  `sku_code`        VARCHAR(64)      NULL                    COMMENT '商家自定义 SKU 编码（店铺内唯一）',
  `spec_name`       VARCHAR(128)     NULL                    COMMENT '规格名称（拼接：大份+加辣）',
  `spec_json`       JSON             NULL                    COMMENT '规格组合 JSON（例：[{"key":"size","value":"大"}]）',
  `price`           DECIMAL(10,2)    NOT NULL                COMMENT 'SKU 售价',
  `original_price`  DECIMAL(10,2)    NULL                    COMMENT 'SKU 划线价',
  `packaging_fee`   DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT 'SKU 级打包费（覆盖商品级）',
  `stock_qty`       INT              NOT NULL DEFAULT 0      COMMENT '库存数量（应用层用 Redis stock:sku:{skuId} 缓存+扣减；MySQL 为兜底，允许临时短暂为负）',
  `sales`           INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT 'SKU 销量',
  `weight_g`        INT UNSIGNED     NULL                    COMMENT '商品重量（克）',
  `volume_ml`       INT UNSIGNED     NULL                    COMMENT '商品体积（毫升）',
  `is_default`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否默认 SKU：0 否 / 1 是',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 下架 / 1 上架 / 2 售罄',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_sku_code` (`product_id`,`sku_code`) COMMENT '同商品 SKU 编码唯一',
  KEY `idx_product_status`         (`product_id`,`status`)   COMMENT '查商品上架 SKU 列表'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='商品 SKU（库存归位）';


-- ============================================================================
-- 6) product_combo_item —— 套餐子项（product.product_type=2 时使用）
-- 对应 PRD §3.2.4.4 套餐管理
-- ============================================================================
DROP TABLE IF EXISTS `product_combo_item`;
CREATE TABLE `product_combo_item` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `combo_product_id`    BIGINT UNSIGNED  NOT NULL                COMMENT '套餐主商品 ID（product.product_type=2）',
  `item_product_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '子商品 ID',
  `item_sku_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '子 SKU ID（即使单规格也填 default SKU）',
  `qty`                 SMALLINT UNSIGNED NOT NULL DEFAULT 1     COMMENT '该子项数量',
  `sort`                INT              NOT NULL DEFAULT 0      COMMENT '排序',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_combo_sort` (`combo_product_id`,`sort`)            COMMENT '查套餐展开'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐子项';


-- ============================================================================
-- 7) product_favorite —— 用户商品收藏
-- 对应 PRD §3.1.5.4 收藏管理（"商家收藏" 暂归同表，target_type=2 时为店铺）
-- ============================================================================
DROP TABLE IF EXISTS `product_favorite`;
CREATE TABLE `product_favorite` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `user_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '用户 ID',
  `target_type`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '收藏类型：1 商品 / 2 店铺',
  `target_id`       BIGINT UNSIGNED  NOT NULL                COMMENT '目标 ID（商品 ID 或店铺 ID）',
  `shop_id`         BIGINT UNSIGNED  NULL                    COMMENT '冗余店铺 ID（便于按店铺聚合）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_target` (`user_id`,`target_type`,`target_id`) COMMENT '同一用户同一目标仅一条',
  KEY `idx_target_type`       (`target_type`,`target_id`)           COMMENT '反查商品/店铺被收藏次数'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户收藏（商品/店铺）';

-- ============================================================================
-- END 03_shop_product.sql —— 共 7 张表
-- 注：DESIGN §三 D3 列出 7 张 → 与 D3 标题"约 8 张"小幅出入；以 DESIGN 列出
-- 表名为准（README.md 中专章说明）
-- ============================================================================
