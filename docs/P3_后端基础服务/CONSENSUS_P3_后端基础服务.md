# CONSENSUS_P3_后端基础服务

## 一、范围共识
1. 5 大基础服务对应 NestJS 5 个模块（`auth/`、`user/`、`message/`、`file/`、`map/`）
2. 全部接口纳入 Swagger OpenAPI `/docs`
3. 全部写操作打操作日志 `operation_log`
4. 全部数据符合 P2 设计

## 二、技术方案共识

### 2.1 Auth 模块
- 密码：bcrypt（cost=12）
- Token：JWT（HS512），payload: `{uid, userType, tenantId, ver}`，ver 支持一键失效
- Refresh：UUID + 存 Redis `auth:refresh:{uid}:{jti}`，滑动续期
- 多端登录守卫：`@UseGuards(JwtAuthGuard)` + `@UserTypes('user'|'merchant'|'rider'|'admin')`
- 权限守卫：`@Permissions('shop:update')` → 从 Redis 权限缓存比对
- 登录风控：`auth:loginfail:{mobileHash}` ≥ 5 次 → 锁 30min
- 短信验证码：`auth:sms:{mobileHash}`，5min，60s 内同一号码最多 1 次
- 微信小程序：`POST /auth/wx-mp/login` 接收 `code`，调用 `jscode2session`，按 openId 找/建用户
- 签名校验（仅管理后台）：AppKey/AppSecret + X-Sign = MD5(appKey+timestamp+nonce+body+appSecret)

### 2.2 User 模块
- 接口按角色拆：`/users/*`、`/merchants/*`、`/riders/*`、`/admins/*`
- 实名认证：三方身份核验（公安二要素/三要素）接口留适配层
- 商户/骑手资质：文件 URL 由 File 模块返回后存 `*_qualification` 表
- 地址：CRUD + 默认切换 + 智能识别（第三方解析 API 预留）
- 黑名单：管理后台专用接口 + 写操作日志

### 2.3 Message 模块
- 抽象 `interface MessageChannel { send(payload): Promise<Result> }`
- 4 个 Channel：`WxSubscribeChannel`、`JPushChannel`、`AliSmsChannel`、`InboxChannel`
- 模板管理：`message_template` 表；`code + channel` 唯一
- 发送入口：`MessageService.send(code, ownerType, ownerId, data)`
- 异步：RabbitMQ 队列 `message.push`，失败重试 3 次（指数退避）
- 记录：`push_record` + `message_inbox`
- 订阅消息 OpenID 缓存 `wx:subscribe:{userId}:{tmplId}`（一次性，发送即消耗）

### 2.4 File 模块
- 适配层：`StorageAdapter`（MinIO / AliOSS），配置切换
- 三种上传：
  - 后端代理上传（小文件 ≤ 5MB）
  - **STS 直传**（移动端大文件，推荐）：`POST /file/sts` 返回临时凭证
  - 预签名 URL（单次上传）
- 校验：MIME + 扩展名白名单；图片最大 20MB；视频 ≤ 100MB
- 水印：可配置图片右下角水印
- 元数据入库 `file_meta`，返回 CDN URL（生产）或直连（开发）
- 私有文件访问：签名 URL（1h 过期）

### 2.5 Map 模块
- 封装 `MapProvider` 接口，默认实现 `AmapProvider`
- 核心方法：
  - `geocode(address)` / `regeocode(lng,lat)`
  - `distance(from, to, type)` / `distanceMatrix(origins, dests)`
  - `routing(from, to, type)` 骑行/步行/驾车
  - `isWithin(polygon, point)` 点在多边形内（turf.js）
  - `riderReportLocation(riderId, lng, lat, ts, extra)`：写 Redis GEO + 投递 RabbitMQ → TimescaleDB 批量落盘
- 高德调用速率：使用缓存降低 QPS（`geocode:{hash}` 7d）

## 三、交付标准
- [ ] 5 个模块代码、单测覆盖率 ≥ 70%
- [ ] Swagger 接口齐全，含中文描述、示例、错误码
- [ ] 全部接口经 Postman 冒烟通过
- [ ] Redis / DB / MQ / MinIO / 高德均可一键启动开发环境
- [ ] `docs/P3_后端基础服务/api/*.md` 接口清单

## 四、风险与应对
| 风险 | 应对 |
|---|---|
| 微信订阅消息模板每次使用一次 | 前端每次触发订阅，后端记录一次性 tmplId |
| 高德 QPS 限流 | 加缓存 + 多 key 轮询 + 降级（返回近似） |
| MinIO/OSS 切换不平滑 | StorageAdapter 单测 + 配置注入 |
| 验证码恶意轰炸 | IP 限流 + 图形验证/滑块（P7+ 视情况引入） |
| JWT Secret 泄露 | 引入 ver 字段 + `auth:token-ver:{uid}` 一键失效 |

## 五、结论
- 所有方案锁定，可进入 DESIGN
