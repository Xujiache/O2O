# D5 支付与财务 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D5（支付/退款/账户/流水/分账/提现/发票/对账 9 张表）

```mermaid
erDiagram
    USER     ||--o{ PAYMENT_RECORD  : "用户支付"
    USER     ||--o{ REFUND_RECORD   : "用户退款"
    PAYMENT_RECORD ||--o{ REFUND_RECORD : "原支付的退款"

    ACCOUNT  ||--o{ ACCOUNT_FLOW    : "账户流水"

    SETTLEMENT_RULE ||--o{ SETTLEMENT_RECORD : "规则匹配产出分账"
    ACCOUNT_FLOW    ||--o{ SETTLEMENT_RECORD : "分账→账户流水"

    ACCOUNT  ||--o{ WITHDRAW_RECORD : "提现申请"
    ACCOUNT_FLOW ||--o{ WITHDRAW_RECORD : "提现产生流水"

    USER     ||--o{ INVOICE         : "用户开票"
    MERCHANT ||--o{ INVOICE         : "商户开票"

    PAYMENT_RECORD ||--o{ RECONCILIATION : "对账聚合（按渠道+日期）"

    PAYMENT_RECORD {
        bigint id PK
        varchar pay_no UK
        varchar out_trade_no UK
        char order_no
        tinyint order_type
        bigint user_id FK
        decimal amount
        tinyint pay_method
        varchar channel
        tinyint status
        datetime pay_at
        json raw_response
    }

    REFUND_RECORD {
        bigint id PK
        varchar refund_no UK
        varchar out_refund_no UK
        varchar pay_no FK
        char order_no
        tinyint order_type
        varchar after_sale_no
        bigint user_id FK
        decimal amount
        tinyint refund_method
        tinyint status
        datetime refund_at
        bigint op_admin_id
    }

    ACCOUNT {
        bigint id PK
        tinyint owner_type
        bigint owner_id
        decimal balance
        decimal frozen
        decimal total_income
        decimal total_expense
        int version
        tinyint status
    }

    ACCOUNT_FLOW {
        bigint id PK
        varchar flow_no UK
        bigint account_id FK
        tinyint owner_type
        bigint owner_id
        tinyint direction
        tinyint biz_type
        decimal amount
        decimal balance_after
        varchar related_no
    }

    SETTLEMENT_RULE {
        bigint id PK
        varchar rule_code UK
        varchar rule_name
        tinyint scene
        tinyint target_type
        tinyint scope_type
        varchar scope_value
        decimal rate
        decimal fixed_fee
        decimal min_fee
        decimal max_fee
        int priority
        datetime valid_from
        datetime valid_to
        tinyint status
    }

    SETTLEMENT_RECORD {
        bigint id PK
        varchar settlement_no UK
        char order_no
        tinyint order_type
        tinyint target_type
        bigint target_id
        bigint rule_id FK
        decimal base_amount
        decimal rate
        decimal fixed_fee
        decimal settle_amount
        tinyint status
        datetime settle_at
        varchar flow_no
    }

    WITHDRAW_RECORD {
        bigint id PK
        varchar withdraw_no UK
        tinyint owner_type
        bigint owner_id
        bigint account_id FK
        decimal amount
        decimal fee
        decimal actual_amount
        varbinary bank_card_no_enc
        varchar bank_card_tail4
        varbinary account_holder_enc
        varchar bank_name
        tinyint status
        bigint audit_admin_id
        datetime audit_at
        varchar payout_no
        datetime payout_at
    }

    INVOICE {
        bigint id PK
        varchar invoice_no UK
        tinyint applicant_type
        bigint applicant_id
        json order_nos
        tinyint invoice_type
        tinyint title_type
        varchar title
        varchar tax_no
        decimal amount
        varchar email
        varbinary mobile_enc
        varchar mobile_tail4
        tinyint status
        varchar pdf_url
        datetime issued_at
    }

    RECONCILIATION {
        bigint id PK
        varchar recon_no UK
        varchar channel
        date bill_date
        int total_orders
        decimal total_amount
        int channel_orders
        decimal channel_amount
        int diff_count
        decimal diff_amount
        tinyint status
    }
```

## 关键说明

- `account` 三类主体（user/merchant/rider）共用一张表，`owner_type+owner_id` 唯一
- `account_flow.direction`：1=入账 / 2=出账；`amount` 始终正数
- `account_flow` 索引 `(account_id, created_at)` 满足账单分页（DESIGN §五 / 提示词约定）
- `settlement_rule.priority` 大→优先；同 scene+target_type 多规则时按优先级匹配命中第一条
- `settlement_record` 一笔订单产 1~3 条（商户 / 骑手 / 平台），关联 `account_flow.flow_no`
- `withdraw_record` 银行卡 `bank_card_no_enc + bank_card_tail4`（DESIGN §九 / encryption.md）
- `reconciliation` 按 `(channel, bill_date)` 唯一，每日每渠道 1 条
