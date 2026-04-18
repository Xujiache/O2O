# D7 营销 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D7（券/活动/红包/积分/邀请 7 张表）

```mermaid
erDiagram
    COUPON ||--o{ USER_COUPON : "用户领取"
    USER   ||--o{ USER_COUPON : "我的券包"
    USER   ||--|| USER_POINT  : "积分余额"
    USER   ||--o{ USER_POINT_FLOW : "积分流水"
    USER_POINT ||--o{ USER_POINT_FLOW : "余额变化"
    USER   ||--o{ INVITE_RELATION : "邀请人战绩"

    PROMOTION    }o--o{ SHOP    : "活动适用店铺(applicable_shops JSON)"
    PROMOTION    }o--o{ PRODUCT : "活动适用商品(applicable_products JSON)"

    RED_PACKET   }o--o{ USER    : "目标用户(target_user_ids JSON)"

    COUPON {
        bigint id PK
        varchar coupon_code UK
        varchar name
        tinyint issuer_type
        bigint issuer_id
        tinyint coupon_type
        decimal discount_value
        decimal min_order_amount
        decimal max_discount
        tinyint scene
        json applicable_shops
        json applicable_categories
        int total_qty
        int received_qty
        int used_qty
        smallint per_user_limit
        tinyint valid_type
        datetime valid_from
        datetime valid_to
        smallint valid_days
        tinyint status
    }

    USER_COUPON {
        bigint id PK
        bigint user_id FK
        bigint coupon_id FK
        varchar coupon_code
        datetime valid_from
        datetime valid_to
        tinyint status
        datetime used_at
        char used_order_no
        tinyint used_order_type
        decimal discount_amount
        tinyint received_source
    }

    PROMOTION {
        bigint id PK
        varchar promotion_code UK
        varchar name
        tinyint promo_type
        tinyint issuer_type
        bigint issuer_id
        tinyint scene
        json applicable_shops
        json applicable_products
        json rule_json
        int total_qty
        int used_qty
        smallint per_user_limit
        datetime valid_from
        datetime valid_to
        int priority
        tinyint is_stackable
        tinyint status
    }

    RED_PACKET {
        bigint id PK
        varchar packet_code UK
        varchar name
        tinyint packet_type
        tinyint issuer_type
        bigint issuer_id
        decimal total_amount
        int total_qty
        int received_qty
        decimal received_amount
        decimal min_amount
        decimal max_amount
        json target_user_ids
        datetime valid_from
        datetime valid_to
        tinyint status
    }

    USER_POINT {
        bigint id PK
        bigint user_id UK
        int total_point
        int frozen_point
        int total_earned
        int total_used
        int version
    }

    USER_POINT_FLOW {
        bigint id PK
        bigint user_id FK
        tinyint direction
        tinyint biz_type
        int point
        int balance_after
        varchar related_no
        datetime expire_at
    }

    INVITE_RELATION {
        bigint id PK
        bigint inviter_id FK
        bigint invitee_id UK
        varchar invite_code
        varchar channel
        tinyint reward_status
        datetime reward_at
    }
```

## 关键说明

- `coupon.coupon_type`：1 满减 / 2 折扣 / 3 立减 / 4 免运费
- `coupon.valid_type`：1 固定时段（用 valid_from/valid_to） / 2 领取后 N 天（用 valid_days）
- `user_coupon.status`：0 已过期 / 1 未使用 / 2 已使用 / 3 冻结（订单未支付时锁定）
- `promotion.rule_json` 不同 promo_type 表达差异（满减阶梯/折扣率/拼单人数等）
- `red_packet` 拼手气红包用 Redis Hash `redpkt:pool:{id}` 预生成份额（详见 redis-keys.md K38）
- `user_point` 一人一条；积分发生用 `user_point_flow` 流水追加
- `invite_relation.invitee_id` 唯一（一人仅被邀请一次，防刷单）
