-- ============================================================================
-- 文件名 : 04_admin.sql
-- 阶段   : P2 数据库设计 / T2.15 admin 超管种子账号
-- 用途   : 初始化默认超级管理员账号 Super
-- 依据   : 提示词
--           - 默认账号 Super
--           - 密码用 bcrypt hash（cost=10）占位
--           - 生产环境由 CI 脚本首次启动时强制修改
--           - 手机号/身份证字段留空或填测试值（tail4=0000）
-- ----------------------------------------------------------------------------
-- 安全设计（重要）:
--   1. 本文件 password_hash 故意填入"非可登录"格式的占位串：
--        $2b$10$xxxx....xxxx0
--      虽然格式合法（$2b$10$ 前缀 + 52 字符 + 1 字符 = 60 长度），
--      但 hash 部分不对应任何已知密码 → bcrypt.compare 始终返回 false。
--      这意味着默认 Super 账号 "无法用任何明文登录"，必须经下列步骤激活：
--   2. 激活流程（任选其一）:
--      A. P3 NestJS 启动钩子检测 admin.username='Super' 且 password_hash
--         以 'xxxxxxxxxx' 结尾时，输出强制提示并要求运维通过 CLI 设置密码；
--      B. CI/CD 在 deploy 之后立即执行 SQL：
--           UPDATE admin SET password_hash = '<bcrypt cost=10 真实 hash>'
--             WHERE username = 'Super';
--         （hash 由 Secret Manager 注入，不落 git）
--      C. 通过管理后台"忘记密码"流程，触发短信验证（mobile_enc 必须先填）。
--   3. 严禁在生产环境使用本占位 hash 登录任何接口。
-- ============================================================================

USE `o2o_platform`;

SET NAMES utf8mb4;

-- 0) 清理旧 super 账号
DELETE FROM `admin_role` WHERE `admin_id` = 8001;
DELETE FROM `admin` WHERE `id` = 8001;

-- 1) 创建默认 Super 账号
--    is_super=1：业务层据此放行所有 RBAC 校验
--    mobile_*=NULL：留空（生产由运维填正式值）
--    tail4='0000'：占位
INSERT INTO `admin`
  (`id`,`tenant_id`,`username`,`password_hash`,`nickname`,`avatar_url`,
   `mobile_enc`,`mobile_hash`,`mobile_tail4`,`email`,
   `is_super`,`status`,`enc_key_ver`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (8001, 1,
   'Super',
   -- 60 字符占位 bcrypt hash（$2b$10$ 前缀 + 52 x + 1 数字）
   -- 首次启动后必须替换为真实 hash，详见文件头安全设计
   '$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx0',
   '系统超级管理员',
   NULL,
   NULL,         -- mobile_enc
   NULL,         -- mobile_hash
   '0000',       -- mobile_tail4 占位
   NULL,         -- email
   1,            -- is_super=1
   1,            -- status=1 启用（实际是否能登录由 password_hash 决定）
   1,            -- enc_key_ver=1
   0,
   NOW(3), NOW(3));

-- 2) 关联超级管理员角色（虽然 is_super=1 时 RBAC 校验已自动放行，
--    但为前端展示一致性仍显式建立 admin_role 关联）
INSERT INTO `admin_role`
  (`tenant_id`,`admin_id`,`role_id`,`is_deleted`,`created_at`,`updated_at`)
VALUES
  (1, 8001, 6001, 0, NOW(3), NOW(3));

-- ============================================================================
-- 校验
-- ============================================================================
SELECT
  a.id,
  a.username,
  a.nickname,
  a.is_super,
  a.status,
  a.mobile_tail4,
  CASE WHEN a.password_hash LIKE '\$2b\$10\$xxxx%' THEN '占位hash(必须重置)' ELSE '已重置' END AS password_state,
  GROUP_CONCAT(r.role_code) AS roles
FROM `admin` a
LEFT JOIN `admin_role` ar ON ar.admin_id = a.id AND ar.is_deleted = 0
LEFT JOIN `role` r ON r.id = ar.role_id AND r.is_deleted = 0
WHERE a.username = 'Super'
GROUP BY a.id;

-- ============================================================================
-- END 04_admin.sql —— 仅创建 1 个超级管理员占位账号
-- ============================================================================
