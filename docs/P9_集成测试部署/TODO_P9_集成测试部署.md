# TODO_P9_集成测试部署

## 一、进行中
- [ ] —

## 二、待办

### M9.1 测试
- [ ] T9.1 后端单测 ≥ 70%
- [ ] T9.2 后端集成测试
- [ ] T9.3 管理后台 E2E（Playwright）
- [ ] T9.4 用户端 E2E（miniprogram-automator）
- [ ] T9.5 商户/骑手 E2E（Appium）
- [ ] T9.6 k6 压测脚本
- [ ] T9.7 JMeter 复杂场景
- [ ] T9.8 OWASP ZAP 扫描
- [ ] T9.9 Trivy / Snyk 扫描
- [ ] T9.10 小程序真机兼容
- [ ] T9.11 APP 真机矩阵
- [ ] T9.12 渗透测试

### M9.2 容器化 & 部署
- [ ] T9.13 后端 Dockerfile
- [ ] T9.14 管理后台 Dockerfile
- [ ] T9.15 Nginx 配置
- [ ] T9.16 docker-compose.staging
- [ ] T9.17 K8s 基线清单
- [ ] T9.18 Helm Chart
- [ ] T9.19 staging/production overlays
- [ ] T9.20 NetworkPolicy / PSS

### M9.3 CI/CD
- [ ] T9.21 Jenkinsfile
- [ ] T9.22 镜像构建/推送
- [ ] T9.23 smoke.sh
- [ ] T9.24 rollback.sh + Helm rollback
- [ ] T9.25 通知（企业微信/钉钉）

### M9.4 监控 & 日志
- [ ] T9.26 Prometheus metrics
- [ ] T9.27 Exporter 部署
- [ ] T9.28 Prometheus + rules
- [ ] T9.29 Grafana 4 大面板
- [ ] T9.30 AlertManager 路由
- [ ] T9.31 Loki + Promtail
- [ ] T9.32 结构化日志 + traceId
- [ ] T9.33 Sentry 前后端

### M9.5 备份 & 容灾
- [ ] T9.34 MySQL 备份 cron
- [ ] T9.35 Redis 持久化 + 异地
- [ ] T9.36 MinIO/OSS 跨区域
- [ ] T9.37 恢复演练
- [ ] T9.38 故障切换演练

### M9.6 文档 & 运维
- [ ] T9.39 运维手册
- [ ] T9.40 Runbook（6 份）
- [ ] T9.41 SLO/SLI 文档
- [ ] T9.42 密钥清单 + 轮换

### M9.7 上架
- [ ] T9.43 小程序审核资料
- [ ] T9.44 小程序合规自检与提交
- [ ] T9.45 iOS 上架
- [ ] T9.46 Android 各市场上架

### M9.8 最终验收
- [ ] T9.47 72h 稳定性压测
- [ ] T9.48 渗透复测
- [ ] T9.49 功能回归
- [ ] T9.50 上线总演练
- [ ] T9.51 最终验收报告
- [ ] T9.52 更新说明文档为 🟢 完成

## 三、已完成
（暂无）

## 四、阻塞
| 任务 | 原因 | 责任人 | 预计解除 |
|---|---|---|---|
| - | - | - | - |

## 五、变更记录
| 日期 | 变更内容 | 变更人 |
|---|---|---|
| 2026-04-18 | 初建，依据 TASK_P9 拆解 | 架构组 |
