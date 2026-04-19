# O2O 商户端 · Sentry 崩溃监控集成说明

> **目的**：自动捕获并上报 APP / 小程序运行时未捕获异常，支持 release 后线上问题追踪  
> **对应**：T6.44 崩溃监控（Sentry）  
> **包大小**：手写 envelope 上报，不依赖 `@sentry/*` SDK，**0 增量包大小**

---

## 一、为什么不用官方 SDK

| 方案 | 包大小 | uni-app 兼容性 | 复杂度 |
|---|---|---|---|
| `@sentry/browser` | ~70KB | ❌ 需要 polyfill | 高 |
| `@sentry/vue` | ~80KB | ❌ 同上 | 高 |
| **手写 envelope HTTP 上报** | **0KB** | ✅ uni.request | 低 |

**P6 选择手写**：核心场景只需 captureException + captureMessage，envelope HTTP 协议公开稳定，自实现可控。

---

## 二、配置

### 2.1 申请 DSN

1. 注册 Sentry：https://sentry.io 或自建 Sentry CE
2. 创建 Project → Platform 选「JavaScript」
3. 复制 DSN，格式：`https://<key>@<host>/<project_id>`

### 2.2 注入 env 变量

`商户端/env/.env.production`：

```
VITE_SENTRY_DSN=https://abc123@sentry.example.com/1
```

`商户端/env/.env.development`：

```
VITE_SENTRY_DSN=
```

> dev 环境留空，避免本地噪音占用配额

### 2.3 自动初始化

`商户端/src/main.ts` 已挂载：

```ts
if (env?.VITE_SENTRY_DSN) {
  initSentry({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_APP_ENV ?? 'development',
    release: env.VITE_APP_VERSION ?? '0.1.0'
  })
}
```

---

## 三、自动捕获

### 3.1 全局未捕获异常

`商户端/src/App.vue` `onError()`：

```ts
onError((err) => {
  logger.error('app.uncaught', { err })
  captureException(err)
})
```

### 3.2 异步 Promise reject

uni-app 不直接暴露 `unhandledrejection`；建议在所有 async 函数 try/catch 后调用 `captureException(e)`

### 3.3 业务自定义上报

```ts
import { captureException, captureMessage } from '@/utils/sentry'

try {
  await acceptOrder(orderNo)
} catch (e) {
  captureException(e, { orderNo, action: 'accept' })
}

captureMessage('用户操作流程异常', 'warning')
```

---

## 四、用户上下文

登录成功后调用（`pages/login/index.vue` 已自动）：

```ts
import { setSentryUser } from '@/utils/sentry'

setSentryUser({ id: result.user.id, mchntNo: result.user.mchntNo })
```

退出登录后清除（`store/auth.ts` `logout()` 已自动）：

```ts
clearSentryUser()
```

---

## 五、Envelope 协议（手写实现）

我们手写的上报符合 [Sentry SDK Developer's Guide](https://develop.sentry.dev/sdk/envelopes/)：

### 5.1 endpoint

`${DSN.scheme}${DSN.host}/api/${DSN.project_id}/envelope/`

### 5.2 头

```
X-Sentry-Auth: Sentry sentry_version=7, sentry_client=o2o-mchnt/0.1.0, sentry_key=<DSN.key>
Content-Type: application/x-sentry-envelope
```

### 5.3 体（multi-part）

```
{"event_id":"abc123...","sent_at":"2026-04-19T10:00:00Z","sdk":{...}}\n
{"type":"event","length":456,"content_type":"application/json"}\n
{"event_id":"abc123...","platform":"javascript","exception":{"values":[...]},"user":{...}}\n
```

### 5.4 实现位置

`商户端/src/utils/sentry.ts` 内的 `sendEnvelope()`

---

## 六、栈解析

V8 风格栈：`at Function (file:line:col)`  
`parseStackFrames()` 解析为 Sentry frames，与 sourcemap 合并后定位源码

> sourcemap 上传归 P9 部署阶段（`sentry-cli releases new && sentry-cli releases files upload`）

---

## 七、验收（V6.30）

### 7.1 手动触发异常

`pages/profile/index.vue`（开发期临时按钮）：

```vue
<BizBtn type="danger" text="触发异常" @click="testCrash" />

function testCrash() {
  throw new Error('Sentry 测试异常 - ' + Date.now())
}
```

### 7.2 验证步骤

1. 真机安装 release 包
2. 点击「触发异常」按钮
3. 等待 5 秒（envelope 异步上报）
4. 登录 Sentry 控制台 → Issues 列表
5. **预期**：出现 `Sentry 测试异常 - <timestamp>` 事件，包含：
   - User: `{ id, mchnt_no }`
   - Environment: `production`
   - Release: `0.1.0`
   - Platform: `javascript`
   - Tags: `client=merchant`

---

## 八、性能与隐私

| 项 | 策略 |
|---|---|
| 上报限频 | 不限频，依赖 Sentry 服务端 quota |
| 网络失败 | 静默丢弃（envelope 不重试，避免循环） |
| 离线缓存 | **不缓存**（避免敏感信息持久化） |
| PII 脱敏 | 仅上报 `user.id` + `mchnt_no`，不上报手机号 / 真名 |
| 业务参数 | 通过 `captureException(err, ctx)` 的 `ctx` 注入；调用方自行脱敏 |

---

## 九、Sentry 控制台告警配置（推荐）

| 规则 | 阈值 | 通知 |
|---|---|---|
| 新错误 | 任意 | 飞书 / 企微 webhook |
| 错误突增 | 1h 内 > 10 次 | PagerDuty |
| 错误用户 | 同一 user 在 30min 内 > 5 次 | 邮件 |

---

## 十、已知限制

1. **无 sourcemap**：S6 仅注入运行时栈；sourcemap 上传归 P9
2. **无 breadcrumbs**：手写版仅捕获最终异常，不含前置操作链；P9 可补
3. **无 native crash**：iOS / Android 进程 crash 不会触发 onError；需配 `@sentry/react-native` 或自写 plus.runtime.uncaughtException 监听
4. **小程序网络白名单**：sentry endpoint 域名需加入小程序后台 request 合法域名

---

## 十一、扩展计划（P9）

- [ ] sourcemap 上传与版本管理
- [ ] APP 端 native crash（NDK） → `@sentry/react-native` 替代
- [ ] breadcrumbs（最近 N 个用户操作）
- [ ] 性能监控（@sentry/tracing）

---

> 维护人：单 Agent V2.0 (P6 商户端 / T6.44)  
> 真实环境集成 / sourcemap 上传：归 **P9 集成测试部署**
