# D6 配送调度 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D6（派单/转单/异常/偏好/轨迹摘要/考勤/奖惩 7 张表）

```mermaid
erDiagram
    RIDER ||--o{ DISPATCH_RECORD       : "派单候选"
    RIDER ||--o{ TRANSFER_RECORD       : "转单"
    RIDER ||--o{ ABNORMAL_REPORT       : "异常上报"
    RIDER ||--|| RIDER_PREFERENCE      : "接单偏好"
    RIDER ||--o{ DELIVERY_TRACK_SUMMARY: "配送轨迹摘要"
    RIDER ||--o{ RIDER_ATTENDANCE      : "考勤"
    RIDER ||--o{ RIDER_REWARD          : "奖惩"

    DISPATCH_RECORD {
        bigint id PK
        char order_no
        tinyint order_type
        tinyint dispatch_mode
        bigint rider_id FK
        decimal score
        int distance_m
        tinyint status
        datetime accepted_at
        datetime responded_at
        varchar reject_reason
        datetime expire_at
    }

    TRANSFER_RECORD {
        bigint id PK
        char order_no
        tinyint order_type
        bigint from_rider_id FK
        bigint to_rider_id FK
        varchar reason_code
        tinyint status
        bigint audit_admin_id
        datetime audit_at
    }

    ABNORMAL_REPORT {
        bigint id PK
        char order_no
        tinyint order_type
        tinyint reporter_type
        bigint reporter_id
        varchar abnormal_type
        varchar description
        json evidence_urls
        decimal lng
        decimal lat
        tinyint status
        bigint handle_admin_id
        varchar handle_result
    }

    RIDER_PREFERENCE {
        bigint id PK
        bigint rider_id FK
        tinyint accept_mode
        int accept_radius_m
        tinyint accept_takeout
        tinyint accept_errand
        json errand_types
        smallint accept_max_concurrent
        tinyint voice_enabled
    }

    DELIVERY_TRACK_SUMMARY {
        bigint id PK
        char order_no UK
        tinyint order_type
        bigint rider_id FK
        decimal pickup_lng
        decimal pickup_lat
        decimal delivery_lng
        decimal delivery_lat
        int total_distance_m
        int total_duration_s
        datetime pickup_at
        datetime delivered_at
        tinyint is_on_time
        int delay_s
    }

    RIDER_ATTENDANCE {
        bigint id PK
        bigint rider_id FK
        date att_date
        datetime clock_in_at
        decimal clock_in_lng
        decimal clock_in_lat
        datetime clock_out_at
        int online_seconds
        int delivered_count
        tinyint is_leave
    }

    RIDER_REWARD {
        bigint id PK
        bigint rider_id FK
        tinyint reward_type
        varchar reason_code
        decimal amount
        int score_delta
        char related_order_no
        bigint op_admin_id
        varchar flow_no
        tinyint is_appealed
        tinyint appeal_status
    }
```

## 关键说明

- `dispatch_record` 一笔订单可有多条派单尝试（被拒/超时未应答→重派）
- `dispatch_record.dispatch_mode` 1=系统智能派 / 2=抢单 / 3=人工指派
- `rider_preference` 一对一 rider，`uk_rider_id` 唯一
- 详细轨迹点存 TimescaleDB `rider_location_ts`（详见 `timescale/01_schema.sql`）；本表只存订单级摘要
- `rider_attendance` 一人一天一条（`uk_rider_date`）
- `rider_reward.reward_type` 1=奖励 / 2=罚款 / 3=补贴 / 4=等级升降；金额到账后写 `account_flow.flow_no`
