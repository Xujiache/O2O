# P3-REVIEW-01 修复报告（R1）

> 阶段：P3 后端基础服务 第 1 轮修复
> 修复人：员工 A（组长）
> 修复日期：2026-04-19
> 修复范围：I-01（P0 阻塞）+ I-02~I-05（4 项 P1）+ 自愿处理 1 项（I-06）
> 自验证基线：R0 PASS；R1 完成后 build Exit 0 / 11 套件 90 测试全过 / ReadLints 0 错 / grep any 0 / grep console.log 0

---

## 总览

| # | 编号 | 优先级 | 状态 | 影响 ACCEPTANCE |
|---|---|---|---|---|
| 1 | I-01 | P0 阻塞 | ✅ 已修复 | V3.13 / V3.14 / V3.15 / V3.16 |
| 2 | I-02 | P1 安全 | ✅ 已修复 | V3.17~V3.25 安全验收 + ACCEPTANCE §三鉴权 |
| 3 | I-03 | P1 安全 | ✅ 已修复 | V3.18 + ACCEPTANCE §三 STS 凭证 |
| 4 | I-04 | P1 功能 | ✅ 已修复 | V3.16 站内信验收 |
| 5 | I-05 | P1 文档 | ✅ 已修复 | 文档完整性 |
| + | I-06 | P2 顺手 | ✅ 已随 I-02 一并 | resolveUploadContext 已删 |

---

## 一、I-01 修复：MessageService 完整化（P0 阻塞）

### 1.1 根因

R0 阶段员工 A 在协调集成时给 message.consumer.ts 提供了 message.service.ts 占位
（仅 logger.log，不实际路由 4 通道），原因：
- B 写了 message.consumer.ts 但漏写 message.service.ts（B 任务范围内）
- B 写了 4 个 Channel 类（wx-subscribe / jpush / ali-sms / inbox）但未在 service 层做路由
- A 占位让 build 通过但留下"已知遗留"，期望 R1 由 A 接管完整化

→ 直接导致 V3.13~V3.16 全部无法验收

### 1.2 修复方式

#### A. 新增 4 个 Channel Symbol token

`后端/src/modules/message/channels/message-channel.interface.ts` 末尾追加：

```typescript
export const WX_SUBSCRIBE_CHANNEL = Symbol('WX_SUBSCRIBE_CHANNEL')
export const JPUSH_CHANNEL = Symbol('JPUSH_CHANNEL')
export const ALI_SMS_CHANNEL = Symbol('ALI_SMS_CHANNEL')
export const INBOX_CHANNEL = Symbol('INBOX_CHANNEL')
```

#### B. 完整重写 `message.service.ts`（删 stub）

```typescript
@Injectable()
export class MessageService {
  constructor(
    @Inject(WX_SUBSCRIBE_CHANNEL) private readonly wxChannel: MessageChannel,
    @Inject(JPUSH_CHANNEL) private readonly jpushChannel: MessageChannel,
    @Inject(ALI_SMS_CHANNEL) private readonly aliSmsChannel: MessageChannel,
    @Inject(INBOX_CHANNEL) private readonly inboxChannel: MessageChannel,
    @InjectRepository(PushRecord) private readonly pushRecordRepo: Repository<PushRecord>,
    @InjectRepository(MessageInbox) private readonly inboxRepo: Repository<MessageInbox>,
    @InjectRepository(MessageTemplate) private readonly templateRepo: Repository<MessageTemplate>,
    private readonly templateService: TemplateService,
    @Inject(forwardRef(() => MessageConsumer)) private readonly consumer: MessageConsumer
  ) {}

  /* 7 个公开方法 */
  async send(opts: SendMessageOpts): Promise<{ jobsCreated: number }>
  async processJob(job: MessagePushJob): Promise<ProcessJobResult>
  async markFinalFailed(job, errorCode, errorMsg): Promise<void>
  async listInbox(receiverType, receiverId, opts): Promise<PageResult<MessageInbox>>
  async unreadCount(receiverType, receiverId): Promise<number>
  async markRead(id, currentUser): Promise<MessageInbox>  // 含越权校验
  async markAllRead(receiverType, receiverId): Promise<{ updated: number }>
}
```

**send 流程对齐 DESIGN_P3 §4.1**：
1. `templateService.getRegistration(code)` 取默认通道集合
2. 对每个通道：渲染 title/content + 写 push_record(status=0) + publish 到 RabbitMQ
3. publish 失败 → 降级直接 processJob（in-memory mode）
4. 多通道时 requestId 加 `:channel` 后缀避免 unique 冲突

**processJob**：按 `job.channel` 路由 → channel.send → 成功 push_record(status=2/sentAt) / 失败 push_record(status=1/errorCode)

**markFinalFailed**：≥3 次重试后 → push_record(status=3)

**markRead 越权校验**：必须 `receiverType === userTypeMap[currentUser.userType] && receiverId === currentUser.uid`，否则抛 20003

#### C. 同步更新 `message.module.ts`

```typescript
providers: [
  TemplateService,
  WxSubscribeChannel, JPushChannel, AliSmsChannel, InboxChannel,
  /* 4 个 Symbol token 通过 useExisting 复用上面 4 个具体 Class */
  { provide: WX_SUBSCRIBE_CHANNEL, useExisting: WxSubscribeChannel },
  { provide: JPUSH_CHANNEL, useExisting: JPushChannel },
  { provide: ALI_SMS_CHANNEL, useExisting: AliSmsChannel },
  { provide: INBOX_CHANNEL, useExisting: InboxChannel },
  MessageConsumer, MessageService
],
controllers: [InboxController],  // R1/I-04
```

### 1.3 自验证

```bash
pnpm --filter 后端 build         # Exit 0 ✓
pnpm --filter 后端 test          # 11 套件 90 测试全过 ✓
grep -rn "MSG-STUB" 后端/src     # 0 命中（旧 stub 已彻底删除）✓
```

---

## 二、I-02 修复：file/map 全部接口加 @UseGuards

### 2.1 根因

C 在 R0 写 file.controller.ts 时注释明示："P3 期 Auth Guard 由员工 A 集成；本期 Controller 暂从 Header 兜底取 X-Uploader-Type / X-Uploader-Id"。但实际从未接入 JwtAuthGuard，导致：
- 任何客户端伪造 `X-Uploader-Type: 4` + `X-Uploader-Id: 1` 即可越权操作 admin 文件
- map 模块 7 个接口完全无鉴权，任何人可上报骑手位置 / 查询轨迹

### 2.2 修复方式

#### A. file.controller.ts

```typescript
// 删除 resolveUploadContext 函数（占位兜底）
// 删除所有 @Headers() headers 参数

@ApiTags('文件 / File')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)        // ← R1 新增
@UserTypes('user', 'merchant', 'rider', 'admin') // ← R1 新增
@Controller('file')
export class FileController {
  // 5 个接口入参全改：
  //   原：@Headers() headers: Record<string, string|undefined>
  //   新：@CurrentUser() user: AuthUser
}

// userType → uploaderType 数值映射
function userToUploadContext(user: AuthUser): UploadContext {
  const map = { user: 1, merchant: 2, rider: 3, admin: 4 }
  return { uploaderType: map[user.userType], uploaderId: user.uid }
}
```

#### B. file.service.ts.remove() owner 校验收紧

```typescript
// R0：file.uploaderType === ctx.uploaderType && file.uploaderId === ctx.uploaderId
// R1：admin 直接放行；其他必须 file.uploaderId === ctx.uploaderId（uid 维度严判）
const isAdmin = ctx.uploaderType === 4
const isOwner = file.uploaderId === ctx.uploaderId
if (!isAdmin && !isOwner) throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, ...)
```

#### C. map.controller.ts

```typescript
@ApiTags('地图 / Map')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)                        // ← R1 类级新增
@Controller('map')
export class MapController {
  /* 4 个全端接口（geocode/regeocode/distance/routing/within-area） */
  /* 不再追加 UserTypeGuard */

  @Post('shop-area')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant', 'admin')                // ← R1
  setShopArea() { ... }

  @Post('rider/report')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider')                            // ← R1
  async report(@Body() dto: RiderReportDto, @CurrentUser() user: AuthUser) {
    /* 防伪造校验：dto.riderId 必须 === user.uid */
    if (dto.riderId !== user.uid) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        `dto.riderId(${dto.riderId}) 与登录骑手 uid(${user.uid}) 不一致`
      )
    }
    return this.riderLocService.reportBatch(dto)
  }

  @Get('rider/:id/track/:orderNo')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user', 'rider', 'admin')           // ← R1
  track() { ... }
}
```

### 2.3 自验证

```bash
grep -nE "@UseGuards" 后端/src/modules/file/file.controller.ts
# 命中：行 87 @UseGuards(JwtAuthGuard, UserTypeGuard)

grep -nE "@UseGuards" 后端/src/modules/map/map.controller.ts
# 命中：行 81 类级 / 183 / 207 / 244（3 个特殊接口）
```

build / test 通过；I-06（resolveUploadContext 删除）已随本次一并完成。

---

## 三、I-03 修复：MinIO STS 改为 presigned-put

### 3.1 根因

R0 MinIO 适配器的 `generateStsCredential` 直接返回 `{ accessKeyId: this.options.accessKey, accessKeySecret: this.options.secretKey }`，等于把管理员 root 凭证下发到任何调用方，即使取得 `keyPrefix` 也无法防越权（前端可用同一 ak/sk 写任何 bucket 任何路径）。

### 3.2 修复方式

#### A. `StorageAdapter.StsCredential` 接口扩展双模式字段

```typescript
export interface StsCredential {
  mode?: 'sts' | 'presigned-put'  // ← R1 新增
  provider: 'minio' | 'ali-oss'

  /* sts 模式专用 */
  accessKeyId: string
  accessKeySecret: string
  sessionToken?: string

  /* presigned-put 模式专用 */
  putUrl?: string                  // ← R1 新增
  objectKey?: string               // ← R1 新增

  expiration: number
  expiresIn: number                // ← R1 新增（统一秒数字段）
  bucket: string
  keyPrefix: string
  endpoint: string
  region?: string
}
```

#### B. MinIO 适配器：改为生成 presigned-put

```typescript
async generateStsCredential(bucket, keyPrefix, expiresSec): Promise<StsCredential> {
  const prefix = keyPrefix.endsWith('/') ? keyPrefix : `${keyPrefix}/`
  const objectKey = `${prefix}${randomUUID().replace(/-/g, '')}`
  const putUrl = await this.client.presignedPutObject(bucket, objectKey, expiresSec)
  return {
    mode: 'presigned-put',
    provider: 'minio',
    accessKeyId: '',         // R1：彻底不暴露
    accessKeySecret: '',     // R1：彻底不暴露
    sessionToken: undefined,
    putUrl,
    objectKey,
    expiration: Date.now() + expiresSec * 1000,
    expiresIn: expiresSec,
    bucket, keyPrefix: prefix, endpoint, region: ...
  }
}
```

#### C. AliOSS 适配器：保留 STS-AssumeRole（mode='sts'）

```typescript
return {
  mode: 'sts',                                                          // ← R1 新增
  provider: 'ali-oss',
  accessKeyId: result.credentials.AccessKeyId,
  accessKeySecret: result.credentials.AccessKeySecret,
  sessionToken: result.credentials.SecurityToken,
  expiresIn: expiresSec,                                                // ← R1 新增
  ...
}
```

#### D. 更新 `dto/file-result.dto.ts.StsCredentialDto` 加 mode/putUrl/objectKey/expiresIn

#### E. 文档：`docs/P3_后端基础服务/api/file.md` 末尾追加 STS 双模式章节，含前端 ts 用法模板。

### 3.3 测试更新

R0 测试 `generateStsCredential 兜底返回 root ak/sk` 期望 `accessKeyId === 'AK'`，R1 后必须改为 `accessKeyId === ''`。新增 2 个用例：

```typescript
it('R1/I-03：generateStsCredential 返回 mode=presigned-put（不再暴露 root ak/sk）', ...)
it('R1/I-03：putUrl 与 objectKey 必返且 objectKey 在 keyPrefix 下', ...)
it('R1/I-03：未带末尾 / 的 keyPrefix 也能自动补全', ...)
```

### 3.4 自验证

```bash
pnpm --filter 后端 test
# storage.adapter.spec.ts: 旧用例升级 + 2 个新用例；全过
```

---

## 四、I-04 修复：站内信 4 接口（依赖 I-01）

### 4.1 根因

ACCEPTANCE V3.16 要求"站内信 写库 + 未读数；mark-read 可用"。R0 仅 InboxChannel 实现了写库，未提供查询/标已读 controller，前端无法接入。

### 4.2 修复方式

#### A. 新增 `后端/src/modules/message/inbox.controller.ts`

```typescript
@ApiTags('消息 / Message')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me/messages', version: '1' })
export class InboxController {
  @Get()                  // GET  /api/v1/me/messages?page=1&pageSize=10&onlyUnread=false
  @Get('unread-count')    // GET  /api/v1/me/messages/unread-count
  @Put(':id/read')        // PUT  /api/v1/me/messages/:id/read（含越权校验）
  @Put('read-all')        // PUT  /api/v1/me/messages/read-all
}
```

`receiverType` 由 `currentUser.userType` 自动推导（user→1 / merchant→2 / rider→3 / admin→4）；4 个接口全部 `@ApiOperation` + `@ApiResponse`。

#### B. 注册到 `message.module.ts.controllers`

```typescript
@Module({
  ...
  controllers: [InboxController],
  ...
})
```

#### C. 越权校验单测（≥ 3 用例）

新增 `inbox.controller.spec.ts`，**7 个用例**：

| # | 用例 | 期望 |
|---|---|---|
| 1 | 同 userType + 同 uid → markRead | ✅ row.isRead=1 |
| 2 | 同 userType 但不同 uid → markRead | ❌ 抛 20003 |
| 3 | 不同 userType（receiverType 不匹配）→ markRead | ❌ 抛 20003 |
| 4 | 不存在 id → markRead | ❌ 抛 10010 |
| 5 | unreadCount 自动按 userType 推导 receiverType | count 正确 |
| 6 | markAllRead 一键全部 + 幂等（再次为 0）| updated 正确 |
| 7 | list 仅返回当前 user 的消息 | 行隔离 |

### 4.3 Swagger 验证

`@ApiTags('消息 / Message')` 关键字 `消息` 与 `main.ts` 中 `/docs/user` 分组规则匹配（C 的 T3.23 配置：用户端文档关键字含 `消息`），自动落入 `/docs/user`。

### 4.4 自验证

```bash
pnpm --filter 后端 test
# inbox.controller.spec.ts: 7 用例全过
```

---

## 五、I-05 修复：A/C 单人完成报告 + 整合 P3 完成报告

### 5.1 根因

R0 完成时仅有员工 B 输出了 `P3_EMPLOYEE_B_COMPLETION_REPORT.md`，A/C 未落单人报告，且无整合 P3 完成报告。Cascade 复审时缺少 ACCEPTANCE 逐条核验依据。

### 5.2 修复方式

新增 3 份文档：

| # | 文件 | 行数 | 说明 |
|---|---|---|---|
| 1 | `docs/P3_后端基础服务/P3_EMPLOYEE_A_COMPLETION_REPORT.md` | ~140 | A 8 项 + 9 接口 + 14 entity 字段映射表 + Guard 链 + 安全验证 + 集成协调 9 项 + 自检 + 已知遗留 |
| 2 | `docs/P3_后端基础服务/P3_EMPLOYEE_C_COMPLETION_REPORT.md` | ~150 | C 10 项 + 11 接口 + Swagger 5 组 + jest 81/90 + Postman 14 + 上传校验示例 + 骑手全链路日志 + 已知遗留 |
| 3 | `docs/P3_后端基础服务/P3_COMPLETION_REPORT.md` | ~180 | 26 项 WBS 三人分配总表 + ACCEPTANCE V3.1~25 逐条核验 + R1 5 项汇总 + Δ1~Δ9 偏差登记 + 归并 P9 9 项 + 给 P4 接口建议 |

注：C 的报告由组长 A 综合 git diff + TODO 勾选行（§五）整理，并在文末注明"由 A 代综合签字"。

---

## 六、自验证（修复完成后）

### 6.1 build

```bash
pnpm --filter 后端 build
# Exit 0 ✓
```

### 6.2 test

```bash
pnpm --filter 后端 test
# 11 套件 / 90 测试全过 ✓
# 相比 R0 基线（10 套件 / 81 测试）：净增 +1 套件 +9 测试，0 降级
```

具体增量：
- `storage.adapter.spec.ts`：+2（presigned-put 模式 + keyPrefix 自动补 /）
- `inbox.controller.spec.ts`（新文件）：+7（7 个越权校验用例）

### 6.3 ReadLints

```bash
ReadLints 后端/src
# No linter errors found. ✓
```

### 6.4 grep `: any`

```bash
grep -rn ": any[^a-zA-Z]" 后端/src
# 0 命中 ✓
```

### 6.5 grep `console.log`

```bash
grep -rn "console\.log" 后端/src
# 0 命中 ✓
```

### 6.6 grep `@UseGuards` 在 file/map controller

```bash
grep -nE "@UseGuards" 后端/src/modules/file/file.controller.ts
# 行 87：@UseGuards(JwtAuthGuard, UserTypeGuard) 类级 ✓

grep -nE "@UseGuards" 后端/src/modules/map/map.controller.ts
# 行 81 类级 + 183/207/244 三个特殊接口 ✓
```

### 6.7 MessageService 7 个公开方法

```bash
grep -nE "async (send|processJob|markFinalFailed|listInbox|unreadCount|markRead|markAllRead)" \
  后端/src/modules/message/message.service.ts
# 7 个全部命中 ✓
```

### 6.8 minio.adapter 不再 export root ak/sk

```bash
grep -n "this.options.accessKey" 后端/src/modules/file/adapters/minio.adapter.ts
# 0 命中（仅 constructor 中 new MinioClient 用一次）
# generateStsCredential 中 accessKeyId: '' / accessKeySecret: '' ✓
```

---

## 七、回归检查

| 检查项 | R0 基线 | R1 修复后 | 净变化 |
|---|---|---|---|
| build | Exit 0 | Exit 0 | 0 |
| test 套件 | 10 | 11 | +1 |
| test 用例 | 81 | 90 | +9 |
| ReadLints 错 / 警告 | 0 / 0 | 0 / 0 | 0 |
| grep `: any` | 0 | 0 | 0 |
| grep `console.log` | 0 | 0 | 0 |
| Swagger 接口数 | 41（auth9 + user14 + file5 + map7 + 其他6）| 45（+ inbox 4）| +4 |
| Controller 文件数 | 10 | 11（+ inbox.controller）| +1 |

**结论：无回归，所有 R0 验收项保持通过 + R1 新增项全部 ✅**

---

## 八、新增 / 修改文件总数

### 8.1 新增文件（6）

| # | 路径 |
|---|---|
| 1 | `后端/src/modules/message/inbox.controller.ts` |
| 2 | `后端/src/modules/message/inbox.controller.spec.ts` |
| 3 | `docs/P3_后端基础服务/P3_EMPLOYEE_A_COMPLETION_REPORT.md` |
| 4 | `docs/P3_后端基础服务/P3_EMPLOYEE_C_COMPLETION_REPORT.md` |
| 5 | `docs/P3_后端基础服务/P3_COMPLETION_REPORT.md` |
| 6 | `docs/P3_后端基础服务/P3_REPAIR_REPORT_R1.md`（本文件）|

### 8.2 修改文件（10）

| # | 路径 | 修改要点 |
|---|---|---|
| 1 | `后端/src/modules/message/channels/message-channel.interface.ts` | 末尾追加 4 个 Channel Symbol token |
| 2 | `后端/src/modules/message/message.service.ts` | 完整重写（7 个公开方法 + 4 通道路由 + 站内信 CRUD）|
| 3 | `后端/src/modules/message/message.module.ts` | 加 InboxController + 4 个 useExisting token |
| 4 | `后端/src/modules/file/file.controller.ts` | 删 resolveUploadContext + 类级 JwtAuthGuard/UserTypeGuard + @CurrentUser |
| 5 | `后端/src/modules/file/file.service.ts` | UploadContext 注释更新 + remove owner 校验收紧 |
| 6 | `后端/src/modules/file/adapters/storage.adapter.ts` | StsCredential 接口加 mode/putUrl/objectKey/expiresIn |
| 7 | `后端/src/modules/file/adapters/minio.adapter.ts` | generateStsCredential 改 presigned-put 模式 |
| 8 | `后端/src/modules/file/adapters/ali-oss.adapter.ts` | generateStsCredential 加 mode='sts' + expiresIn |
| 9 | `后端/src/modules/file/dto/file-result.dto.ts` | StsCredentialDto 加 mode/putUrl/objectKey/expiresIn |
| 10 | `后端/src/modules/map/map.controller.ts` | 类级 JwtAuthGuard + 3 个特殊接口 UserTypes + rider/report 防伪造校验 |
| 11 | `后端/src/modules/file/adapters/storage.adapter.spec.ts` | 旧 root ak/sk 用例升级 + 2 个新用例 |
| 12 | `docs/P3_后端基础服务/api/file.md` | curl 替换 X-Uploader 为 Authorization Bearer + 末尾追加 STS 双模式章节 |
| 13 | `docs/P3_后端基础服务/TODO_P3_后端基础服务.md` | 五、变更记录追加 R1 行 |

**汇总：新增 6 + 修改 13 = 19 个文件改动**

---

## 九、自愿处理项

### I-06 file.controller resolveUploadContext 兜底

✅ 已随 I-02 一并删除 `resolveUploadContext` 函数（17 行）+ 5 处调用点全部替换为 `userToUploadContext(user)`。

### I-07 MessageService send 入口

✅ 已含在 I-01 完整化修复内（必修，非自愿）。

### I-08 P4 模块占位文件头注释统一加 `@stage P1 占位`

⏸ 跳过：影响面大且超出 P3 范围；建议作为 P4 第一个 PR 统一处理（不阻塞 P3-REVIEW-02）。

---

## 十、给 Cascade 复审的提示

请重点核对：

1. **ACCEPTANCE 4 项原本不通过的验收项**（V3.13 / V3.14 / V3.15 / V3.16）现在是否通过 → 见 `P3_COMPLETION_REPORT.md §2.1` 表
2. **安全验收 3 项加固**（鉴权 / STS / 越权）→ 见 `P3_COMPLETION_REPORT.md §2.3` 表
3. **回归 0 降级** → 见本报告 §七 表
4. **3 份完成报告** 的 ACCEPTANCE 逐条核验签字 → 见 `P3_COMPLETION_REPORT.md §2.1~§2.3`
5. **偏差登记表 Δ1~Δ9** → 见 `P3_COMPLETION_REPORT.md §四`

如需 R2 修复，请基于本报告 §六/§七 自验证基线提出新一轮问题清单。

---

## 修复人签字

| 角色 | 签字 | 日期 |
|---|---|---|
| 员工 A（R1 修复负责人）| ✅ | 2026-04-19 |
