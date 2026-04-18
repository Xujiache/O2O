-- ============================================================================
-- 文件名 : 00_init.sql
-- 阶段   : P2 数据库设计 / T2.1 建库与权限
-- 用途   : 创建 o2o_platform 主库、字符集与默认排序规则、应用账号最小权限授权
-- 依据   : DESIGN_P2_数据库设计.md §二（建表统一规范） / CONSENSUS §2.1
-- 执行   : 用 root 账号（Docker 环境密码 = MYSQL_ROOT_PASSWORD）执行
--          docker exec -i o2o-mysql mysql -uroot -p<MYSQL_ROOT_PASSWORD> < 后端/src/database/migrations/00_init.sql
-- 时区说明:
--   1. docker-compose.dev.yml 中 mysql 服务 TZ=Asia/Shanghai，已通过容器环境写入；
--   2. 应用层 NestJS TypeORM 设置 timezone='+08:00'（见 后端/src/database/database.module.ts）；
--   3. 业务字段统一使用 DATETIME(3)（毫秒精度），由应用层显式写入，不依赖 MySQL 默认时区转换；
--   4. 如需在 SQL 端校准当前会话时区，可执行 SET time_zone = '+08:00';（本脚本不强制）。
-- 安全约束（与 P1 R01 教训对齐，不落任何明文密码）:
--   - 应用账号密码用 <CHANGE_ME> 占位；
--   - 生产 / 预发 / 集成环境由 CI/CD 在执行前用 Secret 替换；
--   - 严禁把真实口令提交到 git（已通过 .gitignore 兜底，但人工自检仍是第一道防线）。
-- ============================================================================

-- 1) 创建主数据库（若不存在）
--    字符集 utf8mb4 + utf8mb4_0900_ai_ci 与 docker-compose.dev.yml 的 MySQL command 完全一致
CREATE DATABASE IF NOT EXISTS `o2o_platform`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- 2) 切换到目标库（后续 migrations 01~10 不再写 USE，由调用方按需指定）
USE `o2o_platform`;

-- 3) 应用账号 o2o_app 创建 + 最小权限授权
--    - 仅授予 SELECT/INSERT/UPDATE/DELETE/EXECUTE 五项业务权限；
--    - EXECUTE 用于 04_order.sql 的 sp_create_order_monthly_tables 存储过程调用；
--    - 不授 DDL（CREATE/ALTER/DROP）；schema 变更走专门的 migrator 账号（root 或 DBA 工具）。
--    - 使用 caching_sha2_password 与 MySQL 8 默认插件一致（docker-compose 已显式声明）。
--    - 主机段先放宽到 '%'，生产环境收敛为内网 CIDR（在 K8s NetworkPolicy 层兜底）。

CREATE USER IF NOT EXISTS 'o2o_app'@'%'
  IDENTIFIED WITH caching_sha2_password BY '<CHANGE_ME>';

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
  ON `o2o_platform`.* TO 'o2o_app'@'%';

-- 4) 只读账号 o2o_readonly（用于 BI / 报表 / 数据同步任务）
--    - 仅授予 SELECT；
--    - SHOW VIEW 用于 BI 工具查询视图元数据。
CREATE USER IF NOT EXISTS 'o2o_readonly'@'%'
  IDENTIFIED WITH caching_sha2_password BY '<CHANGE_ME>';

GRANT SELECT, SHOW VIEW
  ON `o2o_platform`.* TO 'o2o_readonly'@'%';

-- 5) 刷新权限并打印当前授权状态供运维核对
FLUSH PRIVILEGES;

SHOW GRANTS FOR 'o2o_app'@'%';
SHOW GRANTS FOR 'o2o_readonly'@'%';

-- 6) 输出版本信息（便于排查环境差异）
SELECT
  @@version           AS mysql_version,
  @@character_set_server AS server_charset,
  @@collation_server  AS server_collation,
  @@time_zone         AS server_tz,
  @@sql_mode          AS sql_mode;

-- ============================================================================
-- END 00_init.sql
-- ============================================================================
