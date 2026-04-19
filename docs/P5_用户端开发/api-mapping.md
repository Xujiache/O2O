# P5 用户端 API 对照文档

> 本文档列出用户端（pages-* / components / store）调用的所有后端接口，与 P3/P4 实现一一对应。
> 数据约定：金额 string + 大数 / 时间 ISO 8601 / 分页 PageResult 或 KeysetPageResult。

## 0. 通用约定

- 路径前缀：`/api/v1`
- 鉴权：`Authorization: Bearer <jwt>`（除 auth/sms/wxNotify 等公开接口）
- 统一响应：`{ code: 0, message: 'ok', data: ..., traceId, timestamp }`
- 错误码：详见 `docs/P4_后端业务服务/P4_COMPLETION_REPORT.md` §10.4

## 1. Auth 模块（`@/api/auth.ts`）

| 前端方法 | 后端端点 | 端 | 用途 |
|---|---|---|---|
| `wxMpLogin({ code, encryptedData, iv })` | POST `/auth/wx-mp/login` | 用户 | 微信登录 |
| `bindMobile({ mobile, smsCode })` | POST `/auth/mobile/bind` | 用户 | 手机号绑定 |
| `sendSmsCode({ mobile, scene })` | POST `/auth/sms/send` | 公开 | 发送短信 |
| `logout()` | POST `/auth/logout` | 通用 | 退出 |

## 2. User 模块（`@/api/user.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `getProfile()` | GET `/me` |
| `updateProfile(payload)` | PUT `/me` |
| `submitRealname(payload)` | POST `/me/realname` |
| `getRealnameStatus()` | GET `/me/realname` |
| `listAddresses()` | GET `/me/addresses` |
| `getAddress(id)` | GET `/me/addresses/:id` |
| `createAddress(payload)` | POST `/me/addresses` |
| `updateAddress(id, payload)` | PUT `/me/addresses/:id` |
| `deleteAddress(id)` | DELETE `/me/addresses/:id` |
| `setDefaultAddress(id)` | POST `/me/addresses/:id/default` |
| `parseAddressText(text)` | POST `/me/addresses/parse` |
| `listFavoriteShops(params)` | GET `/me/favorites/shops` |
| `listFavoriteProducts(params)` | GET `/me/favorites/products` |
| `favoriteShop(shopId)` | POST `/me/shops/:id/favorite` |
| `unfavoriteShop(shopId)` | DELETE `/me/shops/:id/favorite` |
| `favoriteProduct(productId)` | POST `/me/products/:id/favorite` |
| `unfavoriteProduct(productId)` | DELETE `/me/products/:id/favorite` |
| `getInviteInfo()` | GET `/me/invite` |
| `bindInviter(inviteCode)` | POST `/me/invite/bind` |
| `getPoints()` | GET `/me/points` |
| `getPointFlows(params)` | GET `/me/points/flows` |
| `getSettings()` | GET `/me/settings` |
| `updateSettings(payload)` | PUT `/me/settings` |
| `submitFeedback(payload)` | POST `/me/feedbacks` |

## 3. Shop / Product 模块（`@/api/shop.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `getBanners({ position, cityCode })` | GET `/banners` |
| `getNotices({ cityCode, top })` | GET `/notices` |
| `getQuickEntries({ cityCode })` | GET `/quick-entries` |
| `getHotSearches({ cityCode })` | GET `/hot-searches` |
| `listShops(params)` | GET `/user/shops` |
| `getShopDetail(shopId)` | GET `/user/shops/:id` |
| `getShopProductCategories(shopId)` | GET `/user/shops/:id/product-categories` |
| `getShopProducts(shopId, params)` | GET `/user/shops/:id/products` |
| `getProductDetail(productId)` | GET `/user/products/:id` |
| `listReviews(params)` | GET `/user/reviews` |
| `getReviewStat(shopId)` | GET `/user/shops/:id/reviews/stat` |

## 4. Order 模块（`@/api/order.ts`）

| 前端方法 | 后端端点 | 备注 |
|---|---|---|
| `createTakeoutOrder(payload)` | POST `/user/order/takeout` | X-Idem-Key 自动注入 |
| `previewDiscount(payload)` | POST `/me/discount-preview` | 下单前算优惠 |
| `previewErrandPrice(payload)` | POST `/user/order/errand/price` | 跑腿价格预估 |
| `createErrandOrder(payload)` | POST `/user/order/errand` | X-Idem-Key 自动注入 |
| `listOrders(params)` | GET `/me/orders` | keyset 分页 |
| `getOrderDetail(orderNo)` | GET `/me/orders/:orderNo` |  |
| `cancelOrder(orderNo, reason)` | POST `/me/orders/:orderNo/cancel` |  |
| `confirmOrder(orderNo)` | POST `/me/orders/:orderNo/confirm` |  |
| `urgeOrder(orderNo)` | POST `/me/orders/:orderNo/urge` | 催单 |
| `reorder(orderNo)` | POST `/me/orders/:orderNo/reorder` | 再来一单 |
| `applyAfterSale(payload)` | POST `/me/after-sales` |  |
| `listAfterSales(params)` | GET `/me/after-sales` |  |
| `getAfterSale(id)` | GET `/me/after-sales/:id` |  |
| `applyArbitration(payload)` | POST `/me/arbitrations` |  |
| `applyComplaint(payload)` | POST `/me/complaints` |  |

## 5. Coupon / Marketing 模块（`@/api/coupon.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `listMyCoupons({ status, cursor, pageSize })` | GET `/me/coupons` |
| `listAvailableCoupons()` | GET `/coupons/available` |
| `receiveCoupon(couponId)` | POST `/coupons/:id/receive` |
| `bestMatchCoupon({ orderType, shopId, totalAmount })` | GET `/me/coupons/best-match` |
| `grabRedPacket(redPacketId)` | POST `/me/red-packets/grab` |

## 6. Payment 模块（`@/api/pay.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `createPayment({ orderNo, orderType, payMethod, clientType })` | POST `/payment` |
| `getPayStatus(payNo)` | GET `/payment/:payNo` |

**支付流程**：
1. 用户点击"立即支付" → `createPayment({ payMethod: 1, clientType: 'jsapi' })`
2. 后端返回 `jsapi: { timeStamp, nonceStr, package, signType, paySign }`
3. 前端 `uni.requestPayment({ provider: 'wxpay', ...jsapi })` 唤起
4. 成功 → 跳 `/pages-pay/result?payNo=xxx`
5. 结果页轮询 `getPayStatus(payNo)` + WS `payment:result` 事件双重保险

## 7. Map 模块（`@/api/map.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `geocode({ address, city })` | GET `/map/geocode` |
| `regeocode({ lng, lat })` | GET `/map/regeocode` |
| `distance({ fromLng, fromLat, toLng, toLat, type })` | GET `/map/distance` |
| `routing({ ... routeType })` | GET `/map/routing` |
| `withinArea({ shopId, lng, lat })` | POST `/map/within-area` |
| `getRiderTrack(riderId, orderNo, params)` | GET `/map/rider/:id/track/:orderNo` |
| `listCities()` | GET `/region/cities` |
| `getOpenedCities()` | GET `/region/cities/opened` |

## 8. Message 模块（`@/api/msg.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `listMessages({ category, cursor, pageSize })` | GET `/me/messages` |
| `getUnreadCount()` | GET `/me/messages/unread-count` |
| `markRead(id)` | POST `/me/messages/:id/read` |
| `markAllRead(category)` | POST `/me/messages/read-all` |
| `removeMessage(id)` | DELETE `/me/messages/:id` |
| `getSubscribeTemplates()` | GET `/me/messages/subscribe-templates` |

## 9. Wallet 模块（`@/api/wallet.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `getWallet()` | GET `/me/wallet` |
| `listWalletFlows({ flowDirection, cursor, pageSize })` | GET `/me/wallet/flows` |

## 10. Invoice 模块（`@/api/invoice.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `listInvoiceHeaders()` | GET `/me/invoice-headers` |
| `createInvoiceHeader(payload)` | POST `/me/invoice-headers` |
| `updateInvoiceHeader(id, payload)` | PUT `/me/invoice-headers/:id` |
| `deleteInvoiceHeader(id)` | DELETE `/me/invoice-headers/:id` |
| `applyInvoice(payload)` | POST `/me/invoices` |
| `listInvoices(params)` | GET `/me/invoices` |

## 11. Review 模块（`@/api/review.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `submitReview(payload)` | POST `/me/reviews` |

## 12. File 模块（`@/api/file.ts`）

| 前端方法 | 后端端点 |
|---|---|
| `uploadFile(filePath, bizModule, isPublic)` | POST `/file/upload` |
| `uploadImages(filePaths, bizModule, isPublic)` | （循环调用 uploadFile） |

**bizModule 取值**：avatar / qual / proof / invoice / banner / product / shop / video / temp / other

## 13. WebSocket 事件订阅（`@/utils/ws.ts`）

| 主题 | 触发场景 | 推送数据 | 用户端处理 |
|---|---|---|---|
| `order:status:changed` | OrderStateMachine.transit | `{ orderNo, oldStatus, newStatus }` | 详情页 / 跟踪页刷新 |
| `dispatch:rider:notified` | DispatchService.pushDispatchMessage | `{ orderNo, riderId, riderName }` | 订单详情显示骑手 |
| `payment:result` | PaymentStateMachine 转 SUCCESS/FAILED | `{ payNo, status, amount }` | 收银台 / 结果页跳转 |
| `refund:result` | RefundService 回调成功 | `{ orderNo, refundNo, amount }` | 售后详情页刷新 |
| `review:replied` | ReviewReplyService.create | `{ reviewId, reply }` | 我的评价红点 |
| `complaint:resolved` | ComplaintService.resolve | `{ complaintId, result }` | 投诉详情通知 |
| `rider:location:updated` | 骑手位置上报 | `{ riderId, lng, lat, ts }` | 跟踪地图更新 |
| `message:new` | 站内信新增 | `{ id, category, title }` | 消息红点 |

## 14. 统一约定

### 14.1 X-Idem-Key 幂等头
下单接口（createTakeoutOrder / createErrandOrder）自动注入；其他幂等场景通过 `request({ idemKey })` 显式传入。

### 14.2 keyset 分页
```ts
{
  list: T[],
  nextCursor: string | null,  // 用于下一页 cursor 参数
  hasMore: boolean,
  meta?: { page, pageSize, total, totalPages }  // 可选
}
```

### 14.3 错误处理
- `BizError(code, message)` 自动 toast 友好文案（详见 ERROR_TOAST 表）
- 401 → 静默 refresh → 失败 reLaunch /pages/login/index
- 网络错误 → 指数退避重试 3 次（500ms / 1s / 2s）
- 业务码 30001（限流）→ 倒计时提示
- 业务码 30003（重复提交）→ 刷新订单状态
