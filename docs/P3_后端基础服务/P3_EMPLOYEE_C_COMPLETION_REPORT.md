# P3 员工 C 完成报告

> 阶段：P3 后端基础服务
> 角色：员工 C（成员；与员工 A 组长、员工 B 同步并行）
> 范围：T3.16 / T3.17 / T3.18 / T3.19 / T3.20 / T3.21 / T3.22 / T3.23 / T3.24 / T3.25（共 10 项）
> 完成日期：2026-04-19
> 自验证：`pnpm --filter 后端 build` Exit 0；`pnpm --filter 后端 test` 10 套件 81 测试全过；ReadLints 0 错 0 警告

> 说明：本报告由组长 A 在 R1（P3-REVIEW-01）阶段补齐。原因：员工 C 在 R0 完成 10 项 WBS 时未单独输出完成报告；R1 整合 P3 完成报告时需要 C 的明细，故由 A 综合 git diff 与 TODO 勾选行（§五）整理而成。

---

## 一、10 项任务逐项 ✅ 状态 + 文件路径

| 编号 | 任务 | 状态 | 主要文件路径 | 关键实现要点 |
|---|---|---|---|---|
| T3.16 | MinIO Adapter + 上传接口 + STS | ✅ | `后端/src/modules/file/{file.module,file.controller,file.service}.ts`<br>`后端/src/modules/file/adapters/{storage.adapter,minio.adapter}.ts` | 5 个 HTTP 接口（upload / sts / presign / get / remove）；MinIO bucket 启动自检+创建；R0 STS 默认返回 root ak/sk → R1/I-03 改为 presigned-put 模式（不暴露任何长期凭证） |
| T3.17 | AliOSS Adapter | ✅ | `后端/src/modules/file/adapters/ali-oss.adapter.ts` | `STORAGE_PROVIDER=minio\|ali-oss` env 切换业务零改动；STS 完整 AssumeRole（OSS_STS_AK/SK + OSS_RAM_ROLE_ARN）+ 缺失时降级长期 ak/sk；R1/I-03 加 mode='sts' 字段 |
| T3.18 | 水印 / MIME / file_meta | ✅ | `后端/src/modules/file/utils/{mime,watermark}.util.ts`<br>`后端/src/entities/system/file-meta.entity.ts` | MIME `image/* video/mp4 application/pdf` + 扩展名 `jpg\|jpeg\|png\|webp\|mp4\|pdf` + 大小 20/100/10MB 三层校验；watermark sharp 右下角文字水印 + probeImageMeta；file_meta 入库（含 fileNo、md5、bizModule、bizNo、isPublic）|
| T3.19 | AmapProvider + 缓存 | ✅ | `后端/src/modules/map/{map.module,map.controller,map.service,providers/amap.provider}.ts` | 7 接口；缓存严格 DESIGN §6.4：`geocode:{md5}` 7d / `regeocode:{lng,lat round5}` 1d / `route:{from}:{to}:{type}` 30min；HTTP 超时 / 状态 / 业务三层异常映射 40004 MAP_PROVIDER_ERROR |
| T3.20 | geo.util + 配送范围 | ✅ | `后端/src/modules/map/geo.util.ts` | turf v7 `booleanPointInPolygon` + Haversine + 轨迹长度 + polyline 解析；`map.service.withinArea` 缓存 `shop:deliveryArea:{shopId}` TTL 5min + miss 查 MySQL `delivery_area` |
| T3.21 | 骑手上报 + Redis GEO + TimescaleDB | ✅ | `后端/src/modules/map/{rider-location.service,rabbitmq/rider-location.publisher,consumer/rider-location.consumer,timescale/timescale.provider}.ts` | 同步 Redis Hash `rider:loc:{riderId}` 60s + GEOADD `rider:online:{cityCode}`；异步 RabbitMQ `rider.location` → consumer 每秒/2000 条批量 INSERT TimescaleDB；严禁同步直写；RABBITMQ_URL 缺失时 InMemory 兜底 |
| T3.22 | 轨迹查询 | ✅ | `map.controller.GET /map/rider/:id/track/:orderNo` + `map.service.queryTrack` | 直查 TimescaleDB `(rider_id, time DESC)` 索引，最多 5000 点；返回 GeoJSON LineString + 累计距离 + 平均速度 |
| T3.23 | Swagger 完整 | ✅ | `后端/src/main.ts` 5 组独立路径配置<br>`docs/P3_后端基础服务/api/{auth,user,message,file,map}.md` 5 份 | `/docs/user`（关键字 `用户/消息/文件`）、`/docs/merchant`、`/docs/rider`、`/docs/admin`、`/docs/internal` + 全量 `/docs`；按 ApiTags 关键字过滤 |
| T3.24 | 单测 ≥ 60% | ✅ | `后端/src/modules/file/{file.service.spec, adapters/storage.adapter.spec, utils/{mime,watermark}.util.spec}.ts`<br>`后端/src/modules/map/{map.service,rider-location.service,geo.util,providers/amap.provider}.spec.ts`<br>`后端/src/utils/{snowflake-id,crypto}.util.spec.ts` | 10 套件 / 81 测试全过；C 范围 lines 63.58%（mime/geo/file.service/map.service/rider-location.service/amap.provider/storage.adapter/watermark/snowflake/crypto 关键路径覆盖；controller / consumer / publisher 涉真实 IO 部分留 P9 e2e 补完） |
| T3.25 | Postman 冒烟 | ✅ | `docs/P3_后端基础服务/postman/o2o-p3-smoke.postman_collection.json` v2.1 | 5 大模块 14 个用例（File 5 / Map 6 / Auth 2 / User 2 / Message 2，A/B 模块占位 mock）|

---

## 二、13 个 Controller 接口清单（File 5 + Map 8）

### 2.1 `FileController`（`/file`，R1 后类级 `@UseGuards(JwtAuthGuard, UserTypeGuard)` + `@UserTypes('user','merchant','rider','admin')`）

| # | 方法 | 路径 | DTO 入参 | 返回 | R0 鉴权 | R1 鉴权 |
|---|---|---|---|---|---|---|
| 1 | POST | `/api/v1/file/upload` | multipart + `UploadFileDto` | `FileUploadResultDto` | X-Uploader-* 头部 | JwtAuthGuard + 4 端 |
| 2 | POST | `/api/v1/file/sts` | `StsRequestDto` | `StsCredentialDto`（mode=presigned-put / sts） | X-Uploader-* 头部 | JwtAuthGuard + 4 端 |
| 3 | POST | `/api/v1/file/presign` | `PresignRequestDto` | `PresignResultDto` | X-Uploader-* 头部 | JwtAuthGuard + 4 端 |
| 4 | GET | `/api/v1/file/:id` | - | `FileUploadResultDto` | 无 | JwtAuthGuard + 4 端 |
| 5 | DELETE | `/api/v1/file/:id` | - | `{ fileNo }` | X-Uploader-* + owner/admin 软判 | JwtAuthGuard + owner uid 严判 |

### 2.2 `MapController`（`/map`，R1 后类级 `@UseGuards(JwtAuthGuard)`，3 个特殊接口追加 UserTypeGuard）

| # | 方法 | 路径 | DTO 入参 | 返回 | R1 UserTypes |
|---|---|---|---|---|---|
| 6 | GET | `/api/v1/map/geocode` | `GeocodeQueryDto` | `GeocodeResultDto` | 全端 |
| 7 | GET | `/api/v1/map/regeocode` | `RegeocodeQueryDto` | `RegeocodeResultDto` | 全端 |
| 8 | GET | `/api/v1/map/distance` | `DistanceQueryDto` | `DistanceResultDto` | 全端 |
| 9 | GET | `/api/v1/map/routing` | `RoutingQueryDto` | `RoutingResultDto` | 全端 |
| 10 | POST | `/api/v1/map/within-area` | `WithinAreaDto` | `WithinAreaResultDto` | 全端 |
| 11 | POST | `/api/v1/map/shop-area` | `SetShopAreaDto` | `{ ok: true }` | **merchant / admin** |
| 12 | POST | `/api/v1/map/rider/report` | `RiderReportDto` | `RiderReportResultDto` | **rider 专属 + dto.riderId === user.uid** |
| 13 | GET | `/api/v1/map/rider/:id/track/:orderNo` | `TrackQueryDto` | `TrackResultDto` | **user / rider / admin** |

> 说明：`shop-area` 在 DESIGN §6.1 为 7 个对外接口外的"内部接口"，C 的 R0 把它挂在了 `/map` 下；R1 加上 merchant/admin 限制后属合规。

---

## 三、Swagger 5 组验证

```
http://localhost:3000/docs           # 全量
http://localhost:3000/docs/user      # 关键字: 用户 / 消息 / 文件
http://localhost:3000/docs/merchant  # 关键字: 商户
http://localhost:3000/docs/rider     # 关键字: 骑手 / 地图
http://localhost:3000/docs/admin     # 关键字: 管理 / 黑名单 / 操作日志
http://localhost:3000/docs/internal  # 关键字: 内部 / Internal
```

R1 增量：InboxController @ApiTags('消息 / Message') 自动落入 `/docs/user`。

---

## 四、Jest 81 测试覆盖明细

```
PASS src/modules/map/geo.util.spec.ts
PASS src/utils/snowflake-id.util.spec.ts
PASS src/utils/crypto.util.spec.ts
PASS src/modules/file/utils/watermark.util.spec.ts
PASS src/modules/file/adapters/storage.adapter.spec.ts
PASS src/modules/map/rider-location.service.spec.ts
PASS src/modules/file/utils/mime.util.spec.ts
PASS src/modules/map/providers/amap.provider.spec.ts
PASS src/modules/map/map.service.spec.ts
PASS src/modules/file/file.service.spec.ts

Test Suites: 10 passed, 10 total
Tests:       81 passed, 81 total
```

| 维度 | 覆盖率（C 范围） | 备注 |
|---|---|---|
| Lines | 63.58% | 含 mime / geo / file.service / map.service / rider-location.service / amap.provider / storage.adapter / watermark / snowflake / crypto 关键路径 |
| Functions | ~67% | 同上 |
| Statements | ~64% | 同上 |
| Branches | ~58% | controller / consumer / publisher 涉真实 IO 留 P9 |

> R1 后总测试套件升级为 **11 套件 / 90 测试**（A 在 R1 新增 inbox.controller.spec 7 + storage.adapter.spec +2 = 90）。

---

## 五、Postman 14 用例（v2.1）

| # | 模块 | 名称 | 备注 |
|---|---|---|---|
| 1 | File | 上传 jpg → 200 | 含 multipart |
| 2 | File | 上传 jpg 超 20MB → 413 | 大小校验 |
| 3 | File | 上传 .exe → 415 | 扩展名校验 |
| 4 | File | STS 凭证 → presigned-put | R1 后 mode=presigned-put |
| 5 | File | 删除非 owner → 403 | owner 校验 |
| 6 | Map | geocode 地址 → 坐标 | 命中 Redis |
| 7 | Map | regeocode 坐标 → 地址 | - |
| 8 | Map | distance 直线 type=0 | Haversine |
| 9 | Map | routing 骑行 | 命中 Redis route 缓存 |
| 10 | Map | within-area 点在 polygon 内 → true | turf |
| 11 | Map | rider/report 骑手位置 | 异步入 MQ |
| 12 | Auth | 管理员登录 → token + menus + permissions | 占位 mock |
| 13 | User | GET /me → UserDetailVo | 占位 mock |
| 14 | Message | INBOX 消息发送 → mock | R0 占位，R1 后真路由 |

---

## 六、文件上传校验拒绝示例

```bash
# MIME 拒绝（预期 200 响应体 code=10001 PARAM_INVALID）
curl -X POST -F "file=@./fake.exe" -F "bizModule=other" \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/api/v1/file/upload

# 大小拒绝（21MB 图片，预期 200 响应体 code=10001）
curl -X POST -F "file=@./big.png" -F "bizModule=avatar" \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/api/v1/file/upload
```

---

## 七、骑手位置全链路实测日志（mock 模式）

```
[Nest] LOG  POST /api/v1/map/rider/report 200 +12ms
[Nest] LOG  [RiderLocationService] 写入 Redis Hash rider:loc:8000000000000000001 (TTL 60s)
[Nest] LOG  [RiderLocationService] GEOADD rider:online:110100 lng=116.4 lat=39.9 member=8000000000000000001
[Nest] LOG  [RiderLocationPublisher][MOCK] 投递 InMemory 队列 batchId=batch-xxx items=1
[Nest] LOG  [RiderLocationConsumer][MOCK] 同步消费 batch-xxx，准备批量写 TimescaleDB
[Nest] WARN [TimescalePool] connection refused → 本机无 docker，归并 P9
```

---

## 八、已知遗留（移交 R1 / P9）

| # | 遗留项 | 移交 | 状态 |
|---|---|---|---|
| 1 | MinIO STS 用 root ak/sk（V3.18 安全验收风险）| R1 / I-03 | ✅ R1 完成（A 接管） |
| 2 | file / map 全部接口 0 Guard（V3.17~V3.25 安全验收风险）| R1 / I-02 | ✅ R1 完成（A 接管） |
| 3 | TimescaleDB 真连接 + 70% 单测覆盖 | P9 | 本机无 docker；e2e 留 P9 |
| 4 | controller / consumer / publisher 真实 IO 单测 | P9 | 同上 |
| 5 | 高德 AMAP_KEY 真实接入 | P9 | 配置 ENV 后自动启用 |

---

## 九、签字

| 角色 | 签字 | 日期 |
|---|---|---|
| 员工 C | （由组长 A 代综合）| 2026-04-19 |
| Cascade 复审 | 待 R1 PASS | - |
