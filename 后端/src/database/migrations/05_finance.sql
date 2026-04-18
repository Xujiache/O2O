-- ============================================================================
-- 文件名 : 05_finance.sql
-- 阶段   : P2 数据库设计 / T2.6 D5 支付与财务
-- 用途   : 创建 D5 领域 9 张表
--          payment_record / refund_record / account / account_flow /
--          settlement_rule / settlement_record / withdraw_record /
--          invoice / reconciliation
-- 依据   : DESIGN_P2_数据库设计.md §三 D5 / §四 payment_record + settlement_*
--          §九 withdraw_record.bank_card_no_enc + bank_card_tail4
--          提示词："account_flow 以 created_at + account_id 建复合索引"
--                  "金额字段 DECIMAL(12,2)；流水 direction TINYINT (1 入 / 2 出)"
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) payment_record —— 支付记录
-- 对应 PRD §3.1.6.1 支付功能 / §3.5.2.5 支付服务
-- 一笔订单可有多次支付尝试（首次失败重试）
-- ============================================================================
DROP TABLE IF EXISTS `payment_record`;
CREATE TABLE `payment_record` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `pay_no`          VARCHAR(28)      NOT NULL                COMMENT '平台支付单号（28 位）',
  `out_trade_no`    VARCHAR(64)      NULL                    COMMENT '第三方交易号（微信/支付宝返回）',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '关联订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `user_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '付款用户 ID',
  `amount`          DECIMAL(12,2)    NOT NULL                COMMENT '本次支付金额',
  `pay_method`      TINYINT UNSIGNED NOT NULL                COMMENT '支付方式：1 微信 / 2 支付宝 / 3 余额 / 4 混合',
  `channel`         VARCHAR(32)      NULL                    COMMENT '渠道明细（如 wxpay_jsapi/alipay_app）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 创建 / 1 支付中 / 2 成功 / 3 失败 / 4 关闭 / 5 已退款',
  `pay_at`          DATETIME(3)      NULL                    COMMENT '支付完成时间',
  `client_ip`       VARBINARY(16)    NULL                    COMMENT '客户端 IP',
  `device_info`     VARCHAR(255)     NULL                    COMMENT '设备信息（小程序 SystemInfo）',
  `notify_url`      VARCHAR(255)     NULL                    COMMENT '回调地址',
  `raw_request`     JSON             NULL                    COMMENT '请求第三方原始报文（脱敏后）',
  `raw_response`    JSON             NULL                    COMMENT '第三方原始返回（脱敏后）',
  `error_code`      VARCHAR(64)      NULL                    COMMENT '失败代码',
  `error_msg`       VARCHAR(255)     NULL                    COMMENT '失败描述',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pay_no`       (`pay_no`)                       COMMENT '【DESIGN §四】支付单号唯一',
  UNIQUE KEY `uk_out_trade`    (`out_trade_no`)                 COMMENT '【DESIGN §四】第三方交易号唯一（NULL 允许）',
  KEY `idx_order`              (`order_no`,`order_type`)        COMMENT '【DESIGN §四】订单查支付历史',
  KEY `idx_user_status`        (`user_id`,`status`,`created_at`) COMMENT '【DESIGN §四】用户支付查询',
  KEY `idx_status_created`     (`status`,`created_at`)          COMMENT '运营对账（按状态+时间）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='支付记录';


-- ============================================================================
-- 2) refund_record —— 退款记录
-- 对应 PRD §3.1.4.4 售后退款 / §3.5.2.5 退款
-- ============================================================================
DROP TABLE IF EXISTS `refund_record`;
CREATE TABLE `refund_record` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `refund_no`       VARCHAR(28)      NOT NULL                COMMENT '退款单号',
  `out_refund_no`   VARCHAR(64)      NULL                    COMMENT '第三方退款号',
  `pay_no`          VARCHAR(28)      NOT NULL                COMMENT '原支付单号',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `after_sale_no`   VARCHAR(32)      NULL                    COMMENT '关联售后单号',
  `user_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '退款用户 ID',
  `amount`          DECIMAL(12,2)    NOT NULL                COMMENT '本次退款金额',
  `refund_method`   TINYINT UNSIGNED NOT NULL                COMMENT '退款方式：1 原路退回 / 2 退到余额',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 申请 / 1 处理中 / 2 成功 / 3 失败',
  `refund_at`       DATETIME(3)      NULL                    COMMENT '退款完成时间',
  `raw_response`    JSON             NULL                    COMMENT '第三方退款返回',
  `error_code`      VARCHAR(64)      NULL                    COMMENT '失败代码',
  `error_msg`       VARCHAR(255)     NULL                    COMMENT '失败描述',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '操作管理员 ID（人工退款时）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_no`    (`refund_no`)                COMMENT '退款单号唯一',
  UNIQUE KEY `uk_out_refund`   (`out_refund_no`)            COMMENT '第三方退款号唯一',
  KEY `idx_order_no`           (`order_no`)                 COMMENT '订单查退款历史',
  KEY `idx_pay_no`             (`pay_no`)                   COMMENT '支付查退款历史',
  KEY `idx_user_status`        (`user_id`,`status`,`created_at`) COMMENT '用户退款查询',
  KEY `idx_after_sale`         (`after_sale_no`)            COMMENT '售后单查退款',
  KEY `idx_status_created`     (`status`,`created_at`)      COMMENT '运营对账'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='退款记录';


-- ============================================================================
-- 3) account —— 三类账户主表（用户/商户/骑手）
-- 对应 PRD §3.1.5.3 我的钱包 / §3.2.5 商户账单 / §3.3.4 骑手钱包
-- ============================================================================
DROP TABLE IF EXISTS `account`;
CREATE TABLE `account` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `owner_type`      TINYINT UNSIGNED NOT NULL                COMMENT '账户主体类型：1 用户 / 2 商户 / 3 骑手',
  `owner_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '主体 ID（user.id / merchant.id / rider.id）',
  `balance`         DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '可用余额',
  `frozen`          DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '冻结金额（提现处理中、争议金等）',
  `total_income`    DECIMAL(14,2)    NOT NULL DEFAULT 0.00   COMMENT '累计收入',
  `total_expense`   DECIMAL(14,2)    NOT NULL DEFAULT 0.00   COMMENT '累计支出',
  `version`         INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '乐观锁版本号（防并发覆盖）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '账户状态：0 冻结 / 1 正常',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_owner` (`owner_type`,`owner_id`)            COMMENT '同一主体仅一个账户'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账户主表（用户/商户/骑手三类）';


-- ============================================================================
-- 4) account_flow —— 账户流水
-- 索引：(account_id, created_at) 顺序符合提示词约定
-- direction：1 入账 / 2 出账
-- ============================================================================
DROP TABLE IF EXISTS `account_flow`;
CREATE TABLE `account_flow` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `flow_no`         VARCHAR(32)      NOT NULL                COMMENT '流水号（唯一，便于客服定位）',
  `account_id`      BIGINT UNSIGNED  NOT NULL                COMMENT '账户 ID（→ account.id）',
  `owner_type`      TINYINT UNSIGNED NOT NULL                COMMENT '主体类型：1 用户 / 2 商户 / 3 骑手（冗余，避免 join）',
  `owner_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '主体 ID（冗余）',
  `direction`       TINYINT UNSIGNED NOT NULL                COMMENT '【提示词约定】方向：1 入账 / 2 出账',
  `biz_type`        TINYINT UNSIGNED NOT NULL                COMMENT '业务类型：1 订单收入 / 2 订单退款 / 3 分账 / 4 提现 / 5 充值 / 6 奖励 / 7 罚款 / 8 调整',
  `amount`          DECIMAL(12,2)    NOT NULL                COMMENT '发生额（始终正数；出账方向看 direction）',
  `balance_after`   DECIMAL(12,2)    NOT NULL                COMMENT '操作后余额',
  `related_no`      VARCHAR(64)      NULL                    COMMENT '关联业务单号（订单/支付/退款/分账/提现）',
  `remark`          VARCHAR(255)     NULL                    COMMENT '备注',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '操作管理员 ID（biz_type=8 调整时）',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_flow_no`           (`flow_no`)                                  COMMENT '流水号唯一',
  KEY `idx_account_created`         (`account_id`,`created_at`)                  COMMENT '【提示词约定】账户时间线（覆盖账单分页）',
  KEY `idx_owner_biz_created`       (`owner_type`,`owner_id`,`biz_type`,`created_at`) COMMENT '主体按业务类型筛账单',
  KEY `idx_related_no`              (`related_no`)                               COMMENT '业务单号反查流水'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账户流水';


-- ============================================================================
-- 5) settlement_rule —— 分账规则
-- 对应 PRD §3.4.8.2 分账管理；DESIGN §四 字段
--   scene(1外卖/2跑腿) + target_type(1商户/2骑手/3平台) +
--   scope_type(1全局/2城市/3单店) + rate
-- 多条规则按 priority 高→低 匹配，命中即用
-- ============================================================================
DROP TABLE IF EXISTS `settlement_rule`;
CREATE TABLE `settlement_rule` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `rule_code`       VARCHAR(64)      NOT NULL                COMMENT '规则编码',
  `rule_name`       VARCHAR(128)     NOT NULL                COMMENT '规则名称',
  `scene`           TINYINT UNSIGNED NOT NULL                COMMENT '场景：1 外卖 / 2 跑腿',
  `target_type`     TINYINT UNSIGNED NOT NULL                COMMENT '分账对象：1 商户 / 2 骑手 / 3 平台',
  `scope_type`      TINYINT UNSIGNED NOT NULL                COMMENT '生效范围：1 全局 / 2 城市 / 3 单店',
  `scope_value`     VARCHAR(64)      NULL                    COMMENT '范围值（city_code / shop_id）；scope_type=1 时为空',
  `rate`            DECIMAL(8,4)     NOT NULL DEFAULT 0.0000 COMMENT '比例（0~1，例 0.0500 = 5%）',
  `fixed_fee`       DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '固定费（元）',
  `min_fee`         DECIMAL(8,2)     NULL                    COMMENT '最低分账金额',
  `max_fee`         DECIMAL(8,2)     NULL                    COMMENT '最高分账金额',
  `priority`        INT              NOT NULL DEFAULT 0      COMMENT '优先级（大→优先匹配）',
  `valid_from`      DATETIME(3)      NULL                    COMMENT '生效起始',
  `valid_to`        DATETIME(3)      NULL                    COMMENT '失效时间（NULL=长期）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 停用 / 1 启用',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code`     (`rule_code`)                                COMMENT '规则编码唯一',
  KEY `idx_scene_target_status` (`scene`,`target_type`,`status`,`priority`)  COMMENT '按场景+对象+优先级匹配'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分账规则';


-- ============================================================================
-- 6) settlement_record —— 分账记录
-- 每笔订单产出 1~3 条（商户 / 骑手 / 平台）
-- ============================================================================
DROP TABLE IF EXISTS `settlement_record`;
CREATE TABLE `settlement_record` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `settlement_no`   VARCHAR(32)      NOT NULL                COMMENT '分账单号',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `target_type`     TINYINT UNSIGNED NOT NULL                COMMENT '分账对象：1 商户 / 2 骑手 / 3 平台',
  `target_id`       BIGINT UNSIGNED  NULL                    COMMENT '对象 ID（target_type=3 时为 NULL）',
  `rule_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '匹配的规则 ID',
  `base_amount`     DECIMAL(12,2)    NOT NULL                COMMENT '计算基数（订单金额或部分）',
  `rate`            DECIMAL(8,4)     NOT NULL DEFAULT 0.0000 COMMENT '使用的比例',
  `fixed_fee`       DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '使用的固定费',
  `settle_amount`   DECIMAL(12,2)    NOT NULL                COMMENT '实际分账金额',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 待执行 / 1 已执行 / 2 失败 / 3 已撤销',
  `settle_at`       DATETIME(3)      NULL                    COMMENT '执行时间',
  `flow_no`         VARCHAR(32)      NULL                    COMMENT '关联账户流水号（→ account_flow.flow_no）',
  `error_msg`       VARCHAR(255)     NULL                    COMMENT '失败原因',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settlement_no`      (`settlement_no`)                  COMMENT '分账单号唯一',
  KEY `idx_order_target`             (`order_no`,`target_type`)         COMMENT '订单分账明细',
  KEY `idx_target_status_created`    (`target_type`,`target_id`,`status`,`created_at`) COMMENT '主体分账历史',
  KEY `idx_status_settle_at`         (`status`,`settle_at`)             COMMENT '执行 Job'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分账记录';


-- ============================================================================
-- 7) withdraw_record —— 提现记录
-- 对应 PRD §3.2.5.3 商户提现 / §3.3.4.3 骑手提现 / §3.4.8.3 后台审核
-- 银行卡敏感字段加密存储（DESIGN §九）
-- ============================================================================
DROP TABLE IF EXISTS `withdraw_record`;
CREATE TABLE `withdraw_record` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `withdraw_no`         VARCHAR(32)      NOT NULL                COMMENT '提现单号',
  `owner_type`          TINYINT UNSIGNED NOT NULL                COMMENT '提现主体：2 商户 / 3 骑手',
  `owner_id`            BIGINT UNSIGNED  NOT NULL                COMMENT '主体 ID',
  `account_id`          BIGINT UNSIGNED  NOT NULL                COMMENT '账户 ID',
  `amount`              DECIMAL(12,2)    NOT NULL                COMMENT '申请金额',
  `fee`                 DECIMAL(8,2)     NOT NULL DEFAULT 0.00   COMMENT '提现手续费',
  `actual_amount`       DECIMAL(12,2)    NOT NULL                COMMENT '实际到账金额（amount - fee）',
  `bank_card_no_enc`    VARBINARY(255)   NOT NULL                COMMENT '【DESIGN §九】银行卡号 AES-256-GCM',
  `bank_card_tail4`     VARCHAR(8)       NOT NULL                COMMENT '【DESIGN §九】银行卡末 4 位（脱敏）',
  `account_holder_enc`  VARBINARY(255)   NOT NULL                COMMENT '【DESIGN §九】持卡人姓名 AES-256-GCM',
  `bank_name`           VARCHAR(64)      NOT NULL                COMMENT '开户行名称（明文）',
  `bank_branch`         VARCHAR(128)     NULL                    COMMENT '支行名称',
  `enc_key_ver`         TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 申请 / 1 审核中 / 2 审核驳回 / 3 打款中 / 4 已打款 / 5 打款失败',
  `audit_admin_id`      BIGINT UNSIGNED  NULL                    COMMENT '审核管理员 ID',
  `audit_at`            DATETIME(3)      NULL                    COMMENT '审核时间',
  `audit_remark`        VARCHAR(255)     NULL                    COMMENT '审核备注（驳回原因）',
  `payout_no`           VARCHAR(64)      NULL                    COMMENT '第三方付款单号',
  `payout_at`           DATETIME(3)      NULL                    COMMENT '打款完成时间',
  `payout_response`     JSON             NULL                    COMMENT '第三方打款返回',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_withdraw_no`         (`withdraw_no`)                          COMMENT '提现单号唯一',
  KEY `idx_owner_status_created`      (`owner_type`,`owner_id`,`status`,`created_at`) COMMENT '主体提现历史',
  KEY `idx_status_created`            (`status`,`created_at`)                  COMMENT '运营审核工作台',
  KEY `idx_account_id`                (`account_id`)                           COMMENT '账户聚合'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='提现记录';


-- ============================================================================
-- 8) invoice —— 发票
-- 对应 PRD §3.1.5.5 用户发票 / §3.2.5.4 商户发票 / §3.4.8.5 后台开票
-- ============================================================================
DROP TABLE IF EXISTS `invoice`;
CREATE TABLE `invoice` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `invoice_no`      VARCHAR(32)      NOT NULL                COMMENT '内部发票编号',
  `applicant_type`  TINYINT UNSIGNED NOT NULL                COMMENT '申请方：1 用户 / 2 商户',
  `applicant_id`    BIGINT UNSIGNED  NOT NULL                COMMENT '申请方 ID',
  `order_nos`       JSON             NOT NULL                COMMENT '关联订单号数组（一票多单）',
  `invoice_type`    TINYINT UNSIGNED NOT NULL                COMMENT '发票类型：1 电子普票 / 2 电子专票 / 3 纸质普票 / 4 纸质专票',
  `title_type`      TINYINT UNSIGNED NOT NULL                COMMENT '抬头类型：1 个人 / 2 企业',
  `title`           VARCHAR(255)     NOT NULL                COMMENT '抬头名称',
  `tax_no`          VARCHAR(32)      NULL                    COMMENT '税号（企业必填）',
  `register_addr`   VARCHAR(255)     NULL                    COMMENT '注册地址（企业可选）',
  `register_phone`  VARCHAR(32)      NULL                    COMMENT '注册电话',
  `bank_name`       VARCHAR(128)     NULL                    COMMENT '开户行',
  `bank_account`    VARCHAR(64)      NULL                    COMMENT '开户账号',
  `amount`          DECIMAL(12,2)    NOT NULL                COMMENT '开票金额',
  `email`           VARCHAR(128)     NULL                    COMMENT '电子发票收件邮箱',
  `mobile_enc`      VARBINARY(255)   NULL                    COMMENT '收件手机 AES-256-GCM',
  `mobile_tail4`    VARCHAR(8)       NULL                    COMMENT '收件手机末 4 位',
  `enc_key_ver`     TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '加密密钥版本',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 申请 / 1 开票中 / 2 已开 / 3 失败 / 4 已作废',
  `pdf_url`         VARCHAR(512)     NULL                    COMMENT '发票 PDF URL',
  `e_invoice_no`    VARCHAR(64)      NULL                    COMMENT '电子发票号码（开票后回填）',
  `issued_at`       DATETIME(3)      NULL                    COMMENT '开票时间',
  `error_msg`       VARCHAR(255)     NULL                    COMMENT '失败原因',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invoice_no`     (`invoice_no`)                                COMMENT '内部发票编号唯一',
  KEY `idx_applicant_status`     (`applicant_type`,`applicant_id`,`status`,`created_at`) COMMENT '申请方查发票',
  KEY `idx_status_created`       (`status`,`created_at`)                       COMMENT '开票工作台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='发票';


-- ============================================================================
-- 9) reconciliation —— 渠道对账
-- 对应 PRD §3.4.8.4 账单管理 / §3.5.2.5 对账
-- 每天每渠道一条；与第三方对账文件比对差异
-- ============================================================================
DROP TABLE IF EXISTS `reconciliation`;
CREATE TABLE `reconciliation` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `recon_no`        VARCHAR(32)      NOT NULL                COMMENT '对账单号',
  `channel`         VARCHAR(32)      NOT NULL                COMMENT '渠道：wxpay / alipay / ...',
  `bill_date`       DATE             NOT NULL                COMMENT '对账日（自然日）',
  `total_orders`    INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '订单总数（平台侧统计）',
  `total_amount`    DECIMAL(14,2)    NOT NULL DEFAULT 0.00   COMMENT '订单总金额',
  `total_fee`       DECIMAL(12,2)    NOT NULL DEFAULT 0.00   COMMENT '渠道手续费合计',
  `channel_orders`  INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '渠道侧订单数',
  `channel_amount`  DECIMAL(14,2)    NOT NULL DEFAULT 0.00   COMMENT '渠道侧金额',
  `diff_count`      INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '差异笔数',
  `diff_amount`     DECIMAL(14,2)    NOT NULL DEFAULT 0.00   COMMENT '差异金额',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理',
  `bill_file_url`   VARCHAR(512)     NULL                    COMMENT '渠道对账文件 URL',
  `diff_file_url`   VARCHAR(512)     NULL                    COMMENT '差异明细 CSV URL',
  `op_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '处理管理员 ID',
  `finish_at`       DATETIME(3)      NULL                    COMMENT '处理完成时间',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_recon_no`        (`recon_no`)                       COMMENT '对账单号唯一',
  UNIQUE KEY `uk_channel_date`    (`channel`,`bill_date`)            COMMENT '同渠道同一天仅一条',
  KEY `idx_status_bill_date`      (`status`,`bill_date`)             COMMENT '运营按日筛差异'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='渠道对账';

-- ============================================================================
-- END 05_finance.sql —— 共 9 张表
-- ============================================================================
