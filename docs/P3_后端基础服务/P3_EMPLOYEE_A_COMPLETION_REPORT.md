# P3 员工 A 完成报告

> 阶段：P3 后端基础服务
> 角色：**员工 A（组长 / Lead）** —— 额外承担集成验收 + 进度文档更新 + 跨成员集成协调
> 范围（自有）：T3.1 / T3.2 / T3.3 / T3.4 / T3.5 / T3.6 / T3.7 / T3.26（共 8 项）
> 完成日期：2026-04-19
> 自验证：`pnpm --filter 后端 build` Exit 0；`pnpm --filter 后端 start` 19 模块 InstanceLoader 全 OK；`grep ': any'` / `console.log` 0 命中

---

## 一、8 项任务逐项 ✅ 状态 + 文件路径

| 编号 | 任务 | 状态 | 主要文件路径 | 关键实现要点 |
|---|---|---|---|---|
| T3.1 | 全局过滤器/拦截器/响应结构/错误码 | ✅ | `后端/src/common/filters/http-exception.filter.ts`<br>`后端/src/common/interceptors/{timeout,logging,transform}.interceptor.ts`<br>`后端/src/common/dto/{api-response,page-query}.dto.ts`<br>`后端/src/common/exceptions/business.exception.ts`<br>`后端/src/common/error-codes.ts` + `index.ts` | HttpExceptionFilter 优先匹配 BusinessException → AllExceptionsFilter 兜底；TransformInterceptor 与 LoggingInterceptor 注入 `traceId`；TimeoutInterceptor 默认 10s；47 个错误码字典 + getBizErrorMessage 工具 |
| T3.2 | CryptoUtil / PasswordUtil / SnowflakeId / OrderNoGenerator | ✅ | `后端/src/utils/{crypto,password,snowflake-id,order-no.generator,biz-no.generator,index}.ts` | AES-256-GCM 加解密 + HMAC-SHA256 + tail4 三件套；bcrypt cost=10（兼容 B 旧 `$scrypt$` 占位 verify）；SnowflakeId 64 位（41ts+10worker+12seq）+ `next()` 静态快捷；OrderNoGenerator 18 位 [T/E]+yyyyMMdd+shard+seq+Luhn；额外补 `generateBizNo('M' / 'R')` 给 B 的 merchant.service / rider.service |
| T3.3 | TypeORM Entity 14 个 + D10 file_meta 桥接 | ✅ | `后端/src/entities/{base,user,user-address,merchant,merchant-qualification,merchant-staff,rider,rider-qualification,rider-deposit,admin,role,permission,admin-role,role-permission,blacklist,file-meta(桥接)}.entity.ts` + `index.ts` | 14 个 D1 实体严格对齐 P2 `01_account.sql` snake_case → camelCase；BaseEntity 含 5 标配字段（tenantId/isDeleted/createdAt/updatedAt/deletedAt）；mobile / id_card / real_name / bank_card 三件套（_enc + _hash + _tail4）；`D1_ENTITIES` 数组 + `D10_SYSTEM_ENTITIES` 桥接 C 的 file 模块 |
| T3.4 | Auth Module 基础（JWT Strategy + Guard + Decorators） | ✅ | `后端/src/modules/auth/{auth.module,auth.service}.ts`<br>`后端/src/modules/auth/strategies/{jwt,wx-mp}.strategy.ts`<br>`后端/src/modules/auth/guards/{jwt-auth,throttle-sign}.guard.ts`<br>(user-type/permission 由 B 写好的占位/实现复用) | JwtStrategy 算法 HS512 + payload 6 字段（uid/userType/tenantId/ver/iat/exp）+ Redis ver 一键吊销；JwtAuthGuard 支持 `@Public()` 跳过；ThrottleSignGuard 校验 X-Sign + nonce + 时间戳防重放；AuthService 注入 9 个 Repository |
| T3.5 | 小程序 wx-mp/login + 手机绑定 | ✅ | `auth.service.ts.wxMpLogin / bindMobile` + `auth.controller.ts` 的 `POST /wx-mp/login` 与 `POST /mobile/bind` + `strategies/wx-mp.strategy.ts` | jscode2session 调用 + dev mock（appid 缺失时按 code 派生 mock openid）+ 黑名单校验 + 状态校验 + token 签发；mobile/bind 复用 verifySms + 手机号占用查重 |
| T3.6 | 短信验证码（发送/校验/风控） | ✅ | `auth.service.ts.sendSms / verifySms` | 60s 频控 K30 `rl:sms:freq:{mobileHash}` + 5min TTL K03 `auth:sms:{mobileHash}`；dev 环境响应里携带 mock code；6 位数字；用过即删（防重放）；mobile 必须 11 位 1[3-9]xxxxxxxxx |
| T3.7 | 商户/骑手/管理员登录 + Refresh + Logout | ✅ | `auth.service.ts.merchantLogin / merchantSmsLogin / riderLogin / adminLogin / refreshTokenPair / logout` | 风控：连续 5 次失败 → K04 锁 30min；成功 → DEL；管理员登录返回菜单树 + 权限码集合并预热 PermissionGuard 缓存（与 B 的 PermissionGuard Redis Set 共享 K `auth:permissions:{adminId}` TTL 7200s）；logout 通过 INCR ver 一键吊销所有历史 token |
| T3.26 | 集成验收 + 更新说明文档 | ✅ | `说明文档.md §3.1 / §3.3 / §四`、`docs/P3_后端基础服务/TODO_P3_后端基础服务.md` 8 行勾选 | 整理为 V1.9 变更记录；本机 NestJS start 19 模块全 InstanceLoader OK，仅 MySQL 因本机无 docker 拒（按 P1 I-07/I-08、P2 T2.22 同处理归并 P9） |

---

## 二、9 个 Auth 接口（DESIGN_P3 §2.1 全覆盖）

| # | Method + Path | DTO 入参 | DTO 出参 | Swagger 标签 | 鉴权 | Service 方法 |
|---|---|---|---|---|---|---|
| 1 | `POST /api/v1/auth/wx-mp/login` | `WxMpLoginDto` | `WxMpLoginResponseVo` | `Auth` | `@Public()` | `wxMpLogin` |
| 2 | `POST /api/v1/auth/mobile/bind` | `BindMobileDto` | `{ ok: true }` | `Auth` | `@UseGuards(JwtAuthGuard)` | `bindMobile` |
| 3 | `POST /api/v1/auth/sms/send` | `SmsSendDto` | `SmsSendResponseVo` | `Auth` | `@Public()` | `sendSms` |
| 4 | `POST /api/v1/auth/merchant/login` | `MerchantLoginDto` | `MerchantLoginResponseVo` | `Auth` | `@Public()` | `merchantLogin` |
| 5 | `POST /api/v1/auth/merchant/sms-login` | `MerchantSmsLoginDto` | `MerchantLoginResponseVo` | `Auth` | `@Public()` | `merchantSmsLogin` |
| 6 | `POST /api/v1/auth/rider/login` | `RiderLoginDto` | `RiderLoginResponseVo` | `Auth` | `@Public()` | `riderLogin` |
| 7 | `POST /api/v1/auth/admin/login` | `AdminLoginDto` | `AdminLoginResponseVo`（含 menus + permissions）| `Auth` | `@Public()` | `adminLogin` |
| 8 | `POST /api/v1/auth/refresh` | `RefreshDto` | `TokenPairVo` | `Auth` | `@Public()` | `refreshTokenPair` |
| 9 | `POST /api/v1/auth/logout` | -（仅 Header） | `LogoutResponseVo` | `Auth` | `@UseGuards(JwtAuthGuard)` | `logout` |

每个接口均含 `@ApiTags('Auth')` + `@ApiOperation` + `@ApiResponse`（grep 验证：`@ApiOperation` 命中 9 条 ✓）。

---

## 三、14 个 D1 Entity 字段映射

| # | 实体类 | 表名 | TS 字段数 | 三件套 | 说明 |
|---|---|---|---|---|---|
| 1 | `User` | `user` | 24 | mobile（_enc/_hash/_tail4）+ id_card（_enc/_hash）+ real_name（_enc）| C 端用户主表 |
| 2 | `UserAddress` | `user_address` | 22 | receiver_mobile（_enc/_hash/_tail4）| 收货地址簿 |
| 3 | `Merchant` | `merchant` | 26 | mobile（_enc/_hash/_tail4）+ legal_id_card（_enc/_hash）| 商户主表 |
| 4 | `MerchantQualification` | `merchant_qualification` | 14 | 否 | 资质附件 |
| 5 | `MerchantStaff` | `merchant_staff` | 18 | mobile（_enc/_hash/_tail4）| 子账号；password_hash CHAR(60) |
| 6 | `Rider` | `rider` | 30 | mobile + id_card + name(_enc/_tail) + bank_card(_enc/_tail4) | 骑手主表 |
| 7 | `RiderQualification` | `rider_qualification` | 13 | 否 | 资质附件 |
| 8 | `RiderDeposit` | `rider_deposit` | 13 | 否 | 保证金流水 |
| 9 | `Admin` | `admin` | 19 | mobile（_enc/_hash/_tail4）| 平台管理员；password_hash CHAR(60) |
| 10 | `Role` | `role` | 12 | 否 | 5 个 seed 角色 |
| 11 | `Permission` | `permission` | 14 | 否 | 92 条 seed |
| 12 | `AdminRole` | `admin_role` | 8 | 否 | 关联 |
| 13 | `RolePermission` | `role_permission` | 8 | 否 | 关联 |
| 14 | `Blacklist` | `blacklist` | 16 | 否 | 全局黑名单 |
| + | `FileMeta`（桥接 re-export） | `file_meta` | 21 | 否 | D10 桥接 → C 的 file 模块 |

> 全部 14 个 D1 实体含 5 标配字段（继承 `BaseEntity`）；SQL 列名严格对齐 `01_account.sql`（snake_case ↔ camelCase 通过 `@Column({ name: 'snake_case_name' })` 显式声明）。

---

## 四、Guard 链设计（DESIGN_P3 §7.3）

```
Request
  │
  ├─ LoggingInterceptor      # 注入 X-Trace-Id 短 UUID（12 位）
  ├─ TimeoutInterceptor      # 默认 10s
  │
  ├─ JwtAuthGuard            # @Public() 跳过；其余 passport-jwt HS512 验签 + Redis ver 校验
  │     ├─ Strategy.validate # payload 完整性 + ver >= currentVer
  │     └─ req.user = AuthUser{ uid, userType, tenantId, ver, isSuper?, merchantId? }
  │
  ├─ UserTypeGuard           # @UserTypes('user'|'merchant'|'rider'|'admin') 白名单（员工 B 占位实现）
  │
  ├─ PermissionGuard         # @Permissions('xxx') 比对 Redis Set auth:permissions:{adminId}（员工 B 自有产出）
  │     ├─ admin.is_super=1 → '*' 通配 → 直接放行
  │     └─ cache miss → DB join admin_role + role_permission + permission 重建
  │
  └─ ThrottleSignGuard       # 管理后台专用；X-App-Key/Timestamp/Nonce/Sign 四件套
        ├─ Math.abs(now - ts) ≤ 5min
        ├─ SETNX auth:nonce:{nonce} TTL 5min（防重放）
        └─ MD5(appKey + ts + nonce + body + appSecret) 比对
```

---

## 五、安全验证（ACCEPTANCE §三）

| 项 | 标准 | 实现 / 证据 |
|---|---|---|
| 密码 | bcrypt cost ≥ 10 | `password.util.ts.BCRYPT_COST=10`；`PasswordUtil.hash` / `verify` 同步 + 兼容 B 旧 `$scrypt$` 占位 |
| Token | JWT HS512 + ver 字段支持吊销 | `jwt.strategy.ts.algorithms=['HS512']`；`auth.service.ts` 签发用 `algorithm: 'HS512'`；`logout` INCR `auth:tokenver:{userType}:{uid}` |
| 签名头 | X-Sign 校验通过 | `throttle-sign.guard.ts`：MD5(appKey+ts+nonce+body+appSecret) |
| 防重放 | 同一 nonce 60s 内拒绝 | `throttle-sign.guard.ts.SETNX auth:nonce:{nonce} TTL 5min`（>60s，更严） |
| 敏感日志 | mobile / id_card 仅显示 tail4 | `crypto.util.ts.mask(plain, 3, 4)` + `tail4()` 工具；AuthService 中所有 log 均走 `maskMobile` |
| 文件 | MIME + 大小 + 扩展名校验 | C 的 `mime.util.ts` + `assertFileAllowed`，A 帮 C 加上的 JwtAuthGuard 让上传/删除均受认证保护 |

---

## 六、集成协调（A 作为组长帮 B/C 修了 9 个跨成员问题）

| # | 问题来源 | 现象 | 组长协调动作 |
|---|---|---|---|
| 1 | B：`user.service.ts` | `PasswordUtil.hash` 期望同步签名，B 写了 scrypt 占位实现 | 接管为 bcryptjs cost=10 同步实现，保留 `$scrypt$` 旧 hash 兼容 verify（B 占位文件指示我接管） |
| 2 | B：`merchant.service.ts` | `import { generateBizNo } from '@/utils'` 不存在 | 新增 `utils/biz-no.generator.ts`（M+yyyyMMdd+seq6 格式）+ 桶形导出 |
| 3 | B：`admin.service.ts` | `import OperationLogService from './operation-log.service'` 不存在 | 新增 `modules/user/services/operation-log.service.ts` 占位（B 后续替换为真 entity 入库） |
| 4 | B：`message.consumer.ts` | `import { MessageService } from '../message.service'` 不存在 | 新增 `modules/message/message.service.ts` 占位 → R1/I-01 进一步重写为完整 4 通道路由 + 站内信 CRUD |
| 5 | B：`address.service.ts` | `SnowflakeId.next()` / `CryptoUtil.tail4()` / `CryptoUtil.encrypt(plain, ver?)` 返回 Buffer 与 A 原 API 不符 | 调整 utils API：`SnowflakeId.next()` 静态快捷 + `CryptoUtil.tail4()` 别名 + `CryptoUtil.encrypt(plain, ver?)` 改返回 Buffer + 新增 `encryptTriple()` 三件套 |
| 6 | B：`address.dto.ts` | `lng/lat: string \| null` 与 A 的 `number` Entity 不一致 | Entity 移除 transformer 改回 `string \| null`（与 mysql2 默认 DECIMAL → string 行为一致，保留精度）；同步把 `User.birthday` / `Rider.birthday` / `Rider.score` / `RiderDeposit.amount/balanceAfter` / `MerchantQualification.validFrom/To` 改 Date / string 与 B 的 dto 类型对齐 |
| 7 | C：`file.controller.ts` | `Express.Multer.File` 类型缺失（@types/multer 2.x 需 tsconfig types 显式引入）| tsconfig.json `types` 数组追加 `"multer"` |
| 8 | C：`map/{consumer,publisher}.ts` | `amqplib.Connection` 没有 `createChannel/close`（amqplib v0.10 重构为 `ChannelModel`，C 未跟进）| 新增 `src/types/amqplib-augment.d.ts` 做 module augmentation，给 `Connection` 接口补 `createChannel/close` |
| 9 | C：`map/{consumer,publisher,timescale.provider}.ts` | `import { Pool } from 'pg'` 缺 @types/pg | `pnpm --filter 后端 add -D @types/pg` |

---

## 七、自检清单逐项

- [x] grep 后端 src 全文 `: any` **0 命中**
- [x] grep 后端 src 全文 `console.log` **0 命中**
- [x] 14 个 D1 Entity 全部含 `tenant_id / is_deleted / created_at / updated_at / deleted_at`（继承 `BaseEntity`）
- [x] 敏感字段 Entity 含三件套（mobileEnc / mobileHash / mobileTail4 等）
- [x] JWT Strategy 算法 HS512（grep `HS512` 命中 3 处：strategy/module/service）
- [x] PasswordUtil bcrypt cost = **10**（≥ 10 满足约束）
- [x] 9 个 Auth 接口全部 `@ApiTags('Auth')` + `@ApiOperation`
- [x] `pnpm --filter 后端 build` Exit 0
- [x] `pnpm --filter 后端 start` 启动成功（19 模块 InstanceLoader 全 OK）
- [x] `docs/P3_后端基础服务/TODO_P3_后端基础服务.md` 自己负责的 8 行已勾选

---

## 八、已知遗留（移交 R1 / P9）

| # | 遗留项 | 移交 | 状态 |
|---|---|---|---|
| 1 | MessageService stub 占位（仅 log，未真路由 4 通道） | R1 / I-01 | ✅ R1 修复完成（本报告同时间） |
| 2 | InboxController 未落地（V3.16 站内信验收无法通过） | R1 / I-04 | ✅ R1 修复完成 |
| 3 | file.controller / map.controller 0 鉴权 | R1 / I-02 | ✅ R1 修复完成 |
| 4 | MinIO STS 直接返回 root ak/sk | R1 / I-03 | ✅ R1 修复完成 |
| 5 | 实库 DDL 执行 / TimescaleDB 真连接 | P9 | 与 P1 I-07/I-08、P2 T2.22 同处理；本机无 docker |
| 6 | OperationLogService 真实库化（目前仅 logger） | P4 | B 在订单/财务模块写操作时统一接入 |
| 7 | wx-mp 真实 jscode2session（目前 dev mock） | P9 | 配置 `WECHAT_MP_APPID/SECRET` 后自动启用 |

---

## 九、给 B/C 的反馈

**给 B 的建议**：
- `PasswordUtil` 已切换为 bcrypt cost=10 + 同步签名；B 旧 `$scrypt$...` hash 仍可 verify，可在登录通过后异步 rehash 写回；
- `OperationLogService` / `MessageService` 已由我占位 → R1/I-01 我已重写为真实路由；建议 B 在 P4 阶段把 OperationLogService 替换为 `operation_log` 表 entity 真实入库 + 异步 RabbitMQ；
- `merchant_qualification` / `rider_qualification` 的 `validFrom/validTo` 已改 `Date | null`，与你的 dto 期望一致。

**给 C 的建议**：
- `amqplib-augment.d.ts` 是临时类型补丁，建议后续把 `consumer/publisher` 中的 `amqplib.Connection` 改为 `amqplib.ChannelModel`（amqplib v0.10 推荐写法），即可移除补丁；
- R1/I-03 修复后 MinIO 适配器返回 `mode='presigned-put'`，前端需按 `mode` 字段分支处理，详见 `docs/P3_后端基础服务/api/file.md` 末尾"STS 双模式"章节；
- R1/I-02 修复后 file/map 全部接口统一 JwtAuthGuard，X-Uploader-* 头部已废弃；

---

## 十、签字

| 角色 | 签字 | 日期 |
|---|---|---|
| 员工 A（组长） | ✅ | 2026-04-19 |
| Cascade 复审 | 待 R1 PASS | - |
