# O2O API Postman / Apifox 集合

> 阶段：P9 Sprint 7 / W7.B.4（P9-P3-04）
> 文件：`O2O-API.postman_collection.json`（v2.1.0 标准）
> 用途：本地 / staging / prod 三环境 API 调试，自动 JWT 注入

---

## 一、文件结构

```
docs/postman/
├── O2O-API.postman_collection.json   # Postman 集合（v2.1.0），5 个示例端点
└── README.md                         # 本文件
```

集合包含 5 个示例端点：

| # | 端点 | 鉴权 | 说明 |
|---|---|---|---|
| 1 | `POST /auth/admin/login` | 无 | 管理员账密登录拿 JWT |
| 2 | `GET  /me`              | Bearer | 当前登录用户 profile |
| 3 | `GET  /user/orders`     | Bearer | 当前用户订单列表（分页 + 状态过滤） |
| 4 | `GET  /shops`           | 无（@Public） | 公开店铺列表 |
| 5 | `POST /file/upload`     | Bearer | 文件上传（multipart/form-data，白名单三层） |

---

## 二、环境变量

集合根级 `variable` 中预置 5 个 collection variables：

| 变量 | 默认值（dev） | 说明 |
|---|---|---|
| `baseUrl`       | `http://localhost:3000/api/v1` | 后端 API 基础路径（含 `/api/v1` 前缀） |
| `username`      | `admin` | 管理员账号 —— 仅 dev 演示，prod 必须切到专用账号 |
| `password`      | `Pwd@2026` | 管理员密码 —— 严禁把真密码提交到仓库 |
| `jwt`           | `""` | 由 Pre-request Script 自动写入；不要手动改 |
| `jwtExpiresAt`  | `0` | 由 Pre-request Script 写入的失效时间戳（毫秒） |

> 切换到 staging / prod 时建议**用 Postman Environment 覆盖**而不是改 collection variable 默认值，避免误推真密码。

---

## 三、Pre-request Script 工作原理

集合根级注册了一段 collection-level Pre-request Script，每次发送请求前执行：

```
1. 当前请求 path 命中 /auth/admin/login？
   ├─ 是 → 跳过（避免登录请求自身触发登录死循环）
   └─ 否 → 继续

2. 读 {{jwt}} + {{jwtExpiresAt}}
   ├─ 仍有效（距过期 > 60s）→ 直接走 collection-level Bearer Auth
   └─ 失效 / 不存在 → 进入第 3 步

3. pm.sendRequest({{baseUrl}}/auth/admin/login, body={username,password})

4. 解析响应：取 data.tokens.accessToken / expiresIn
   └─ 成功 → pm.collectionVariables.set('jwt', ...) + set('jwtExpiresAt', now + expiresIn*1000)
   └─ 失败 → console.error，但不阻塞当前请求（让它自然 401，便于排查）
```

集合根级 `auth.bearer` 配置 `Bearer {{jwt}}`，所以一旦 `{{jwt}}` 被注入，所有未单独 override 的请求自动带上 `Authorization: Bearer <token>` 头。

`Auth - Admin Login` 与 `Shop - Public Shop List` 两个端点单独设置了 `auth.type = noauth`，避免 collection-level Bearer 影响公开接口。

### 失效与刷新

- token 过期前 60 秒主动刷新 → 减少边界 401
- 任意一次手动调用 `Auth - Admin Login` 也会同步写回 `{{jwt}}`（端点 1 的 test 脚本里也做了一次写入，作为兜底）
- 如果想强制重新登录：把 `{{jwt}}` 手动清空 + `{{jwtExpiresAt}}` 设为 0

---

## 四、导入方式

### Postman

1. Postman 打开 → 左上 `Import`
2. 选择 `O2O-API.postman_collection.json`
3. 导入后在 collection 上右键 → `Edit` → `Variables` 调整 baseUrl / username / password
4. 点任意一个 protected 端点（如 `User - Get Me`）→ `Send`，Pre-request 自动登录

### Apifox

1. Apifox 顶部 `+` → `导入数据` → `Postman`
2. 选 `O2O-API.postman_collection.json`
3. 导入后会自动把 collection variables 映射到 Apifox 的「环境变量」
4. Pre-request Script 在 Apifox 侧叫「前置脚本」，pm.\* API 兼容；直接生效

### Insomnia

1. `Application` → `Import / Export` → `Import Data` → `From File`
2. 选 `O2O-API.postman_collection.json`
3. Insomnia 对 `pm.sendRequest` 的兼容性不如 Postman，若 Pre-request 不生效请改用 Insomnia 自带的 `OAuth 2.0 / Bearer Token` Auth 模板

---

## 五、环境切换（dev / staging / prod）

推荐用 Postman 的 **Environment** 而非直接改 collection variable，这样可以通过右上角下拉一键切换：

### 5.1 创建三个 Environment

| Environment | baseUrl | username | password |
|---|---|---|---|
| `O2O-dev`     | `http://localhost:3000/api/v1`           | `admin` | `Pwd@2026`（dev 默认） |
| `O2O-staging` | `https://api-staging.o2o.example.com/api/v1` | `<staging-admin>` | `<staging-secret>` |
| `O2O-prod`    | `https://api.o2o.example.com/api/v1`     | `<prod-admin>`    | `<prod-secret>` |

### 5.2 切换流程

1. Postman 右上角 Environment 下拉 → 选目标环境
2. 因为 environment variable 优先级高于 collection variable，`{{baseUrl}}` 等会自动指向新环境
3. 集合 Pre-request Script 自动用新 baseUrl 登录拿 token

### 5.3 环境变量隔离 jwt

如果不希望 dev / staging / prod 共用 `{{jwt}}`（建议隔离，否则切环境后 token 还是上一个环境的），把 `jwt` / `jwtExpiresAt` 也提升到 environment variable —— Pre-request Script 中 `pm.collectionVariables.set` 改成 `pm.environment.set` 即可（或保留并在 environment 中也声明同名变量；Postman 取值时 environment 优先）。

---

## 六、安全提醒

1. **严禁**把真密码提交到 git。当前 `password` 默认值 `Pwd@2026` 仅作 dev 演示。
2. staging / prod 走 Postman Environment 单独配置，并把 environment 文件加入 `.gitignore`。
3. token 过期窗口默认 7200s（2 小时）；Pre-request Script 提前 60s 刷新，无须额外配置。
4. 如果后端 `accessToken` 与 `expiresIn` 字段路径变更（当前是 `data.tokens.accessToken`），同步修改 Pre-request Script 第 3 步的解析逻辑。

---

## 七、常见问题

| 问题 | 排查 |
|---|---|
| 所有请求返回 401 | 1) 看 Postman Console 是否有 `[O2O Pre-request] login failed` 错误；2) 检查 `baseUrl` 是否 reachable；3) 用户名密码是否正确 |
| Pre-request Script 未触发 | 1) 确认 collection-level Pre-request 而非单请求级别（在 collection 根 `Pre-request Script` Tab 检查）；2) Apifox 用户检查「前置脚本」是否已勾选 collection 级 |
| `jwt` 拿到了但仍 401 | 1) 检查后端 jwt secret 与签名算法是否匹配；2) 看 token 是否过期（`jwtExpiresAt` 与当前时间戳对比） |
| 想关闭自动登录 | collection → `Pre-request Script` → 注释掉 `pm.sendRequest(...)` 块即可手动管理 token |

---

## 八、扩展

如果要新增端点：

1. 在 collection 下 `Add Request`
2. URL 用 `{{baseUrl}}/<path>`
3. 默认 collection-level Bearer Auth 自动生效；若是公开接口（`@Public()`），单独把请求 Auth 设为 `No Auth`
4. 若需要不同登录角色（merchant / rider / user）的 jwt：可在请求自身的 Pre-request Script 中自行调用对应 `/auth/<role>/login` 写到 `{{jwt}}`
