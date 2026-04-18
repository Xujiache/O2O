-- ============================================================================
-- 文件名 : 02_region.sql
-- 阶段   : P2 数据库设计 / T2.3 D2 地址与区域
-- 用途   : 创建 D2 领域 2 张表（行政区划 region / 配送区域 delivery_area）
-- 依据   : DESIGN_P2_数据库设计.md §三 D2
-- 数据   : region 实际行数据由 seeds/02_region.sql 加载（国家统计局官方数据）
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) region —— 行政区划
-- 数据源：国家统计局《统计用区划代码和城乡划分代码》（2024 版本）
-- 层级：1 省 / 自治区 / 直辖市，2 市 / 地区 / 自治州，3 区 / 县
-- 自引用：parent_code 指向上级 region.code（省的 parent_code = '0'）
-- ============================================================================
DROP TABLE IF EXISTS `region`;
CREATE TABLE `region` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID（行政区划平台级共享，固定 1；为对齐标配五字段保留列）',
  `code`            CHAR(6)          NOT NULL                COMMENT '行政区划代码（国家统计局 6 位）',
  `parent_code`     CHAR(6)          NOT NULL DEFAULT '0'    COMMENT '上级代码（省级 = 0）',
  `level`           TINYINT UNSIGNED NOT NULL                COMMENT '层级：1 省 / 2 市 / 3 区/县',
  `name`            VARCHAR(64)      NOT NULL                COMMENT '完整名称（例：北京市朝阳区）',
  `short_name`      VARCHAR(32)      NULL                    COMMENT '简称（例：朝阳区）',
  `pinyin`          VARCHAR(64)      NULL                    COMMENT '拼音（用于按字母索引）',
  `pinyin_initial`  CHAR(1)          NULL                    COMMENT '首字母（A-Z）',
  `lng`             DECIMAL(10,7)    NULL                    COMMENT '中心点经度（GCJ-02）',
  `lat`             DECIMAL(10,7)    NULL                    COMMENT '中心点纬度',
  `sort`            INT              NOT NULL DEFAULT 0      COMMENT '排序权重',
  `is_hot`          TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '热门城市：0 否 / 1 是（首页置顶）',
  `is_open`         TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '业务是否开通：0 未开通 / 1 已开通',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code`     (`code`)                          COMMENT '行政区划代码唯一',
  KEY `idx_parent_level`   (`parent_code`,`level`)           COMMENT '按父节点+层级查子区划',
  KEY `idx_level_open`     (`level`,`is_open`)               COMMENT '查已开通的某层级城市',
  KEY `idx_hot`            (`is_hot`,`level`)                COMMENT '热门城市'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行政区划（国家统计局 6 位代码）';


-- ============================================================================
-- 2) delivery_area —— 配送区域（多边形围栏）
-- 对应 PRD §3.2.2.3 配送范围自定义 / §3.4.7.4 区域管理
-- 几何方案：使用 JSON 列存 GeoJSON（DESIGN §三 D2 明确优先 JSON）
--           应用层用 turf.js 做点-多边形判断；后续业务量大可改 ST_Geometry
-- 适用：    type=1 商户店铺自定义配送圈；type=2 平台跑腿服务区
-- ============================================================================
DROP TABLE IF EXISTS `delivery_area`;
CREATE TABLE `delivery_area` (
  `id`              BIGINT UNSIGNED  NOT NULL                COMMENT '主键，雪花 ID',
  `tenant_id`       INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '租户 ID',
  `area_type`       TINYINT UNSIGNED NOT NULL                COMMENT '区域类型：1 商户配送圈 / 2 平台跑腿服务区',
  `owner_id`        BIGINT UNSIGNED  NULL                    COMMENT '归属 ID（type=1→shop.id，type=2→NULL）',
  `name`            VARCHAR(64)      NOT NULL                COMMENT '区域名称（例：朝阳区跑腿服务范围）',
  `city_code`       CHAR(6)          NOT NULL                COMMENT '所属城市编码（→ region.code，level=2）',
  `polygon`         JSON             NOT NULL                COMMENT 'GeoJSON Polygon（[[lng,lat],...]）',
  `delivery_fee`    DECIMAL(8,2)     NULL                    COMMENT '基础配送费（type=1 时使用）',
  `min_order`       DECIMAL(8,2)     NULL                    COMMENT '起送价（type=1 时使用）',
  `extra_fee_rule`  JSON             NULL                    COMMENT '阶梯加价规则（按距离/重量；JSON 数组）',
  `priority`        INT              NOT NULL DEFAULT 0      COMMENT '优先级（同店多区域时大→优先）',
  `status`          TINYINT UNSIGNED NOT NULL DEFAULT 1      COMMENT '状态：0 停用 / 1 启用',
  `is_deleted`      TINYINT UNSIGNED NOT NULL DEFAULT 0      COMMENT '软删',
  `created_at`      DATETIME(3)      NOT NULL                COMMENT '创建时间',
  `updated_at`      DATETIME(3)      NOT NULL                COMMENT '更新时间',
  `deleted_at`      DATETIME(3)      NULL                    COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_owner_type` (`area_type`,`owner_id`,`status`)    COMMENT '按归属查启用的配送区域',
  KEY `idx_city_status` (`city_code`,`status`)              COMMENT '城市+启用状态聚合'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='配送区域（多边形围栏，GeoJSON）';

-- ============================================================================
-- END 02_region.sql —— 共 2 张表（region / delivery_area）
-- 实际行政区划数据由 seeds/02_region.sql 加载
-- ============================================================================
