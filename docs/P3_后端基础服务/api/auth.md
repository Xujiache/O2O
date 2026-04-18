# Auth 模块接口文档（P3 / 员工 A 主负责）

> 基准：DESIGN_P3_后端基础服务.md §二
> 实现：`后端/src/modules/auth/`（员工 A 持续推进）
>
> 本文件由员工 C 在 P3/T3.23 阶段先行起骨架，员工 A 完成 Auth Module 后填充详细
> 字段。骨架部分已基于 DESIGN §2.1 表格 + ACCEPTANCE V3.1~V3.6 + CONSENSUS §2.1
> 结论编制；占位字段一旦 A 落地代码即由 A 接管为权威。

## 0. 通用约定

- 路径前缀：`/api/v1/auth`
- 鉴权：除 `wx-mp/login` / `mobile/bind` / 各端 `login` / `sms-login` /
  `admin/login` / `refresh` / `sms/send` 等公开接口外，全部接口必须携带
  `Authorization: Bearer <jwt>`
- JWT Payload（DESIGN §2.2）：`{ uid, userType: 'user'|'merchant'|'rider'|'admin', tenantId, ver, iat, exp }`
- Token 寿命：access 2h（`JWT_EXPIRES_IN`），refresh 7d（`auth:refresh:{userType}:{userId}`）
- 风控：`auth:loginfail:{mobileHash}` ≥ 5 次 → 锁 30min（DESIGN §2.4）

## 1. 接口清单（DESIGN §2.1）

| 端 | Method | Path | 入参 | 出参 |
|---|---|---|---|---|
| 用户端（小程序） | POST | `/api/v1/auth/wx-mp/login` | `{code, encryptedData?, iv?}` | `{accessToken, refreshToken, user}` |
| 用户端（绑手机） | POST | `/api/v1/auth/mobile/bind` | `{mobile, smsCode}` | `{ok}` |
| 商户端 | POST | `/api/v1/auth/merchant/login` | `{mobile, password}` | `{accessToken, refreshToken, merchant}` |
| 商户端短信 | POST | `/api/v1/auth/merchant/sms-login` | `{mobile, smsCode}` | 同上 |
| 骑手端 | POST | `/api/v1/auth/rider/login` | `{mobile, password}` | 同上 |
| 管理后台 | POST | `/api/v1/auth/admin/login` | `{username, password, captcha?}` | `{accessToken, refreshToken, admin, menus, permissions}` |
| 通用 | POST | `/api/v1/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` |
| 通用 | POST | `/api/v1/auth/logout` | - | `{ok}` |
| 短信 | POST | `/api/v1/auth/sms/send` | `{mobile, scene}` | `{ok}` |

## 2. Guard 链（DESIGN §2.3）

- 全局：`JwtAuthGuard`（`@Public()` 装饰跳过）
- 子路由：`UserTypeGuard` + `PermissionGuard`
- 管理后台：额外 `ThrottleSignGuard`（X-Sign 校验，详见 CONSENSUS §2.1）

## 3. 错误码（与 `common/error-codes.ts` 段位对齐）

| 段位 | 用途 |
|---|---|
| 20001 AUTH_TOKEN_MISSING | 未带 Authorization |
| 20002 AUTH_TOKEN_INVALID | JWT 解析 / 签名失败 |
| 20003 AUTH_PERMISSION_DENIED | PermissionGuard 拒绝 |
| 20005 AUTH_TOKEN_EXPIRED | 过期 |
| 20010 AUTH_LOGIN_FAILED | 账号 / 密码错误 |
| 20011 AUTH_LOGIN_LOCKED | 5 次失败锁定 |
| 20013 AUTH_PASSWORD_INCORRECT | bcrypt compare 不通过 |
| 20014/20015 AUTH_SMS_CODE_* | 验证码错误 / 过期 |
| 30002 SMS_SEND_TOO_FREQUENT | 60s 内同号重发 |

## 4. 自验证

待员工 A Auth Module 落地后补充 curl 示例 + Postman 用例。Postman 冒烟集
在 `postman/o2o-p3-smoke.postman_collection.json` 已预留 Auth 分组占位（mock 模式 +
注释说明）。
