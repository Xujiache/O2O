# File 模块接口文档（P3 / 员工 C 负责）

> 基准：DESIGN_P3_后端基础服务.md §五 + ACCEPTANCE V3.17 / V3.18 / V3.19 / V3.20
> 实现：`后端/src/modules/file/`

## 0. 通用约定

- 路径前缀：`/api/v1/file`（在 `main.ts setGlobalPrefix` 中统一）
- 鉴权：`Authorization: Bearer <jwt>`（已接入 A 的 `JwtAuthGuard` + `UserTypeGuard`，4 端登录均可上传/查询/删除；uploaderType / uploaderId 由 JWT 解析后注入到 `UploadContext`，无需任何自定义请求头）
- 响应：`{ code: 0, message: 'ok', data: ..., traceId, timestamp }`（由 `TransformInterceptor` 包裹）
- 错误：`{ code, message, data: null, httpStatus, path, timestamp }`（由 `AllExceptionsFilter` 统一）
- Swagger 分组：用户端 / 商户端 / 骑手端 / 管理后台 / 内部 5 组都包含 File 模块

## 1. 上传校验三层（DESIGN §5.4）

| 维度 | 白名单 / 上限 | 错误码 | HTTP |
|---|---|---|---|
| MIME | `image/jpeg`、`image/png`、`image/webp`、`video/mp4`、`application/pdf` | 10001 PARAM_INVALID（消息含"MIME 不在白名单"） | 415 |
| 扩展名 | `jpg`、`jpeg`、`png`、`webp`、`mp4`、`pdf` | 10001 PARAM_INVALID（消息含"扩展名 不在白名单"） | 415 |
| 大小 | 图片 20MB / 视频 100MB / PDF 10MB | 10001 PARAM_INVALID（消息含"大小 超过上限"） | 413 |

任何一层不通过即抛 `BusinessException` + 对应 HTTP 状态码。

## 2. Bucket 规划（DESIGN §5.2）

| Bucket | 用途 | 访问 | 默认环境变量 |
|---|---|---|---|
| `o2o-public` | 商品图、店铺图、Banner | 公开读 / 直返 CDN URL | `STORAGE_PUBLIC_BUCKET` |
| `o2o-private` | 身份证、营业执照、健康证、凭证 | 签名 URL（默认 15 分钟） | `STORAGE_PRIVATE_BUCKET` |
| `o2o-temp` | 导出、临时文件 | 生命周期 7d；运维统一回收 | `STORAGE_TEMP_BUCKET` |

切换 OSS：`STORAGE_PROVIDER=ali-oss` 即可，业务代码零改动；OSS 字段通过
`OSS_*` 环境变量提供（详见 `后端/src/config/env.validation.ts`）。

## 3. 接口

### 3.1 POST /api/v1/file/upload —— 代理上传

**Content-Type**: `multipart/form-data`

| Field | 类型 | 必填 | 说明 |
|---|---|---|---|
| file | File | 是 | 二进制文件 |
| bizModule | string | 是 | `avatar`/`qual`/`proof`/`invoice`/`banner`/`product`/`shop`/`video`/`temp`/`other` |
| bizNo | string | 否 | 业务单号 |
| isPublic | boolean | 否，默认 true | true → o2o-public；false → o2o-private |
| watermark | boolean | 否，默认 false | 是否给图片右下角加文字水印 |

**响应（200）**：

```json
{
  "code": 0,
  "data": {
    "id": "7212876543210123456",
    "fileNo": "F202604190120000abc12345",
    "bucket": "o2o-public",
    "objectKey": "product/202604/abc12345.jpg",
    "url": "http://localhost:9000/o2o-public/product/202604/abc12345.jpg",
    "size": 102400,
    "mimeType": "image/jpeg",
    "isPublic": true
  }
}
```

**典型拒绝示例**：

| 场景 | 返回 |
|---|---|
| 上传 `.exe` | HTTP 415 + `code:10001` + `message:"扩展名 \".exe\" 不在白名单（jpg|jpeg|png|webp|mp4|pdf）"` |
| 上传 30MB 图片 | HTTP 413 + `code:10001` + `message:"文件大小 30.00MB 超过上限 20MB"` |
| MIME 篡改为 `application/zip` | HTTP 415 + `code:10001` + `message:"MIME \"application/zip\" 不在白名单..."` |

### 3.2 POST /api/v1/file/sts —— STS 临时凭证

**Body（JSON）**：

```json
{ "bizModule": "qual", "isPublic": false, "contentType": "application/pdf" }
```

**响应（R1/I-03 后双模式，按 mode 字段分支）**：

**MinIO（dev/test）→ mode='presigned-put'**：

```json
{
  "code": 0,
  "data": {
    "mode": "presigned-put",
    "provider": "minio",
    "accessKeyId": "",
    "accessKeySecret": "",
    "sessionToken": null,
    "putUrl": "http://localhost:9000/o2o-private/qual/202604/abc12345...?X-Amz-Algorithm=...",
    "objectKey": "qual/202604/abc12345...",
    "expiration": 1745040900000,
    "expiresIn": 900,
    "bucket": "o2o-private",
    "keyPrefix": "qual/202604/",
    "endpoint": "http://localhost:9000",
    "region": "cn-north-1"
  }
}
```

**AliOSS（生产）→ mode='sts'**：

```json
{
  "code": 0,
  "data": {
    "mode": "sts",
    "provider": "ali-oss",
    "accessKeyId": "STS.AKIA...",
    "accessKeySecret": "...",
    "sessionToken": "eyJhbGc...",
    "expiration": 1745040900000,
    "expiresIn": 900,
    "bucket": "o2o-private",
    "keyPrefix": "qual/202604/",
    "endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
    "region": "oss-cn-hangzhou"
  }
}
```

**前端用法**：按 `mode` 字段分支（详见文末「STS 双模式」章节完整 ts 模板）：
- `mode='presigned-put'`（MinIO dev/test）：`fetch(putUrl, { method:'PUT', body:file, headers:{ 'Content-Type': file.type } })`，上传完成后由业务侧调 P4 阶段的 `/file/confirm` 落 file_meta
- `mode='sts'`（AliOSS prod）：用 oss-js + 临时 ak/sk + sessionToken 调用 `client.put(objectKey, file)`

> AliOSS STS 完整流程：`OSS_STS_ACCESS_KEY_ID` + `OSS_STS_ACCESS_KEY_SECRET` +
> `OSS_RAM_ROLE_ARN` 三个变量配齐后，AliOssAdapter 自动调用 `sts.assumeRole`；
> 配置缺失时降级长期 ak/sk（mode 仍为 'sts'）—— 仅开发可用，生产严禁。

### 3.3 POST /api/v1/file/presign —— 预签名 PUT URL

**Body（JSON）**：

```json
{
  "bizModule": "avatar",
  "fileName": "head.png",
  "contentType": "image/png",
  "isPublic": true,
  "expiresSec": 900
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "url": "http://localhost:9000/o2o-public/avatar/202604/abc.png?X-Amz-...",
    "bucket": "o2o-public",
    "objectKey": "avatar/202604/abc.png",
    "expiration": 1745040900000,
    "contentType": "image/png"
  }
}
```

**前端用法**：

```js
await fetch(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/png' },
  body: pngBlob
})
```

> AliOSS 严格校验 Content-Type 与签名一致；MinIO 因 minio-js 8.x 限制不强约束。

### 3.4 GET /api/v1/file/:id —— 反查

返回与 upload 相同的 `FileUploadResultDto`；私有桶在每次反查时重新生成
15 分钟签名 URL。

### 3.5 DELETE /api/v1/file/:id —— 删除

仅文件 owner 或 `uploaderType=4`（管理员）可删除；否则返回 `code:20003 AUTH_PERMISSION_DENIED` + HTTP 403。
软删 `file_meta.is_deleted=1` + 物理删除 OSS 对象（OSS 删除失败仅 warn 不阻塞）。

## 4. 水印（DESIGN §5.3）

`addWatermark(buffer, mime, text='@O2O平台', opacity=0.5)`：

- 仅对 `image/jpeg|png|webp` 生效，其他类型返回原 buffer
- 右下角半透明黑底 + 白字 SVG composite，字号自适应图宽
- sharp 处理失败时记录 warn 并返回原图，不影响上传主流程
- 商品图等增值场景启用；身份证、资质等私密图严禁加水印

## 5. file_meta 入库

写入字段（对齐 P2 `migrations/10_system.sql`）：`id` 雪花 ID / `file_no` 业务编号 /
`bucket` / `object_key` / `file_name` / `file_size` / `mime_type` / `file_type`
（1 图 / 2 视 / 3 PDF / 4 Excel / 5 其他）/ `width` / `height` / `md5` / `cdn_url`
（公开桶回写）/ `uploader_type` / `uploader_id` / `biz_module` / `biz_no` /
`is_public` / 5 标配字段（`tenant_id` / `is_deleted` / `created_at` / `updated_at` / `deleted_at`）。

## 6. 错误码段位

| 段位 | 触发条件 | HTTP |
|---|---|---|
| 10001 PARAM_INVALID | MIME / 扩展名 / 大小 / 文件为空 | 400 / 413 / 415 |
| 10010 BIZ_RESOURCE_NOT_FOUND | 文件不存在 / 已被软删 | 404 |
| 20003 AUTH_PERMISSION_DENIED | 非 owner 且非管理员删除 | 403 |
| 40005 STORAGE_PROVIDER_ERROR | MinIO / OSS IO 失败 | 502 |

## 7. 自验证（开发环境）

启动依赖：`pnpm docker:dev:up` 拉起 MinIO / Redis / TimescaleDB。

```bash
# ===== 所有接口必须带 Authorization Bearer；uploaderType / uploaderId 一律从 JWT 解析 =====
TOKEN="eyJhbGciOiJIUzUxMiJ9..."  # POST /auth/admin/login 拿到

# 上传
curl -X POST http://localhost:3000/api/v1/file/upload \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@./avatar.jpg" -F "bizModule=avatar" -F "isPublic=true"

# STS / 预签名 PUT 双模式凭证
curl -X POST http://localhost:3000/api/v1/file/sts \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"bizModule":"qual","isPublic":false}'

# 预签名 PUT URL（轻量直传）
curl -X POST http://localhost:3000/api/v1/file/presign \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"bizModule":"avatar","fileName":"head.png","contentType":"image/png"}'

# 反查
curl -H "Authorization: Bearer ${TOKEN}" http://localhost:3000/api/v1/file/<id>

# 删除（owner / admin）
curl -X DELETE -H "Authorization: Bearer ${TOKEN}" http://localhost:3000/api/v1/file/<id>
```

---

## STS 双模式（P3-REVIEW-01 R1 / I-03 修复）

R1 之前 `POST /file/sts` 在 MinIO 适配器下会直接返回 root accessKey/secretKey，等于把
管理员凭证下发给前端，存在严重越权风险。R1 修复后改为**双模式**，由适配器自行选择：

| 环境 | mode | 实现 | 安全 |
|---|---|---|---|
| dev / test（MinIO）| `presigned-put` | 服务端 `Minio.Client.presignedPutObject(bucket, key, 900)` 生成单次 PUT URL | 不暴露任何长期/临时 ak/sk；URL 15 分钟过期 |
| prod（AliOSS）| `sts` | 服务端 `OSS.STS.assumeRole(roleArn, policy, 900, 'o2o-platform')`；policy 仅授权 `${bucket}/${keyPrefix}*` 下 PutObject/GetObject | 临时 ak/sk + sessionToken，15 分钟过期 |

**前端使用模板**：

```ts
const { mode, putUrl, accessKeyId, accessKeySecret, sessionToken, bucket, objectKey } = await fetch('/api/v1/file/sts', { method:'POST', body, headers:{ Authorization } }).then(r=>r.json()).then(r=>r.data)

if (mode === 'presigned-put') {
  /* MinIO dev 路径：直接 fetch PUT */
  await fetch(putUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
  /* 上传完成 → 调用 P4 confirm 接口落 file_meta */
} else {
  /* AliOSS prod 路径：用 oss-js + 临时凭证 */
  const client = new OSS({ accessKeyId, accessKeySecret, stsToken: sessionToken, bucket, region })
  await client.put(objectKey, file)
}
```

> 测试覆盖：见 `后端/src/modules/file/adapters/storage.adapter.spec.ts`，
> R1 新增 `MinioAdapter.generateStsCredential 返回 mode=presigned-put（不再暴露 root ak/sk）`
> 等 2 个用例，旧"AliOSS 兜底返回长期 ak/sk"用例升级断言 `mode='sts'` + `expiresIn=600`。

