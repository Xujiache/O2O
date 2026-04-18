# TODO_P3_后端基础服务

> 与 `TASK_P3_后端基础服务.md` 一一对应。

## 一、进行中
- [ ] —

## 二、待办

### M3.1 基础公共
- [x] T3.1 全局过滤器/拦截器/响应结构（员工 A）
- [x] T3.2 CryptoUtil / PasswordUtil / Snowflake / OrderNo（员工 A）
- [x] T3.3 TypeORM Entity（账号/角色/权限/地址/资质 14 个 + D10 file_meta 桥接）（员工 A）

### M3.2 Auth
- [x] T3.4 JWT Strategy + Guard 基础（员工 A）
- [x] T3.5 小程序 wx-mp 登录（员工 A）
- [x] T3.6 短信验证码 + 风控（员工 A）
- [x] T3.7 商户/骑手/管理员登录 + Refresh + Logout（员工 A）
- [x] T3.8 PermissionGuard + 权限缓存（员工 B）—— `auth/guards/permission.guard.ts`：Redis Set TTL 7200s + 超管 `*` 通配 + DB 三表 join 回源 + AdminService 配套刷新接口

### M3.3 User
- [x] T3.9 用户 CRUD + 实名 + 地址（员工 B）—— `user/{user,address}.controller` + `services/{user,address}` + DTO；K06 缓存失效；详情默认 `mobileTail4`、列表禁返回 `*_enc/_hash`
- [x] T3.10 商户 CRUD + 资质审核（员工 B）—— `user/merchant.controller` + `services/{merchant,qualification}` + DTO；K07 缓存失效；4 状态审核流转
- [x] T3.11 骑手 CRUD + 资质 + 保证金（员工 B）—— `user/rider.controller` + `services/rider` + DTO；K08 缓存失效；保证金事务 + 余额自动累加
- [x] T3.12 管理员 + 黑名单 + 操作日志（员工 B）—— `user/admin.controller` + `services/{admin,blacklist,operation-log}` + DTO；权限缓存联动 DEL；黑名单封禁联动主账号 status=0；全部写操作落 `operation_log`

### M3.4 Message
- [x] T3.13 模板管理 + RabbitMQ（员工 B）—— `message/{message.module,message.service,template/template.service,consumer/message.consumer}`；18+ 模板 code 注册 + bootstrap；RabbitMQ 三队列拓扑（main/retry/dead）+ TTL 60s 退避 + ≥3 次进死信；mock 模式（in-memory）可工作
- [x] T3.14 WxSubscribeChannel（员工 B）—— `message/channels/wx-subscribe.channel.ts`；Redlock `lock:wx:token` PX 5000 + 缓存 `cache:wx:access_token` TTL 7000s + 双重检查 + Lua CAS 释放锁 + 40001/42001 自动失效；mock 模式可工作
- [x] T3.15 JPush / AliSms / Inbox（员工 B）—— `message/channels/{jpush,ali-sms,inbox}.channel.ts`；JPush alias/regId 双投；AliSms K30 同号 60s 频控（SETNX EX 60）+ 阿里云 POP V1 签名；Inbox 直写 `message_inbox`；4 通道全 mock 可工作

### M3.5 File
- [x] T3.16 MinIO Adapter + 上传接口 + STS（员工 C）—— `modules/file/{file.module,file.controller,file.service}` + `adapters/{storage.adapter,minio.adapter}`；4 个接口（upload / sts / presign / 反查）；STS 默认 root ak/sk 兜底（生产建议 K8s 注入 STS-AssumeRole）；DELETE 按 owner+admin 校验
- [x] T3.17 AliOSS Adapter（员工 C）—— `modules/file/adapters/ali-oss.adapter.ts`；`STORAGE_PROVIDER=minio|ali-oss` env 切换业务零改动；STS 完整 AssumeRole（OSS_STS_* / OSS_RAM_ROLE_ARN）+ 缺失时降级长期 ak/sk
- [x] T3.18 水印 / MIME / file_meta（员工 C）—— `utils/{mime,watermark}.util.ts` + `entities/system/file-meta.entity.ts`（继承 BaseEntity）；MIME `image/* video/mp4 application/pdf` + 扩展名 `jpg|jpeg|png|webp|mp4|pdf` + 大小 20/100/10MB 三层校验；watermark sharp 右下角文字水印 + probeImageMeta；file_meta 入库

### M3.6 Map
- [x] T3.19 AmapProvider + 缓存（员工 C）—— `modules/map/{map.module,map.controller,map.service,providers/amap.provider}.ts`；7 接口；缓存严格 DESIGN §6.4：`geocode:{md5}` 7d / `regeocode:{lng,lat round5}` 1d / `route:{from}:{to}:{type}` 30min；HTTP 超时/状态/业务三层异常映射 40004 MAP_PROVIDER_ERROR
- [x] T3.20 geo.util + 配送范围（员工 C）—— `modules/map/geo.util.ts`（turf v7 `booleanPointInPolygon` + Haversine + 轨迹长度 + polyline 解析）；`map.service.withinArea` 缓存 `shop:deliveryArea:{shopId}` TTL 5min + miss 查 MySQL `delivery_area`
- [x] T3.21 骑手上报 + Redis GEO + TimescaleDB（员工 C）—— `modules/map/{rider-location.service,rabbitmq/rider-location.publisher,consumer/rider-location.consumer,timescale/timescale.provider}.ts`；同步 Redis Hash `rider:loc:{riderId}` 60s + GEOADD `rider:online:{cityCode}`；异步 RabbitMQ `rider.location` → consumer 每秒/2000 条批量 INSERT TimescaleDB；严禁同步直写；RABBITMQ_URL 缺失时 InMemory 兜底
- [x] T3.22 轨迹查询（员工 C）—— `map.controller.GET /map/rider/:id/track/:orderNo`；直查 TimescaleDB `(rider_id, time DESC)` 索引，最多 5000 点；返回 GeoJSON LineString + 累计距离/平均速度

### M3.7 收尾
- [x] T3.23 Swagger 完整（员工 C）—— `main.ts` 5 组独立路径（`/docs/user|merchant|rider|admin|internal`）+ 全量 `/docs`；按 ApiTags 关键字过滤；`docs/P3_后端基础服务/api/{auth,user,message,file,map}.md` 5 份齐全
- [x] T3.24 单测 ≥ 60%（员工 C）—— 10 套件 / 81 测试全过；员工 C 范围 lines 63.58%（全文件 mime/geo/file.service/map.service/rider-location.service/amap.provider/storage.adapter/watermark/snowflake/crypto 关键路径覆盖；controller / consumer / publisher 涉真实 IO 部分留 P9 e2e 补完）
- [x] T3.25 Postman 冒烟（员工 C）—— `docs/P3_后端基础服务/postman/o2o-p3-smoke.postman_collection.json` v2.1；5 大模块 14 个用例（File 5 / Map 6 / Auth 2 / User 2 / Message 2，A/B 模块占位 mock）
- [x] T3.26 更新说明文档（员工 A 组长，详见 §3.3 P3 关键日志）

## 三、已完成
（暂无）

## 四、阻塞
| 任务 | 原因 | 责任人 | 预计解除 |
|---|---|---|---|
| - | - | - | - |

## 五、变更记录
| 日期 | 变更内容 | 变更人 |
|---|---|---|
| 2026-04-18 | 初建，依据 TASK_P3 拆解 | 架构组 |
| 2026-04-19 | 员工 A 完成 T3.1~T3.7 + T3.26（自身负责的 8 项）全部 ✅；并发现/补齐若干集成依赖：D10 file_meta 桥接、generateBizNo、operation-log.service 占位、message.service 占位、amqplib Connection 类型补丁、@types/pg、@types/geojson、tsconfig multer types | 员工 A（组长） |
| 2026-04-19 | 员工 B 完成 T3.8/T3.9/T3.10/T3.11/T3.12/T3.13/T3.14/T3.15（全部 8 项）；增量产出：①  `entities/system/operation-log.entity.ts` + 4 张 D9 message entity 并补齐 `entities/index.ts` D9 桶形 / ALL_ENTITIES 聚合；② `modules/auth/guards/permission.guard.ts`（Redis Set TTL 2h + 超管 `*` 通配 + DB 三表 join 回源） + 配套 `auth/decorators/permissions.decorator.ts`；③ `modules/user/`（5 Controller + 7 Service + DTO 全套，含 admin/blacklist/operation-log）；④ `modules/message/`（service + consumer + template + 4 channels + 18+ 模板 code 注册），全部 channel mock 模式可工作；⑤ pnpm --filter 后端 build Exit 0 验证通过；⑥ ReadLints 0 错 0 警告 | 员工 B |
| 2026-04-19 | 员工 C 完成 T3.16~T3.25（10 项）：① `modules/file/`（4 接口 + MinIO/AliOSS 双适配器 + STS 生成 + 预签名 PUT + 三层校验 + sharp 水印 + file_meta 入库）；② `modules/map/`（7 对外接口 + Amap Provider + 缓存 + turf v7 配送范围 + Redis GEO + RabbitMQ Publisher/Consumer + pg.Pool TimescaleDB 批量 INSERT + 轨迹 GeoJSON）；③ `entities/system/file-meta.entity.ts` + `D10_SYSTEM_ENTITIES` + DatabaseModule 注册；④ `utils/snowflake-id.util.ts`（雪花 ID + nextFileNo）；⑤ `main.ts` Swagger 5 组（user/merchant/rider/admin/internal）+ 全量 /docs；⑥ `docs/P3_后端基础服务/api/{auth,user,message,file,map}.md` 5 份；⑦ `docs/P3_后端基础服务/postman/o2o-p3-smoke.postman_collection.json` 14 用例；⑧ jest 10 套件 81 测试全过 + lines 63.58%（员工 C 范围）；⑨ pnpm --filter 后端 build Exit 0 + grep `: any` / `console.log` 0 命中；⑩ 顺手补：`@types/pg`、`@types/multer`、`@types/ali-oss`、根 `pnpm.onlyBuiltDependencies` 放行 sharp 原生构建；env 增 `STORAGE_*` / `OSS_*` / `AMAP_*` / `RIDER_REPORT_*` / `TIMESCALE_*` / `SNOWFLAKE_WORKER_ID` 字段；configuration.ts + env.validation.ts 同步 | 员工 C |
| 2026-04-19 | P3-REVIEW-01 第 1 轮修复完成（I-01 P0 + I-02~I-05 共 4 项 P1） | 员工 A（修复轮次 R1） |
| 2026-04-19 | P3-REVIEW-02 第 2 轮修复完成（I-09 P1 + I-10/I-13/I-14/I-15 共 4 项 P2） | 员工 A（修复轮次 R2） |
