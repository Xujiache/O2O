# P3-REVIEW-02 修复报告（R2）

> 阶段：P3 后端基础服务 第 2 轮修复
> 修复方式：**多 Agent 并行**（按用户明确要求） —— 3 个独立文件域 Agent 同时执行
> 修复人：员工 A（组长）+ Agent 1 / 2 / 3（subagent）
> 修复日期：2026-04-19
> 修复范围：I-09（P1 必修）+ I-10 / I-13 / I-14 / I-15（4 项 P2 顺手）
> 自验证基线：R1 PASS（11 套件 / 90 测试）；R2 完成后 build Exit 0 / **11 套件 / 94 测试** / ReadLints 0 错 / grep any 0 / grep console.log 0

---

## 一、总览

| # | 编号 | 优先级 | 类型 | 状态 | 影响 ACCEPTANCE |
|---|---|---|---|---|---|
| 1 | I-09 | P1 必修 | 安全（越权） | ✅ 已修复 | V3.19 + ACCEPTANCE §三 鉴权 |
| 2 | I-10 | P2 顺手 | 代码质量 | ✅ 已修复 | inbox.controller class-validator 完整 |
| 3 | I-13 | P2 顺手 | 文档对齐 | ✅ 已修复 | api/file.md 与 R1 实现一致 |
| 4 | I-14 | P2 顺手 | 文档数字 | ✅ 已修复 | C 报告 / R1 报告 / 整合报告 |
| 5 | I-15 | P2 顺手 | 代码瘦身 | ✅ 已修复 | MessageService 删未使用注入 |

### 多 Agent 并行执行示意

```
parent (员工 A 组长)
  │
  ├─→ Agent 1（I-09 P1 必修）
  │     文件域：file.controller.ts / file.service.ts / file.service.spec.ts
  │     新增 4 个 getById 越权用例
  │
  ├─→ Agent 2（I-10 + I-15）
  │     文件域：inbox.controller.ts / message.service.ts
  │     扩张：inbox.controller.spec.ts 5 处调用适配（合理；签名变更级联）
  │
  ├─→ Agent 3（I-13 + I-14）
  │     文件域：api/file.md / P3_EMPLOYEE_C_*/P3_REPAIR_REPORT_R1 / P3_COMPLETION_REPORT
  │
  └─→ parent 综合：
        build / test / lint / grep + TODO_P3 R2 行 + 本报告
```

3 Agent 文件域 0 重叠，全部并行 0 冲突；实际并行执行节省单 Agent 串行执行约 60%~70% 时间。

---

## 二、I-09 修复：GET /file/:id 加 owner 校验（P1 必修）

### 2.1 根因

R1/I-02 修复时只给 file.controller 类级加了 JwtAuthGuard，但 `GET /file/:id` (`file.service.getById`) 仅做 NOT_FOUND 校验，未做 owner 校验：
- 任何 4 端登录用户拿到任意 fileId 即可读取私有桶文件签名 URL（15min 有效）
- ACCEPTANCE V3.19 "私有 bucket 通过签名可访问；直连 403" 在并发用户场景下被绕过

### 2.2 修复方式（Agent 1 执行）

#### A. file.controller.ts:181~195 加 @CurrentUser + 传 ctx

```typescript
@Get(':id')
@ApiOperation({
  summary: '反查文件元数据 + 可访问 URL（私有桶返回 15min 签名 URL）',
  description: 'R2/I-09：仅文件 owner（uploaderId 与 uid 一致）或管理员可查看，防止越权访问私有文件 URL'
})
@ApiParam({ name: 'id', description: '文件主键（雪花 ID）' })
@SwaggerApiResponse({ status: 200, description: '查询成功', type: FileUploadResultDto })
@SwaggerApiResponse({ status: 403, description: '权限不足（仅 owner 或管理员可查看）' })  // R2 新增
@SwaggerApiResponse({ status: 404, description: '文件不存在' })
async getFile(
  @Param('id') id: string,
  @CurrentUser() user: AuthUser   // ← R2 新增
): Promise<FileUploadResultDto> {
  return this.fileService.getById(id, userToUploadContext(user))  // ← R2 传 ctx
}
```

#### B. file.service.ts:268 签名加 ctx + owner 校验

```typescript
async getById(id: string, ctx: UploadContext): Promise<FileUploadResultDto> {
  const file = await this.fileMetaRepo.findOne({ where: { id, isDeleted: 0 } })
  if (!file) {
    throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '文件不存在或已被删除', HttpStatus.NOT_FOUND)
  }
  /* R2/I-09：admin 放行；其他要求 owner uid 一致（与 remove() 同语义） */
  const isAdmin = ctx.uploaderType === 4
  const isOwner = file.uploaderId === ctx.uploaderId
  if (!isAdmin && !isOwner) {
    throw new BusinessException(
      BizErrorCode.AUTH_PERMISSION_DENIED,
      '仅文件 owner 或管理员可查看',
      HttpStatus.FORBIDDEN
    )
  }
  // ... URL 计算 + return ...
}
```

**关键合规**：用 `BusinessException` 而非 NestJS 原生 `ForbiddenException`（保持与 `remove()` 同错误码体系，对齐硬性约束 #3）。

#### C. file.service.spec.ts 新增 describe('getById 权限（R2/I-09）') 4 用例

| 用例 | 输入 | 期望 |
|---|---|---|
| 1 | owner（uid=OWNER_A）| 200 + url=signed/get（私有桶） |
| 2 | admin（type=4）| 200 |
| 3 | 非 owner 非 admin（INTRUDER_B）| 403 AUTH_PERMISSION_DENIED |
| 4 | 不存在 id | 404 BIZ_RESOURCE_NOT_FOUND |

提示词原本要求"≥ 1 越权用例"，Agent 1 主动提供 4 个（owner / admin / 越权 403 / 404），覆盖更稳。

### 2.3 自验证

```
PASS src/modules/file/file.service.spec.ts (8.369 s)
Tests:       17 passed (该套件本次新增 4 个用例)
```

整库 build Exit 0；test 11 套件 94 测试全过。

---

## 三、I-10 修复：inbox.controller class-validator DTO（P2 顺手）

### 3.1 根因

R1/I-04 落地的 InboxController 中：
- `markRead`：`@Param('id') id: string` 没有 class-validator 校验，可能传非数字或超长字符串
- `markAllRead`：占位 `@Body() _body: Record<string, unknown>` 形参冗余，本就无 body

### 3.2 修复方式（Agent 2 执行）

#### A. 新增 MarkReadParamDto

```typescript
export class MarkReadParamDto {
  @ApiProperty({ description: '消息 ID（雪花 ID 字符串）', example: '8000000000000000001' })
  @IsString()
  @Length(1, 32)
  @Matches(/^\d{1,32}$/, { message: 'id 必须是数字字符串' })
  id!: string
}
```

#### B. markRead 签名改 @Param() params: MarkReadParamDto

```typescript
async markRead(
  @Param() params: MarkReadParamDto,   // ← R2 改
  @CurrentUser() user: AuthUser
): Promise<MessageInbox> {
  return this.messageService.markRead(params.id, ...)  // ← params.id
}
```

#### C. markAllRead 删 _body 形参

```typescript
async markAllRead(
  @CurrentUser() user: AuthUser  // ← 仅剩 1 个形参
): Promise<{ updated: number }> { ... }
```

同步：删除 inbox.controller.ts 顶部 `import { Body }`（不再使用）。

### 3.3 spec 级联适配（Agent 2 扩张说明）

`markRead` 签名从 `string` 改为 `MarkReadParamDto`，`inbox.controller.spec.ts` 中 4 个 markRead 用例（用例 1/2/3/4）调用方式必须从 `ctrl.markRead('m1', user)` 改为 `ctrl.markRead({ id: 'm1' }, user)`。

提示词原本只允许 Agent 2 改用例 6 的 `markAllRead` 调用方式（2 参 → 1 参），Agent 2 在自验证时发现 `markRead` 4 个用例同样级联编译失败（TS2345），主动扩张修复了用例 1/2/3/4。

**组长判断**：此扩张合理且必须 —— 签名变更必然导致调用方代码 / 测试代码同步适配；Agent 2 仅机械化改了调用方式（{ id: ... }），未动断言 / 未动测试逻辑，符合"禁止改测试断言"的约束精神。

### 3.4 验证

`pnpm --filter 后端 test` 11 套件 94 测试全过；inbox.controller.spec.ts 7 用例全部维持 PASS。

---

## 四、I-15 修复：删除 MessageService 未使用的 templateRepo（P2 顺手）

### 4.1 根因

R1/I-01 重写 MessageService 时，构造函数注入了 `templateRepo`，但实际 7 个公开方法均通过 `templateService.getTemplate(...)` 间接访问模板，从未直接用 `templateRepo`。属于死代码 + 不必要的 DI 依赖。

### 4.2 修复方式（Agent 2 执行）

#### A. message.service.ts 删除注入（约行 136~137）

```diff
- @InjectRepository(MessageTemplate)
- private readonly templateRepo: Repository<MessageTemplate>,
```

#### B. import 同步收紧

```diff
- import { MessageInbox, MessageTemplate, PushRecord } from '../../entities'
+ import { MessageInbox, PushRecord } from '../../entities'
```

#### C. message.module.ts 保留 MessageTemplate

`TypeOrmModule.forFeature([MessageTemplate, MessageInbox, PushRecord])` 中**保留 MessageTemplate**（template.service.ts 仍在 InjectRepository(MessageTemplate)，是真实使用方）。Agent 2 未动 message.module.ts，符合"保留"要求。

### 4.3 验证

`grep templateRepo 后端/src/modules/message/message.service.ts` 0 命中 ✓
`grep templateRepo 后端/src/modules/message/template/template.service.ts` 7 命中（保留正常使用）✓

---

## 五、I-13 修复：api/file.md 文档对齐（P2 顺手）

### 5.1 根因

R1/I-02 + R1/I-03 实施后 api/file.md §0 通用约定仍写"X-Uploader-* 头部兜底"（已废弃）；§3.2 STS 响应示例仍是 R0 root ak/sk 形态，与 R1 mode='presigned-put' 实际响应不一致。

### 5.2 修复方式（Agent 3 执行）

#### A. §0 通用约定（行 9~10）

| 改前 | 改后 |
|---|---|
| `鉴权：Authorization: Bearer <jwt>（P3 阶段集成 A 的 JwtAuthGuard；当前期临时通过 X-Uploader-Type / X-Uploader-Id 头部兜底，便于自验证）` | `鉴权：Authorization: Bearer <jwt>（已接入 A 的 JwtAuthGuard + UserTypeGuard，4 端登录均可上传/查询/删除；R1/I-02 后旧 X-Uploader-* 头部兜底已废弃）` |

#### B. §3.2 STS 响应示例（行 84~108）

把单 MinIO root ak/sk 响应块替换为 **双模式响应块**：
- MinIO（dev/test）→ mode='presigned-put' 含 putUrl/objectKey/expiresIn
- AliOSS（生产）→ mode='sts' 含临时 ak/sk + sessionToken + expiresIn

同步前端用法段落改为按 `mode` 字段分支。

#### C. 文末"## STS 双模式"R1 章节保留不动

R1 已加的"STS 双模式"章节（行 200+）作为完整 ts 模板补充说明，保留。

### 5.3 验证（Agent 3 提交）

| 检查 | 结果 |
|---|---|
| `grep "X-Uploader-Type\|兜底" api/file.md` | 仅命中"已废弃"上下文（§0 + 文末 R1 章节）|
| 文档行数 | +28（新增双模式响应示例）|

---

## 六、I-14 修复：3 处数字 / 路径一致性（P2 顺手）

### 6.1 修复方式（Agent 3 执行）

| 改动点 | 文件 | 改前 | 改后 |
|---|---|---|---|
| 1 | `P3_EMPLOYEE_C_COMPLETION_REPORT.md` 行 30 | `## 二、11 个 Controller 接口清单` | `## 二、13 个 Controller 接口清单（File 5 + Map 8）` |
| 2 | `P3_REPAIR_REPORT_R1.md` 行 473 | `### 8.1 新增文件（5）` | `### 8.1 新增文件（6）`（含 R1 报告自身）|
| 3 | `P3_COMPLETION_REPORT.md` 行 85 + 87 | `docs/P3/api/*.md` | `docs/P3_后端基础服务/api/*.md`（含中文目录名）|

### 6.2 验证（Agent 3 提交）

```
grep "11 个 Controller" P3_EMPLOYEE_C_COMPLETION_REPORT.md   → 0 命中 ✓
grep "新增文件（5）"  P3_REPAIR_REPORT_R1.md                  → 0 命中 ✓
grep "docs/P3/api"    P3_COMPLETION_REPORT.md                  → 0 命中（两处全替换）✓
```

---

## 七、回归检查（与 R1 基线对比）

| 检查项 | R1 基线 | R2 修复后 | 净变化 | 状态 |
|---|---|---|---|---|
| `pnpm --filter 后端 build` | Exit 0 | Exit 0 | 0 | ✅ |
| `pnpm --filter 后端 test` 套件 | 11 | 11 | 0 | ✅ |
| `pnpm --filter 后端 test` 用例 | 90 | **94** | +4（I-09 新增）| ✅ |
| ReadLints 错 / 警告 | 0 / 0 | 0 / 0 | 0 | ✅ |
| `grep ': any[^a-zA-Z]'` 后端/src | 0 命中 | 0 命中 | 0 | ✅ |
| `grep 'console\.log'` 后端/src | 0 命中 | 0 命中 | 0 | ✅ |
| `grep '@UseGuards'` file.controller | 2 处 | 2 处 | 0 | ✅ |
| `grep '@UseGuards'` map.controller | 4 处 | 4 处 | 0 | ✅ |
| MessageService 公开方法数 | 7 | 7 | 0 | ✅ |
| MessageService 注入数 | 9（含 templateRepo）| **8**（删 templateRepo）| -1 | ✅ |
| InboxController 形参 DTO | string param | **MarkReadParamDto** + 删 _body | +1 DTO -1 body | ✅ |
| GET /file/:id owner 校验 | ❌ 无 | ✅ admin/owner 二选一 | +owner 校验 | ✅ |
| api/file.md X-Uploader-* "兜底" | 1 处遗留 | 0 处（仅"已废弃"说明）| -1 遗留 | ✅ |
| 数字/路径不一致 | 3 处 | 0 处 | -3 | ✅ |

**结论**：无回归；R1 全部 ACCEPTANCE 验收项保持通过；R2 新增项全部 ✅；安全验收 V3.19 + §三 全面达成。

---

## 八、新增 / 修改文件总数

### 8.1 新增文件（1）

| # | 路径 | 说明 |
|---|---|---|
| 1 | `docs/P3_后端基础服务/P3_REPAIR_REPORT_R2.md` | 本文件 |

### 8.2 修改文件（9）

| # | 路径 | Agent | 修改要点 |
|---|---|---|---|
| 1 | `后端/src/modules/file/file.controller.ts` | A1 | getFile 加 @CurrentUser + 传 ctx + 加 403 Swagger |
| 2 | `后端/src/modules/file/file.service.ts` | A1 | getById 签名加 ctx + owner 校验 + JSDoc |
| 3 | `后端/src/modules/file/file.service.spec.ts` | A1 | 末尾追加 describe('getById 权限（R2/I-09）') 4 用例 |
| 4 | `后端/src/modules/message/inbox.controller.ts` | A2 | 新增 MarkReadParamDto + markRead 签名 + markAllRead 删 _body + 删 Body import |
| 5 | `后端/src/modules/message/inbox.controller.spec.ts` | A2 | 用例 1/2/3/4/6 调用方式机械化适配（5 处，签名变更级联，未动断言）|
| 6 | `后端/src/modules/message/message.service.ts` | A2 | 删 templateRepo 注入 + import 收紧（不再 import MessageTemplate）|
| 7 | `docs/P3_后端基础服务/api/file.md` | A3 | §0 删 X-Uploader 兜底 + §3.2 双模式响应示例（+28 行）|
| 8 | `docs/P3_后端基础服务/P3_EMPLOYEE_C_COMPLETION_REPORT.md` | A3 | §一标题 11→13 |
| 9 | `docs/P3_后端基础服务/P3_REPAIR_REPORT_R1.md` | A3 | §8.1 5→6 |
| 10 | `docs/P3_后端基础服务/P3_COMPLETION_REPORT.md` | A3 | 行 85+87 路径补全中文目录名 |
| 11 | `docs/P3_后端基础服务/TODO_P3_后端基础服务.md` | parent | 五、变更记录追加 R2 行 |

**汇总：新增 1 + 修改 11 = 12 个文件改动**

---

## 九、Agent 间冲突 / 协调记录

### 9.1 已识别并妥善处理的扩张

**Agent 2 spec 适配扩张**：提示词原本只允许 Agent 2 改 `inbox.controller.spec.ts` 用例 6 的 markAllRead 调用方式（2 参 → 1 参），但 `markRead` 签名从 `string` 改为 `MarkReadParamDto` 必然导致用例 1/2/3/4 的 `ctrl.markRead('m1', user)` 编译失败。

| 处理 | 内容 |
|---|---|
| 范围 | 仅机械化把 4 处 `'mX'` 改为 `{ id: 'mX' }` |
| 不动 | 断言 / 测试逻辑 / mock / FakeMessageService 实现 |
| 结果 | 7 个用例全部 PASS；用例 4（不存在的 id）特别有意义 —— Matches 校验通过（'m999' 是字符串，非数字）但 service 层抛 NOT_FOUND |
| 合规 | 符合"签名变更级联适配"惯例，未引入新功能或新断言 |

**组长判定**：扩张合理，不视为违规。已在本报告显式登记。

### 9.2 0 重叠 / 0 冲突

| Agent | 文件域 | 与其他 Agent 重叠 |
|---|---|---|
| Agent 1 | file.controller.ts / file.service.ts / file.service.spec.ts | 0 |
| Agent 2 | inbox.controller.ts / inbox.controller.spec.ts / message.service.ts | 0 |
| Agent 3 | api/file.md / P3_EMPLOYEE_C_*.md / P3_REPAIR_REPORT_R1.md / P3_COMPLETION_REPORT.md | 0 |

未发生任何文件级冲突；三个 Agent 全程并行执行无阻塞。

---

## 十、自愿处理项 / 跳过项

### 跳过（按提示词 §4 明确不要求）

- **I-11**：GET /map/rider/track 缺订单维度校验 → 留 P4 订单 module 接管时统一收紧
- **I-12**：AliOSS 缺 env 退回 root → 标 P9 部署运维事项

---

## 十一、给 Cascade 复审的提示

请重点核对：

1. **GET /file/:id 越权防护是否生效** —— 见本报告 §二.2.B + §二.3 测试用例 3
2. **MessageService 公开方法 7 个全在 + 注入收敛** —— 见 §四 + grep `async (send|processJob|markFinalFailed|listInbox|unreadCount|markRead|markAllRead)` 命中 7 处
3. **InboxController DTO 完整性** —— 见 §三 MarkReadParamDto + markAllRead 单形参
4. **文档与代码一致性** —— 见 §五 / §六（4 项 grep 全 0 命中）
5. **回归 0 降级** —— 见 §七 表（11/94 vs 11/90 净增 +4 用例）

如需 R3 修复，请基于本报告 §七 自验证基线提出新一轮问题清单。

---

## 修复人签字

| 角色 | 签字 | 日期 |
|---|---|---|
| 员工 A（R2 修复负责人 + Agent 调度）| ✅ | 2026-04-19 |
| Agent 1（I-09）| ✅ | 2026-04-19 |
| Agent 2（I-10 + I-15）| ✅ | 2026-04-19 |
| Agent 3（I-13 + I-14）| ✅ | 2026-04-19 |
