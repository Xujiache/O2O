-- ============================================================================
-- 文件名 : 03_rbac.sql
-- 阶段   : P2 数据库设计 / T2.14 RBAC seed
-- 用途   : 初始化角色（5 个）+ 权限点（菜单/按钮/接口三层）+ 角色↔权限 关联
-- 依据   : PRD §3.4 全部 10 大模块 / §3.4.9.1 权限管理
--          提示词："5 个角色：超级管理员 / 运营 / 财务 / 客服 / 风控"
--          permission 三层：resource_type=1 菜单 / 2 按钮 / 3 接口
-- 注意   : 超级管理员 super_admin 通过 admin.is_super=1 实现"全权"，
--          不在 role_permission 中显式列权限（保持表数据简洁，避免数据膨胀）
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 0) 清理旧 seed
-- ============================================================================
DELETE FROM `role_permission` WHERE 1=1;
DELETE FROM `permission` WHERE 1=1;
DELETE FROM `role` WHERE 1=1;

-- ============================================================================
-- 1) role —— 5 个角色
-- ============================================================================
INSERT INTO `role` (`id`,`tenant_id`,`role_code`,`role_name`,`description`,`data_scope`,`sort`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(6001, 1, 'super_admin', '超级管理员', '系统最高权限，admin.is_super=1 时使用；不依赖 role_permission', 1, 10, 1, 0, NOW(3), NOW(3)),
(6002, 1, 'operation',   '运营',       '负责商户/骑手审核、运营内容、订单运营、营销活动',                 1, 20, 1, 0, NOW(3), NOW(3)),
(6003, 1, 'finance',     '财务',       '负责支付/退款/分账/提现/对账/发票',                                1, 30, 1, 0, NOW(3), NOW(3)),
(6004, 1, 'cs',          '客服',       '负责工单、投诉、售后、用户/商户/骑手协助',                          1, 40, 1, 0, NOW(3), NOW(3)),
(6005, 1, 'risk_control','风控',       '负责黑名单、异常监控、违规处理、刷单识别',                          1, 50, 1, 0, NOW(3), NOW(3));

-- ============================================================================
-- 2) permission —— 菜单（resource_type=1）
-- 树形结构：parent_id=0 为顶级菜单
-- ============================================================================
-- 2.1 顶级菜单（与 PRD §3.4 十大模块一致；id 3001~3010）
INSERT INTO `permission` (`id`,`tenant_id`,`parent_id`,`resource_type`,`resource_code`,`resource_name`,`action`,`icon`,`sort`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(3001, 1, 0, 1, 'dashboard',          '数据大盘',           NULL, 'dashboard',         10, 1, 0, NOW(3), NOW(3)),
(3002, 1, 0, 1, 'user_mgmt',          '用户管理',           NULL, 'user',              20, 1, 0, NOW(3), NOW(3)),
(3003, 1, 0, 1, 'merchant_mgmt',      '商户管理',           NULL, 'shop',              30, 1, 0, NOW(3), NOW(3)),
(3004, 1, 0, 1, 'rider_mgmt',         '骑手管理',           NULL, 'truck',             40, 1, 0, NOW(3), NOW(3)),
(3005, 1, 0, 1, 'order_mgmt',         '订单管理',           NULL, 'order',             50, 1, 0, NOW(3), NOW(3)),
(3006, 1, 0, 1, 'product_content',    '商品与内容管理',     NULL, 'product',           60, 1, 0, NOW(3), NOW(3)),
(3007, 1, 0, 1, 'operation_mgmt',     '运营管理',           NULL, 'megaphone',         70, 1, 0, NOW(3), NOW(3)),
(3008, 1, 0, 1, 'finance_mgmt',       '财务管理',           NULL, 'wallet',            80, 1, 0, NOW(3), NOW(3)),
(3009, 1, 0, 1, 'system_mgmt',        '系统管理',           NULL, 'settings',          90, 1, 0, NOW(3), NOW(3)),
(3010, 1, 0, 1, 'cs_risk_mgmt',       '客服与风控',         NULL, 'shield',           100, 1, 0, NOW(3), NOW(3));

-- 2.2 二级菜单（id 3101~ ；parent_id 指向上面）
INSERT INTO `permission` (`id`,`tenant_id`,`parent_id`,`resource_type`,`resource_code`,`resource_name`,`action`,`icon`,`sort`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
-- 数据大盘
(3101, 1, 3001, 1, 'dashboard.overview',     '核心数据概览',     NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3102, 1, 3001, 1, 'dashboard.trend',        '数据趋势图',       NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3103, 1, 3001, 1, 'dashboard.realtime',     '实时监控',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
-- 用户管理
(3201, 1, 3002, 1, 'user_mgmt.list',         '用户列表',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3202, 1, 3002, 1, 'user_mgmt.detail',       '用户详情',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3203, 1, 3002, 1, 'user_mgmt.risk',         '用户风控',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
-- 商户管理
(3301, 1, 3003, 1, 'merchant_mgmt.audit',    '入驻审核',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3302, 1, 3003, 1, 'merchant_mgmt.list',     '商户列表',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3303, 1, 3003, 1, 'merchant_mgmt.shop',     '店铺管理',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
(3304, 1, 3003, 1, 'merchant_mgmt.risk',     '商户风控',         NULL, NULL, 40, 1, 0, NOW(3), NOW(3)),
-- 骑手管理
(3401, 1, 3004, 1, 'rider_mgmt.audit',       '入驻审核',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3402, 1, 3004, 1, 'rider_mgmt.list',        '骑手列表',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3403, 1, 3004, 1, 'rider_mgmt.delivery',    '配送管理',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
(3404, 1, 3004, 1, 'rider_mgmt.reward',      '奖惩管理',         NULL, NULL, 40, 1, 0, NOW(3), NOW(3)),
(3405, 1, 3004, 1, 'rider_mgmt.risk',        '骑手风控',         NULL, NULL, 50, 1, 0, NOW(3), NOW(3)),
-- 订单管理
(3501, 1, 3005, 1, 'order_mgmt.list',        '全量订单',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3502, 1, 3005, 1, 'order_mgmt.detail',      '订单详情',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3503, 1, 3005, 1, 'order_mgmt.abnormal',    '异常订单',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
(3504, 1, 3005, 1, 'order_mgmt.export',      '订单导出',         NULL, NULL, 40, 1, 0, NOW(3), NOW(3)),
-- 商品与内容
(3601, 1, 3006, 1, 'product_content.product','商品管理',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3602, 1, 3006, 1, 'product_content.banner', '内容/Banner',      NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3603, 1, 3006, 1, 'product_content.review', '评价管理',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
-- 运营管理
(3701, 1, 3007, 1, 'operation.coupon',       '优惠活动管理',     NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3702, 1, 3007, 1, 'operation.activity',     '营销活动',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3703, 1, 3007, 1, 'operation.push',         '消息推送',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
(3704, 1, 3007, 1, 'operation.region',       '区域管理',         NULL, NULL, 40, 1, 0, NOW(3), NOW(3)),
-- 财务管理
(3801, 1, 3008, 1, 'finance.overview',       '财务概览',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3802, 1, 3008, 1, 'finance.settle',         '分账管理',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3803, 1, 3008, 1, 'finance.withdraw',       '提现管理',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
(3804, 1, 3008, 1, 'finance.bill',           '账单管理',         NULL, NULL, 40, 1, 0, NOW(3), NOW(3)),
(3805, 1, 3008, 1, 'finance.invoice',        '发票管理',         NULL, NULL, 50, 1, 0, NOW(3), NOW(3)),
-- 系统管理
(3901, 1, 3009, 1, 'system.role',            '权限管理',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3902, 1, 3009, 1, 'system.dict',            '字典管理',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3903, 1, 3009, 1, 'system.log',             '日志管理',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3)),
(3904, 1, 3009, 1, 'system.config',          '系统设置',         NULL, NULL, 40, 1, 0, NOW(3), NOW(3)),
-- 客服与风控
(3911, 1, 3010, 1, 'cs.ticket',              '工单管理',         NULL, NULL, 10, 1, 0, NOW(3), NOW(3)),
(3912, 1, 3010, 1, 'cs.arbitration',         '仲裁管理',         NULL, NULL, 20, 1, 0, NOW(3), NOW(3)),
(3913, 1, 3010, 1, 'cs.risk',                '风控管理',         NULL, NULL, 30, 1, 0, NOW(3), NOW(3));

-- ============================================================================
-- 3) permission —— 按钮（resource_type=2，挂在二级菜单下）
-- ============================================================================
INSERT INTO `permission` (`id`,`tenant_id`,`parent_id`,`resource_type`,`resource_code`,`resource_name`,`action`,`icon`,`sort`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
-- 用户管理按钮
(4001, 1, 3201, 2, 'user_mgmt.list.search', '查询用户',     'list',   NULL, 10, 1, 0, NOW(3), NOW(3)),
(4002, 1, 3201, 2, 'user_mgmt.list.export', '导出用户',     'export', NULL, 20, 1, 0, NOW(3), NOW(3)),
(4003, 1, 3203, 2, 'user_mgmt.risk.ban',    '封禁用户',     'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4004, 1, 3203, 2, 'user_mgmt.risk.unban',  '解封用户',     'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
-- 商户审核按钮
(4101, 1, 3301, 2, 'merchant_mgmt.audit.pass',   '审核通过', 'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4102, 1, 3301, 2, 'merchant_mgmt.audit.reject', '审核驳回', 'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
(4103, 1, 3302, 2, 'merchant_mgmt.list.ban',     '封禁商户', 'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
-- 骑手审核按钮
(4201, 1, 3401, 2, 'rider_mgmt.audit.pass',   '审核通过',  'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4202, 1, 3401, 2, 'rider_mgmt.audit.reject', '审核驳回',  'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
(4203, 1, 3404, 2, 'rider_mgmt.reward.add',   '新增奖惩',  'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
-- 订单按钮
(4301, 1, 3501, 2, 'order_mgmt.list.search', '查询订单', 'list',   NULL, 10, 1, 0, NOW(3), NOW(3)),
(4302, 1, 3504, 2, 'order_mgmt.export',      '导出订单', 'export', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4303, 1, 3503, 2, 'order_mgmt.abnormal.handle', '处理异常订单', 'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
-- 财务按钮
(4401, 1, 3803, 2, 'finance.withdraw.audit', '审核提现', 'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4402, 1, 3805, 2, 'finance.invoice.issue',  '开票',     'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4403, 1, 3804, 2, 'finance.bill.recon',     '执行对账', 'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
-- 客服按钮
(4501, 1, 3911, 2, 'cs.ticket.assign', '指派工单', 'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4502, 1, 3911, 2, 'cs.ticket.close',  '关闭工单', 'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
(4503, 1, 3912, 2, 'cs.arbitration.judge', '裁决仲裁', 'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
-- 风控按钮
(4601, 1, 3913, 2, 'cs.risk.blacklist.add',    '加入黑名单', 'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4602, 1, 3913, 2, 'cs.risk.blacklist.remove', '移除黑名单', 'delete', NULL, 20, 1, 0, NOW(3), NOW(3)),
-- 运营按钮
(4701, 1, 3701, 2, 'operation.coupon.create', '新建券',     'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4702, 1, 3702, 2, 'operation.activity.create','新建活动',  'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4703, 1, 3703, 2, 'operation.push.send',     '发送推送',   'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
-- 系统按钮
(4801, 1, 3901, 2, 'system.role.create', '新建角色',     'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4802, 1, 3901, 2, 'system.role.update', '编辑角色',     'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
(4803, 1, 3902, 2, 'system.dict.update', '维护字典',     'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(4804, 1, 3904, 2, 'system.config.update','修改配置',    'update', NULL, 10, 1, 0, NOW(3), NOW(3));

-- ============================================================================
-- 4) permission —— 接口（resource_type=3，挂在按钮或菜单下，用 method:path 编码）
-- 仅录入代表性接口；P3 阶段接口 controller 完整后再追加
-- ============================================================================
INSERT INTO `permission` (`id`,`tenant_id`,`parent_id`,`resource_type`,`resource_code`,`resource_name`,`action`,`icon`,`sort`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES
(5001, 1, 4001, 3, 'GET:/api/admin/users',                  '用户列表 API',     'list',   NULL, 10, 1, 0, NOW(3), NOW(3)),
(5002, 1, 4002, 3, 'POST:/api/admin/users/export',          '用户导出 API',     'export', NULL, 20, 1, 0, NOW(3), NOW(3)),
(5003, 1, 4003, 3, 'POST:/api/admin/users/{id}/ban',        '用户封禁 API',     'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
(5004, 1, 4101, 3, 'POST:/api/admin/merchants/{id}/audit',  '商户审核 API',     'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(5005, 1, 4201, 3, 'POST:/api/admin/riders/{id}/audit',     '骑手审核 API',     'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
(5006, 1, 4301, 3, 'GET:/api/admin/orders',                 '订单列表 API',     'list',   NULL, 10, 1, 0, NOW(3), NOW(3)),
(5007, 1, 4302, 3, 'POST:/api/admin/orders/export',         '订单导出 API',     'export', NULL, 20, 1, 0, NOW(3), NOW(3)),
(5008, 1, 4401, 3, 'POST:/api/admin/withdraws/{id}/audit',  '提现审核 API',     'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(5009, 1, 4402, 3, 'POST:/api/admin/invoices/{id}/issue',   '开票 API',         'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
(5010, 1, 4501, 3, 'POST:/api/admin/tickets/{id}/assign',   '工单指派 API',     'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
(5011, 1, 4503, 3, 'POST:/api/admin/arbitrations/{id}/judge','仲裁裁决 API',    'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
(5012, 1, 4601, 3, 'POST:/api/admin/blacklist',             '加入黑名单 API',   'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
(5013, 1, 4602, 3, 'DELETE:/api/admin/blacklist/{id}',      '移除黑名单 API',   'delete', NULL, 20, 1, 0, NOW(3), NOW(3)),
(5014, 1, 4701, 3, 'POST:/api/admin/coupons',               '创建券 API',       'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
(5015, 1, 4801, 3, 'POST:/api/admin/roles',                 '创建角色 API',     'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
(5016, 1, 4803, 3, 'PUT:/api/admin/dicts/{type}',           '维护字典 API',     'update', NULL, 20, 1, 0, NOW(3), NOW(3));

-- ============================================================================
-- 5) role_permission —— 角色↔权限 关联
-- 超级管理员 super_admin (6001)：通过 admin.is_super=1 自动放行，不录关联
-- 运营 operation (6002)：商户/骑手/订单/商品/运营/系统(读)/客服 工作台 + 大盘
-- 财务 finance (6003)：财务全部 + 大盘 + 订单查看
-- 客服 cs (6004)：客服 + 工单 + 订单查看 + 用户/商户/骑手 详情
-- 风控 risk_control (6005)：风控相关 + 黑名单管理
-- ============================================================================

-- 5.1 运营 operation
INSERT INTO `role_permission` (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`) VALUES
(6002, 3001,1,0,NOW(3),NOW(3)),(6002, 3101,1,0,NOW(3),NOW(3)),(6002, 3102,1,0,NOW(3),NOW(3)),(6002, 3103,1,0,NOW(3),NOW(3)),
(6002, 3002,1,0,NOW(3),NOW(3)),(6002, 3201,1,0,NOW(3),NOW(3)),(6002, 3202,1,0,NOW(3),NOW(3)),
(6002, 3003,1,0,NOW(3),NOW(3)),(6002, 3301,1,0,NOW(3),NOW(3)),(6002, 3302,1,0,NOW(3),NOW(3)),(6002, 3303,1,0,NOW(3),NOW(3)),
(6002, 3004,1,0,NOW(3),NOW(3)),(6002, 3401,1,0,NOW(3),NOW(3)),(6002, 3402,1,0,NOW(3),NOW(3)),(6002, 3403,1,0,NOW(3),NOW(3)),(6002, 3404,1,0,NOW(3),NOW(3)),
(6002, 3005,1,0,NOW(3),NOW(3)),(6002, 3501,1,0,NOW(3),NOW(3)),(6002, 3502,1,0,NOW(3),NOW(3)),(6002, 3503,1,0,NOW(3),NOW(3)),(6002, 3504,1,0,NOW(3),NOW(3)),
(6002, 3006,1,0,NOW(3),NOW(3)),(6002, 3601,1,0,NOW(3),NOW(3)),(6002, 3602,1,0,NOW(3),NOW(3)),(6002, 3603,1,0,NOW(3),NOW(3)),
(6002, 3007,1,0,NOW(3),NOW(3)),(6002, 3701,1,0,NOW(3),NOW(3)),(6002, 3702,1,0,NOW(3),NOW(3)),(6002, 3703,1,0,NOW(3),NOW(3)),(6002, 3704,1,0,NOW(3),NOW(3)),
(6002, 4001,1,0,NOW(3),NOW(3)),(6002, 4002,1,0,NOW(3),NOW(3)),
(6002, 4101,1,0,NOW(3),NOW(3)),(6002, 4102,1,0,NOW(3),NOW(3)),(6002, 4103,1,0,NOW(3),NOW(3)),
(6002, 4201,1,0,NOW(3),NOW(3)),(6002, 4202,1,0,NOW(3),NOW(3)),(6002, 4203,1,0,NOW(3),NOW(3)),
(6002, 4301,1,0,NOW(3),NOW(3)),(6002, 4302,1,0,NOW(3),NOW(3)),(6002, 4303,1,0,NOW(3),NOW(3)),
(6002, 4701,1,0,NOW(3),NOW(3)),(6002, 4702,1,0,NOW(3),NOW(3)),(6002, 4703,1,0,NOW(3),NOW(3)),
(6002, 5001,1,0,NOW(3),NOW(3)),(6002, 5002,1,0,NOW(3),NOW(3)),(6002, 5004,1,0,NOW(3),NOW(3)),(6002, 5005,1,0,NOW(3),NOW(3)),
(6002, 5006,1,0,NOW(3),NOW(3)),(6002, 5007,1,0,NOW(3),NOW(3)),(6002, 5014,1,0,NOW(3),NOW(3));

-- 5.2 财务 finance
INSERT INTO `role_permission` (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`) VALUES
(6003, 3001,1,0,NOW(3),NOW(3)),(6003, 3101,1,0,NOW(3),NOW(3)),(6003, 3102,1,0,NOW(3),NOW(3)),
(6003, 3005,1,0,NOW(3),NOW(3)),(6003, 3501,1,0,NOW(3),NOW(3)),(6003, 3502,1,0,NOW(3),NOW(3)),(6003, 3504,1,0,NOW(3),NOW(3)),
(6003, 3008,1,0,NOW(3),NOW(3)),(6003, 3801,1,0,NOW(3),NOW(3)),(6003, 3802,1,0,NOW(3),NOW(3)),(6003, 3803,1,0,NOW(3),NOW(3)),(6003, 3804,1,0,NOW(3),NOW(3)),(6003, 3805,1,0,NOW(3),NOW(3)),
(6003, 4301,1,0,NOW(3),NOW(3)),(6003, 4302,1,0,NOW(3),NOW(3)),
(6003, 4401,1,0,NOW(3),NOW(3)),(6003, 4402,1,0,NOW(3),NOW(3)),(6003, 4403,1,0,NOW(3),NOW(3)),
(6003, 5006,1,0,NOW(3),NOW(3)),(6003, 5007,1,0,NOW(3),NOW(3)),(6003, 5008,1,0,NOW(3),NOW(3)),(6003, 5009,1,0,NOW(3),NOW(3));

-- 5.3 客服 cs
INSERT INTO `role_permission` (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`) VALUES
(6004, 3001,1,0,NOW(3),NOW(3)),(6004, 3101,1,0,NOW(3),NOW(3)),
(6004, 3002,1,0,NOW(3),NOW(3)),(6004, 3201,1,0,NOW(3),NOW(3)),(6004, 3202,1,0,NOW(3),NOW(3)),
(6004, 3003,1,0,NOW(3),NOW(3)),(6004, 3302,1,0,NOW(3),NOW(3)),
(6004, 3004,1,0,NOW(3),NOW(3)),(6004, 3402,1,0,NOW(3),NOW(3)),
(6004, 3005,1,0,NOW(3),NOW(3)),(6004, 3501,1,0,NOW(3),NOW(3)),(6004, 3502,1,0,NOW(3),NOW(3)),(6004, 3503,1,0,NOW(3),NOW(3)),
(6004, 3010,1,0,NOW(3),NOW(3)),(6004, 3911,1,0,NOW(3),NOW(3)),(6004, 3912,1,0,NOW(3),NOW(3)),
(6004, 4301,1,0,NOW(3),NOW(3)),(6004, 4303,1,0,NOW(3),NOW(3)),
(6004, 4501,1,0,NOW(3),NOW(3)),(6004, 4502,1,0,NOW(3),NOW(3)),(6004, 4503,1,0,NOW(3),NOW(3)),
(6004, 5001,1,0,NOW(3),NOW(3)),(6004, 5006,1,0,NOW(3),NOW(3)),(6004, 5010,1,0,NOW(3),NOW(3)),(6004, 5011,1,0,NOW(3),NOW(3));

-- 5.4 风控 risk_control
INSERT INTO `role_permission` (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`) VALUES
(6005, 3001,1,0,NOW(3),NOW(3)),(6005, 3103,1,0,NOW(3),NOW(3)),
(6005, 3002,1,0,NOW(3),NOW(3)),(6005, 3203,1,0,NOW(3),NOW(3)),
(6005, 3003,1,0,NOW(3),NOW(3)),(6005, 3304,1,0,NOW(3),NOW(3)),
(6005, 3004,1,0,NOW(3),NOW(3)),(6005, 3405,1,0,NOW(3),NOW(3)),
(6005, 3005,1,0,NOW(3),NOW(3)),(6005, 3501,1,0,NOW(3),NOW(3)),(6005, 3503,1,0,NOW(3),NOW(3)),
(6005, 3010,1,0,NOW(3),NOW(3)),(6005, 3913,1,0,NOW(3),NOW(3)),
(6005, 4003,1,0,NOW(3),NOW(3)),(6005, 4004,1,0,NOW(3),NOW(3)),(6005, 4103,1,0,NOW(3),NOW(3)),
(6005, 4601,1,0,NOW(3),NOW(3)),(6005, 4602,1,0,NOW(3),NOW(3)),
(6005, 5003,1,0,NOW(3),NOW(3)),(6005, 5012,1,0,NOW(3),NOW(3)),(6005, 5013,1,0,NOW(3),NOW(3));

-- ============================================================================
-- 校验：各角色权限点统计
-- ============================================================================
SELECT
  r.role_code,
  r.role_name,
  COUNT(rp.permission_id) AS permission_count
FROM `role` r
LEFT JOIN `role_permission` rp ON rp.role_id = r.id AND rp.is_deleted = 0
WHERE r.is_deleted = 0
GROUP BY r.id, r.role_code, r.role_name
ORDER BY r.sort;

-- ============================================================================
-- END 03_rbac.sql —— 5 角色 / 92 权限点（顶级菜单 10 + 二级菜单 38 +
-- 按钮 28 + 接口 16 = 92 条 permission；运营/财务/客服/风控四角色合计
-- ~120 条 role_permission 关联）
-- ============================================================================


-- ============================================================================
-- P9-Sprint2 增量 (W2.D.4)：biz:* 命名空间权限码与 5 角色映射
-- 等价于 13_rbac_biz_codes.sql migration（保持 seed 与 migration 等价
-- 以便本地 reset 后单文件完整重建）。命名空间对齐管理后台 v-biz-auth /
-- BizRowAction.auth / BizBatchAction.auth；映射理由见 P9_PERM_AUDIT_REPORT_V2.md
-- 角色对齐：6001 super_admin (auto pass) / 6002 operation (≈R_ADMIN) /
--          6003 finance / 6004 cs / 6005 risk_control (≈R_AUDIT)
-- ============================================================================

-- biz:* 按钮码（resource_type=2）：15 条
INSERT IGNORE INTO `permission`
  (`id`,`tenant_id`,`parent_id`,`resource_type`,`resource_code`,`resource_name`,`action`,`icon`,`sort`,`status`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (4900, 1, 3901, 2, 'biz:system:admin:create',        '新增管理员',     'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
  (4901, 1, 3901, 2, 'biz:system:role:create',         '新增角色',       'create', NULL, 20, 1, 0, NOW(3), NOW(3)),
  (4902, 1, 3901, 2, 'biz:system:role:assign',         '分配角色权限',   'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  (4903, 1, 3901, 2, 'biz:system:permission:edit',     '编辑权限',       'update', NULL, 40, 1, 0, NOW(3), NOW(3)),
  (4904, 1, 3902, 2, 'biz:system:dict:edit',           '字典维护',       'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
  (4905, 1, 3903, 2, 'biz:system:operation-log:view',  '操作日志查看',   'list',   NULL, 10, 1, 0, NOW(3), NOW(3)),
  (4906, 1, 3803, 2, 'biz:finance:withdraw:audit',     '提现审核',       'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
  (4907, 1, 3805, 2, 'biz:finance:invoice:audit',      '发票审核',       'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
  (4908, 1, 3912, 2, 'biz:cs:arbitration:judge',       '仲裁判定',       'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
  (4909, 1, 3911, 2, 'biz:cs:ticket:close',            '工单关闭',       'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  (4910, 1, 3913, 2, 'biz:risk:order:pass',            '风险订单通过',   'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  (4911, 1, 3913, 2, 'biz:risk:order:block',           '风险订单拦截',   'update', NULL, 40, 1, 0, NOW(3), NOW(3)),
  (4912, 1, 3301, 2, 'biz:merchant:audit',             '商户入驻审核',   'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  (4913, 1, 3304, 2, 'biz:merchant:risk:ban',          '商户封禁',       'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
  (4914, 1, 3203, 2, 'biz:user:risk:ban',              '用户封禁',       'update', NULL, 30, 1, 0, NOW(3), NOW(3));

-- 6002 operation (≈R_ADMIN)：系统管理（非 permission:edit）+ 商户 + 用户
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6002, 4900, 1, 0, NOW(3), NOW(3)),
  (6002, 4901, 1, 0, NOW(3), NOW(3)),
  (6002, 4904, 1, 0, NOW(3), NOW(3)),
  (6002, 4905, 1, 0, NOW(3), NOW(3)),
  (6002, 4912, 1, 0, NOW(3), NOW(3)),
  (6002, 4913, 1, 0, NOW(3), NOW(3)),
  (6002, 4914, 1, 0, NOW(3), NOW(3));

-- 6003 finance：财务全集
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6003, 4906, 1, 0, NOW(3), NOW(3)),
  (6003, 4907, 1, 0, NOW(3), NOW(3));

-- 6004 cs：客服 + 风险订单审核
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6004, 4908, 1, 0, NOW(3), NOW(3)),
  (6004, 4909, 1, 0, NOW(3), NOW(3)),
  (6004, 4910, 1, 0, NOW(3), NOW(3)),
  (6004, 4911, 1, 0, NOW(3), NOW(3));

-- 6005 risk_control (≈R_AUDIT)：审核员（仅商户入驻审核）
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6005, 4912, 1, 0, NOW(3), NOW(3));

-- ============================================================================
-- END P9-Sprint2 增量 —— biz:* 15 条权限码 + 14 条角色映射（super_admin 自动放行）
-- ============================================================================
