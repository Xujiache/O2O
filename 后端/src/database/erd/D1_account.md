# D1 账号与认证 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D1（用户/商户/骑手/管理员/RBAC/黑名单 14 张表）
> 约定：仅展示主表关系，省略软删/审计列；逻辑外键（DB 不建物理 FK）

```mermaid
erDiagram
    USER ||--o{ USER_ADDRESS : "拥有多个收货地址"

    MERCHANT ||--o{ MERCHANT_QUALIFICATION : "提交多份资质"
    MERCHANT ||--o{ MERCHANT_STAFF        : "下设多个子账号"

    RIDER    ||--o{ RIDER_QUALIFICATION   : "提交多份资质"
    RIDER    ||--o{ RIDER_DEPOSIT         : "保证金流水"

    ADMIN    ||--o{ ADMIN_ROLE            : "可绑定多个角色"
    ROLE     ||--o{ ADMIN_ROLE            : "被多个管理员持有"
    ROLE     ||--o{ ROLE_PERMISSION       : "拥有多个权限"
    PERMISSION ||--o{ ROLE_PERMISSION     : "被多个角色持有"
    PERMISSION ||--o{ PERMISSION          : "树形：parent_id 自引用"

    BLACKLIST }o--|| USER     : "可针对用户"
    BLACKLIST }o--|| MERCHANT : "可针对商户"
    BLACKLIST }o--|| RIDER    : "可针对骑手"

    USER {
        bigint id PK
        varchar union_id UK
        varchar open_id_mp UK
        varbinary mobile_enc
        char mobile_hash UK
        varchar mobile_tail4
        varbinary id_card_enc
        char id_card_hash
        varbinary real_name_enc
        tinyint is_realname
        tinyint enc_key_ver
        tinyint status
        tinyint reg_source
    }

    USER_ADDRESS {
        bigint id PK
        bigint user_id FK
        varchar receiver_name
        varbinary receiver_mobile_enc
        char receiver_mobile_hash
        char province_code
        char city_code
        char district_code
        varchar detail
        decimal lng
        decimal lat
        tinyint is_default
    }

    MERCHANT {
        bigint id PK
        varchar merchant_no UK
        varchar name
        varchar industry_code
        varbinary mobile_enc
        char mobile_hash UK
        varbinary legal_id_card_enc
        char province_code
        char city_code
        char district_code
        tinyint audit_status
        tinyint status
    }

    MERCHANT_QUALIFICATION {
        bigint id PK
        bigint merchant_id FK
        tinyint qual_type
        varchar cert_no
        date valid_to
        varchar attach_url
        tinyint audit_status
    }

    MERCHANT_STAFF {
        bigint id PK
        bigint merchant_id FK
        varchar username
        char password_hash
        varbinary mobile_enc
        char mobile_hash
        varchar role_code
        tinyint status
    }

    RIDER {
        bigint id PK
        varchar rider_no UK
        varbinary name_enc
        varbinary mobile_enc
        char mobile_hash UK
        varbinary id_card_enc
        char id_card_hash UK
        varbinary bank_card_enc
        varchar bank_card_tail4
        char service_city
        tinyint level
        decimal score
        tinyint audit_status
        tinyint status
        tinyint online_status
    }

    RIDER_QUALIFICATION {
        bigint id PK
        bigint rider_id FK
        tinyint qual_type
        varchar cert_no
        date valid_to
        varchar attach_url
        tinyint audit_status
    }

    RIDER_DEPOSIT {
        bigint id PK
        bigint rider_id FK
        tinyint op_type
        decimal amount
        decimal balance_after
        varchar pay_no
    }

    ADMIN {
        bigint id PK
        varchar username UK
        char password_hash
        varbinary mobile_enc
        tinyint is_super
        tinyint status
    }

    ROLE {
        bigint id PK
        varchar role_code UK
        varchar role_name
        tinyint data_scope
        tinyint status
    }

    PERMISSION {
        bigint id PK
        bigint parent_id
        tinyint resource_type
        varchar resource_code
        varchar resource_name
        varchar action
    }

    ADMIN_ROLE {
        bigint id PK
        bigint admin_id FK
        bigint role_id FK
    }

    ROLE_PERMISSION {
        bigint id PK
        bigint role_id FK
        bigint permission_id FK
    }

    BLACKLIST {
        bigint id PK
        tinyint target_type
        bigint target_id
        varchar target_value
        varchar reason
        tinyint level
        datetime expire_at
        tinyint status
    }
```

## 关键说明

- 用户/商户/骑手三类身份独立建表（业务流程差异大，公共字段冗余设计）
- RBAC 三表（admin/role/permission）+ 两关联表（admin_role/role_permission）实现完整权限模型
- `permission.parent_id=0` 顶级菜单，自引用形成菜单树（菜单/按钮/接口三层混合）
- `blacklist.target_type` 1=用户/2=商户/3=骑手/4=设备/5=IP，对应 `target_id` 或 `target_value`
- 所有敏感字段三列拆分：`*_enc` (AES-GCM) + `*_hash` (HMAC) + `*_tail4` (脱敏)，详见 `encryption.md`
