# TASK_P8_管理后台开发

## 一、WBS

### M8.1 基础设施
| 编号 | 任务 | 工时(h) |
|---|---|---|
| T8.1 | 清点已有框架能力；补齐业务 API axios 实例 | 3 |
| T8.2 | 路由：按 10 模块拆分 `routes/business.ts` + 动态菜单生成 | 4 |
| T8.3 | Store 扩展：dict / perm / appConfig | 3 |
| T8.4 | 统一组件 `<BizTable/>` | 8 |
| T8.5 | `<BizSearchForm/>` / `<BizModal/>` / `<BizAuth/>` | 6 |
| T8.6 | `<BizUpload/>` / `<BizChart/>` / `<BizStatus/>` / `<BizExport/>` / `<BizJsonViewer/>` | 8 |
| T8.7 | 异步导出（轮询下载链接） | 4 |
| T8.8 | i18n 扩展（中英业务命名空间） | 3 |
| T8.9 | WS admin 客户端 | 3 |

### M8.2 数据大盘
| T8.10 | overview.vue | 6 |
| T8.11 | trend.vue | 4 |
| T8.12 | ops.vue | 4 |
| T8.13 | monitor.vue（WS 实时表） | 5 |

### M8.3 用户管理
| T8.14 | user/list.vue | 3 |
| T8.15 | user/detail.vue（多 Tab） | 5 |
| T8.16 | user/risk.vue | 2 |

### M8.4 商户管理
| T8.17 | merchant/audit.vue + 驳回 | 4 |
| T8.18 | merchant/list.vue + detail.vue | 5 |
| T8.19 | shop/list.vue（含配送范围编辑） | 5 |
| T8.20 | shop/notice-audit.vue | 2 |
| T8.21 | merchant/risk.vue | 2 |

### M8.5 骑手管理
| T8.22 | rider/audit.vue | 3 |
| T8.23 | rider/list.vue | 3 |
| T8.24 | rider/detail.vue（轨迹回放） | 8 |
| T8.25 | rider/transfer-audit.vue | 2 |
| T8.26 | rider/reward.vue（奖惩配置） | 4 |
| T8.27 | rider/level-config.vue | 3 |
| T8.28 | rider/risk.vue | 2 |

### M8.6 订单管理
| T8.29 | order/list.vue（强筛选+批量导出） | 5 |
| T8.30 | order/detail.vue + BizOrderFlow | 6 |
| T8.31 | order/cancel-refund-audit.vue | 3 |
| T8.32 | order/complaint.vue | 3 |
| T8.33 | order/arbitration.vue + 判定录入 | 4 |

### M8.7 商品与内容
| T8.34 | product/list.vue + violation.vue | 4 |
| T8.35 | product/category.vue | 2 |
| T8.36 | content/banner.vue | 3 |
| T8.37 | content/quick-entry.vue + hot-search.vue | 3 |
| T8.38 | content/notice.vue（富文本） | 4 |
| T8.39 | review/list.vue + appeal.vue | 4 |

### M8.8 运营管理
| T8.40 | ops/coupon.vue | 5 |
| T8.41 | ops/promotion.vue | 6 |
| T8.42 | ops/push.vue | 4 |
| T8.43 | ops/push-template.vue | 3 |
| T8.44 | ops/region.vue（城市/区域配置+polygon） | 6 |

### M8.9 财务管理
| T8.45 | finance/overview.vue | 4 |
| T8.46 | finance/settlement-rule.vue | 4 |
| T8.47 | finance/settlement-record.vue | 3 |
| T8.48 | finance/withdraw-audit.vue（批量审核） | 5 |
| T8.49 | finance/bill.vue | 3 |
| T8.50 | finance/invoice-audit.vue | 4 |
| T8.51 | finance/reconciliation.vue | 3 |

### M8.10 系统管理
| T8.52 | system/admin.vue + role.vue + permission.vue | 8 |
| T8.53 | system/dict.vue | 3 |
| T8.54 | system/operation-log.vue + api-log.vue | 4 |
| T8.55 | system/system-config.vue + app-config.vue | 4 |

### M8.11 客服 & 风控
| T8.56 | cs/ticket.vue | 4 |
| T8.57 | cs/arbitration.vue | 4 |
| T8.58 | risk/rule.vue | 3 |
| T8.59 | risk/risk-order.vue + cheat.vue + record.vue | 5 |

### M8.12 收尾
| T8.60 | E2E 覆盖 10 模块回归 | 8 |
| T8.61 | Lighthouse 优化 | 3 |
| T8.62 | 打包产物、CI 集成 | 2 |
| T8.63 | 更新说明文档 | 0.5 |

**合计：约 230h ≈ 29 人日**

## 二、并行
- 基础设施先行（T8.1~T8.9）
- 10 模块业务可多人并行
- 审批类页面（商户/骑手/提现/仲裁）可共用审批流组件，抽象后提速

## 三、里程碑
- M8.1 统一组件完备
- M8.2 数据大盘 + 用户管理跑通
- M8.3 商户 + 骑手 + 订单（核心三大）
- M8.4 运营 + 财务 + 系统
- M8.5 客服风控 + E2E + 打包，进入 P9

## 四、风险
| 风险 | 应对 |
|---|---|
| 页面量大导致进度偏差 | 统一组件优先；模块可并行 |
| 实时监控性能 | WS 合并推送 + 节流 |
| 导出数据量 | 异步任务 + 生成链接 |
| 权限遗漏 | 自动化测试：遍历菜单+权限码 |

## 五、状态跟踪
见 `TODO_P8_管理后台开发.md`。
