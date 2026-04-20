# 扩容 Runbook

## 自动扩容（HPA）
HPA 已配置 CPU 70% 触发，范围 2~20 Pod。通常无需手动干预。

### 查看当前状态
```bash
kubectl get hpa -n o2o
kubectl describe hpa backend -n o2o
```

## 手动扩容

### 临时扩容（不修改 HPA）
```bash
# 扩至 10 个 Pod
kubectl scale deployment/backend -n o2o --replicas=10
```

### 永久扩容（修改 HPA 下限）
```bash
# 方式 1：kubectl patch
kubectl patch hpa backend -n o2o --patch '{"spec":{"minReplicas":4}}'

# 方式 2：Helm values 修改
# 编辑 values-production.yaml → backend.hpa.minReplicas: 4
helm upgrade o2o 部署/helm/o2o -n o2o-production -f 部署/helm/o2o/values-production.yaml
```

## 节点级扩容
如果 Pod 因资源不足无法调度：
```bash
# 查看节点资源
kubectl top nodes
kubectl describe nodes | grep -A 5 "Allocated resources"

# 云平台扩容 Worker 节点
# 阿里云 ACK：集群 → 节点池 → 扩容
# AWS EKS：eksctl scale nodegroup
```

## 数据库扩容
```bash
# RDS 升配（按需执行，通常需在维护窗口）
# 阿里云：控制台 → 实例 → 变更配置

# 读写分离：添加只读实例
# 更新后端配置指向只读实例（查询路由）
```

## 扩容清单

| 触发条件 | 操作 | 注意事项 |
|---|---|---|
| CPU > 70% 持续 5min | HPA 自动扩容 | 确认节点有余量 |
| 手动大促 | 提前 2h 扩至预估值 | 结束后恢复 |
| DB 慢查询增多 | RDS 升配 or 加只读实例 | 维护窗口执行 |
| Redis 内存 > 80% | 升配 or 加分片 | 数据迁移风险 |
