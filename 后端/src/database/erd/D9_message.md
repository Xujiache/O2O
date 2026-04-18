# D9 消息通知 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D9（模板/收件箱/推送/公告 4 张表）

```mermaid
erDiagram
    MESSAGE_TEMPLATE ||--o{ MESSAGE_INBOX : "模板渲染→站内信"
    MESSAGE_TEMPLATE ||--o{ PUSH_RECORD   : "模板渲染→外部推送"

    USER     ||--o{ MESSAGE_INBOX : "用户站内信"
    MERCHANT ||--o{ MESSAGE_INBOX : "商户站内信"
    RIDER    ||--o{ MESSAGE_INBOX : "骑手站内信"

    USER     ||--o{ PUSH_RECORD : "微信订阅推送"
    RIDER    ||--o{ PUSH_RECORD : "APP 推送"

    NOTICE   }o--o{ USER : "公告对所有用户"

    MESSAGE_TEMPLATE {
        bigint id PK
        varchar template_code UK
        varchar template_name
        tinyint channel
        tinyint target_type
        varchar biz_scene
        varchar external_template_id
        varchar title_template
        text content_template
        json var_schema
        tinyint priority
        tinyint status
    }

    MESSAGE_INBOX {
        bigint id PK
        tinyint receiver_type
        bigint receiver_id
        tinyint category
        varchar title
        text content
        varchar link_url
        tinyint related_type
        varchar related_no
        tinyint is_read
        datetime read_at
        bigint template_id FK
    }

    PUSH_RECORD {
        bigint id PK
        varchar request_id UK
        tinyint channel
        varchar provider
        bigint template_id FK
        varchar template_code
        tinyint target_type
        bigint target_id
        varchar target_address
        json vars_json
        tinyint status
        tinyint attempts
        varchar external_msg_id
        varchar error_code
        datetime sent_at
    }

    NOTICE {
        bigint id PK
        varchar notice_no UK
        varchar title
        varchar summary
        text content
        varchar cover_url
        tinyint notice_type
        json target_terminal
        json target_city
        json target_user_segment
        tinyint priority
        datetime start_at
        datetime end_at
        int view_count
        tinyint status
        bigint publisher_admin_id
        datetime published_at
    }
```

## 关键说明

- `message_template.channel`：1 站内信 / 2 微信订阅 / 3 短信 / 4 APP 推送 / 5 站内推送
- `message_template.biz_scene` 业务场景串（如 `order_paid`、`order_canceled`、`refund_succeeded`）
- `message_inbox.category`：1 订单 / 2 活动 / 3 账户 / 4 系统 / 5 客服
- `message_inbox.is_read=0` 未读，列表查询用 `idx_receiver_read_created`
- `push_record.request_id` 业务侧生成的幂等键，避免重复推送
- `push_record.attempts` 失败重试次数，配合 Redis `push:retry:{id}`（K42）调度
- `notice.target_terminal` JSON 数组（`["user","merchant","rider","admin"]`），多端可见
- `notice.target_city`/`target_user_segment` 定向投放
