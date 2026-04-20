# TODO_P9_集成测试部署

## 一、进行中
- [ ] —

## 二、待办

### M9.1 测试
- [ ] T9.4 用户端 E2E（miniprogram-automator）— 需微信开发者工具
- [ ] T9.5 商户/骑手 E2E（Appium）— 需真机/模拟器
- [ ] T9.10 小程序真机兼容 — 需 BrowserStack 账号
- [ ] T9.11 APP 真机矩阵 — 需真机云
- [ ] T9.12 渗透测试 — 需第三方服务商

### M9.4 监控 & 日志
- [ ] T9.27 Exporter 部署 — 需 K8s 集群
- [ ] T9.29 Grafana 4 大面板 JSON — 需 Grafana 实例导出
- [ ] T9.31 Loki + Promtail — 需 K8s 集群
- [ ] T9.33 Sentry 集成 — 需 Sentry DSN

### M9.5 备份 & 容灾
- [ ] T9.35 Redis 持久化 + 异地 — 需云 Redis
- [ ] T9.36 MinIO/OSS 跨区域 — 需云存储配置
- [ ] T9.37 恢复演练 — 需生产环境
- [ ] T9.38 故障切换演练 — 需主从架构

### M9.7 上架
- [ ] T9.43 小程序审核资料 — 需企业资质
- [ ] T9.44 小程序合规自检与提交 — 需微信后台
- [ ] T9.45 iOS 上架 — 需 Apple 开发者账号
- [ ] T9.46 Android 各市场上架 — 需各平台开发者账号 + 软著

### M9.8 最终验收
- [ ] T9.47 72h 稳定性压测 — 需生产环境
- [ ] T9.48 渗透复测 — 需第三方
- [ ] T9.49 功能回归 — 需全量数据
- [ ] T9.50 上线总演练
- [ ] T9.51 最终验收报告
- [ ] T9.52 更新说明文档为 🟢 完成

## 三、已完成

### M9.2 容器化 & 部署
- [x] T9.13 后端 Dockerfile（多阶段构建）
- [x] T9.14 管理后台 Dockerfile
- [x] T9.15 Nginx 配置（nginx.conf + api.conf + admin.conf + ws.conf）
- [x] T9.16 docker-compose.staging.yml（全栈编排）
- [x] T9.17 K8s 基线清单（namespace/deployment/service/ingress/hpa/pdb/configmap/secret/networkpolicy）
- [x] T9.18 Helm Chart（Chart.yaml + values + templates）
- [x] T9.19 staging/production overlays（values-staging/values-production）
- [x] T9.20 NetworkPolicy / PSS

### M9.3 CI/CD
- [x] T9.21 Jenkinsfile 全流水线
- [x] T9.22 镜像构建/推送（集成在 Jenkinsfile 中）
- [x] T9.23 smoke.sh 冒烟测试脚本
- [x] T9.24 rollback.sh + Helm rollback
- [x] T9.25 通知脚本（企业微信/钉钉 webhook）

### M9.1 测试（部分）
- [x] T9.1 后端单测（24 套件 / 208 测试全通过）
- [x] T9.6 k6 压测脚本（下单 1000TPS / 支付 500TPS / 骑手上报 2000TPS）
- [x] T9.8 OWASP ZAP 配置文件
- [x] T9.9 Trivy/Snyk 集成在 Jenkinsfile 中

### M9.4 监控 & 日志（部分）
- [x] T9.28 Prometheus + rules（prometheus.yml + alerts.yml）
- [x] T9.30 AlertManager 路由 + 通道（alertmanager.yml）
- [x] T9.32 Grafana 数据源配置

### M9.5 备份 & 容灾（部分）
- [x] T9.34 MySQL 备份脚本 + CronJob
- [x] Redis 备份脚本
- [x] MySQL 恢复脚本

### M9.6 文档 & 运维
- [x] T9.39 运维手册（ops-manual.md）
- [x] T9.40 Runbook 6 份（incident-response / db-backup / db-restore / failover / scale-up / release-process）
- [x] T9.41 SLO/SLI（集成在运维手册中）
- [x] T9.42 密钥清单（集成在 secret.yaml 模板 + 运维手册中）

## 四、阻塞
| 任务 | 原因 | 预计解除 |
|---|---|---|
| T9.4/T9.5 E2E 真机 | 需微信开发者工具 + Appium 环境 | 配置环境后 |
| T9.43~T9.46 上架 | 需企业资质 + 各平台开发者账号 | 资质就位后 |
| T9.47 72h 压测 | 需生产级 K8s 集群 | 集群就绪后 |

## 五、变更记录
| 日期 | 变更内容 | 变更人 |
|---|---|---|
| 2026-04-18 | 初建，依据 TASK_P9 拆解 | 架构组 |
| 2026-04-21 | 完成 M9.2/M9.3/M9.6 全量 + M9.1/M9.4/M9.5 部分 | AI |
