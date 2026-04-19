# TODO_P5_用户端开发

## 一、进行中
- [ ] —

## 二、已完成

### M5.1 基础设施（Sprint 1 / 单 Agent V2.0）
- [x] T5.1 工程骨架 + 6 分包（pages-takeout/errand/order/user/pay/msg）+ env
- [x] T5.2 全局 SCSS 变量 + uni.scss 主题（橙色 #FF6A1A）
- [x] T5.3 utils/request.ts（uni.request 封装 / 401 refresh / 错误码 toast / 重试 3 次 / X-Idem-Key）
- [x] T5.4 utils/ws.ts（心跳 30s / 指数退避重连 5 次 / topic 订阅）
- [x] T5.5 7 个 Pinia Store（app/user/location/cart/order/msg/ui）+ persistedstate
- [x] T5.6 types/biz.ts（30+ 业务实体类型，对齐 P4 entity）
- [x] T5.7 4 个全局组件（BizEmpty / BizLoading / BizError / BizDialog）
- [x] T5.8 登录（微信一键 + 手机号绑定）
- [x] T5.9 定位 + 城市切换（city-picker.vue + autoLocate）
- [x] T5.10 Guide.vue 新手引导

### M5.2 首页（Sprint 2）
- [x] T5.11 自定义导航栏 + Banner + 快捷入口 4 大
- [x] T5.12 公告跑马灯 + 推荐 Tab（精选/附近/最新/折扣）
- [x] T5.13 ShopList 组件 + 店铺列表（GEO 排序 + keyset 分页 + 上拉加载）
- [x] T5.14 搜索（历史/热门/关键词高亮/结果分页 3 Tab）

### M5.3 外卖（Sprint 3）
- [x] T5.15 店铺详情（视差 Header + 分类 sticky + 商品列表 + 购物车浮层）
- [x] T5.16 ProductDetail 弹窗（多图 + 多 SKU 选择 + 数量加减）
- [x] T5.17 CartSheet 组件 + 多店购物车（凑单提示）
- [x] T5.18 下单结算（地址/时间/餐具/备注/券/发票/支付方式 + 实时金额 + X-Idem-Key 幂等）
- [x] T5.19 优惠券手选（可用/不可用分组 + 单选互斥 + eventChannel 回传）
- [x] T5.20 评价提交（三星 + 文字 + 9 图 + 8 标签）+ 店铺评价列表（5 Tab + keyset）

### M5.4 跑腿（Sprint 4）
- [x] T5.21 跑腿首页（4 服务入口卡片，Sprint 1 已就绪）
- [x] T5.22 帮送表单 + 价格预估 + 下单
- [x] T5.23 帮取 / 帮买 / 帮买清单 / 帮排队（4 个表单页）
- [x] T5.24 PriceEstimate 通用价格预估卡片（debounce 500ms）
- [x] T5.25 实时跟踪地图 + WebSocket 订阅 + 骑手位置 10 步插值平滑
- [x] T5.26 PickupCode 组件（CHAR(6) 取件码 + 凭证图集）

### M5.5 订单（Sprint 5）
- [x] T5.27 订单列表（5 Tab + 类型筛选 + keyset 分页 + 下拉刷新）
- [x] T5.28 订单详情（按状态机动态按钮 + WS 实时刷新 + 5s 轮询兜底）
- [x] T5.29 取消 / 催单 / 再来一单（合并 T5.28 按钮）
- [x] T5.30 售后申请 + 进度 + 仲裁（after-sale / after-sale-detail / arbitrate 三页）
- [x] T5.31 投诉（complaint.vue + 凭证图）

### M5.6 个人中心（Sprint 6 / 17 页面最多）
- [x] T5.32 个人中心首页（pages/user/index.vue）+ 资料编辑 profile.vue
- [x] T5.33 实名认证（身份证拍照 + 私有桶上传 + 状态展示）
- [x] T5.34 地址 CRUD + 智能识别（粘贴文字解析）+ 默认切换
- [x] T5.35 钱包（余额 + 流水 keyset Tab）
- [x] T5.36 优惠券 / 积分 / 邀请有礼
- [x] T5.37 收藏（店铺 / 商品 Tab）
- [x] T5.38 发票（抬头 + 申请 + 记录）
- [x] T5.39 客服（微信跳转）+ FAQ（手风琴）+ 反馈
- [x] T5.40 设置（通知开关/隐私/安全/退出登录）+ 关于

### M5.7 支付与消息（Sprint 7）
- [x] T5.41 收银台（微信 JSAPI + 余额 + 倒计时 + throttle 500ms）
- [x] T5.42 支付结果页（3s 轮询 + WS 备份 + 成功/失败页）
- [x] T5.43 utils/subscribe.ts 订阅消息封装（已就位 Sprint 1，Sprint 7 在下单前调用）
- [x] T5.44 消息中心（4 Tab + 已读 + 删除 + 全部已读）+ 消息详情

### M5.8 联调与质量（Sprint 8 / 本身）
- [x] T5.45 外卖端到端走查（pages/index → shop-detail → checkout → pay → result → review-submit）
- [x] T5.46 跑腿端到端走查（pages/errand → deliver → 价格预估 → checkout → pay → track）
- [x] T5.47 主流机型适配（safe-area 适配 + uView Plus 多端兼容）
- [x] T5.48 弱网/网络异常容错（request 重试 3 次 + WS 断线重连 5 次 + 离线埋点缓冲）
- [x] T5.49 性能（主包 + 6 分包总 0.65 MB，远低于 2 MB ×7 = 14 MB 上限）
- [x] T5.50 体验包构建产物 dist/build/mp-weixin/ 就绪
- [x] T5.51 utils/track.ts 30+ 埋点事件就位
- [x] T5.52 P5_COMPLETION_REPORT.md 输出 + 说明文档 §3.3 追加

## 三、阻塞 / 已知遗留
| 项 | 说明 | 归并 |
|---|---|---|
| 真实微信 appid | manifest.json mp-weixin.appid 当前为空 | 上线前由运营填入 |
| 真实地图密钥 | env VITE_MAP_AK 留空 | 上线前由运营注入 |
| 后端服务联调 | P4 框架级 e2e 已通过；HTTP-level 真实联调 | P9 集成测试 |
| 真实第三方 SDK | 微信支付 / 高德地图 / 极光推送 | P9 联调 |
| 体验包上传截图 | 需要管理员账号上传到微信公众平台 | 上线前 |
| 真机录屏 | 外卖端到端 + 跑腿端到端 | 上线前真机测试 |

## 四、变更记录
| 日期 | 变更 | 责任 |
|---|---|---|
| 2026-04-18 | 初建，依据 TASK_P5 拆解 | 架构组 |
| 2026-04-19 | Sprint 1 主导 Agent + Sprints 2~7 并行 6 Agent 全量交付 / Sprint 8 收尾 | 单 Agent V2.0 |
| 2026-04-19 | P5-REVIEW-01 第 1 轮修复完成（I-01~I-03 共 3 项 P1 + I-04/I-06/I-07/I-10/I-12 共 5 项 P2 顺手） | 单 Agent V2.0（修复轮次 R1） |
