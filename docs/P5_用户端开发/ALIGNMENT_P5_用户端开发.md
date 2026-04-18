# ALIGNMENT_P5_用户端开发

> 本文件用于 P5 阶段**需求对齐**，严格基于 PRD §3.1 用户端（微信小程序，uni-app）。

## 一、PRD 原文回溯

### 1.1 端定位（§3.1 / §5）
- **目标平台**：微信小程序（唯一编译目标）
- **技术栈**：uni-app + Vue3 + Pinia + uView Plus
- **角色**：C 端用户 —— 外卖下单、跑腿发起方

### 1.2 六大模块（逐字对齐）

| 模块 | PRD 章节 | 核心功能 |
|---|---|---|
| 首页 | §3.1.1 | 定位、搜索、运营位、推荐、公告 |
| 外卖点餐 | §3.1.2 | 商家列表/详情、商品管理、购物车、下单结算、评价 |
| 同城跑腿 | §3.1.3 | 帮送/帮取/帮买/帮排队、订单跟踪 |
| 订单管理 | §3.1.4 | 全量订单、状态分类、操作、售后 |
| 个人中心 | §3.1.5 | 账号、地址、资产优惠、收藏、发票、客服、设置 |
| 支付与消息 | §3.1.6 | 微信/余额支付、微信订阅消息、消息中心、语音提醒 |

### 1.3 性能要求（§4.1.3）
- 首屏加载 ≤ 2s
- 页面切换 ≤ 300ms
- 订单状态推送延迟 ≤ 3s（由后端 + WebSocket + 订阅消息实现）

### 1.4 兼容性（§4.2.1）
- 微信基础库 ≥ 2.0

### 1.5 易用性（§4.5.1）
- 核心下单流程 ≤ 5 步
- 新手引导清晰、异常提示明确

## 二、P5 范围

### 2.1 in-scope
- 6 大模块全部页面 + 组件 + 交互
- 全端 API 对接（基于 P4 已交付接口）
- 支付 JSAPI 接入
- 订阅消息授权
- 位置授权、手机号授权
- WebSocket 订阅订单状态 / 骑手定位
- 错误处理、加载状态、空态、新手引导
- 国际化（中文主力，i18n 预留）
- 主题与样式库
- 埋点事件

### 2.2 out-of-scope
- 小程序上架与审核（P9）
- 真实第三方密钥（用沙箱/mock）
- 大量性能压测（P9）

## 三、页面清单（由 §3.1 推导）

### 3.1 首页（§3.1.1）
- `/pages/index/index`：首页（定位、搜索入口、Banner、快捷入口、推荐、公告）
- `/pages/index/city-picker`：城市切换
- `/pages/index/notice`：公告列表/详情
- `/pages/index/search`：搜索（商家/商品/跑腿服务）、历史、热门
- `/pages/index/search-result`：搜索结果
- `/pages/index/address-switch`：地址快速切换

### 3.2 外卖（§3.1.2）
- `/pages/takeout/shop-list`：商家列表（筛选/排序）
- `/pages/takeout/shop-detail`：商家详情（店铺信息/商品）
- `/pages/takeout/product-detail`：商品详情（规格、加车、收藏）
- `/pages/takeout/cart`：购物车
- `/pages/takeout/checkout`：下单结算（地址、时间、备注、优惠、发票、支付）
- `/pages/takeout/review-submit`：评价提交
- `/pages/takeout/review-list`：店铺评价列表

### 3.3 跑腿（§3.1.3）
- `/pages/errand/entry`：跑腿首页（4 服务入口）
- `/pages/errand/send`：帮送（寄/收件、物品、保价、时间）
- `/pages/errand/pickup`：帮取
- `/pages/errand/buy`：帮买（购买地址、清单、预算）
- `/pages/errand/queue`：帮排队（场所、类型、时长）
- `/pages/errand/price-preview`：价格预估卡片（弹层/单页均可）
- `/pages/errand/tracking`：订单实时跟踪（地图、骑手定位、凭证）

### 3.4 订单（§3.1.4）
- `/pages/order/list`：订单列表（状态/类型筛选）
- `/pages/order/detail`：订单详情
- `/pages/order/cancel`：取消订单（选原因）
- `/pages/order/after-sale-apply`：售后申请（凭证）
- `/pages/order/after-sale-detail`：售后进度
- `/pages/order/complaint`：投诉
- `/pages/order/arbitrate`：申请仲裁

### 3.5 个人中心（§3.1.5）
- `/pages/user/home`：个人中心
- `/pages/user/profile`：资料编辑
- `/pages/user/realname`：实名认证
- `/pages/user/address-list`、`/pages/user/address-edit`：地址管理
- `/pages/user/wallet`：钱包（余额、明细）
- `/pages/user/coupon`：优惠券
- `/pages/user/points`：积分
- `/pages/user/invite`：邀请有礼
- `/pages/user/favorite-shop`、`/pages/user/favorite-product`
- `/pages/user/invoice-title`、`/pages/user/invoice-apply`、`/pages/user/invoice-list`
- `/pages/user/help`：帮助中心 / FAQ
- `/pages/user/feedback`：意见反馈
- `/pages/user/customer-service`：在线客服（IM 或 5ike 跳转）
- `/pages/user/settings`：通知开关、隐私、账号安全
- `/pages/user/about`：关于我们

### 3.6 支付与消息（§3.1.6）
- `/pages/pay/cashier`：支付收银台
- `/pages/pay/result`：支付结果
- `/pages/msg/center`：消息中心
- `/pages/msg/detail`：消息详情

## 四、关键交互约束
- **授权流程**：首次进入请求位置授权 → 下单时请求手机号授权 → 订单状态请求订阅消息授权
- **定位容错**：拒绝授权时允许手动选城市/地址
- **支付超时**：15min 未支付自动关单，前端显示倒计时
- **确认收货超时**：配送完成 15 天自动确认（后端兜底）
- **新手引导**：首页 / 外卖 / 跑腿首次进入展示

## 五、待澄清
| 编号 | 问题 | 默认 |
|---|---|---|
| Q5.1 | 登录时机 | 匿名可浏览；下单/查单/个人中心等敏感操作强制登录 |
| Q5.2 | 地图 SDK | uni-app 原生 map 组件 + 高德小程序 JS SDK |
| Q5.3 | 客服通道 | 跳转微信客服（24h 内消息）+ 站内工单 |
| Q5.4 | 语音提醒 | 小程序不支持常驻语音，改为订阅消息 + 前台播放 |
| Q5.5 | 主题 | 主色 #FF6A1A（橙色，配餐饮行业）；深色模式 V2 |
| Q5.6 | 埋点 | 自建埋点上报 + 小程序数据分析 API |

## 六、对齐结论
- 6 大模块全覆盖，40+ 页面已识别
- 与 PRD §3.1 / §4.1 / §4.2 / §4.5 一字对齐
- 进入 CONSENSUS 阶段
