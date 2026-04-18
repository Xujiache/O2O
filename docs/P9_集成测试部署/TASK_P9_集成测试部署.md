# TASK_P9_集成测试部署

## 一、WBS

### M9.1 测试
| 编号 | 任务 | 工时(h) |
|---|---|---|
| T9.1 | 后端单测补齐至 ≥ 70% | 12 |
| T9.2 | 后端集成测试（Supertest 全 API） | 16 |
| T9.3 | Playwright 管理后台 E2E（10 模块关键路径） | 12 |
| T9.4 | miniprogram-automator 用户端 E2E（下单/支付/跑腿） | 10 |
| T9.5 | Appium 商户端/骑手端 E2E（接单/派送/打印） | 12 |
| T9.6 | k6 压测脚本（下单/支付/派单/骑手上报） | 8 |
| T9.7 | JMeter 复杂场景（闭环多步骤） | 6 |
| T9.8 | OWASP ZAP 扫描 + 复测 | 6 |
| T9.9 | Trivy/Snyk 依赖与镜像扫描 | 3 |
| T9.10 | 兼容性：微信小程序真机 + BrowserStack | 6 |
| T9.11 | 兼容性：APP 真机矩阵（iOS 13+ / Android 8+ 10 机型） | 8 |
| T9.12 | 渗透测试（第三方外协或自测） | 16 |

### M9.2 容器化 & 部署
| T9.13 | 后端 Dockerfile + 本地构建 | 3 |
| T9.14 | 管理后台 Dockerfile | 2 |
| T9.15 | Nginx 配置（api/admin/ws） | 3 |
| T9.16 | docker-compose.staging.yml | 2 |
| T9.17 | K8s 基线清单（Deployment/Service/Ingress/HPA/PDB/ConfigMap/Secret） | 10 |
| T9.18 | Helm Chart（values/templates） | 8 |
| T9.19 | staging / production 两套 overlays | 3 |
| T9.20 | NetworkPolicy 与 PSS | 3 |

### M9.3 CI/CD
| T9.21 | Jenkinsfile 全流水线 | 6 |
| T9.22 | 镜像构建/推送脚本 | 2 |
| T9.23 | 冒烟测试脚本 smoke.sh | 3 |
| T9.24 | 回滚脚本 rollback.sh + Helm rollback | 2 |
| T9.25 | 通知（企业微信/钉钉） | 2 |

### M9.4 监控 & 日志
| T9.26 | 后端埋点 Prometheus metrics | 5 |
| T9.27 | Exporter 部署（mysql/redis/rabbitmq/node） | 3 |
| T9.28 | Prometheus + rules.yml | 3 |
| T9.29 | Grafana 4 大面板 | 6 |
| T9.30 | AlertManager 路由 + 通道 | 3 |
| T9.31 | Loki + Promtail 日志栈 | 4 |
| T9.32 | 应用日志结构化（JSON）+ traceId | 3 |
| T9.33 | Sentry 集成（前后端） | 3 |

### M9.5 备份 & 容灾
| T9.34 | MySQL 备份脚本 + cron | 3 |
| T9.35 | Redis 持久化 + 异地复制 | 2 |
| T9.36 | MinIO/OSS 跨区域复制 | 2 |
| T9.37 | 恢复演练脚本 + 演练记录 | 4 |
| T9.38 | 故障切换演练（主从切换） | 4 |

### M9.6 文档 & 运维
| T9.39 | 运维手册 | 4 |
| T9.40 | Runbook：事故响应 / DB 备份 / 故障切换 / 扩容 / 发布流程 | 8 |
| T9.41 | SLO/SLI 文档 | 2 |
| T9.42 | 权限/密钥清单与轮换计划 | 2 |

### M9.7 上架
| T9.43 | 微信小程序审核资料准备 | 4 |
| T9.44 | 小程序合规自检与提交 | 3 |
| T9.45 | iOS App Store 上架（TestFlight→生产） | 8 |
| T9.46 | Android 主流市场上架（华为/小米/OPPO/VIVO） | 10 |

### M9.8 最终验收
| T9.47 | 72 小时稳定性压测 | 8 |
| T9.48 | 渗透复测通过 | 4 |
| T9.49 | 功能回归全通过 | 6 |
| T9.50 | 上线总演练（灰度→全量） | 6 |
| T9.51 | 汇总最终验收报告 | 3 |
| T9.52 | 更新说明文档为 🟢 完成 | 0.5 |

**合计：约 285h ≈ 36 人日**

## 二、并行
- 测试 / 容器化 / CI/CD / 监控 四条线并行
- 上架与最终验收放在末期

## 三、里程碑
- M9.1 所有测试通过
- M9.2 staging 环境部署成功
- M9.3 CI/CD 全链路打通
- M9.4 监控日志就绪
- M9.5 生产环境部署 + 备份
- M9.6 APP/小程序上架
- M9.7 72h 稳定 + 最终验收通过

## 四、风险
| 风险 | 应对 |
|---|---|
| 压测未达标 | 定位瓶颈（DB/缓存/代码）→ 优化 → 复测 |
| APP 审核被拒 | 准备合规材料、预审沟通 |
| 数据迁移失败 | 多环境预演 + 回滚 |
| 上线期间事故 | 灰度 + Runbook + 快速回滚 |
| 密钥泄露 | K8s Secret + KMS + 审计 |

## 五、状态跟踪
见 `TODO_P9_集成测试部署.md`。
