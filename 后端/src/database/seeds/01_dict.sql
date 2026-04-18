-- ============================================================================
-- 文件名 : 01_dict.sql
-- 阶段   : P2 数据库设计 / T2.12 sys_dict seed
-- 用途   : 初始化字典数据
-- 依据   : PRD §3.4.9.2 字典管理 / TASK §2.12 提示词清单
-- 涵盖   : 订单状态(外卖10/跑腿10) / 支付方式 / 支付状态 / 违规类型 /
--          行业分类 / 骑手等级 / 售后原因 / 取消原因 / 转单原因 /
--          异常类型 / 投诉分类 / 工单分类 / 奖励原因 / 跑腿服务类型 /
--          跑腿物品类型
-- 重复执行: 使用 DELETE + INSERT，与 schema migration 一样可幂等重置
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- 清理旧 seed（仅 is_system=1 的内置数据；运营自建数据保留）
DELETE FROM `sys_dict` WHERE `is_system` = 1;

-- ----------------------------------------------------------------------------
-- 1) order_takeout_status —— 外卖订单状态（10 档，与 04_order.sql 头部枚举对齐）
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1001, 1, 'order_takeout_status', '0',  '待支付',          'PENDING_PAY',     JSON_OBJECT('color','#f59e0b'), 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1002, 1, 'order_takeout_status', '5',  '已关闭(支付超时)','PAY_TIMEOUT',     JSON_OBJECT('color','#9ca3af'), 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1003, 1, 'order_takeout_status', '10', '待接单',          'WAIT_ACCEPT',     JSON_OBJECT('color','#3b82f6'), 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1004, 1, 'order_takeout_status', '20', '已接单待出餐',    'WAIT_PREPARE',    JSON_OBJECT('color','#3b82f6'), 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1005, 1, 'order_takeout_status', '30', '出餐完成待取',    'WAIT_PICKUP',     JSON_OBJECT('color','#06b6d4'), 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1006, 1, 'order_takeout_status', '40', '配送中',          'DELIVERING',      JSON_OBJECT('color','#06b6d4'), 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1007, 1, 'order_takeout_status', '50', '已送达待确认',    'WAIT_CONFIRM',    JSON_OBJECT('color','#10b981'), 70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1008, 1, 'order_takeout_status', '55', '已完成',          'FINISHED',        JSON_OBJECT('color','#10b981'), 80, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1009, 1, 'order_takeout_status', '60', '已取消',          'CANCELED',        JSON_OBJECT('color','#9ca3af'), 90, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1010, 1, 'order_takeout_status', '70', '售后中',          'AFTER_SALE',      JSON_OBJECT('color','#ef4444'),100, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 2) order_errand_status —— 跑腿订单状态（10 档）
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1101, 1, 'order_errand_status', '0',  '待支付',          'PENDING_PAY',  JSON_OBJECT('color','#f59e0b'), 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1102, 1, 'order_errand_status', '5',  '已关闭(支付超时)','PAY_TIMEOUT',  JSON_OBJECT('color','#9ca3af'), 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1103, 1, 'order_errand_status', '10', '待接单',          'WAIT_ACCEPT',  JSON_OBJECT('color','#3b82f6'), 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1104, 1, 'order_errand_status', '20', '骑手已接单',      'ACCEPTED',     JSON_OBJECT('color','#3b82f6'), 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1105, 1, 'order_errand_status', '30', '已取件',          'PICKED',       JSON_OBJECT('color','#06b6d4'), 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1106, 1, 'order_errand_status', '40', '配送中',          'DELIVERING',   JSON_OBJECT('color','#06b6d4'), 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1107, 1, 'order_errand_status', '50', '已送达待确认',    'WAIT_CONFIRM', JSON_OBJECT('color','#10b981'), 70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1108, 1, 'order_errand_status', '55', '已完成',          'FINISHED',     JSON_OBJECT('color','#10b981'), 80, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1109, 1, 'order_errand_status', '60', '已取消',          'CANCELED',     JSON_OBJECT('color','#9ca3af'), 90, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1110, 1, 'order_errand_status', '70', '售后中',          'AFTER_SALE',   JSON_OBJECT('color','#ef4444'),100, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 3) pay_method —— 支付方式
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1201, 1, 'pay_method', '1', '微信支付', 'WECHAT',  JSON_OBJECT('icon','wechat_pay'),  10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1202, 1, 'pay_method', '2', '支付宝',   'ALIPAY',  JSON_OBJECT('icon','alipay'),      20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1203, 1, 'pay_method', '3', '余额支付', 'BALANCE', JSON_OBJECT('icon','wallet'),      30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1204, 1, 'pay_method', '4', '混合支付', 'MIXED',   JSON_OBJECT('icon','mixed'),       40, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 4) pay_status —— 支付状态
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1301, 1, 'pay_status', '0', '未支付',     'UNPAID',          NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1302, 1, 'pay_status', '1', '支付中',     'PAYING',          NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1303, 1, 'pay_status', '2', '已支付',     'PAID',            NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1304, 1, 'pay_status', '3', '已退款',     'REFUNDED',        NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1305, 1, 'pay_status', '4', '部分退款',   'PARTIAL_REFUND',  NULL, 50, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 5) violation_type —— 违规类型（用户/商户/骑手通用，extra.target 区分）
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1401, 1, 'violation_type', 'V001', '虚假下单',         'FAKE_ORDER',          JSON_OBJECT('target','user,rider'),     10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1402, 1, 'violation_type', 'V002', '恶意差评',         'MALICIOUS_REVIEW',    JSON_OBJECT('target','user'),           20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1403, 1, 'violation_type', 'V003', '套现刷单',         'CASH_OUT',            JSON_OBJECT('target','user,merchant'),  30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1404, 1, 'violation_type', 'V004', '商品违规',         'ILLEGAL_PRODUCT',     JSON_OBJECT('target','merchant'),       40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1405, 1, 'violation_type', 'V005', '资质过期',         'EXPIRED_QUAL',        JSON_OBJECT('target','merchant,rider'), 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1406, 1, 'violation_type', 'V006', '骑手违规接单',     'RIDER_FAKE_ACCEPT',   JSON_OBJECT('target','rider'),          60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1407, 1, 'violation_type', 'V007', '骑手代刷',         'RIDER_BRUSH',         JSON_OBJECT('target','rider'),          70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1408, 1, 'violation_type', 'V008', '严重投诉',         'SEVERE_COMPLAINT',    JSON_OBJECT('target','merchant,rider'), 80, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 6) industry —— 商家行业分类（菜系/便利店等）
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1501, 1, 'industry', 'IND_FAST',     '快餐简餐',     'fast_food',      NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1502, 1, 'industry', 'IND_CHN',      '中餐',         'chinese',        NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1503, 1, 'industry', 'IND_HOTPOT',   '火锅烧烤',     'hotpot',         NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1504, 1, 'industry', 'IND_WEST',     '西餐',         'western',        NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1505, 1, 'industry', 'IND_DRINK',    '饮品甜品',     'drinks',         NULL, 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1506, 1, 'industry', 'IND_DESSERT',  '面包蛋糕',     'dessert',        NULL, 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1507, 1, 'industry', 'IND_BREAK',    '早餐粥铺',     'breakfast',      NULL, 70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1508, 1, 'industry', 'IND_CONV',     '便利店',       'convenience',    NULL, 80, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1509, 1, 'industry', 'IND_SUPER',    '商超',         'supermarket',    NULL, 90, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1510, 1, 'industry', 'IND_FRUIT',    '水果生鲜',     'fruit',          NULL,100, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1511, 1, 'industry', 'IND_PHARM',    '药店',         'pharmacy',       NULL,110, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1512, 1, 'industry', 'IND_FLOWER',   '鲜花蛋糕',     'flower_cake',    NULL,120, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 7) rider_level —— 骑手等级
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1601, 1, 'rider_level', '1', '青铜骑手', 'L1', JSON_OBJECT('min_score',0,    'max_score',299,  'fee_rate',1.0),  10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1602, 1, 'rider_level', '2', '白银骑手', 'L2', JSON_OBJECT('min_score',300,  'max_score',999,  'fee_rate',1.05), 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1603, 1, 'rider_level', '3', '黄金骑手', 'L3', JSON_OBJECT('min_score',1000, 'max_score',2999, 'fee_rate',1.10), 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1604, 1, 'rider_level', '4', '铂金骑手', 'L4', JSON_OBJECT('min_score',3000, 'max_score',7999, 'fee_rate',1.15), 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1605, 1, 'rider_level', '5', '钻石骑手', 'L5', JSON_OBJECT('min_score',8000, 'max_score',999999,'fee_rate',1.20),50, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 8) aftersale_reason —— 售后原因
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1701, 1, 'aftersale_reason', 'AS001', '商品质量问题',         'QUALITY',           NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1702, 1, 'aftersale_reason', 'AS002', '商品与描述不符',       'NOT_MATCH',         NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1703, 1, 'aftersale_reason', 'AS003', '少送/漏送',            'MISSING',           NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1704, 1, 'aftersale_reason', 'AS004', '商品损坏',             'DAMAGED',           NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1705, 1, 'aftersale_reason', 'AS005', '送错商品',             'WRONG_ITEM',        NULL, 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1706, 1, 'aftersale_reason', 'AS006', '配送超时',             'DELIVERY_TIMEOUT',  NULL, 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1707, 1, 'aftersale_reason', 'AS007', '商家服务态度差',       'BAD_SERVICE',       NULL, 70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1708, 1, 'aftersale_reason', 'AS008', '骑手服务态度差',       'BAD_RIDER',         NULL, 80, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1709, 1, 'aftersale_reason', 'AS009', '其他',                 'OTHER',             NULL, 99, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 9) cancel_reason —— 取消原因
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1801, 1, 'cancel_reason', 'CR001', '我不想买了',           'USER_CHANGE_MIND',  JSON_OBJECT('actor','user'),     10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1802, 1, 'cancel_reason', 'CR002', '信息填写错误',         'INFO_WRONG',        JSON_OBJECT('actor','user'),     20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1803, 1, 'cancel_reason', 'CR003', '商家长时间未接单',     'MERCHANT_NOT_ACCEPT',JSON_OBJECT('actor','user'),    30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1804, 1, 'cancel_reason', 'CR004', '商品缺货',             'OUT_OF_STOCK',      JSON_OBJECT('actor','merchant'), 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1805, 1, 'cancel_reason', 'CR005', '商家暂停营业',         'SHOP_CLOSED',       JSON_OBJECT('actor','merchant'), 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1806, 1, 'cancel_reason', 'CR006', '配送范围超出',         'OUT_OF_AREA',       JSON_OBJECT('actor','merchant'), 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1807, 1, 'cancel_reason', 'CR007', '系统支付超时',         'PAY_TIMEOUT',       JSON_OBJECT('actor','system'),   70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1808, 1, 'cancel_reason', 'CR008', '其他',                 'OTHER',             NULL,                            99, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 10) transfer_reason —— 骑手转单原因
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(1901, 1, 'transfer_reason', 'TR001', '车辆故障', 'VEHICLE_FAILURE',   NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1902, 1, 'transfer_reason', 'TR002', '突发事件', 'EMERGENCY',         NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1903, 1, 'transfer_reason', 'TR003', '路线冲突', 'ROUTE_CONFLICT',    NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1904, 1, 'transfer_reason', 'TR004', '身体不适', 'HEALTH',            NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(1905, 1, 'transfer_reason', 'TR005', '其他',     'OTHER',             NULL, 99, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 11) abnormal_type —— 异常上报类型
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(2001, 1, 'abnormal_type', 'AB001', '联系不上用户',     'USER_UNREACHABLE',     NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2002, 1, 'abnormal_type', 'AB002', '联系不上商家',     'MERCHANT_UNREACHABLE', NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2003, 1, 'abnormal_type', 'AB003', '商家出餐慢',       'SLOW_PREPARE',         NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2004, 1, 'abnormal_type', 'AB004', '物品破损',         'ITEM_DAMAGED',         NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2005, 1, 'abnormal_type', 'AB005', '地址错误',         'WRONG_ADDRESS',        NULL, 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2006, 1, 'abnormal_type', 'AB006', '骑手交通事故',     'RIDER_ACCIDENT',       NULL, 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2007, 1, 'abnormal_type', 'AB007', '其他',             'OTHER',                NULL, 99, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 12) complaint_category —— 投诉分类
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(2101, 1, 'complaint_category', 'CC001', '商家服务问题',     'SERVICE',         NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2102, 1, 'complaint_category', 'CC002', '骑手服务问题',     'RIDER_SERVICE',   NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2103, 1, 'complaint_category', 'CC003', '商品质量问题',     'PRODUCT_QUALITY', NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2104, 1, 'complaint_category', 'CC004', '配送问题',         'DELIVERY',        NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2105, 1, 'complaint_category', 'CC005', '支付问题',         'PAYMENT',         NULL, 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2106, 1, 'complaint_category', 'CC006', '退款纠纷',         'REFUND',          NULL, 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2107, 1, 'complaint_category', 'CC007', '隐私安全',         'PRIVACY',         NULL, 70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2108, 1, 'complaint_category', 'CC008', '其他',             'OTHER',           NULL, 99, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 13) ticket_category —— 工单分类
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(2201, 1, 'ticket_category', 'TC001', '咨询',         'CONSULT',     NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2202, 1, 'ticket_category', 'TC002', '账户问题',     'ACCOUNT',     NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2203, 1, 'ticket_category', 'TC003', '订单问题',     'ORDER',       NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2204, 1, 'ticket_category', 'TC004', '财务问题',     'FINANCE',     NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2205, 1, 'ticket_category', 'TC005', '功能建议',     'SUGGESTION',  NULL, 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2206, 1, 'ticket_category', 'TC006', '系统故障',     'SYSTEM_BUG',  NULL, 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2207, 1, 'ticket_category', 'TC007', '其他',         'OTHER',       NULL, 99, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 14) reward_reason —— 骑手奖惩原因
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(2301, 1, 'reward_reason', 'RW001', '准时配送奖励',   'ON_TIME',          JSON_OBJECT('reward_type',1), 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2302, 1, 'reward_reason', 'RW002', '好评奖励',       'GOOD_REVIEW',      JSON_OBJECT('reward_type',1), 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2303, 1, 'reward_reason', 'RW003', '高峰补贴',       'PEAK_SUBSIDY',     JSON_OBJECT('reward_type',3), 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2304, 1, 'reward_reason', 'RW004', '完成单量奖励',   'VOLUME',           JSON_OBJECT('reward_type',1), 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2305, 1, 'reward_reason', 'RW005', '配送超时罚款',   'DELIVERY_TIMEOUT', JSON_OBJECT('reward_type',2), 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2306, 1, 'reward_reason', 'RW006', '差评罚款',       'BAD_REVIEW',       JSON_OBJECT('reward_type',2), 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2307, 1, 'reward_reason', 'RW007', '违规接单罚款',   'FAKE_ACCEPT',      JSON_OBJECT('reward_type',2), 70, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2308, 1, 'reward_reason', 'RW008', '损坏物品赔付',   'ITEM_DAMAGE',      JSON_OBJECT('reward_type',2), 80, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2309, 1, 'reward_reason', 'RW009', '等级升降',       'LEVEL_CHANGE',     JSON_OBJECT('reward_type',4), 90, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 15) errand_service_type —— 跑腿服务类型
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(2401, 1, 'errand_service_type', '1', '帮送',     'DELIVER',  JSON_OBJECT('icon','box'),    10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2402, 1, 'errand_service_type', '2', '帮取',     'PICKUP',   JSON_OBJECT('icon','pickup'), 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2403, 1, 'errand_service_type', '3', '帮买',     'BUY',      JSON_OBJECT('icon','cart'),   30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2404, 1, 'errand_service_type', '4', '帮排队',   'QUEUE',    JSON_OBJECT('icon','queue'),  40, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 16) errand_item_type —— 跑腿物品类型
-- ----------------------------------------------------------------------------
INSERT INTO `sys_dict` (`id`,`tenant_id`,`dict_type`,`dict_code`,`dict_label`,`dict_value`,`extra`,`sort`,`is_system`,`description`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(2501, 1, 'errand_item_type', 'IT001', '文件资料',     'DOCUMENT', NULL, 10, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2502, 1, 'errand_item_type', 'IT002', '日用百货',     'DAILY',    NULL, 20, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2503, 1, 'errand_item_type', 'IT003', '食品饮料',     'FOOD',     NULL, 30, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2504, 1, 'errand_item_type', 'IT004', '数码电子',     'ELECTRIC', NULL, 40, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2505, 1, 'errand_item_type', 'IT005', '服装鞋包',     'CLOTHING', NULL, 50, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2506, 1, 'errand_item_type', 'IT006', '鲜花蛋糕',     'FLOWER',   NULL, 60, 1, NULL, 1, 0, NOW(3), NOW(3)),
(2507, 1, 'errand_item_type', 'IT007', '其他',         'OTHER',    NULL, 99, 1, NULL, 1, 0, NOW(3), NOW(3));

-- ----------------------------------------------------------------------------
-- 校验：当前 sys_dict 中各类型记录数
-- ----------------------------------------------------------------------------
SELECT
  `dict_type`,
  COUNT(*) AS items_count
FROM `sys_dict`
WHERE `is_system` = 1 AND `is_deleted` = 0
GROUP BY `dict_type`
ORDER BY `dict_type`;

-- ============================================================================
-- END 01_dict.sql —— 共 16 个 dict_type，~108 条字典项
-- ============================================================================
