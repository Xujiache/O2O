# DESIGN_P3_后端基础服务

## 一、模块划分（NestJS）
```
后端/src/modules/
├── auth/           # 统一认证授权
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/{jwt,local,wx-mp}.strategy.ts
│   ├── guards/{jwt-auth,user-type,permission,throttle-sign}.guard.ts
│   ├── decorators/{user-types,permissions,current-user}.ts
│   └── dto/*.dto.ts
├── user/           # 用户中心
│   ├── controllers/{user,merchant,rider,admin,address}.controller.ts
│   ├── services/{user,merchant,rider,admin,address,blacklist,qualification}.service.ts
│   └── dto/*.dto.ts
├── message/        # 消息推送
│   ├── message.service.ts
│   ├── channels/{wx-subscribe,jpush,ali-sms,inbox}.channel.ts
│   ├── consumer/message.consumer.ts (RabbitMQ)
│   └── template/template.service.ts
├── file/           # 文件存储
│   ├── file.controller.ts
│   ├── file.service.ts
│   ├── adapters/{minio,ali-oss}.adapter.ts
│   └── utils/{mime,watermark}.ts
└── map/            # 地图定位
    ├── map.controller.ts (仅内部)
    ├── map.service.ts
    ├── providers/amap.provider.ts
    ├── geo.util.ts (turf)
    └── rider-location.service.ts
```

## 二、Auth 详细设计

### 2.1 登录接口
| 端 | 路径 | 入参 | 出参 |
|---|---|---|---|
| 用户端(小程序) | `POST /api/v1/auth/wx-mp/login` | `{code, encryptedData?, iv?}` | `{accessToken, refreshToken, user:{id,avatar,nickname,mobileTail4?}}` |
| 用户端(绑手机) | `POST /api/v1/auth/mobile/bind` | `{mobile, smsCode}` | `{ok}` |
| 商户端 | `POST /api/v1/auth/merchant/login` | `{mobile, password}` | `{accessToken, refreshToken, merchant}` |
| 商户端短信 | `POST /api/v1/auth/merchant/sms-login` | `{mobile, smsCode}` | 同上 |
| 骑手端 | `POST /api/v1/auth/rider/login` | 同商户 | 同上 |
| 管理后台 | `POST /api/v1/auth/admin/login` | `{username, password, captcha?}` | `{accessToken, refreshToken, admin, menus, permissions}` |
| 通用 | `POST /api/v1/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` |
| 通用 | `POST /api/v1/auth/logout` | - | `{ok}` |
| 短信 | `POST /api/v1/auth/sms/send` | `{mobile, scene}` | `{ok}` |

### 2.2 JWT Payload
```ts
interface JwtPayload {
  uid: string;         // 雪花 ID 字符串
  userType: 'user'|'merchant'|'rider'|'admin';
  tenantId: number;
  ver: number;         // 强制失效版本
  iat: number; exp: number;
}
```

### 2.3 Guard 链
- 全局：`JwtAuthGuard`（除 `@Public()` 外）
- 子路由：`UserTypeGuard` + `PermissionGuard`
- 管理后台：额外 `ThrottleSignGuard`（X-Sign 校验）

### 2.4 登录风控流程
1. 计算 `mobileHash = HMAC(mobile, pepper)`
2. 若 `auth:loginfail:{hash}` ≥ 5 → 直接 401 + "账户锁定 30 分钟"
3. 校验密码/验证码失败 → `INCR auth:loginfail:{hash}` TTL=30min
4. 成功 → `DEL auth:loginfail:{hash}`

### 2.5 权限缓存
- 登录成功写：`auth:permissions:{adminId}` Set，TTL 2h
- 权限变更写：`DEL auth:permissions:*` 或精确删

## 三、User 详细设计

### 3.1 核心接口
| 角色 | 路径 | 动作 |
|---|---|---|
| 用户 | `GET/PUT /api/v1/me` | 查询/更新个人信息 |
| 用户 | `POST /api/v1/me/realname` | 实名认证提交 |
| 用户 | `CRUD /api/v1/me/addresses` | 地址管理 |
| 商户 | `CRUD /api/v1/merchants/*` | 入驻/资质/子账号 |
| 骑手 | `CRUD /api/v1/riders/*` | 注册/资质/保证金 |
| 管理员 | `CRUD /api/v1/admin/users`、`/admin/merchants`、`/admin/riders`、`/admin/admins` | 管理后台审核 |
| 管理员 | `POST /api/v1/admin/blacklist` | 封禁/解封 |

### 3.2 实名认证适配
```ts
interface RealNameVerifier {
  verify(name: string, idCard: string): Promise<{ok: boolean; code?: string}>;
}
// 实现：阿里云身份二要素 / 腾讯云实名核身
```

### 3.3 审核流程
- `status=0 待审核` → 运营审核 → `1 通过 / 2 驳回`（填 remark）→ 驳回后用户可再次提交

## 四、Message 详细设计

### 4.1 发送流程
```
业务调用 MessageService.send(code, ownerType, ownerId, data)
  → 查 message_template（code + 可用 channel 列表）
  → 为每个 channel 投递 RabbitMQ message.push 队列
  → Consumer 路由到对应 Channel.send()
  → 成功写 push_record 并回写状态
  → 同时写 message_inbox（站内信通道固定）
  → 失败：retry_count+=1；< 3 次退避重发；≥3 次落死信
```

### 4.2 模板 code 命名
- `ORDER_CREATED` / `ORDER_ACCEPTED` / `ORDER_READY` / `ORDER_PICKED` / `ORDER_DELIVERED` / `ORDER_CANCELED` / `ORDER_REFUND` / `ORDER_AFTER_SALE`
- `RIDER_DISPATCH` / `RIDER_REWARD` / `RIDER_PENALTY`
- `MERCHANT_NEW_ORDER` / `MERCHANT_CANCEL_APPLY`
- `USER_COUPON` / `USER_INVITE_REWARD`
- `ACTIVITY_NOTICE` / `SYSTEM_NOTICE`

### 4.3 通道实现要点
- **WxSubscribeChannel**：`wechatAccessToken` 缓存 2h，自动刷新；调用 `/cgi-bin/message/subscribe/send`
- **JPushChannel**：HTTPS Basic Auth，targets 支持 alias/tag/registrationId
- **AliSmsChannel**：SDK + 签名 + 模板参数校验
- **InboxChannel**：直写 `message_inbox`

## 五、File 详细设计

### 5.1 上传接口
| 方式 | 路径 | 说明 |
|---|---|---|
| 代理上传 | `POST /api/v1/file/upload` (multipart) | 小文件 |
| STS 直传 | `POST /api/v1/file/sts` | 返回临时 AK/SK + bucket/key |
| 预签名 | `POST /api/v1/file/presign` | 返回 PUT URL |
| 删除 | `DELETE /api/v1/file/:id` | 仅 owner 或管理员 |

### 5.2 Bucket 规划
| Bucket | 用途 | 访问 |
|---|---|---|
| `o2o-public` | 商品图、店铺图、Banner | 公开读 |
| `o2o-private` | 身份证、营业执照、健康证、凭证 | 签名读 |
| `o2o-temp` | 导出、临时文件 | 生命周期 7d |

### 5.3 路径规范
`{biz}/{yyyyMM}/{uuid}.{ext}`，如 `product/202604/abc123.jpg`

### 5.4 安全
- MIME 白名单：`image/*`、`video/mp4`、`application/pdf`
- 扩展名白名单：`jpg|jpeg|png|webp|mp4|pdf`
- 大小限制：图片 20MB、视频 100MB、PDF 10MB
- 病毒扫描：留 hook，生产接 ClamAV（P9）

## 六、Map 详细设计

### 6.1 接口（内部 + 少量对外）
| 路径 | 用途 | 端 |
|---|---|---|
| `GET /api/v1/map/geocode` | 地址→坐标 | 内部 |
| `GET /api/v1/map/regeocode` | 坐标→地址 | 全端 |
| `GET /api/v1/map/distance` | 两点距离 | 全端 |
| `GET /api/v1/map/routing` | 路径规划 | 骑手/用户 |
| `POST /api/v1/map/within-area` | 配送范围校验 | 用户下单 |
| `POST /api/v1/map/rider/report` | 骑手上报位置 | 骑手 |
| `GET /api/v1/map/rider/:id/track/:orderNo` | 查询轨迹 | 用户/管理后台 |

### 6.2 骑手位置上报

```ts
// 请求（骑手端，间隔 10s 批量上报）
POST /api/v1/map/rider/report
{ "locations": [{ "ts": 1713440000000, "lng":116.4, "lat":39.9, "speedKmh":18, "dir":90, "acc":5, "battery":80, "orderNo": null }] }
```

处理：
1. Redis `rider:loc:{id}` 最新位置（Hash，TTL 60s）
2. Redis GEO `rider:online:{cityCode}` ADD
3. 投递 RabbitMQ `rider.location` 批量消费 → TimescaleDB（每秒批次 flush，2000 条/批）
4. 若 `orderNo` 非空 → 同时写 WebSocket 广播给下单用户端

### 6.3 配送范围校验
- 输入：`shopId` + `{lng,lat}`
- 从缓存 `shop:deliveryArea:{shopId}` 取 polygon（GeoJSON）
- turf.booleanPointInPolygon(point, polygon)

### 6.4 高德缓存
| key | 结构 | TTL |
|---|---|---|
| `geocode:{md5(address)}` | String | 7d |
| `regeocode:{lng,lat round5}` | String | 1d |
| `route:{from}:{to}:{type}` | String | 30min |

## 七、共享基础设施设计

### 7.1 全局过滤器/拦截器
- `HttpExceptionFilter`：统一 `{code, message, data, traceId}`
- `TransformInterceptor`：成功包裹 `{code:0, message:'ok', data, traceId}`
- `LoggingInterceptor`：写 `api_log`
- `TimeoutInterceptor`：默认 10s

### 7.2 错误码约定
- `0` 成功
- `10xxx` 参数/业务
- `20xxx` 认证/权限
- `30xxx` 限流/频控
- `40xxx` 第三方异常
- `50xxx` 系统错误

### 7.3 Swagger
- 生成：`@nestjs/swagger`
- 分组：`/docs/user`、`/docs/merchant`、`/docs/rider`、`/docs/admin`、`/docs/internal`

### 7.4 公共 util
- `SnowflakeId`：workerId 启动时抢占 Redis `sys:snowflake:worker:{hostname}`
- `OrderNoGenerator`：`T/E` + 日期 + 分片 + 序列 + 校验
- `CryptoUtil`：AES-GCM + HMAC
- `PasswordUtil`：bcrypt 封装

## 八、产物清单
- [ ] 5 个 NestJS 模块代码
- [ ] 单元测试
- [ ] Swagger 文档
- [ ] `docs/P3_后端基础服务/api/{auth,user,message,file,map}.md`
