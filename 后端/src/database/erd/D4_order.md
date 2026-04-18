# D4 订单 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D4（订单分表 + 凭证 + 售后）
> 注意：以模板表 `_template` 表达逻辑结构；实际写入的物理表为 `_YYYYMM` 后缀

```mermaid
erDiagram
    USER ||--o{ ORDER_TAKEOUT_TEMPLATE : "下外卖订单"
    SHOP ||--o{ ORDER_TAKEOUT_TEMPLATE : "店铺订单"
    RIDER ||--o{ ORDER_TAKEOUT_TEMPLATE : "骑手配送外卖"

    USER ||--o{ ORDER_ERRAND_TEMPLATE : "下跑腿订单"
    RIDER ||--o{ ORDER_ERRAND_TEMPLATE : "骑手配送跑腿"

    ORDER_TAKEOUT_TEMPLATE ||--o{ ORDER_TAKEOUT_ITEM_TEMPLATE : "订单明细"
    ORDER_TAKEOUT_TEMPLATE ||--o{ ORDER_STATUS_LOG_TEMPLATE   : "外卖状态日志"
    ORDER_ERRAND_TEMPLATE  ||--o{ ORDER_STATUS_LOG_TEMPLATE   : "跑腿状态日志"

    ORDER_TAKEOUT_TEMPLATE ||--o{ ORDER_PROOF      : "凭证"
    ORDER_ERRAND_TEMPLATE  ||--o{ ORDER_PROOF      : "凭证"
    ORDER_TAKEOUT_TEMPLATE ||--o{ ORDER_AFTER_SALE : "售后"
    ORDER_ERRAND_TEMPLATE  ||--o{ ORDER_AFTER_SALE : "售后"

    ORDER_TAKEOUT_TEMPLATE {
        bigint id PK
        char order_no UK
        bigint user_id FK
        bigint shop_id FK
        bigint merchant_id
        bigint rider_id FK
        decimal goods_amount
        decimal delivery_fee
        decimal package_fee
        decimal discount_amount
        decimal coupon_amount
        decimal pay_amount
        json address_snapshot
        json shop_snapshot
        tinyint status
        tinyint pay_status
        tinyint pay_method
        varchar pay_no
        datetime pay_at
        datetime accept_at
        datetime ready_at
        datetime dispatch_at
        datetime picked_at
        datetime delivered_at
        datetime finished_at
        datetime cancel_at
    }

    ORDER_TAKEOUT_ITEM_TEMPLATE {
        bigint id PK
        char order_no FK
        bigint shop_id
        bigint product_id
        bigint sku_id
        varchar product_name
        varchar sku_spec
        decimal unit_price
        smallint qty
        decimal package_fee
        decimal total_price
        tinyint is_combo_item
        bigint combo_parent_id
    }

    ORDER_ERRAND_TEMPLATE {
        bigint id PK
        char order_no UK
        bigint user_id FK
        bigint rider_id FK
        tinyint service_type
        json pickup_snapshot
        json delivery_snapshot
        varchar item_type
        int item_weight_g
        decimal item_value
        json buy_list
        decimal buy_budget
        varchar queue_place
        smallint queue_duration_min
        char pickup_code
        decimal service_fee
        decimal tip_fee
        decimal insurance_fee
        decimal pay_amount
        tinyint status
    }

    ORDER_STATUS_LOG_TEMPLATE {
        bigint id PK
        char order_no FK
        tinyint order_type
        tinyint from_status
        tinyint to_status
        tinyint op_type
        bigint op_id
        varchar remark
    }

    ORDER_PROOF {
        bigint id PK
        char order_no FK
        tinyint order_type
        tinyint proof_type
        tinyint uploader_type
        bigint uploader_id
        json image_urls
        decimal lng
        decimal lat
    }

    ORDER_AFTER_SALE {
        bigint id PK
        varchar after_sale_no UK
        char order_no FK
        tinyint order_type
        bigint user_id FK
        bigint shop_id
        bigint rider_id
        tinyint type
        varchar reason_code
        json evidence_urls
        decimal apply_amount
        decimal actual_amount
        tinyint status
        bigint arbitration_id
    }
```

## 状态机

### 外卖订单（10 档）

```
0 待支付 → 5 已关闭(支付超时)
0 待支付 → 10 待接单 → 20 已接单待出餐 → 30 出餐完成待取
        → 40 配送中 → 50 已送达待确认 → 55 已完成
任意 → 60 已取消（用户/商户/系统）
55/40/30 → 70 售后中（用户发起售后）
```

### 跑腿订单（10 档）

```
0 待支付 → 5 已关闭(支付超时)
0 → 10 待接单 → 20 骑手已接单 → 30 已取件 → 40 配送中 → 50 已送达待确认 → 55 已完成
任意 → 60 已取消
配送阶段 → 70 售后中
```

## 分表说明

物理表名形如 `order_takeout_202604`、`order_errand_202604`，由
`sp_create_order_monthly_tables(p_yyyymm)` 存储过程从模板创建（详见 04_order.sql）。

| 模板表                      | 实际物理表（每月一张）    | 保留  |
| --------------------------- | ------------------------- | ----- |
| order_takeout_template      | order_takeout_YYYYMM      | 24 月 |
| order_takeout_item_template | order_takeout_item_YYYYMM | 24 月 |
| order_errand_template       | order_errand_YYYYMM       | 24 月 |
| order_status_log_template   | order_status_log_YYYYMM   | 12 月 |

`order_proof` 与 `order_after_sale` 不分表（体量可控）。
