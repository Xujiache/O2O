# TASK_P3_后端基础服务

## 一、WBS

| 编号 | 任务 | 依赖 | 产出 | 工时(h) |
|---|---|---|---|---|
| T3.1 | 全局过滤器/拦截器/响应结构/错误码 | P1 | common/* | 3 |
| T3.2 | CryptoUtil / PasswordUtil / SnowflakeId / OrderNo | T3.1 | utils/* | 4 |
| T3.3 | TypeORM Entity：user/merchant/rider/admin/role/permission/address/qualification/blacklist | P2 | entities/* | 8 |
| T3.4 | Auth Module 基础（JWT Strategy + Guard） | T3.3 | auth/* | 6 |
| T3.5 | 小程序 `wx-mp/login` 完整流程 | T3.4 | wx-mp.strategy | 5 |
| T3.6 | 手机号短信验证码（发送/校验/风控） | T3.4 | auth.service | 5 |
| T3.7 | 商户/骑手/管理员登录 + Refresh + Logout | T3.4 | auth.controller | 5 |
| T3.8 | PermissionGuard + 权限缓存 | T3.4 | guards + decorators | 4 |
| T3.9 | User Module：用户 CRUD + 实名 + 地址 | T3.3,T3.8 | user/* | 8 |
| T3.10 | Merchant Module：商户 CRUD + 资质审核 | T3.3,T3.8 | user/merchants | 6 |
| T3.11 | Rider Module：骑手 CRUD + 资质审核 + 保证金 | T3.3,T3.8 | user/riders | 6 |
| T3.12 | Admin Module + 黑名单 + 操作日志 | T3.3,T3.8 | user/admins | 5 |
| T3.13 | Message Module：模板 + RabbitMQ 队列 + Consumer | P1 | message/* | 4 |
| T3.14 | WxSubscribeChannel + AccessToken 管理 | T3.13 | channels/wx | 4 |
| T3.15 | JPushChannel + AliSmsChannel + InboxChannel | T3.13 | channels/* | 6 |
| T3.16 | File Module：MinIO Adapter + 上传接口 + STS | P1 | file/* | 6 |
| T3.17 | AliOSS Adapter + 切换 | T3.16 | adapters/ali-oss | 3 |
| T3.18 | 水印 + MIME 校验 + file_meta 入库 | T3.16 | utils | 3 |
| T3.19 | Map Module：Amap Provider + 缓存 | P1 | map/* | 5 |
| T3.20 | geo.util（点在多边形） + 配送范围校验 | T3.19 | util | 2 |
| T3.21 | 骑手位置上报 + Redis GEO + MQ → TimescaleDB 批量写 | T3.19 | rider-location | 6 |
| T3.22 | 轨迹查询接口（用户/管理后台） | T3.21 | controller | 2 |
| T3.23 | Swagger 分组 + 示例 + 错误码注解 | 全部 | docs | 4 |
| T3.24 | 单元测试：Auth 关键路径 + CryptoUtil + MessageService + StorageAdapter | 全部 | tests/ | 10 |
| T3.25 | Postman 冒烟用例集 | 全部 | postman.json | 3 |
| T3.26 | 更新说明文档进度 | 全部 | 文档 | 0.5 |

**合计：约 113h ≈ 14 人日**

## 二、依赖
- T3.1 → T3.2 → T3.3 (实体先行)
- 各模块 (T3.4, T3.9, T3.13, T3.16, T3.19) 可**并行**推进
- 每模块完成后合并一次 Swagger 并跑冒烟

## 三、里程碑
- **M3.1**：Auth + User 跑通（登录 → 个人资料 → 地址 CRUD）
- **M3.2**：Message 异步可达 4 通道
- **M3.3**：File 上传下载通过
- **M3.4**：Map 定位上报 + 轨迹查询闭环
- **M3.5**：全量 Swagger 发布、Postman 冒烟通过，进入 P4

## 四、风险
| 风险 | 应对 |
|---|---|
| 微信 access_token 并发刷新 | Redis 分布式锁 `lock:wx:token` |
| 高德 IP 白名单 | 测试环境先用 SK 放通；生产加白名单 |
| MinIO STS 配置 | 默认关闭，优先用预签名 URL |
| 极光/短信依赖密钥缺失 | 各 Channel 支持 mock 模式 |

## 五、状态跟踪
见 `TODO_P3_后端基础服务.md`。
