-- ============================================================================
-- 文件名 : 13_rbac_biz_codes.sql
-- 阶段   : P9 集成测试部署 / Sprint 2 / W2.D.4
-- 用途   : 补 biz:* 命名空间权限码（resource_type=2 按钮）+ 5 角色映射
-- 依据   : docs/P9_集成测试部署/P9_PERM_AUDIT_REPORT.md（Sprint 1 V1）+
--          P9_PERM_AUDIT_REPORT_V2.md（Sprint 2 V2 升级）
--          管理后台 v-biz-auth + BizRowAction.auth + BizBatchAction.auth 已落地
--          15 处 biz:* 权限码（5 顶部按钮 + 行级 + 批量 + 弹窗）
-- 注意   :
--   1) permission 表使用 resource_code 命名空间（不是 code），UNIQUE 键
--      uk_resource_code (resource_code, resource_type) — 同 type 下唯一
--   2) role_permission 表使用 role_id + permission_id（INT 主键）
--   3) 5 角色 ID 已在 03_rbac.sql 固定：
--      6001 super_admin（admin.is_super=1 自动放行，不录关联）
--      6002 operation   ≈ 文档 R_ADMIN
--      6003 finance     = R_FINANCE
--      6004 cs          = R_CS
--      6005 risk_control ≈ R_AUDIT（兼任审核 / 风控）
--   4) 本 migration 全部 INSERT IGNORE，重跑幂等
--   5) 权限 ID 取 4900~4914（与 03_rbac.sql 4001~4804 不冲突）
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- ============================================================================
-- 1) permission —— biz:* 按钮码（resource_type=2）
-- parent_id 对齐 03_rbac.sql 二级菜单：
--   3203 user_mgmt.risk / 3304 merchant_mgmt.risk / 3301 merchant_mgmt.audit /
--   3803 finance.withdraw / 3805 finance.invoice /
--   3912 cs.arbitration / 3911 cs.ticket / 3913 cs.risk /
--   3901 system.role / 3902 system.dict / 3903 system.log /
--   3904 system.config（permission:edit 借 system.role 节点）
-- ============================================================================
INSERT IGNORE INTO `permission`
  (`id`,`tenant_id`,`parent_id`,`resource_type`,`resource_code`,`resource_name`,`action`,`icon`,`sort`,`status`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  -- 系统管理 6 个
  (4900, 1, 3901, 2, 'biz:system:admin:create',        '新增管理员',     'create', NULL, 10, 1, 0, NOW(3), NOW(3)),
  (4901, 1, 3901, 2, 'biz:system:role:create',         '新增角色',       'create', NULL, 20, 1, 0, NOW(3), NOW(3)),
  (4902, 1, 3901, 2, 'biz:system:role:assign',         '分配角色权限',   'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  (4903, 1, 3901, 2, 'biz:system:permission:edit',     '编辑权限',       'update', NULL, 40, 1, 0, NOW(3), NOW(3)),
  (4904, 1, 3902, 2, 'biz:system:dict:edit',           '字典维护',       'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
  (4905, 1, 3903, 2, 'biz:system:operation-log:view',  '操作日志查看',   'list',   NULL, 10, 1, 0, NOW(3), NOW(3)),
  -- 财务 2 个
  (4906, 1, 3803, 2, 'biz:finance:withdraw:audit',     '提现审核',       'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
  (4907, 1, 3805, 2, 'biz:finance:invoice:audit',      '发票审核',       'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
  -- 客服 2 个
  (4908, 1, 3912, 2, 'biz:cs:arbitration:judge',       '仲裁判定',       'update', NULL, 20, 1, 0, NOW(3), NOW(3)),
  (4909, 1, 3911, 2, 'biz:cs:ticket:close',            '工单关闭',       'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  -- 风控 2 个
  (4910, 1, 3913, 2, 'biz:risk:order:pass',            '风险订单通过',   'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  (4911, 1, 3913, 2, 'biz:risk:order:block',           '风险订单拦截',   'update', NULL, 40, 1, 0, NOW(3), NOW(3)),
  -- 商户 2 个
  (4912, 1, 3301, 2, 'biz:merchant:audit',             '商户入驻审核',   'update', NULL, 30, 1, 0, NOW(3), NOW(3)),
  (4913, 1, 3304, 2, 'biz:merchant:risk:ban',          '商户封禁',       'update', NULL, 10, 1, 0, NOW(3), NOW(3)),
  -- 用户 1 个
  (4914, 1, 3203, 2, 'biz:user:risk:ban',              '用户封禁',       'update', NULL, 30, 1, 0, NOW(3), NOW(3));

-- ============================================================================
-- 2) role_permission —— 5 角色 × biz:* 映射
-- super_admin (6001) 通过 admin.is_super=1 自动放行，不录关联（保持 03_rbac.sql 一致）
-- ============================================================================

-- 2.1 operation (6002 ≈ R_ADMIN)：系统管理（非 permission:edit）+ 商户 + 用户
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6002, 4900, 1, 0, NOW(3), NOW(3)), -- biz:system:admin:create
  (6002, 4901, 1, 0, NOW(3), NOW(3)), -- biz:system:role:create
  (6002, 4904, 1, 0, NOW(3), NOW(3)), -- biz:system:dict:edit
  (6002, 4905, 1, 0, NOW(3), NOW(3)), -- biz:system:operation-log:view
  (6002, 4912, 1, 0, NOW(3), NOW(3)), -- biz:merchant:audit
  (6002, 4913, 1, 0, NOW(3), NOW(3)), -- biz:merchant:risk:ban
  (6002, 4914, 1, 0, NOW(3), NOW(3)); -- biz:user:risk:ban

-- 2.2 finance (6003 = R_FINANCE)：财务全集
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6003, 4906, 1, 0, NOW(3), NOW(3)), -- biz:finance:withdraw:audit
  (6003, 4907, 1, 0, NOW(3), NOW(3)); -- biz:finance:invoice:audit

-- 2.3 cs (6004 = R_CS)：客服 + 风险订单审核
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6004, 4908, 1, 0, NOW(3), NOW(3)), -- biz:cs:arbitration:judge
  (6004, 4909, 1, 0, NOW(3), NOW(3)), -- biz:cs:ticket:close
  (6004, 4910, 1, 0, NOW(3), NOW(3)), -- biz:risk:order:pass
  (6004, 4911, 1, 0, NOW(3), NOW(3)); -- biz:risk:order:block

-- 2.4 risk_control (6005 ≈ R_AUDIT)：审核员 / 风控（仅商户入驻审核）
INSERT IGNORE INTO `role_permission`
  (`role_id`,`permission_id`,`tenant_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (6005, 4912, 1, 0, NOW(3), NOW(3)); -- biz:merchant:audit

-- ============================================================================
-- 校验：biz:* 权限码总数 + 各角色映射条数
-- ============================================================================
SELECT COUNT(*) AS biz_perm_count
FROM `permission`
WHERE `resource_code` LIKE 'biz:%' AND `is_deleted` = 0;

SELECT
  r.role_code,
  r.role_name,
  COUNT(rp.permission_id) AS biz_perm_count
FROM `role` r
LEFT JOIN `role_permission` rp ON rp.role_id = r.id AND rp.is_deleted = 0
LEFT JOIN `permission` p ON p.id = rp.permission_id AND p.resource_code LIKE 'biz:%'
WHERE r.is_deleted = 0 AND p.id IS NOT NULL
GROUP BY r.id, r.role_code, r.role_name
ORDER BY r.sort;

-- ============================================================================
-- END 13_rbac_biz_codes.sql —— biz:* 共 15 条 permission；角色映射：
-- super_admin(0,自动放行) / operation(7) / finance(2) / cs(4) / risk_control(1)
-- ============================================================================
