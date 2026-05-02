# P9 外部依赖清单（不可代码化）— 上线前置交付

> **发布日期**：2026-05-02（Sprint 7 终轮交付物）
> **目标读者**：运营 / 测试 / 运维 / 法务 / 安全外协
> **使用方式**：每项配 ① 阻塞影响 ② 推荐处理方 ③ 预计工时 ④ 关联 P9 PUNCHLIST 编号
> **基线**：P9 代码层全部 🟢，剩余仅外部资源 / 真账号 / 真集群 / 真资质 / 第三方服务

---

## 一、清单总览

| 类别 | 项数 | 累计预计工时 |
|---|---:|---:|
| 真机率证 | 8 | 约 80 人时 |
| 真账号 / 真 Key | 10 | 约 60 人时 |
| 真集群 | 6 | 约 120 人时 |
| 真资质 | 5 | 约 240 人时 |
| 第三方服务 | 4 | 约 60 人时 |
| **合计** | **33** | **约 560 人时** |

---

## 二、真机率证（8 项）

> 真机覆盖 iOS / Android 各两款 + 一台老旧 Android 兼容机；测试需录屏 + 运行日志 + 截图，归档 `docs/P9_集成测试部署/真机录屏/` 目录。

| # | 项 | 阻塞影响 | 处理方 | 工时 | PUNCHLIST |
|---|---|---|---|---:|---|
| EXT-DEV-01 | iOS 后台 10 min 真机率证（骑手端 V7.23）| 上架 + 计费场景 | 骑手测试 + iOS 真机 (iPhone 12+) | 12h | P9-P1-26 |
| EXT-DEV-02 | iOS silent.wav + 30 min 静默播放真机率证 | 商户端 V6.x 后台播放 | 商户测试 + iOS 真机 | 8h | P9-P1-24 |
| EXT-DEV-03 | Android Foreground Service nativePlugin 真机验收 | P7-S4 nativePlugin 真编 380 行 Java 已就绪，需 HBuilderX 云打包后真机验收 | 骑手测试 + Android 真机 (Pixel 6 + 小米 13) | 16h | P9-P1-23 / P9-P1-27 |
| EXT-DEV-04 | 30 min 熄屏稳定性 4 款主流国产真机 | 骑手 P7-L11 NFR | 骑手测试 + 4 款国产真机（华为 / 小米 / OPPO / vivo）| 16h | P9-P1-34 |
| EXT-DEV-05 | 商户蓝牙打印 10 张连续 + 断开重连真机 | 商户 V6.26 NFR | 商户测试 + 蓝牙打印机（58/80 mm 各 1 台）| 8h | P9-P1-22 |
| EXT-DEV-06 | APK ≤ 45 MB / IPA ≤ 65 MB 体积测量 | 骑手 P7-L02 NFR | 运维 + 骑手 release 包 | 4h | P9-P1-32 |
| EXT-DEV-07 | 冷启动 ≤ 2.5 s / 定位 CPU ≤ 5% / 8h 耗电 ≤ 30% / 崩溃率 ≤ 0.3% | 骑手 P7-L03 NFR | 测试 + 骑手 release 包 + 性能测试工具 | 12h | P9-P1-33 |
| EXT-DEV-08 | 小米 / 华为上传与图片权限提示验证 | 骑手 P7-L13 兼容性 | 骑手测试 + 小米 / 华为真机 | 4h | P9-P2-08 |

---

## 三、真账号 / 真 Key（10 项）

> 全部 Secret 必须走 K8s Secret + KMS / Vault 注入，**严禁** 入仓 .env.production；K8s 部署文档已在 `部署/k8s/base/secret.yaml` 留 placeholder。

| # | 项 | 阻塞影响 | 处理方 | 工时 | PUNCHLIST |
|---|---|---|---|---:|---|
| EXT-KEY-01 | 用户端微信小程序真实 appid + 体验版上传 | 用户端上架 | 法务 + 微信开放平台账号 + 运维注入 | 4h | P9-P1-17 |
| EXT-KEY-02 | 微信支付商户号 mchid + V3 apiV3Key + 证书 | 支付链路联调 | 法务（注册商户）+ 后端注入 | 8h | P9-P1-19 |
| EXT-KEY-03 | 支付宝商户应用 appId + privateKey + alipayPublicKey | 备用支付通道 | 法务 + 后端注入 | 8h | P9-P1-19 |
| EXT-KEY-04 | 高德地图 SDK key（4 端 × 2 平台 = 8 套）| 用户端 / 商户端 / 骑手端 / 管理后台轨迹 | 运营 + 高德开发者账号 + 各端注入 | 4h | P9-P1-18 |
| EXT-KEY-05 | 极光推送 appKey + masterSecret + 证书（iOS APNs）| 推送通知 | 运营 + 极光控制台 + iOS APNs 证书 | 8h | P9-P1-28 |
| EXT-KEY-06 | 阿里云短信 accessKeyId + secret + 5 模板 ID + signName | 验证码 / 通知 | 运营 + 阿里云控制台 | 8h | P9-P1-29 |
| EXT-KEY-07 | 阿里云号码中心（AXN 隐私号）accessKeyId + 双号池 ID | 用户↔骑手通讯保护 | 法务（备案）+ 运维 | 4h | P9-P1-30 |
| EXT-KEY-08 | Sentry DSN（4 端 × prod/staging = 8 个 project）| 崩溃监控 | 运维 + Sentry 自托管或 SaaS | 4h | P9-P1-29 |
| EXT-KEY-09 | MinIO / 阿里 OSS access key + bucket | 文件上传 | 运维 + 阿里云 OSS / 自托管 MinIO | 4h | — |
| EXT-KEY-10 | RSA 密钥对（管理后台密码加密）| 已实现自动生成 + Redis 缓存（Sprint 5 W5.C），但生产需 KMS 托管私钥 | 安全 + 运维 | 8h | L8-10 |

---

## 四、真集群（6 项）

> Helm Chart 与 Kustomize overlay 已就位（`部署/helm/o2o/` + `部署/k8s/overlays/{staging,production}/`）。

| # | 项 | 阻塞影响 | 处理方 | 工时 | PUNCHLIST |
|---|---|---|---|---:|---|
| EXT-CLS-01 | docker-compose.staging 全栈拉起 + takeout/errand HTTP e2e | 业务集成测试启动 | 运维 + 后端 + 测试 | 16h | P9-P1-01 |
| EXT-CLS-02 | T9.27 Exporter K8s 真集群部署验证 | 监控生效 | 运维 + Prometheus / Grafana | 16h | P9-P2-09 |
| EXT-CLS-03 | T9.35 Redis 异地复制 | 容灾 | 运维 + 双地域 K8s 集群 | 24h | P9-P2-10 |
| EXT-CLS-04 | T9.36 MinIO / OSS 跨区域复制 | 容灾 | 运维 + OSS 跨域同步策略 | 16h | P9-P2-11 |
| EXT-CLS-05 | T9.37 / T9.38 恢复演练 + 故障切换演练记录 | 上线运维资质 | 运维 + 测试 | 24h | P9-P2-12 / P9-P2-13 |
| EXT-CLS-06 | T9.47 72 h 稳定性压测 | 上线放量 | 测试 + 运维 + 真集群 | 24h | P9-EXT-05 |

---

## 五、真资质（5 项）

> 上架资质流程长、独立外部依赖，建议运营 / 法务尽早启动。

| # | 项 | 阻塞影响 | 处理方 | 工时 | PUNCHLIST |
|---|---|---|---|---:|---|
| EXT-LIC-01 | 微信小程序审核资料（用户端 / 商户端）| 上架 | 运营 + 法务 + 企业资质 | 40h（含返修） | P9-EXT-01 / P9-EXT-02 |
| EXT-LIC-02 | iOS App Store 上架（商户端 / 骑手端）| 上架 | 运营 + 法务 + Apple 开发者账号（$99/年） | 80h（含返修）| P9-EXT-03 |
| EXT-LIC-03 | Android 主流市场上架（华为 / 小米 / OPPO / vivo / 应用宝 5 市场）| 上架 | 运营 + 法务 + 软件著作权（5 项 × 30 天） | 80h | P9-EXT-04 |
| EXT-LIC-04 | 等保合规测评（2.0 三级）| 长期合规 | 法务 + 第三方测评机构 | 16h（甲方配合） | R9.3 |
| EXT-LIC-05 | iOS VoIP 推送企业资质 | 商户后台呼叫 | 法务 + Apple Enterprise 账号 | 24h | R9.4 |

---

## 六、第三方服务（4 项）

| # | 项 | 阻塞影响 | 处理方 | 工时 | PUNCHLIST |
|---|---|---|---|---:|---|
| EXT-SVC-01 | OWASP ZAP 真集群复测 + 渗透测试 | 安全签字 | 安全外协（第三方机构）+ 真 staging 集群 | 24h | P9-P1-35 / P9-P1-36 / P9-EXT-06 |
| EXT-SVC-02 | T9.10 BrowserStack 微信小程序兼容矩阵 | 兼容性签字 | 测试 + BrowserStack 账号 | 16h | P9-P2-06 |
| EXT-SVC-03 | T9.11 APP 真机矩阵（iOS 13+ / Android 8+ 10 机型）| 兼容性签字 | 测试 + 真机租赁服务 | 16h | P9-P2-07 |
| EXT-SVC-04 | 真音频资源（new-dispatch.mp3 / new-order.mp3）+ marker 真图标 | 商户 / 骑手 UI 资产 | UI 设计 + 音频制作 | 4h | P9-P1-31 |

---

## 七、关键路径（优先级）

### 7.1 必须先于 staging 联调启动

- EXT-KEY-01 ~ EXT-KEY-09（除 KEY-10）
- EXT-CLS-01

### 7.2 staging 联调中执行

- EXT-DEV-01 ~ EXT-DEV-08
- EXT-CLS-02

### 7.3 上架前必须完成

- EXT-LIC-01 ~ EXT-LIC-03
- EXT-CLS-03 ~ EXT-CLS-06
- EXT-SVC-01 ~ EXT-SVC-04

### 7.4 上架后持续维护

- EXT-LIC-04（等保 2.0 三级）
- EXT-LIC-05（iOS VoIP 企业资质，可选）

---

## 八、推荐总执行节奏

```
W1     │ 法务启动：微信支付商户 / 小程序 appid / iOS / Android 软著（同步并行）
W2-W3  │ 运维准备：K8s 真集群 + KMS / Vault + Helm 部署 + Secret 注入（含 EXT-KEY 全部）
W4     │ 后端 + 运维 staging 真凭证联调（覆盖 EXT-KEY 全部）
W5-W6  │ 真机率证（8 项 EXT-DEV 并行 4 测试人员 × 2 周）
W7     │ 安全外协 OWASP / 渗透 + 兼容性矩阵
W8     │ 上架资质提交（小程序 / iOS / Android 全启动）
W9-W12 │ 上架返修 + 灰度发布 + 总演练 + 上线签字
```

---

## 九、与 P9_FINAL_REPORT 联动

`P9_FINAL_REPORT.md` §六「Punchlist 最终消化统计」列出代码层 67/82 项已闭环；剩余 **15 项** 为不可代码化外部依赖，本清单是其完整展开 + 附加 18 项纯外部资源（账号 / 资质 / 真机 / 第三方服务）合计 **33 项**。

| FINAL_REPORT 残留 | 数量 | 本清单展开为 |
|---|---:|---|
| 4 P1（真机率证 + 真凭证）| 4 | 8 EXT-DEV + 10 EXT-KEY |
| 1 P2（Sass legacy 跨阶段）| 1 | 已合并入工具链工时（不在本清单）|
| 10 EXT 上架 | 10 | 6 EXT-CLS + 5 EXT-LIC + 4 EXT-SVC |

---

## 十、一句话总结

> 33 项不可代码化外部依赖 = 8 真机 + 10 真账号/Key + 6 真集群 + 5 真资质 + 4 第三方服务，预计 ~560 人时；建议 W1 启动法务并行链、W2 启动运维链，**12 周内可推进至上线灰度**。代码层 P1~P9 全 🟢 已就绪，外部链一旦完成即可触发灰度发布 → 全量发布。
