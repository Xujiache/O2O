# User 模块接口文档（P3 / 员工 B 主负责）

> 基准：DESIGN_P3_后端基础服务.md §三
> 实现：`后端/src/modules/user/`（员工 B 持续推进）
>
> 本文件由员工 C 在 P3/T3.23 阶段先行起骨架；员工 B 完成后填充入参字段细节。

## 0. 通用约定

- 路径前缀：`/api/v1`
- 鉴权：除少量 PUBLIC 外，全部需 JWT
- 角色 Guard：`@UserTypes('user'|'merchant'|'rider'|'admin')`
- 权限 Guard：`@Permissions('shop:update' 等)`

## 1. 接口清单（DESIGN §3.1）

| 角色 | Method | Path | 用途 |
|---|---|---|---|
| 用户 | GET / PUT | `/api/v1/me` | 查询 / 更新个人资料 |
| 用户 | POST | `/api/v1/me/realname` | 实名认证提交 |
| 用户 | CRUD | `/api/v1/me/addresses` | 地址 CRUD（含默认切换） |
| 商户 | CRUD | `/api/v1/merchants/*` | 入驻 / 资质 / 子账号 |
| 骑手 | CRUD | `/api/v1/riders/*` | 注册 / 资质 / 保证金 |
| 管理员 | CRUD | `/api/v1/admin/users` | 用户后台 |
| 管理员 | CRUD | `/api/v1/admin/merchants` | 商户审核 |
| 管理员 | CRUD | `/api/v1/admin/riders` | 骑手审核 |
| 管理员 | CRUD | `/api/v1/admin/admins` | 管理员管理 |
| 管理员 | POST | `/api/v1/admin/blacklist` | 封禁 / 解封 |

## 2. 实名认证适配（DESIGN §3.2）

```ts
interface RealNameVerifier {
  verify(name: string, idCard: string): Promise<{ ok: boolean; code?: string }>
}
```
实现：阿里云身份二要素 / 腾讯云实名核身（按 env 切换）。

## 3. 审核流程（DESIGN §3.3）

`status=0 待审核` → 运营审核 → `1 通过 / 2 驳回（填 remark）` → 驳回后用户可
再次提交。

## 4. 错误码

| 段位 | 用途 |
|---|---|
| 10001 PARAM_INVALID | 参数校验失败 |
| 10010 BIZ_RESOURCE_NOT_FOUND | 用户 / 商户 / 骑手不存在 |
| 10012 BIZ_OPERATION_FORBIDDEN | 状态机禁止该操作（如已通过的资质再次提交） |
| 20003 AUTH_PERMISSION_DENIED | 角色 / 权限不匹配 |
| 20020 AUTH_ACCOUNT_DISABLED | 账户被禁用 |
| 20021 AUTH_ACCOUNT_BLACKLISTED | 黑名单 |

## 5. 自验证

待员工 B 落地 controller 后补充 curl 示例 + Postman 用例。
