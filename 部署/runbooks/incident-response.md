# 事故响应 Runbook

## 一、告警分级

| 级别 | 定义 | 响应时间 | 通知方式 |
|---|---|---|---|
| P0 | 核心服务不可用（下单/支付/派单全挂） | ≤ 5min | 电话 + 短信 + 群 |
| P1 | 性能严重退化或部分功能不可用 | ≤ 15min | 短信 + 群 |
| P2 | 非核心功能异常 | ≤ 30min | 企业微信群 |

## 二、响应流程

```mermaid
flowchart TD
    A[收到告警] --> B{确认级别}
    B -->|P0| C[立即拉群 + 电话值班人]
    B -->|P1| D[群内@相关人]
    B -->|P2| E[记录 Issue]
    C --> F[查看 Grafana 面板]
    D --> F
    F --> G{定位根因}
    G -->|应用层| H[查看应用日志 + Sentry]
    G -->|DB| I[查看慢查询 + 连接数]
    G -->|依赖服务| J[检查 Redis/MQ/外部 API]
    H --> K[执行修复]
    I --> K
    J --> K
    K --> L[验证恢复]
    L --> M[更新时间线]
    M --> N[事后复盘 5Whys]
```

## 三、常用排查命令

```bash
# 查看 Pod 状态
kubectl get pods -n o2o -o wide

# 查看 Pod 日志
kubectl logs -n o2o deployment/backend --tail=100 -f

# 查看 Pod 资源使用
kubectl top pods -n o2o

# 查看事件
kubectl get events -n o2o --sort-by='.lastTimestamp' | tail -20

# 强制重启
kubectl rollout restart deployment/backend -n o2o

# 快速扩容
kubectl scale deployment/backend -n o2o --replicas=10
```

## 四、事后复盘模板

| 项目 | 内容 |
|---|---|
| 事故时间 | |
| 影响范围 | |
| 根本原因 | |
| 时间线 | |
| 修复措施 | |
| 后续改进 | |
| 5 Whys | |
