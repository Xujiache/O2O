-- ============================================================================
-- 文件名 : 08_review.sql
-- 阶段   : P2 数据库设计 / T2.9 D8 评价售后
-- 用途   : 创建 D8 领域 6 张表
--          review / review_reply / review_appeal /
--          complaint / arbitration / ticket
-- 依据   : DESIGN_P2_数据库设计.md §三 D8（标题写 "5 张" 但实际列出 6 张）
--          + CONSENSUS_P2_数据库设计.md §1.1（D8 预估 6 张）
-- 决策   : 按字段相关性，ticket 保留在 D8（与 complaint/arbitration 同属
--          客服/投诉/工单语义族）；若并入 D10 会与系统配置混淆。
--          决策已在 后端/src/database/README.md 记录。
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) review —— 用户评价
-- 对应 PRD §3.1.2.6 评价体系 / §3.4.6.3 评价管理
-- ============================================================================
DROP TABLE IF EXISTS `review`;
CREATE TABLE `review` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `order_no`        CHAR(18)         NOT NULL                COMMENT '订单号',
  `order_type`      TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `user_id`         BIGINT UNSIGNED  NOT NULL                COMMENT '评价用户 ID',
  `target_type`     TINYINT UNSIGNED NOT NULL                COMMENT '评价对象：1 店铺 / 2 商品 / 3 骑手 / 4 综合',
  `target_id`       BIGINT UNSIGNED  NOT NULL                COMMENT '对象 ID（店铺/商品/骑手）',
  `shop_id`         BIGINT UNSIGNED  NULL                    COMMENT '冗余店铺 ID',
  `rider_id`        BIGINT UNSIGNED  NULL                    COMMENT '冗余骑手 ID',
  `score`           TINYINT UNSIGNED NOT NULL                COMMENT '总分（1~5）',
  `taste_score`     TINYINT UNSIGNED NULL                    COMMENT '口味分（外卖）',
  `package_score`   TINYINT UNSIGNED NULL                    COMMENT '包装分（外卖）',
  `delivery_score`  TINYINT UNSIGNED NULL                    COMMENT '配送/服务分',
  `content`         VARCHAR(1000)    NULL                    COMMENT '评价内容',
  `image_urls`      JSON             NULL                    COMMENT '图片 URL 数组（最多 9 张）',
  `tags`            JSON             NULL                    COMMENT '标签数组（"分量足"/"很辣" 等）',
  `is_anonymous`    TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否匿名：0 否 / 1 是',
  `is_top`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否置顶：0 否 / 1 是（管理员）',
  `is_hidden`       TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否隐藏（违规处理）：0 否 / 1 是',
  `useful_count`    INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '有用计数',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_target`     (`order_no`,`target_type`,`target_id`)    COMMENT '一笔订单同对象仅评一次',
  KEY `idx_target_score_created`   (`target_type`,`target_id`,`score`,`created_at`) COMMENT '对象评价分页',
  KEY `idx_user_created`           (`user_id`,`created_at`)                  COMMENT '用户评价历史',
  KEY `idx_shop_score_created`     (`shop_id`,`score`,`created_at`)          COMMENT '店铺好评/差评',
  KEY `idx_rider_score_created`    (`rider_id`,`score`,`created_at`)         COMMENT '骑手好评/差评'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户评价';


-- ============================================================================
-- 2) review_reply —— 商家/官方回复
-- 对应 PRD §3.2.2.4 商户评价管理（评价回复）
-- ============================================================================
DROP TABLE IF EXISTS `review_reply`;
CREATE TABLE `review_reply` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `review_id`       BIGINT UNSIGNED  NOT NULL                COMMENT '原评价 ID',
  `replier_type`    TINYINT UNSIGNED NOT NULL                COMMENT '回复方：1 商户 / 2 平台官方',
  `replier_id`      BIGINT UNSIGNED  NOT NULL                COMMENT '回复方 ID（merchant_staff.id 或 admin.id）',
  `content`         VARCHAR(1000)    NOT NULL                COMMENT '回复内容',
  `is_hidden`       TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '是否隐藏',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_review_id` (`review_id`,`created_at`)            COMMENT '查评价的全部回复'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='评价回复';


-- ============================================================================
-- 3) review_appeal —— 评价申诉（差评申诉）
-- 对应 PRD §3.2.2.4 差评申诉 / §3.4.6.3 差评申诉审核
-- ============================================================================
DROP TABLE IF EXISTS `review_appeal`;
CREATE TABLE `review_appeal` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `review_id`       BIGINT UNSIGNED  NOT NULL                COMMENT '被申诉评价 ID',
  `appellant_type`  TINYINT UNSIGNED NOT NULL                COMMENT '申诉方：1 商户 / 2 骑手',
  `appellant_id`    BIGINT UNSIGNED  NOT NULL                COMMENT '申诉方 ID',
  `reason_code`     VARCHAR(64)      NOT NULL                COMMENT '申诉理由编码',
  `reason_detail`   VARCHAR(1000)    NOT NULL                COMMENT '申诉详情',
  `evidence_urls`   JSON             NULL                    COMMENT '证据图片 URL 数组',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 申诉中 / 1 通过(评价已隐藏) / 2 驳回',
  `audit_admin_id`  BIGINT UNSIGNED  NULL                    COMMENT '审核管理员',
  `audit_at`        DATETIME(3)      NULL                    COMMENT '审核时间',
  `audit_remark`    VARCHAR(500)     NULL                    COMMENT '审核备注',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_review_id`           (`review_id`)                            COMMENT '评价的申诉历史',
  KEY `idx_appellant_status`    (`appellant_type`,`appellant_id`,`status`) COMMENT '申诉方查申诉',
  KEY `idx_status_created`      (`status`,`created_at`)                  COMMENT '运营审核工作台'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='评价申诉（差评申诉）';


-- ============================================================================
-- 4) complaint —— 投诉
-- 对应 PRD §3.1.4.3 订单投诉 / §3.4.10.1 工单（投诉类）
-- 与 ticket 的差异：complaint 强针对订单/对象的投诉；ticket 是更宽泛的工单
-- ============================================================================
DROP TABLE IF EXISTS `complaint`;
CREATE TABLE `complaint` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `complaint_no`        VARCHAR(32)      NOT NULL                COMMENT '投诉单号',
  `complainant_type`    TINYINT UNSIGNED NOT NULL                COMMENT '投诉方：1 用户 / 2 商户 / 3 骑手',
  `complainant_id`      BIGINT UNSIGNED  NOT NULL                COMMENT '投诉方 ID',
  `target_type`         TINYINT UNSIGNED NOT NULL                COMMENT '被投诉对象：1 用户 / 2 商户 / 3 骑手 / 4 平台',
  `target_id`           BIGINT UNSIGNED  NULL                    COMMENT '被投诉对象 ID（target_type=4 为 NULL）',
  `order_no`            CHAR(18)         NULL                    COMMENT '关联订单号（可空）',
  `order_type`          TINYINT UNSIGNED NULL                    COMMENT '订单类型：1 外卖 / 2 跑腿',
  `category`            VARCHAR(64)      NOT NULL                COMMENT '投诉类别（→ sys_dict complaint_category）',
  `content`             VARCHAR(2000)    NOT NULL                COMMENT '投诉内容',
  `evidence_urls`       JSON             NULL                    COMMENT '证据图片/视频 URL 数组',
  `severity`            TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '严重等级：1 一般 / 2 中等 / 3 严重',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 待处理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 转仲裁',
  `handle_admin_id`     BIGINT UNSIGNED  NULL                    COMMENT '处理管理员 ID',
  `handle_at`           DATETIME(3)      NULL                    COMMENT '处理时间',
  `handle_result`       VARCHAR(2000)    NULL                    COMMENT '处理结果',
  `arbitration_id`      BIGINT UNSIGNED  NULL                    COMMENT '关联仲裁 ID（status=4）',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_complaint_no`            (`complaint_no`)                                COMMENT '投诉单号唯一',
  KEY `idx_complainant_status_created`    (`complainant_type`,`complainant_id`,`status`,`created_at`) COMMENT '投诉方历史',
  KEY `idx_target_status_created`         (`target_type`,`target_id`,`status`,`created_at`) COMMENT '被投诉对象历史',
  KEY `idx_status_severity_created`       (`status`,`severity`,`created_at`)              COMMENT '运营按严重度筛',
  KEY `idx_order_no`                      (`order_no`)                                    COMMENT '订单关联投诉'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投诉';


-- ============================================================================
-- 5) arbitration —— 平台仲裁
-- 对应 PRD §3.1.4.4 平台仲裁申请 / §3.2.3.4 平台仲裁配合 / §3.4.10.2 仲裁管理
-- ============================================================================
DROP TABLE IF EXISTS `arbitration`;
CREATE TABLE `arbitration` (
  `id`                  BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`           INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `arbitration_no`      VARCHAR(32)      NOT NULL                COMMENT '仲裁单号',
  `source_type`         TINYINT UNSIGNED NOT NULL                COMMENT '来源：1 售后转仲裁 / 2 投诉转仲裁 / 3 主动申请',
  `source_id`           BIGINT UNSIGNED  NOT NULL                COMMENT '来源 ID（after_sale.id / complaint.id）',
  `order_no`            CHAR(18)         NOT NULL                COMMENT '关联订单号',
  `order_type`          TINYINT UNSIGNED NOT NULL                COMMENT '订单类型：1 外卖 / 2 跑腿',
  `applicant_type`      TINYINT UNSIGNED NOT NULL                COMMENT '申请方：1 用户 / 2 商户 / 3 骑手',
  `applicant_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '申请方 ID',
  `respondent_type`     TINYINT UNSIGNED NOT NULL                COMMENT '被申请方：1 用户 / 2 商户 / 3 骑手',
  `respondent_id`       BIGINT UNSIGNED  NOT NULL                COMMENT '被申请方 ID',
  `dispute_amount`      DECIMAL(12,2)    NULL                    COMMENT '争议金额',
  `dispute_content`     VARCHAR(2000)    NOT NULL                COMMENT '争议描述',
  `evidence_urls`       JSON             NULL                    COMMENT '证据 URL 数组',
  `status`              TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 待审 / 1 审理中 / 2 已裁决 / 3 已关闭',
  `decision`            TINYINT UNSIGNED NULL                    COMMENT '裁决结果：1 申请方胜 / 2 被申请方胜 / 3 部分支持 / 4 驳回',
  `decision_amount`     DECIMAL(12,2)    NULL                    COMMENT '裁决金额（赔付）',
  `decision_detail`     VARCHAR(2000)    NULL                    COMMENT '裁决详情',
  `judge_admin_id`      BIGINT UNSIGNED  NULL                    COMMENT '主审管理员 ID',
  `decision_at`         DATETIME(3)      NULL                    COMMENT '裁决时间',
  `is_deleted`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`          DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`          DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`          DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arbitration_no`     (`arbitration_no`)                          COMMENT '仲裁单号唯一',
  KEY `idx_status_created`           (`status`,`created_at`)                     COMMENT '运营仲裁工作台',
  KEY `idx_order_no`                 (`order_no`)                                COMMENT '订单仲裁历史',
  KEY `idx_applicant`                (`applicant_type`,`applicant_id`,`status`)  COMMENT '申请方仲裁历史',
  KEY `idx_respondent`               (`respondent_type`,`respondent_id`,`status`) COMMENT '被申请方仲裁历史'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='平台仲裁';


-- ============================================================================
-- 6) ticket —— 客服工单
-- 对应 PRD §3.4.10.1 工单管理（投诉/售后/求助）/ §3.1.5.6 在线客服
-- 设计原因：与 complaint/arbitration 同属客服域，并入 D8 而非 D10（README §决策记录）
-- ============================================================================
DROP TABLE IF EXISTS `ticket`;
CREATE TABLE `ticket` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `ticket_no`       VARCHAR(32)      NOT NULL                COMMENT '工单号',
  `submitter_type`  TINYINT UNSIGNED NOT NULL                COMMENT '提交方：1 用户 / 2 商户 / 3 骑手',
  `submitter_id`    BIGINT UNSIGNED  NOT NULL                COMMENT '提交方 ID',
  `category`        VARCHAR(64)      NOT NULL                COMMENT '工单分类（→ sys_dict ticket_category）',
  `priority`        TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '优先级：1 低 / 2 中 / 3 高 / 4 紧急',
  `title`           VARCHAR(255)     NOT NULL                COMMENT '工单标题',
  `content`         TEXT             NOT NULL                COMMENT '工单内容',
  `attach_urls`     JSON             NULL                    COMMENT '附件 URL 数组',
  `related_order_no` CHAR(18)        NULL                    COMMENT '关联订单号',
  `related_type`    TINYINT UNSIGNED NULL                    COMMENT '关联类型：1 外卖 / 2 跑腿',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '状态：0 待受理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 已转单',
  `assignee_admin_id` BIGINT UNSIGNED NULL                   COMMENT '指派管理员 ID',
  `last_reply_at`   DATETIME(3)      NULL                    COMMENT '最后回复时间',
  `last_reply_by_type` TINYINT UNSIGNED NULL                 COMMENT '最后回复方：1 提交方 / 2 客服',
  `closed_at`       DATETIME(3)      NULL                    COMMENT '关闭时间',
  `close_reason`    VARCHAR(500)     NULL                    COMMENT '关闭原因/总结',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ticket_no`           (`ticket_no`)                                  COMMENT '工单号唯一',
  KEY `idx_submitter_status_created`  (`submitter_type`,`submitter_id`,`status`,`created_at`) COMMENT '提交方工单',
  KEY `idx_assignee_status`           (`assignee_admin_id`,`status`,`priority`)      COMMENT '客服工作台',
  KEY `idx_status_priority_created`   (`status`,`priority`,`created_at`)             COMMENT '运营按优先级筛',
  KEY `idx_related_order`             (`related_order_no`)                           COMMENT '订单关联工单'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客服工单';

-- ============================================================================
-- END 08_review.sql —— 共 6 张表
-- ============================================================================
