# Map 模块接口文档（P3 / 员工 C 负责）

> 基准：DESIGN_P3_后端基础服务.md §六 + ACCEPTANCE V3.21~V3.25
> 实现：`后端/src/modules/map/`

## 0. 通用约定

- 路径前缀：`/api/v1/map`
- 鉴权：与 File 模块相同（详见 `api/file.md`）
- 缓存（DESIGN §6.4）：

| key 模板 | 类型 | TTL |
|---|---|---|
| `geocode:{md5(address|city)}` | String(JSON) | 7d |
| `regeocode:{lng,lat round5}` | String(JSON) | 1d |
| `route:{from}:{to}:{type}` | String(JSON) | 30min |
| `shop:deliveryArea:{shopId}` | String(JSON) | 5min |
| `rider:loc:{riderId}` | Hash | 60s |
| `rider:online:{cityCode}` | GEO | — |

- TimescaleDB：`rider_location_ts` 超表（P2 timescale/01_schema.sql）

## 1. 接口清单（7 + 1 内部）

| Method | Path | 用途 | 端 |
|---|---|---|---|
| GET | `/api/v1/map/geocode` | 地址 → 坐标 | 内部 + 全端 |
| GET | `/api/v1/map/regeocode` | 坐标 → 地址 | 全端 |
| GET | `/api/v1/map/distance` | 两点距离（直线/驾车/步行） | 全端 |
| GET | `/api/v1/map/routing` | 路径规划 | 用户/骑手 |
| POST | `/api/v1/map/within-area` | 配送范围校验 | 用户下单 |
| POST | `/api/v1/map/shop-area` | 【内部】预热 polygon 缓存 | 商户后台 |
| POST | `/api/v1/map/rider/report` | 骑手位置上报 | 骑手 |
| GET | `/api/v1/map/rider/:id/track/:orderNo` | 轨迹查询 | 用户 / 管理后台 |

## 2. 接口明细

### 2.1 GET /map/geocode

**Query**：`address` 必填、`city` 可选
**响应 data**：
```json
{
  "lng": 116.4806,
  "lat": 39.9938,
  "level": "poi",
  "formatted": "北京市朝阳区望京 SOHO 塔1",
  "cityCode": "010",
  "adcode": "110105"
}
```
**错误**：`code:40004 MAP_PROVIDER_ERROR` + HTTP 400/502

### 2.2 GET /map/regeocode

**Query**：`lng` `lat`
**响应 data**：
```json
{ "formatted":"北京市朝阳区望京街","province":"北京市","city":"北京市","district":"朝阳区","cityCode":"010","adcode":"110105" }
```

### 2.3 GET /map/distance

**Query**：`fromLng/fromLat/toLng/toLat/type`
- `type=0` 直线（应用层 Haversine，不调高德，零网络往返）
- `type=1` 驾车，`type=3` 步行（高德 v3/distance）
**响应 data**：`{ distance, duration, type }`

### 2.4 GET /map/routing

**Query**：`fromLng/fromLat/toLng/toLat/routeType`
- `routeType ∈ driving|walking|bicycling|electrobike`
**响应 data**：
```json
{ "distance":8125, "duration":1080, "path":[[116.48,39.99],[116.40,39.91]], "type":"driving" }
```

### 2.5 POST /map/within-area

**Body**：
```json
{ "shopId":"7000000000000000001", "lng":116.48, "lat":39.99 }
```
**响应 data**：
```json
{ "within":true, "areaId":"7000000000000000003", "deliveryFee":5, "minOrder":20 }
```
**实现**：
1. 取 `shop:deliveryArea:{shopId}` Redis（5min TTL）；miss → 查 MySQL `delivery_area`
   （`area_type=1, owner_id=shopId, status=1`，按 `priority DESC` 取一条）
2. `turf.booleanPointInPolygon([lng,lat], polygon)`（v7 API）

### 2.6 POST /map/shop-area（内部接口）

商户后台保存 polygon 后调用，预热缓存（不写库）。
```json
{
  "shopId":"7000000000000000001",
  "polygon":{"type":"Polygon","coordinates":[[[116.47,39.99],[116.49,39.99],[116.49,39.97],[116.47,39.97],[116.47,39.99]]]},
  "deliveryFee":5, "minOrder":20, "overwrite":true
}
```

### 2.7 POST /map/rider/report

**Body**：
```json
{
  "riderId":"8000000000000000001",
  "cityCode":"110100",
  "locations":[
    { "ts":1745040000000, "lng":116.48, "lat":39.99, "speedKmh":18, "dir":90, "acc":5, "battery":80, "orderNo":null }
  ]
}
```

**处理**（DESIGN §6.2）：
1. 同步：`HSET rider:loc:{riderId}` (TTL 60s) + `GEOADD rider:online:{cityCode} <lng> <lat> <riderId>`
2. 异步：投递 RabbitMQ `rider.location` 队列；consumer 内置缓冲，每秒（或满 2000 条）批量
   `INSERT INTO rider_location_ts (...)`（pg.Pool）
3. 严禁同步直写 TimescaleDB；接口 P95 ≤ 50ms

**响应 data**：
```json
{ "accepted":1, "geoUpdated":true, "batchId":"rider-loc-1745040000000-7" }
```

**错误**：
- `code:10001 PARAM_INVALID` + HTTP 400 当 lng/lat 全部越界
- `code:50005 SYSTEM_MQ_ERROR` + HTTP 502 当 RabbitMQ publish 失败

### 2.8 GET /map/rider/:id/track/:orderNo

**Path**：`id` 骑手 ID；`orderNo` 订单号
**Query**：`fromTs?` `toTs?` ISO 字符串

**响应 data**：
```json
{
  "riderId":"8000000000000000001",
  "orderNo":"T20260419AB123",
  "pointCount":47,
  "geometry":{"type":"LineString","coordinates":[[116.48,39.99],[116.40,39.91]]},
  "timestamps":[1745040000000,1745040010000],
  "properties":{"startMs":1745040000000,"endMs":1745040600000,"totalDistanceM":8125,"avgSpeedKmh":28}
}
```

**实现**：直查 TimescaleDB rider_location_ts（按 `(rider_id, time DESC)` 索引），最多 5000 点，
应用层算 totalDistanceM（trackTotalLengthM）+ avgSpeedKmh。

## 3. RABBITMQ → TimescaleDB 全链路

```
POST /map/rider/report
   → RiderLocationService.reportBatch
       ├─ Redis: HSET rider:loc:{riderId} + GEOADD rider:online:{cityCode}
       └─ Publisher: AmqpRiderLocationPublisher.publishBatch (queue=rider.location)
            ↓ amqplib persistent message
       Consumer: RiderLocationConsumer
          ├─ acceptBatch → 内存缓冲
          ├─ 满 RIDER_REPORT_BATCH_SIZE 即触发 flushBuffer
          └─ 每 RIDER_REPORT_FLUSH_INTERVAL_MS 周期 flush
               ↓
          pg.Pool.query → INSERT INTO rider_location_ts (time, rider_id, ...)
```

参数（`后端/src/config/configuration.ts` `map.*`）：
- `RIDER_REPORT_BATCH_SIZE` 默认 2000
- `RIDER_REPORT_FLUSH_INTERVAL_MS` 默认 1000

## 4. 错误码段位

| 段位 | 触发条件 | HTTP |
|---|---|---|
| 10001 PARAM_INVALID | lng/lat 越界、shopId 缺失、坐标参数非法 | 400 |
| 40004 MAP_PROVIDER_ERROR | 高德 status=0 / HTTP 非 2xx / 超时 | 400 / 502 / 503 |
| 50003 SYSTEM_DB_ERROR | TimescaleDB 查询失败 | 502 |
| 50005 SYSTEM_MQ_ERROR | RabbitMQ publish 失败 | 502 |

## 5. 自验证（开发环境）

```bash
# 配送范围（先预热缓存）
curl -X POST http://localhost:3000/api/v1/map/shop-area -H 'Content-Type: application/json' -d '{
  "shopId":"S1",
  "polygon":{"type":"Polygon","coordinates":[[[116.47,39.99],[116.49,39.99],[116.49,39.97],[116.47,39.97],[116.47,39.99]]]}
}'
curl -X POST http://localhost:3000/api/v1/map/within-area -H 'Content-Type: application/json' -d '{ "shopId":"S1","lng":116.48,"lat":39.98 }'

# 骑手位置上报
curl -X POST http://localhost:3000/api/v1/map/rider/report -H 'Content-Type: application/json' -d '{
  "riderId":"R1","cityCode":"110100",
  "locations":[{"ts":1745040000000,"lng":116.48,"lat":39.99,"speedKmh":18}]
}'

# Redis 校验
docker exec o2o-redis redis-cli -a o2o_redis_2026 HGETALL rider:loc:R1
docker exec o2o-redis redis-cli -a o2o_redis_2026 GEOPOS rider:online:110100 R1

# TimescaleDB 校验
docker exec o2o-timescaledb psql -U o2o_ts -d o2o_timescale -c "SELECT count(*) FROM rider_location_ts WHERE rider_id=1::bigint;"

# 轨迹
curl 'http://localhost:3000/api/v1/map/rider/R1/track/T20260419AB123'
```
