# D10 系统运营 ER 图

> 阶段：P2 / T2.19
> 范围：DESIGN §三 D10（字典/配置/操作日志/接口日志/Banner/热搜/文件/首页推荐 8 张表）

```mermaid
erDiagram
    SYS_DICT       ||--o{ SYS_DICT       : "树形：parent_code 自引用"
    ADMIN          ||--o{ OPERATION_LOG  : "操作日志"
    ADMIN          ||--o{ API_LOG        : "调用接口（caller_type=4）"
    USER           ||--o{ API_LOG        : "调用接口（caller_type=1）"
    ADMIN          ||--o{ BANNER         : "管理员发布"
    ADMIN          ||--o{ HOME_RECOMMEND : "管理员发布"
    ADMIN          ||--o{ NOTICE         : "管理员发布（详见 D9）"

    USER     ||--o{ FILE_META : "用户上传"
    MERCHANT ||--o{ FILE_META : "商户上传"
    RIDER    ||--o{ FILE_META : "骑手上传"
    ADMIN    ||--o{ FILE_META : "管理员上传"

    SYS_DICT {
        bigint id PK
        varchar dict_type
        varchar dict_code
        varchar dict_label
        varchar dict_value
        varchar parent_code
        json extra
        int sort
        tinyint is_system
        tinyint status
    }

    SYS_CONFIG {
        bigint id PK
        varchar config_group
        varchar config_key
        text config_value
        varchar value_type
        varchar description
        tinyint is_sensitive
        tinyint is_system
        bigint op_admin_id
    }

    OPERATION_LOG {
        bigint id PK
        bigint op_admin_id FK
        varchar op_admin_name
        varchar module
        varchar action
        varchar resource_type
        varchar resource_id
        varchar description
        varchar request_method
        varchar request_url
        json request_params
        int response_code
        int cost_ms
        tinyint is_success
    }

    API_LOG {
        bigint id PK
        varchar trace_id
        tinyint caller_type
        bigint caller_id
        varchar terminal
        varchar method
        varchar path
        varchar query
        json body_summary
        int status_code
        int cost_ms
        int response_size
        varchar error_code
    }

    BANNER {
        bigint id PK
        varchar position
        varchar title
        varchar image_url
        tinyint link_type
        varchar link_value
        json target_city
        datetime start_at
        datetime end_at
        int sort
        int view_count
        int click_count
        tinyint status
    }

    HOT_SEARCH {
        bigint id PK
        varchar keyword
        tinyint search_type
        char target_city
        int score
        tinyint is_pinned
        datetime start_at
        datetime end_at
        tinyint status
    }

    FILE_META {
        bigint id PK
        varchar file_no UK
        varchar bucket
        varchar object_key
        varchar file_name
        bigint file_size
        varchar mime_type
        tinyint file_type
        int width
        int height
        int duration_s
        char md5
        varchar cdn_url
        tinyint uploader_type
        bigint uploader_id
        varchar biz_module
        varchar biz_no
        tinyint is_public
        datetime expire_at
    }

    HOME_RECOMMEND {
        bigint id PK
        varchar position
        varchar title
        varchar subtitle
        varchar icon_url
        varchar image_url
        tinyint recommend_type
        bigint target_id
        tinyint link_type
        varchar link_value
        json target_city
        json target_user_segment
        datetime start_at
        datetime end_at
        int sort
        int view_count
        int click_count
        tinyint status
    }
```

## 关键说明

- `sys_dict` 一条 = 某 dict_type 下的某项；同 `(dict_type, dict_code)` 唯一
- `sys_dict.parent_code` 树形（如行业大类→子类）
- `sys_config` 同 `(config_group, config_key)` 唯一；敏感配置（API Key/Secret）走 KMS 不入本表
- `operation_log` 与 `api_log` 在 DESIGN §六 标记为按月/周分表，本期单表落地，分表延后到 jobs/monthly-table-job.md §六
- `banner.position` 编码区分多端（`user_home_top` / `merchant_login_top` 等）
- `hot_search.search_type`：1=外卖 / 2=跑腿 / 3=通用；按 `(search_type, target_city, score)` 排序
- `file_meta` 实际文件存 MinIO/OSS；本表存元数据 + 引用关系（`biz_module/biz_no` 反查）
- `home_recommend.recommend_type` 1=快捷入口 / 2=商家 / 3=商品 / 4=活动 / 5=自定义
