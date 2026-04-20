# O2O 平台运维手册

## 一、系统架构总览

```
客户端（小程序/APP/H5）
        │
   CDN / WAF
        │
   Nginx Ingress
        │
   ┌────┴────┐
   │ Backend │ ← NestJS × N pods（HPA 2~20）
   └────┬────┘
   ┌────┼────────────┐──────────┐
   │    │            │          │
 MySQL Redis    RabbitMQ    MinIO/OSS
 (RDS) (集群)    (集群)
   │
TimescaleDB
```

## 二、环境信息

| 环境 | 域名 | 用途 |
|---|---|---|
| Staging | staging-api.o2o.com / staging-admin.o2o.com | 预发布验证 |
| Production | api.o2o.com / admin.o2o.com | 正式环境 |

## 三、K8s 常用操作

### 查看服务状态
```bash
kubectl get all -n o2o
kubectl get pods -n o2o -o wide
kubectl top pods -n o2o
```

### 查看日志
```bash
# 实时日志
kubectl logs -n o2o deployment/backend -f --tail=100

# 按关键字搜索
kubectl logs -n o2o deployment/backend --since=1h | grep ERROR
```

### 配置更新
```bash
# 更新 ConfigMap
kubectl edit configmap backend-config -n o2o

# 更新后重启生效
kubectl rollout restart deployment/backend -n o2o
```

## 四、监控

| 工具 | 地址 | 用途 |
|---|---|---|
| Grafana | https://grafana.o2o.com | 面板与告警 |
| Prometheus | https://prometheus.o2o.com | 指标查询 |
| Sentry | https://sentry.o2o.com | 异常追踪 |

## 五、备份策略

| 组件 | 频率 | 保留 | 异地 |
|---|---|---|---|
| MySQL | 每日 02:00 全量 + 10min binlog | 30 天 | S3 |
| Redis | 每 6h RDB + 实时 AOF | 7 天 | S3 |
| MinIO/OSS | 实时跨区域复制 | - | 异地 |

## 六、SLO/SLI

| SLI | SLO | 测量方式 |
|---|---|---|
| 可用性 | ≥ 99.9% | Prometheus up 指标 |
| API P95 延迟 | ≤ 200ms | http_request_duration_seconds |
| 5xx 错误率 | < 0.1% | http_requests_total{status=~"5.."} |
| 订单成功率 | ≥ 98% | order_paid_total / order_created_total |

## 七、值班制度

- 7×24 轮值，每人一周
- P0 告警：5 分钟内响应
- Runbook 位置：`部署/runbooks/`

## 八、密钥管理

- 所有密钥通过 K8s Secret 注入，禁止硬编码
- 密钥轮换周期：90 天
- 轮换操作：更新 Secret → 重启 Deployment
- 第三方 Key 清单见 `部署/k8s/base/secret.yaml`
