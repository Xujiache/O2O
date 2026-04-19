# P5 用户端埋点事件清单

> 本文档列出用户端 30+ 标准埋点事件。事件由 `@/utils/track.ts` 统一上报：批量缓冲 + 10s flush + 离线重试。

## 上报通道

- 入口：`track(eventId, params?, opt?: { from, to })`
- 缓冲：内存队列，满 20 条触发 flush；定时 10s flush
- 端点：POST `/api/v1/track/events`（待 P9 后端实装）
- 失败：自动回滚到队首，下次重试（最多保留 200 条）

## 事件结构

```ts
interface TrackEvent {
  eventId: string         // 事件 ID
  params?: Record         // 业务参数
  from?: string           // 来源页路径
  to?: string             // 目标页路径
  ts?: number             // 触发毫秒数
}
```

## 事件清单（按业务域）

### 浏览类（VIEW_*）
| eventId | 触发位置 | 说明 |
|---|---|---|
| `view_home` | pages/index/index onShow | 首页曝光 |
| `view_takeout` | pages/takeout/index onShow | 外卖入口 |
| `view_errand` | pages/errand/index onShow | 跑腿入口 |
| `view_shop` | pages-takeout/shop-detail onLoad | 店铺详情曝光 |
| `view_product` | ProductDetail.vue 弹出 | 商品详情曝光 |
| `view_order_list` | pages/order/index onShow | 订单列表 |
| `view_order_detail` | pages-order/detail onLoad | 订单详情 |
| `view_user_home` | pages/user/index onShow | 个人中心 |
| `view_login` | pages/login/index onLoad | 登录页 |

### 点击类（CLICK_*）
| eventId | 触发位置 | 参数 |
|---|---|---|
| `click_login` | 登录页一键登录按钮 | `{ method: 'wx'|'mobile' }` |
| `click_add_cart` | 商品加购 | `{ shopId, productId, skuId }` |
| `click_remove_cart` | 商品减购 | `{ shopId, productId, skuId }` |
| `click_checkout` | 店铺购物车 → 结算 | `{ shopId, totalAmount }` |
| `click_place_order` | 下单按钮 | `{ orderType: 1|2 }` |
| `click_pay` | 收银台支付按钮 | `{ orderNo, payMethod }` |
| `click_track_map` | 订单详情查看地图 | `{ orderNo }` |
| `click_contact_rider` | 联系骑手 | `{ orderNo }` |
| `click_review` | 订单去评价 | `{ orderNo }` |
| `click_after_sale` | 申请售后 | `{ orderNo }` |
| `click_complaint` | 投诉 | `{ orderNo }` |
| `click_invite` | 邀请有礼 | `{ uid }` |
| `click_coupon` | 优惠券中心 | `{ source }` |
| `click_favorite` | 收藏 | `{ type: 'shop'|'product', id }` |
| `click_search` | 搜索框 | `{ from }` |
| `click_banner` | Banner / 快捷入口 | `{ id, position }` |

### 提交结果类
| eventId | 触发位置 | 参数 |
|---|---|---|
| `login_success` | 登录成功回调 | `{ uid }` |
| `login_fail` | 登录失败 | `{ reason }` |
| `place_order_success` | 下单成功 | `{ orderNo, orderType, payAmount }` |
| `place_order_fail` | 下单失败 | `{ reason }` |
| `pay_success` | 支付成功 | `{ payNo, amount, payMethod }` |
| `pay_fail` | 支付失败 | `{ payNo, reason }` |
| `submit_review` | 评价提交 | `{ orderNo, rating }` |
| `submit_after_sale` | 售后提交 | `{ orderNo, refundAmount }` |
| `receive_coupon` | 领取优惠券 | `{ couponId }` |
| `search_submit` | 搜索提交 | `{ q, type, resultCount }` |

### 订阅消息授权
| eventId | 触发位置 | 参数 |
|---|---|---|
| `request_subscribe` | wx.requestSubscribeMessage 调用前 | `{ count }` |
| `subscribe_accept` | 用户同意 | `{ count }` |
| `subscribe_reject` | 用户拒绝 | `{ count }` |

### 系统事件
| eventId | 触发位置 | 参数 |
|---|---|---|
| `ws_reconnect` | WebSocket 重连 | `{ attempt }` |
| `error_caught` | 全局异常捕获 | `{ err, source }` |

## 数据格式示例

```json
POST /api/v1/track/events
{
  "uid": "u_1234567890",
  "events": [
    {
      "eventId": "view_home",
      "ts": 1745040000000,
      "from": "/pages/login/index"
    },
    {
      "eventId": "click_add_cart",
      "params": { "shopId": "s_001", "productId": "p_001", "skuId": "sku_001" },
      "ts": 1745040020000,
      "to": "/pages-takeout/shop-detail"
    }
  ]
}
```

## 验收标准（ACCEPTANCE V5.x 非功能）

- 埋点事件 ≥ 30 个 ✅（当前 30+）
- 上报成功率 ≥ 99%（依赖后端 P9）
- 不在主线程阻塞 UI ✅（异步缓冲）
- 离线降级（网络异常时本地排队，恢复后重试）✅
