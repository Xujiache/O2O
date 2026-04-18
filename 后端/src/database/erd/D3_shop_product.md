# D3 店铺与商品 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D3（店铺/营业时段/分类/商品/SKU/套餐/收藏 7 张表）

```mermaid
erDiagram
    SHOP ||--o{ SHOP_BUSINESS_HOUR : "营业时段（一周多条）"
    SHOP ||--o{ PRODUCT_CATEGORY   : "店铺分类"
    SHOP ||--o{ PRODUCT            : "店铺商品"

    PRODUCT_CATEGORY ||--o{ PRODUCT      : "分类下商品"
    PRODUCT_CATEGORY ||--o{ PRODUCT_CATEGORY : "二级分类（parent_id）"

    PRODUCT ||--o{ PRODUCT_SKU         : "1 商品 N SKU"
    PRODUCT ||--o{ PRODUCT_COMBO_ITEM  : "套餐展开（combo_product_id）"

    PRODUCT_SKU     ||--o{ PRODUCT_COMBO_ITEM : "套餐子项 SKU"

    PRODUCT_FAVORITE }o--|| PRODUCT : "用户收藏商品（target_type=1）"
    PRODUCT_FAVORITE }o--|| SHOP    : "用户收藏店铺（target_type=2）"

    SHOP {
        bigint id PK
        bigint merchant_id FK
        varchar name
        varchar industry_code
        char city_code
        char district_code
        decimal lng
        decimal lat
        varbinary contact_mobile_enc
        decimal min_order_amount
        decimal base_delivery_fee
        decimal packaging_fee
        int delivery_distance_max
        smallint avg_prepare_min
        decimal score
        int monthly_sales
        tinyint auto_accept
        tinyint business_status
        tinyint audit_status
        tinyint status
    }

    SHOP_BUSINESS_HOUR {
        bigint id PK
        bigint shop_id FK
        tinyint day_of_week
        time open_time
        time close_time
        tinyint is_active
    }

    PRODUCT_CATEGORY {
        bigint id PK
        bigint shop_id FK
        bigint parent_id
        varchar name
        int sort
        tinyint status
    }

    PRODUCT {
        bigint id PK
        bigint shop_id FK
        bigint category_id FK
        varchar name
        decimal price
        decimal original_price
        decimal packaging_fee
        smallint min_order_qty
        tinyint has_sku
        tinyint product_type
        json tags
        int monthly_sales
        decimal score
        tinyint is_recommend
        tinyint audit_status
        tinyint status
        int sort
    }

    PRODUCT_SKU {
        bigint id PK
        bigint product_id FK
        varchar sku_code
        varchar spec_name
        json spec_json
        decimal price
        decimal packaging_fee
        int stock_qty
        int sales
        tinyint is_default
        tinyint status
    }

    PRODUCT_COMBO_ITEM {
        bigint id PK
        bigint combo_product_id FK
        bigint item_product_id FK
        bigint item_sku_id FK
        smallint qty
        int sort
    }

    PRODUCT_FAVORITE {
        bigint id PK
        bigint user_id
        tinyint target_type
        bigint target_id
        bigint shop_id
    }
```

## 关键说明

- `product.has_sku=0` 单规格仍建一条 default SKU（避免应用层判空分支，库存统一在 SKU 表）
- `product.product_type` 1=普通/2=套餐/3=特价；type=2 时 `product_combo_item` 展开子项
- `shop_business_hour.day_of_week` 0=每天通用 / 1~7=周一~周日；跨天营业拆为两条
- `product_favorite.target_type` 1=商品/2=店铺，便于"我的收藏"统一展示
- 库存 `product_sku.stock_qty` 在应用层用 Redis `stock:sku:{skuId}` 缓存 + 原子扣减（详见 redis-keys.md K15）
