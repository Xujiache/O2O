-- ============================================================================
-- 文件名 : 04_order.sql
-- 阶段   : P2 数据库设计 / T2.5 D4 订单分表模板 + 月分表存储过程
-- 用途   : 创建订单领域：
--          - 三张模板表（_template，永远不写入）
--          - 三张全局表（凭证/售后/状态日志模板）
--          - 一个存储过程 sp_create_order_monthly_tables
--          - 末尾调用，预先生成 当月 + 下月 共 8 张物理分表
-- 依据   : DESIGN_P2_数据库设计.md §三 D4 / §四 order_takeout/order_errand 字段
--          §五 订单索引 / §六 分表策略
--          CONSENSUS_P2_数据库设计.md §2.3 分表 / §2.2 订单号策略
-- 状态机 :
--   外卖（10 档）：
--     0=待支付 5=已关闭(支付超时) 10=待接单 20=已接单待出餐 30=出餐完成待取
--     40=配送中 50=已送达待确认 55=已完成 60=已取消 70=售后中
--   跑腿（10 档）：
--     0=待支付 5=已关闭(支付超时) 10=待接单 20=骑手已接单 30=已取件
--     40=配送中 50=已送达待确认 55=已完成 60=已取消 70=售后中
-- 注意   :
--   1. 模板表只用于 CREATE TABLE LIKE 复制结构，禁止直接 INSERT；
--   2. 存储过程使用 prepared statement 拼接动态表名（MySQL 8 标准方案）；
--   3. 末尾的 CALL 按当前系统时间 2026-04 生成 202604 + 202605；
--   4. 每月 1 日 02:00 由 monthly-table-job.md 触发追加下月表。
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) order_takeout_template —— 外卖订单分表模板（永远不写入）
-- ============================================================================
DROP TABLE IF EXISTS `order_takeout_template`;
CREATE TABLE `order_takeout_template` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`            CHAR(18)         NOT NULL                COMMENT '业务订单号，格式 [T][yyyyMMdd][shard2][seq6][校验1]',
  `user_id`             BIGINT UNSIGNED  NOT NULL                COMMENT '下单用户 ID（→ user.id）',
  `shop_id`             BIGINT UNSIGNED  NOT NULL                COMMENT '店铺 ID（→ shop.id）',
  `merchant_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '商户 ID 冗余（→ merchant.id）',
  `rider_id`            BIGINT UNSIGNED  NULL                    COMMENT '骑手 ID（接单后写入）',
  `goods_amount`        DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '商品金额合计（不含运费/打包费）',
  `delivery_fee`        DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '配送费',
  `package_fee`         DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '打包费合计',
  `discount_amount`     DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '满减/折扣等优惠（不含券）',
  `coupon_amount`       DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '优惠券抵扣金额',
  `pay_amount`          DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '应支付金额（实际支付，包含运费打包费扣除优惠后）',
  `address_snapshot`    JSON             NOT NULL                COMMENT '收货地址快照（下单瞬间冻结，避免地址簿变更影响）',
  `shop_snapshot`       JSON             NULL                    COMMENT '店铺快照（名称/电话/地址，便于历史订单展示）',
  `remark`              VARCHAR(255)     NULL                    COMMENT '用户备注',
  `expected_arrive_at`  DATETIME(3)      NULL                    COMMENT '期望送达时间（NULL=立即配送）',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '订单状态：见文件头 10 档枚举',
  `pay_status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '支付状态：0 未支付 / 1 支付中 / 2 已支付 / 3 已退款 / 4 部分退款',
  `pay_method`          TINYINT UNSIGNED NULL                    COMMENT '支付方式：1 微信 / 2 支付宝 / 3 余额 / 4 混合',
  `pay_no`              VARCHAR(64)      NULL                    COMMENT '支付单号（→ payment_record.pay_no）',
  `pay_at`              DATETIME(3)      NULL                    COMMENT '支付完成时间',
  `accept_at`           DATETIME(3)      NULL                    COMMENT '商户接单时间',
  `ready_at`            DATETIME(3)      NULL                    COMMENT '出餐完成时间',
  `dispatch_at`         DATETIME(3)      NULL                    COMMENT '派单/抢单时间',
  `picked_at`           DATETIME(3)      NULL                    COMMENT '骑手取餐时间',
  `delivered_at`        DATETIME(3)      NULL                    COMMENT '骑手送达时间',
  `finished_at`         DATETIME(3)      NULL                    COMMENT '订单完成时间（用户确认或自动确认）',
  `cancel_at`           DATETIME(3)      NULL                    COMMENT '取消时间',
  `cancel_reason`       VARCHAR(255)     NULL                    COMMENT '取消原因',
  `refund_amount`       DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '已退款金额（累计）',
  `is_invoice`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否申请发票：0 否 / 1 是',
  `invoice_id`          BIGINT UNSIGNED  NULL                    COMMENT '发票 ID（→ invoice.id）',
  `is_reviewed`         TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否已评价：0 否 / 1 是',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间（下单时刻；同时也是分表路由键）',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no`         (`order_no`)                            COMMENT '订单号全局唯一',
  KEY `idx_user_status`            (`user_id`,`status`,`created_at`)       COMMENT '【DESIGN §五重点】用户订单列表（按状态+时间）',
  KEY `idx_shop_status`            (`shop_id`,`status`,`created_at`)       COMMENT '【DESIGN §五重点】店铺订单列表',
  KEY `idx_rider_status`           (`rider_id`,`status`,`created_at`)      COMMENT '【DESIGN §五重点】骑手订单列表',
  KEY `idx_status_created`         (`status`,`created_at`)                 COMMENT '运营按状态聚合统计',
  KEY `idx_pay_no`                 (`pay_no`)                              COMMENT '支付回调反查订单'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='【模板，禁写入】外卖订单分表模板（按月）';


-- ============================================================================
-- 2) order_takeout_item_template —— 外卖订单明细模板（按月分表，与主单同月）
-- ============================================================================
DROP TABLE IF EXISTS `order_takeout_item_template`;
CREATE TABLE `order_takeout_item_template` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '所属订单号',
  `shop_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '店铺 ID',
  `product_id`      BIGINT UNSIGNED  NOT NULL                COMMENT '商品 ID',
  `sku_id`          BIGINT UNSIGNED  NOT NULL                COMMENT 'SKU ID',
  `product_name`    VARCHAR(128)     NOT NULL                COMMENT '商品名称快照（下单瞬间冻结）',
  `sku_spec`        VARCHAR(128)     NULL                    COMMENT '规格描述快照',
  `image_url`       VARCHAR(512)     NULL                    COMMENT '商品主图快照',
  `unit_price`      DECIMAL(10,2)    NOT NULL                COMMENT '单价快照',
  `qty`             SMALLINT UNSIGNED NOT NULL               COMMENT '数量',
  `package_fee`     DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '该子项打包费合计',
  `total_price`     DECIMAL(12,2)    NOT NULL                COMMENT '小计（unit_price × qty，不含打包费）',
  `is_combo_item`   TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否套餐子项：0 否 / 1 是',
  `combo_parent_id` BIGINT UNSIGNED  NULL                    COMMENT '所属套餐主项 ID（is_combo_item=1 时）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_no` (`order_no`)                          COMMENT '查订单全部明细'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='【模板，禁写入】外卖订单明细模板';


-- ============================================================================
-- 3) order_errand_template —— 跑腿订单分表模板（按月）
-- 4 种服务类型：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队
-- ============================================================================
DROP TABLE IF EXISTS `order_errand_template`;
CREATE TABLE `order_errand_template` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`            CHAR(18)         NOT NULL                COMMENT '业务订单号，格式 [E][yyyyMMdd][shard2][seq6][校验1]',
  `user_id`             BIGINT UNSIGNED  NOT NULL                COMMENT '下单用户 ID',
  `rider_id`            BIGINT UNSIGNED  NULL                    COMMENT '骑手 ID',
  `service_type`        TINYINT UNSIGNED NOT NULL                COMMENT '服务类型：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队',
  `pickup_snapshot`     JSON             NULL                    COMMENT '取件地址快照（含联系人/手机末 4 位）',
  `delivery_snapshot`   JSON             NULL                    COMMENT '送达地址快照',
  `item_type`           VARCHAR(64)      NULL                    COMMENT '物品类型（文件/食品/数码/其他）',
  `item_weight_g`       INT UNSIGNED     NULL                    COMMENT '物品重量（克）',
  `item_value`          DECIMAL(12,2)    NULL                    COMMENT '物品申报价值（用于保价计费）',
  `buy_list`            JSON             NULL                    COMMENT '帮买清单 JSON（service_type=3 必填）',
  `buy_budget`          DECIMAL(12,2)    NULL                    COMMENT '帮买预算（service_type=3）',
  `queue_place`         VARCHAR(255)     NULL                    COMMENT '排队场所（service_type=4）',
  `queue_type`          VARCHAR(64)      NULL                    COMMENT '排队类型（医院/网红店/政务）',
  `queue_duration_min`  SMALLINT UNSIGNED NULL                   COMMENT '预计排队时长（分钟，service_type=4）',
  `pickup_code`         CHAR(6)          NULL                    COMMENT '取件码（6 位数字，配送至送达地后核验）',
  `expected_pickup_at`  DATETIME(3)      NULL                    COMMENT '期望取件/起买时间',
  `service_fee`         DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '服务费（基础+距离）',
  `tip_fee`             DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '小费',
  `insurance_fee`       DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '保价费',
  `estimated_goods`     DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '预估物品/帮买金额',
  `pay_amount`          DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '应支付金额',
  `remark`              VARCHAR(255)     NULL                    COMMENT '用户备注',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '订单状态：见文件头 10 档枚举',
  `pay_status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '支付状态：0 未付 / 1 支付中 / 2 已付 / 3 已退 / 4 部分退',
  `pay_method`          TINYINT UNSIGNED NULL                    COMMENT '支付方式：1 微信 / 2 支付宝 / 3 余额 / 4 混合',
  `pay_no`              VARCHAR(64)      NULL                    COMMENT '支付单号',
  `pay_at`              DATETIME(3)      NULL                    COMMENT '支付时间',
  `accept_at`           DATETIME(3)      NULL                    COMMENT '骑手接单时间',
  `dispatch_at`         DATETIME(3)      NULL                    COMMENT '派单时间',
  `picked_at`           DATETIME(3)      NULL                    COMMENT '取件/帮买完成时间',
  `delivered_at`        DATETIME(3)      NULL                    COMMENT '送达时间',
  `finished_at`         DATETIME(3)      NULL                    COMMENT '订单完成时间',
  `cancel_at`           DATETIME(3)      NULL                    COMMENT '取消时间',
  `cancel_reason`       VARCHAR(255)     NULL                    COMMENT '取消原因',
  `refund_amount`       DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '已退款金额',
  `is_reviewed`         TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否评价',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no`     (`order_no`)                              COMMENT '订单号全局唯一',
  KEY `idx_user_status`        (`user_id`,`status`,`created_at`)         COMMENT '【DESIGN §五重点】用户订单列表',
  KEY `idx_rider_status`       (`rider_id`,`status`,`created_at`)        COMMENT '【DESIGN §五重点】骑手订单列表',
  KEY `idx_service_status`     (`service_type`,`status`,`created_at`)    COMMENT '运营按服务类型聚合',
  KEY `idx_status_created`     (`status`,`created_at`)                   COMMENT '运营状态聚合',
  KEY `idx_pay_no`             (`pay_no`)                                COMMENT '支付回调反查'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='【模板，禁写入】跑腿订单分表模板（按月）';


-- ============================================================================
-- 4) order_status_log_template —— 订单状态变更日志模板（按月分表）
-- 一笔订单平均 6~10 条日志，体量大，按月分表减少单表压力
-- ============================================================================
DROP TABLE IF EXISTS `order_status_log_template`;
CREATE TABLE `order_status_log_template` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `from_status`     TINYINT UNSIGNED NULL                    COMMENT '原状态（首条为 NULL）',
  `to_status`       TINYINT UNSIGNED NOT NULL                COMMENT '新状态',
  `op_type`         TINYINT UNSIGNED NOT NULL                COMMENT '操作来源：1 用户 / 2 商户 / 3 骑手 / 4 管理员 / 5 系统',
  `op_id`           BIGINT UNSIGNED  NULL                    COMMENT '操作者 ID（系统时为 NULL）',
  `op_ip`           VARBINARY(16)    NULL                    COMMENT '操作 IP',
  `remark`          VARCHAR(500)     NULL                    COMMENT '备注/原因',
  `extra`           JSON             NULL                    COMMENT '扩展信息（如经纬度、设备号）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间（即操作时间）',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_created` (`order_no`,`created_at`)         COMMENT '查订单时间线'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='【模板，禁写入】订单状态变更日志模板';


-- ============================================================================
-- 5) order_proof —— 取送件凭证（不分表，体量可控）
-- 对应 PRD §3.3.3.2 取件凭证上传 / 送达凭证上传
-- ============================================================================
DROP TABLE IF EXISTS `order_proof`;
CREATE TABLE `order_proof` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `proof_type`      TINYINT UNSIGNED NOT NULL                COMMENT '凭证类型：1 取件凭证 / 2 送达凭证 / 3 异常凭证',
  `uploader_type`   TINYINT UNSIGNED NOT NULL                COMMENT '上传方：1 用户 / 2 商户 / 3 骑手 / 4 管理员',
  `uploader_id`     BIGINT UNSIGNED  NOT NULL                COMMENT '上传方 ID',
  `image_urls`      JSON             NOT NULL                COMMENT '凭证图片 URL 数组（最多 6 张）',
  `signature_url`   VARCHAR(512)     NULL                    COMMENT '电子签名图（可选）',
  `lng`             DECIMAL(10,7)    NULL                    COMMENT '上传时经度',
  `lat`             DECIMAL(10,7)    NULL                    COMMENT '上传时纬度',
  `ocr_text`        TEXT             NULL                    COMMENT 'OCR 识别文本（用于稽核）',
  `remark`          VARCHAR(255)     NULL                    COMMENT '说明',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_type`       (`order_no`,`proof_type`)             COMMENT '查订单某类凭证',
  KEY `idx_uploader_created` (`uploader_type`,`uploader_id`,`created_at`) COMMENT '上传者历史凭证'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='取送件凭证';


-- ============================================================================
-- 6) order_after_sale —— 售后工单（不分表）
-- 对应 PRD §3.1.4.4 售后管理 / §3.2.3.4 异常订单处理
-- ============================================================================
DROP TABLE IF EXISTS `order_after_sale`;
CREATE TABLE `order_after_sale` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `after_sale_no`       VARCHAR(32)      NOT NULL                COMMENT '售后单号（AS+yyyyMMdd+seq）',
  `order_no`            CHAR(18)         NOT NULL                COMMENT '关联订单号',
  `order_type`          TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `user_id`             BIGINT UNSIGNED  NOT NULL                COMMENT '申请用户 ID',
  `shop_id`             BIGINT UNSIGNED  NULL                    COMMENT '店铺 ID（外卖时填）',
  `rider_id`            BIGINT UNSIGNED  NULL                    COMMENT '骑手 ID',
  `type`                TINYINT UNSIGNED NOT NULL                COMMENT '类型：1 仅退款 / 2 退货退款 / 3 换货 / 4 投诉',
  `reason_code`         VARCHAR(64)      NOT NULL                COMMENT '原因编码（→ sys_dict aftersale_reason）',
  `reason_detail`       VARCHAR(500)     NULL                    COMMENT '原因描述',
  `evidence_urls`       JSON             NULL                    COMMENT '证据图片数组',
  `apply_amount`        DECIMAL(12,2)    NOT NULL                COMMENT '申请退款金额',
  `actual_amount`       DECIMAL(12,2)    NULL                    COMMENT '实际退款金额（处理后填）',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 申请中 / 10 商户处理中 / 20 平台仲裁中 / 30 已同意 / 40 已拒绝 / 50 已退款 / 60 已关闭',
  `merchant_reply`      VARCHAR(500)     NULL                    COMMENT '商户回复',
  `merchant_reply_at`   DATETIME(3)      NULL                    COMMENT '商户回复时间',
  `arbitration_id`      BIGINT UNSIGNED  NULL                    COMMENT '关联仲裁 ID（→ arbitration.id）',
  `op_admin_id`         BIGINT UNSIGNED  NULL                    COMMENT '处理管理员 ID',
  `finish_at`           DATETIME(3)      NULL                    COMMENT '完成时间',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_after_sale_no` (`after_sale_no`)              COMMENT '售后单号唯一',
  KEY `idx_order_no`            (`order_no`)                    COMMENT '查订单全部售后',
  KEY `idx_user_status`         (`user_id`,`status`,`created_at`) COMMENT '用户售后历史',
  KEY `idx_shop_status`         (`shop_id`,`status`,`created_at`) COMMENT '商户售后工作台',
  KEY `idx_status_created`      (`status`,`created_at`)         COMMENT '运营仲裁工作台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='订单售后工单';


-- ============================================================================
-- 7) 存储过程 sp_create_order_monthly_tables
-- 功能 ：根据传入的 yyyymm 字符串，幂等地创建该月的 4 张订单分表
-- 参数 ：p_yyyymm —— 6 位年月字符串，例如 '202604'
-- 返回 ：无（执行结果通过 SHOW CREATE TABLE 校验）
-- 用途 ：1) 初始化时调用，预生成当月+下月分表
--        2) 月度 Job（EVENT 或 NestJS Cron）每月 1 日 02:00 提前生成下月分表
-- 实现 ：CREATE TABLE IF NOT EXISTS ... LIKE template，借助
--        MySQL 8 prepared statements 拼接动态表名
-- ============================================================================
DROP PROCEDURE IF EXISTS `sp_create_order_monthly_tables`;
DELIMITER $$
CREATE PROCEDURE `sp_create_order_monthly_tables`(IN p_yyyymm CHAR(6))
COMMENT '依据 yyyymm 月份串幂等创建 4 张订单分表（外卖主表/外卖明细/跑腿主表/状态日志）'
BEGIN
  -- 入参基本校验：必须 6 位数字
  IF p_yyyymm IS NULL OR CHAR_LENGTH(p_yyyymm) <> 6 OR p_yyyymm REGEXP '^[0-9]{6}$' = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'sp_create_order_monthly_tables: p_yyyymm must be 6 digits like 202604';
  END IF;

  -- 1) 外卖主表 order_takeout_<yyyymm>
  SET @ddl_takeout := CONCAT(
    'CREATE TABLE IF NOT EXISTS `order_takeout_', p_yyyymm,
    '` LIKE `order_takeout_template`'
  );
  PREPARE stmt FROM @ddl_takeout;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  -- 2) 外卖明细 order_takeout_item_<yyyymm>
  SET @ddl_item := CONCAT(
    'CREATE TABLE IF NOT EXISTS `order_takeout_item_', p_yyyymm,
    '` LIKE `order_takeout_item_template`'
  );
  PREPARE stmt FROM @ddl_item;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  -- 3) 跑腿主表 order_errand_<yyyymm>
  SET @ddl_errand := CONCAT(
    'CREATE TABLE IF NOT EXISTS `order_errand_', p_yyyymm,
    '` LIKE `order_errand_template`'
  );
  PREPARE stmt FROM @ddl_errand;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  -- 4) 状态日志 order_status_log_<yyyymm>
  SET @ddl_log := CONCAT(
    'CREATE TABLE IF NOT EXISTS `order_status_log_', p_yyyymm,
    '` LIKE `order_status_log_template`'
  );
  PREPARE stmt FROM @ddl_log;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  -- 输出执行摘要供运维核对
  SELECT
    p_yyyymm                                AS yyyymm,
    CONCAT('order_takeout_',     p_yyyymm)  AS table_takeout,
    CONCAT('order_takeout_item_',p_yyyymm)  AS table_takeout_item,
    CONCAT('order_errand_',      p_yyyymm)  AS table_errand,
    CONCAT('order_status_log_',  p_yyyymm)  AS table_status_log;
END$$
DELIMITER ;


-- ============================================================================
-- 8) 初始化调用：生成 当月(202604) + 下月(202605)
-- 当前系统时间 2026-04（详见 docs/P2_数据库设计/P2_COMPLETION_REPORT.md）
-- 共 8 张物理表落库
-- ============================================================================
CALL sp_create_order_monthly_tables('202604');
CALL sp_create_order_monthly_tables('202605');

-- 校验：可手动执行
--   SHOW TABLES LIKE 'order_takeout_2026%';
--   SHOW TABLES LIKE 'order_errand_2026%';
--   SHOW TABLES LIKE 'order_status_log_2026%';

-- ============================================================================
-- END 04_order.sql
-- 共 6 张表（4 模板 + 2 全局）+ 1 存储过程 + 8 张物理分表
-- ============================================================================
