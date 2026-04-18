# CONSENSUS_P9_集成测试部署

## 一、范围与目标
- 通过 PRD §6 全部验收标准
- 达成 SLO：核心接口 P95 ≤ 200ms、可用性 ≥ 99.9%
- 完成生产 K8s 集群部署，容器化 + CI/CD 全链路
- APP、小程序上架审核通过

## 二、技术方案共识

### 2.1 部署拓扑（生产）

```
                    [ DNS / CDN ]
                         │
                    [ LB / WAF ]
                         │
              ┌──────────┼────────────┐
              ▼          ▼            ▼
        [ Nginx 1..N ]（Ingress Controller）
              │
        ┌─────┴─────┐
        ▼           ▼
   [ NestJS API ]  [ Admin 静态 ]
        │
   ┌────┼─────┬─────────────┐
   ▼    ▼     ▼             ▼
 MySQL  Redis RabbitMQ  TimescaleDB
 (RDS)  集群   集群      集群
        │     │
        ▼     ▼
     MinIO / OSS
```

### 2.2 镜像策略
| 组件 | 基础镜像 | 多阶段构建 |
|---|---|---|
| 后端 | node:20-alpine | builder + runner |
| 管理后台 | nginx:1.25-alpine | builder(node:20) + runner(nginx) |
| 用户/商户/骑手 APP/MP | 不容器化，构建产物传企业分发平台 |

### 2.3 K8s 资源
- Deployment：backend、admin-web、task-worker（BullMQ 消费者）、dispatch-worker
- Service：ClusterIP + Ingress
- ConfigMap：公共配置
- Secret：密钥（第三方 AK/SK、JWT secret、DB 密码）
- HPA：CPU 70% 自动扩容 2~20 pod
- PDB：确保至少 1 个存活
- NetworkPolicy：最小网络访问

### 2.4 CI/CD（Jenkins Pipeline）
```
stages:
  1. checkout
  2. lint (ESLint/Prettier/Stylelint)
  3. test (unit + integration)
  4. sonar / code quality
  5. build (docker build)
  6. security scan (Trivy)
  7. push to registry
  8. deploy staging (Helm upgrade)
  9. smoke test
 10. manual approval
 11. deploy production (Helm upgrade)
 12. post-smoke + notify
```

### 2.5 测试矩阵
| 类型 | 工具 | 覆盖 |
|---|---|---|
| 单测 | Jest | 后端模块 / 前端工具 |
| 接口集成 | Supertest + Jest | 后端全 API |
| E2E UI | Playwright | 管理后台核心流程 |
| 小程序 | miniprogram-automator + 真机 | 下单 / 支付 / 跑腿 |
| APP | Appium | 商户接单 / 骑手派送 |
| 性能 | k6 + JMeter | 下单 / 支付 / 派单 |
| 安全 | OWASP ZAP + Trivy + Snyk | 镜像 / 依赖 / Web |
| 兼容 | BrowserStack + 真机云 | 多浏览器 + 多设备 |

### 2.6 性能测试目标（对应 §4.1）
| 场景 | 指标 |
|---|---|
| 下单接口 | P95 ≤ 500ms @ 1000 TPS 持续 10min |
| 支付回调 | P95 ≤ 200ms @ 500 TPS |
| 店铺列表 | P95 ≤ 300ms @ 500 TPS（命中缓存） |
| 骑手上报 | P95 ≤ 100ms @ 2000 TPS |
| 订单查询 | 百万级数据 P95 ≤ 1s |

### 2.7 安全测试
- **OWASP Top 10** 全覆盖
- 密钥不入仓，Secret 使用 K8s Secret + KMS
- 依赖漏洞扫描（Snyk/Trivy）
- 渗透测试由第三方执行（合规报告）

### 2.8 监控与告警
| 维度 | 指标 | 告警阈值 |
|---|---|---|
| 应用 | QPS / P95 / 5xx 率 | P95 > 500ms 或 5xx > 1% 持续 3min |
| 业务 | 下单成功率 / 支付成功率 / 派单成功率 | 成功率 < 98% |
| DB | 连接数 / 慢查询 / 主从延迟 | 慢查询 > 10/min |
| Redis | 连接 / 内存 / 命中率 | 内存 > 80% |
| MQ | 队列积压 / 消费 lag | lag > 10000 |
| 服务器 | CPU / 内存 / 磁盘 / 网络 | CPU > 80% 持续 5min |

### 2.9 备份与恢复
- MySQL：xtrabackup 每日全量 02:00；binlog 每 10min 增量
- Redis：AOF 每秒 + RDB 每 6h；复制到异地
- MinIO/OSS：跨区域复制
- 每月一次恢复演练

### 2.10 灰度发布
- 后端：K8s 蓝绿部署 + Ingress 按权重切流
- 管理后台：直接切流
- 小程序：微信灰度（50% → 100%）
- APP：应用市场分阶段发布（10% → 50% → 100%）

## 三、交付标准
- [ ] PRD §6 全部项 100% 通过
- [ ] SLO 达标
- [ ] 生产部署成功，小程序/APP 上架
- [ ] 完整运维文档 + Runbook
- [ ] 72h 稳定运行

## 四、风险
| 风险 | 应对 |
|---|---|
| 性能瓶颈 | 提前压测，按瓶颈扩容/优化 SQL/加缓存 |
| 数据迁移失败 | 演练 + 回滚脚本 |
| APP 审核被拒 | 提前合规自检 + 预审沟通 |
| 小程序类目不符 | 确认类目（外卖/跑腿）及资质 |
| 支付沙箱与生产差异 | 生产环境灰度单金额验证 |

## 五、结论
- 方案锁定，进入 DESIGN
