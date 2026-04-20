# 故障切换 Runbook

## MySQL 主从切换

### 自动切换（RDS 场景）
云 RDS 通常自带高可用切换，只需确认：
1. 应用连接使用的是 RDS **VIP**（而非主实例 IP）
2. 切换后检查连接池是否自动重连

### 手动切换
```bash
# 1. 确认从库同步状态
mysql -h slave -e "SHOW REPLICA STATUS\G" | grep -E "Seconds_Behind|Running"

# 2. 停止主库写入
mysql -h master -e "SET GLOBAL read_only = ON; FLUSH TABLES WITH READ LOCK;"

# 3. 等待从库追平
# Seconds_Behind_Source = 0

# 4. 提升从库为主库
mysql -h slave -e "STOP REPLICA; RESET REPLICA ALL; SET GLOBAL read_only = OFF;"

# 5. 更新 ConfigMap 中的 DB_HOST
kubectl edit configmap backend-config -n o2o

# 6. 重启后端
kubectl rollout restart deployment/backend -n o2o

# 7. 验证
bash 部署/ci/scripts/smoke.sh production
```

## Redis 切换
```bash
# Sentinel 模式自动切换
redis-cli -h sentinel -p 26379 SENTINEL failover o2o-master

# 确认新主库
redis-cli -h sentinel -p 26379 SENTINEL get-master-addr-by-name o2o-master
```

## 切换演练记录

| 日期 | 组件 | 场景 | 切换耗时 | 数据验证 | 结果 |
|---|---|---|---|---|---|
| | | | | | |
