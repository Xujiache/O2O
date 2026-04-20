# 数据库恢复 Runbook

## 前提条件
- 已有可用备份文件（本地 `/backup/mysql/` 或 S3）
- 确认恢复目标（全量 or 部分库表）
- 已通知相关人员并获得授权

## 恢复步骤

### 1. 从 S3 下载备份
```bash
aws s3 ls s3://o2o-backup/mysql/ --human-readable
aws s3 cp s3://o2o-backup/mysql/full_20260420_0200.sql.gz /backup/mysql/
```

### 2. 停止后端服务（防止写入）
```bash
kubectl scale deployment/backend -n o2o --replicas=0
```

### 3. 执行恢复
```bash
bash 部署/backup/restore-mysql.sh /backup/mysql/full_20260420_0200.sql.gz
```

### 4. 验证数据
```sql
USE o2o_platform;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM shops;
-- 对比备份前的记录数
```

### 5. 恢复后端服务
```bash
kubectl scale deployment/backend -n o2o --replicas=4
```

### 6. 冒烟测试
```bash
bash 部署/ci/scripts/smoke.sh production
```

## 注意事项
- 生产环境恢复必须**双人操作**
- 恢复前先在 staging 验证
- RPO 目标：≤ 1 小时（binlog 增量备份间隔）
- RTO 目标：≤ 30 分钟

## 演练记录

| 日期 | 操作人 | 场景 | 耗时 | 结果 |
|---|---|---|---|---|
| | | | | |
