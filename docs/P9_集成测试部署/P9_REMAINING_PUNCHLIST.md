# P9 集成测试部署 — 剩余工作 Punchlist（2026-05-01）

> **目的**：在 `P9_PROGRESS_BASELINE_2026-05-01.md` 盘点的基础上，按优先级（P0 / P1 / P2 / P3）将剩余 24 项 WBS + 60+ 项前阶段遗留整理成可逐项消化的 Punchlist。
> **基准**：本文件以 2026-05-01 提交 `1171241` 为快照。
> **维护方式**：每完成一项立即在 `[ ]` → `[x]`，并在 `证据` 栏补 commit hash + 自动化结果。

---

## 一、优先级定义

| 级 | 含义 | 处理策略 |
|---|---|---|
| **P0** | 阻塞 P9 启动 / 阻塞前 8 阶段最终签字 | 必须本周内消化 |
| **P1** | 核心功能真实联调 / 真实第三方接入 / 真机率证 | P9 启动后第一批处理 |
| **P2** | 体验 / 自动化 / 可维护性 | P9 中期（Sprint 2~3） |
| **P3** | 文档勘误 / 命名差异 / 优化建议 | P9 末期或 V2 |

---

## 二、P0：阻塞项（本期 Sprint 1 收口）

| 编号 | 项 | 来源 | 处理 |
|---|---|---|---|
| [ ] P9-P0-01 | 后端单测覆盖率重测 + 补足至 ≥70% | T9.1 / P4-P3-01 / P4-P3-02 | Sprint 1 W1.C.1~5 |
| [ ] P9-P0-02 | 管理后台主 chunk 2796 KB → ≤2000 KB | L8-04 / P8-R1R2-I02 | Sprint 1 W1.B.1 |
| [ ] P9-P0-03 | BizAuth 0 引用 → 至少 5 处真用 + 输出权限矩阵 | L8-05 / P8-R1R2-I03 | Sprint 1 W1.B.2 |
| [ ] P9-P0-04 | P4 残留 11 处 `parseFloat(amount)` 全部改 `BigNumber` | P4-P3 残留 | Sprint 1 W1.C.4 |

---

## 三、P1：核心功能真实联调（Sprint 2~N）

### 3.1 真实容器 + HTTP-level e2e

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-01 | docker-compose.staging 全栈拉起，跑 takeout-flow / errand-flow HTTP e2e | P4-P1-01 |
| [ ] P9-P1-02 | T9.2 后端 Supertest 全 API 集成测试 | T9.2 |
| [ ] P9-P1-03 | T9.3 Playwright 管理后台 E2E 补齐剩余 5 个模块（user / product / marketing / review / cs-risk） | T9.3 |

### 3.2 后端业务真实联动

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-04 | OrderDelivered 5min 自动 finished（BullMQ 延迟 job） | P4-P1-02 |
| [ ] P9-P1-05 | RefundSucceed 反向结算（settlement.reverseForOrder + account.spend） | P4-P1-03 |
| [ ] P9-P1-06 | 真实 WeChat Pay V3 / Alipay SDK（替换 mock） | P4-P1-04 |
| [ ] P9-P1-07 | OperationLog 真持久化（替换 logger stub） | P4-P1-05 |
| [ ] P9-P1-08 | DLQ 自动重试策略 + 管理后台界面 | P4-P1-06 |
| [ ] P9-P1-09 | Saga 状态持久化到 saga_state 表 | P4-P1-07 |
| [ ] P9-P1-10 | 拼单成团合并多单（V4.10） | P4-P1-08 |
| [ ] P9-P1-11 | sys_config 系统：scoring / invite / coupon / refund / dispatch 全量配置接入 | P4/L-02 / P4/I-07 / P4/I-08 |
| [ ] P9-P1-12 | 健康证到期 15 天前提醒（后端定时任务） | P7-P1-07 |

### 3.3 P8 admin controller 4 个 stub 真业务联动

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-13 | `admin-export.controller` 进程内 Map → Redis + DB + 真异步 job | P8-R1R2-I04 / L8-02 |
| [ ] P9-P1-14 | `admin-finance-ext.controller` overview 真实聚合查询（替代硬编码 `'0.00'`） | P8-R1R2-I04 / L8-09 |
| [ ] P9-P1-15 | `admin-rider-ext.controller` track 接 TimescaleDB 真查询 | P8-R1R2-I04 / L8-03 |
| [ ] P9-P1-16 | `settlementRecordRetry` 端点真实重试逻辑 | P8-P1-05 |

### 3.4 用户端真机 / 真 SDK / 真联调

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-17 | 用户端微信小程序真实 appid 注入 + 体验版上传 | P5-P1-02 |
| [ ] P9-P1-18 | 高德地图 SDK key 注入（用户端 / 商户端 / 骑手端 / 管理后台轨迹） | P5-P1-03 / P7-P1-03 / L8-03 |
| [ ] P9-P1-19 | 微信支付 / 极光 / 短信真 SDK 联调（用户端 / 商户端） | P5-P1-04 / P6-P1-05 |
| [ ] P9-P1-20 | 用户端后端 HTTP 真联调（替换 mock） | P5-P1-01 / P5-L03 |
| [ ] P9-P1-21 | `OrderErrand.detail` 返回 `proofs` 字段确认 + 补全 | P5-P1-06 |

### 3.5 商户端真机 / 真 SDK

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-22 | 商户端蓝牙打印真机 10 张连续 + 断开重连 | P6-P1-02 / P6-V6.26 |
| [ ] P9-P1-23 | Android Foreground Service nativePlugin 真机验收 | P6-P1-03 |
| [ ] P9-P1-24 | iOS silent.wav + 30min 真机率证 | P6-P1-04 |
| [ ] P9-P1-25 | 商户端 mock → 真 API 联调（订单 / 商品 / 财务） | P6-P1-01 |

### 3.6 骑手端真机 / 真 SDK

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-26 | iOS 后台 10min 真机率证 | P7-P1-01 / V7.23 |
| [ ] P9-P1-27 | nativePlugin HBuilderX 云打包真集成 | P7-P1-02 / P7-L04 |
| [ ] P9-P1-28 | 极光推送 appKey + 真机 token | P7-P1-04 |
| [ ] P9-P1-29 | Sentry DSN 注入 + 真崩溃截图（后端 / 商户端 / 骑手端） | P7-P1-05 / P6-P1-06 / T9.33 |
| [ ] P9-P1-30 | 阿里云号码中心 callRelay 三方虚号 SDK 接入 | P7-P1-06 |
| [ ] P9-P1-31 | 真音频资源（new-dispatch.mp3 / new-order.mp3）+ marker 真图标 | P6/L UI 资源 / P7-L08 / P7-L09 |

### 3.7 NFR 真机率证

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-32 | APK ≤45MB / IPA ≤65MB 体积测量 | P7-L02 |
| [ ] P9-P1-33 | 冷启动 ≤2.5s / 定位 CPU ≤5% / 8h 耗电 ≤30% / 崩溃率 ≤0.3% | P7-L03 |
| [ ] P9-P1-34 | 30min 熄屏稳定性 4 款主流国产真机 | P7-L11 |

### 3.8 安全 / 合规

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P1-35 | OWASP ZAP 复测（依赖 staging） | T9.8 |
| [ ] P9-P1-36 | 渗透测试（第三方） | T9.12 / P7 同款 |
| [ ] P9-P1-37 | 管理员密码 RSA 加密传输 | L8-10 |

---

## 四、P2：体验 / 自动化 / 可维护性（Sprint 中期）

### 4.1 自动化测试

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P2-01 | T9.4 miniprogram-automator 用户端 E2E（下单/支付/跑腿） | T9.4 |
| [ ] P9-P2-02 | T9.5 Appium 商户端/骑手端 E2E（接单/派送/打印） | T9.5 |
| [ ] P9-P2-03 | T9.7 JMeter 复杂场景压测 | T9.7 |
| [ ] P9-P2-04 | 5 角色权限自动化 E2E（Playwright / Vitest） | L8-05 / 配合 W1.B.2 矩阵 |
| [ ] P9-P2-05 | uni-automator 自动化 E2E（商户端 / 骑手端） | P6-L12 |

### 4.2 兼容性 / 真机矩阵

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P2-06 | T9.10 BrowserStack 微信小程序兼容 | T9.10 |
| [ ] P9-P2-07 | T9.11 APP 真机矩阵（iOS 13+ / Android 8+ 10 机型） | T9.11 |
| [ ] P9-P2-08 | 小米 / 华为上传与图片权限提示验证 | P7-L13 |

### 4.3 监控 / 备份

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P2-09 | T9.27 Exporter K8s 真集群部署验证 | T9.27 |
| [ ] P9-P2-10 | T9.35 Redis 异地复制 | T9.35 |
| [ ] P9-P2-11 | T9.36 MinIO/OSS 跨区域复制 | T9.36 |
| [ ] P9-P2-12 | T9.37 恢复演练记录 | T9.37 |
| [ ] P9-P2-13 | T9.38 故障切换演练 | T9.38 |

### 4.4 P8 余项

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P2-14 | P8 WS 实时推送真接入 | L8-01 / P8-P2-01 |
| [ ] P9-P2-15 | wangEditor 图片上传对接 MinIO | L8-08 / P8-P2-07 |
| [ ] P9-P2-16 | 管理后台 Lighthouse ≥85 实测 | L8-04 续 / P8-P2-04 |

### 4.5 业务体验 / 后端补 API

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P2-17 | search/result 拆分 `searchProducts` / `searchErrandTemplates` | P5-L07 / P5-P2-01 |
| [ ] P9-P2-18 | 跟踪页右侧 Tab 反向高亮（IntersectionObserver） | P5-L08 / P5-P2-02 |
| [ ] P9-P2-19 | 评价标签后端配置 `/me/reviews/tags` | P5-L09 / P5-P2-03 |
| [ ] P9-P2-20 | 套餐编辑独立 UI | P6-L09 / P6-P2-01 |
| [ ] P9-P2-21 | 营业时间 cron 自动启停（后端） | P6-L10 / P6-P2-02 |

### 4.6 工具链

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P2-22 | Sass `[legacy-js-api]` 跨 P5/P6/P7 统一升级 + 三端回归 | TOOL-P2-01 / P6-R03 / P7-R02 |

---

## 五、P3：文档勘误 / 命名差异（Sprint 末期或 V2）

| 编号 | 项 | 来源 |
|---|---|---|
| [ ] P9-P3-01 | spec ValidationPipe 触发覆盖增强 | P3-P3-01 |
| [ ] P9-P3-02 | `api/file.md` X-Uploader 字样清理 | P3-P3-02 |
| [ ] P9-P3-03 | R2 报告 §8.2 数字一致性 | P3-P3-03 |
| [ ] P9-P3-04 | Postman E2E 真 JWT | P4-P3-03 |
| [ ] P9-P3-05 | `coupons-select` 金额边角 2 处 Number | P5-P3-01 |
| [ ] P9-P3-06 | `track.vue` 凭证加载命名差异（refreshOrder vs loadProofs） | P5-P3-02 |
| [ ] P9-P3-07 | R1 报告标题数字笔误 | P5-P3-03 |
| [ ] P9-P3-08 | `'o2o_rider_auth'` pinia persist key 抽常量 | P7-P3-01 |
| [ ] P9-P3-09 | 高级 BI / 数据透视 / 多租户 → V2 | P8-P3-01~03 |

---

## 六、上架 / 最终验收（外部依赖，等条件就绪）

| 编号 | 项 | 来源 / 阻塞 |
|---|---|---|
| [ ] P9-EXT-01 | T9.43 微信小程序审核资料 | 企业资质 |
| [ ] P9-EXT-02 | T9.44 小程序合规自检与提交 | 微信后台 |
| [ ] P9-EXT-03 | T9.45 iOS App Store 上架 | Apple 开发者账号 |
| [ ] P9-EXT-04 | T9.46 Android 主流市场上架 | 各市场账号 + 软著 |
| [ ] P9-EXT-05 | T9.47 72h 稳定性压测 | 生产 K8s |
| [ ] P9-EXT-06 | T9.48 渗透复测 | 第三方 |
| [ ] P9-EXT-07 | T9.49 功能回归全通过 | staging 全量数据 |
| [ ] P9-EXT-08 | T9.50 上线总演练 | 灰度 → 全量 |
| [ ] P9-EXT-09 | T9.51 汇总最终验收报告 | 上述完成后 |
| [ ] P9-EXT-10 | T9.52 更新说明文档为 🟢 完成 | 最终签字 |

---

## 七、一句话总结

> **当前**：P9 容器化 / CI/CD / 监控 / 备份 / 文档骨架已就绪；测试线（单测除外）+ 真机 + 真 SDK + 真集群 + 上架是接下来的主战场。
> **本期 Sprint 1**：清掉 P0 4 项（覆盖率 + 主 chunk + BizAuth + 11 处 parseFloat），为后续真联调打底。
