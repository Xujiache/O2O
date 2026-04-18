# Message 模块接口文档（P3 / 员工 B 主负责）

> 基准：DESIGN_P3_后端基础服务.md §四
> 实现：`后端/src/modules/message/`（员工 B 持续推进）
>
> 本文件由员工 C 在 P3/T3.23 起骨架；员工 B 完成 Channels 后补充字段。

## 0. 通用约定

- 路径前缀：`/api/v1/message`
- RabbitMQ 队列：`message.push`（与 Map 模块的 `rider.location` 不冲突）
- 模板表：`message_template`（P2 D9）；`code + channel` 唯一

## 1. 发送流程（DESIGN §4.1）

```
业务调用 MessageService.send(code, ownerType, ownerId, data)
  → 查 message_template
  → 为每个 channel 投递 RabbitMQ message.push
  → Consumer 路由到对应 Channel.send()
  → 成功写 push_record（+ message_inbox if InboxChannel）
  → 失败：retry_count+=1；< 3 次退避重发；≥ 3 次落死信
```

## 2. 模板 code（DESIGN §4.2）

`ORDER_*` / `RIDER_*` / `MERCHANT_*` / `USER_*` / `ACTIVITY_NOTICE` / `SYSTEM_NOTICE` 等

## 3. 通道实现要点（DESIGN §4.3）

- WxSubscribeChannel：access_token Redis 缓存 2h，自动刷新（Redis 锁防并发）
- JPushChannel：HTTPS Basic Auth，targets 支持 alias/tag/registrationId
- AliSmsChannel：SDK + 签名 + 模板参数校验
- InboxChannel：直写 `message_inbox`

## 4. 接口清单（员工 B 落地后补全）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/v1/message/send` | 业务侧手动触发 |
| GET | `/api/v1/me/inbox` | 当前用户站内信列表 |
| POST | `/api/v1/me/inbox/:id/read` | 标记已读 |
| POST | `/api/v1/admin/message/template` | 模板 CRUD（管理后台） |

## 5. 错误码

| 段位 | 用途 |
|---|---|
| 40001 WX_API_ERROR | 微信订阅消息接口异常 |
| 40002 SMS_PROVIDER_ERROR | 短信平台异常 |
| 40003 PUSH_PROVIDER_ERROR | 极光异常 |
| 50005 SYSTEM_MQ_ERROR | RabbitMQ 投递失败 |
