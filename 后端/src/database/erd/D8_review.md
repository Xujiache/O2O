# D8 评价售后 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D8（评价/回复/申诉/投诉/仲裁/工单 6 张表）
> 决策：ticket 保留在 D8（与 complaint/arbitration 同属客服域，详见 README）

```mermaid
erDiagram
    USER     ||--o{ REVIEW          : "用户评价"
    REVIEW   ||--o{ REVIEW_REPLY    : "评价回复"
    REVIEW   ||--o{ REVIEW_APPEAL   : "差评申诉"

    USER     ||--o{ COMPLAINT       : "投诉发起"
    COMPLAINT ||--o| ARBITRATION    : "升级仲裁"

    USER     ||--o{ TICKET          : "提交工单"
    TICKET   }o--|| ORDER_TAKEOUT_TEMPLATE : "关联订单（可选）"
    TICKET   }o--|| ORDER_ERRAND_TEMPLATE  : "关联订单（可选）"

    REVIEW {
        bigint id PK
        char order_no
        tinyint order_type
        bigint user_id FK
        tinyint target_type
        bigint target_id
        bigint shop_id
        bigint rider_id
        tinyint score
        tinyint taste_score
        tinyint package_score
        tinyint delivery_score
        varchar content
        json image_urls
        json tags
        tinyint is_anonymous
        tinyint is_top
        tinyint is_hidden
        int useful_count
    }

    REVIEW_REPLY {
        bigint id PK
        bigint review_id FK
        tinyint replier_type
        bigint replier_id
        varchar content
        tinyint is_hidden
    }

    REVIEW_APPEAL {
        bigint id PK
        bigint review_id FK
        tinyint appellant_type
        bigint appellant_id
        varchar reason_code
        varchar reason_detail
        json evidence_urls
        tinyint status
        bigint audit_admin_id
        datetime audit_at
    }

    COMPLAINT {
        bigint id PK
        varchar complaint_no UK
        tinyint complainant_type
        bigint complainant_id
        tinyint target_type
        bigint target_id
        char order_no
        tinyint order_type
        varchar category
        varchar content
        json evidence_urls
        tinyint severity
        tinyint status
        bigint handle_admin_id
        bigint arbitration_id
    }

    ARBITRATION {
        bigint id PK
        varchar arbitration_no UK
        tinyint source_type
        bigint source_id
        char order_no
        tinyint order_type
        tinyint applicant_type
        bigint applicant_id
        tinyint respondent_type
        bigint respondent_id
        decimal dispute_amount
        varchar dispute_content
        json evidence_urls
        tinyint status
        tinyint decision
        decimal decision_amount
        bigint judge_admin_id
    }

    TICKET {
        bigint id PK
        varchar ticket_no UK
        tinyint submitter_type
        bigint submitter_id
        varchar category
        tinyint priority
        varchar title
        text content
        json attach_urls
        char related_order_no
        tinyint related_type
        tinyint status
        bigint assignee_admin_id
        datetime last_reply_at
    }
```

## 关键说明

- `review.target_type`：1=店铺/2=商品/3=骑手/4=综合；同 `(order_no, target_type, target_id)` 唯一
- `review.score` 总分；`taste_score/package_score/delivery_score` 子项分（外卖特有）
- `review_reply.replier_type`：1=商户回复 / 2=平台官方回复
- `review_appeal` 差评申诉，通过后 `review.is_hidden=1` 隐藏评价
- `complaint` 与 `ticket` 区别：complaint 强针对订单/对象；ticket 是通用工单
- `complaint.status=4` 转仲裁时填 `arbitration_id`
- `arbitration.source_type`：1=售后转 / 2=投诉转 / 3=主动申请
- `ticket.related_order_no` 可空（咨询类工单无订单关联）
