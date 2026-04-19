# 用户端（O2O · 微信小程序）

> C 端用户下单入口。对应 **PRD §3.1** 六大模块：首页 / 外卖点餐 / 同城跑腿 / 订单 / 个人中心 / 支付与消息。
>
> 技术栈：**uni-app + Vue3 + Pinia + uView Plus + TypeScript 严格模式**。主编译目标 `mp-weixin`。

---

## 一、目录结构（P5 / DESIGN_P5 §一）

```
用户端/src/
├── pages/                       # 主包（首页 / 登录 / 城市 / 搜索 / 5 大入口 tab）
│   ├── index/                   # 首页（§3.1.1）+ city-picker
│   ├── login/                   # 登录（微信 + 手机号绑定）
│   ├── search/                  # 搜索 + 结果
│   ├── takeout/                 # 外卖入口（跳分包）
│   ├── errand/                  # 跑腿入口（4 服务）
│   ├── order/                   # 订单列表
│   ├── user/                    # 个人中心首页
│   └── pay/                     # 收银台
├── pages-takeout/               # 外卖分包（店铺 / 下单 / 评价 / 选券）
├── pages-errand/                # 跑腿分包（4 服务表单 + 跟踪地图）
├── pages-order/                 # 订单分包（详情 / 评价 / 售后 / 投诉 / 仲裁）
├── pages-user/                  # 个人中心分包（资料 / 实名 / 地址 / 钱包 / 优惠券 / 邀请 / 收藏 / 发票 / 客服 / 设置 / 关于）
├── pages-pay/                   # 支付分包（结果页）
├── pages-msg/                   # 消息分包（中心 / 详情）
├── components/biz/              # 业务组件（Empty/Loading/Error/Dialog/Guide/ShopList/ShopCard/ProductCard/ProductDetail/CartSheet/PriceEstimate/PickupCode/RiderMap）
├── store/                       # Pinia Store（app/user/location/cart/order/msg/ui）+ persistedstate
├── api/                         # 业务 API 封装（auth/user/shop/order/coupon/pay/map/msg/wallet/invoice/review/file）
├── utils/                       # request / ws / location / track / subscribe / format / logger / storage
├── types/                       # TypeScript 业务类型（biz.ts + shims.d.ts）
├── App.vue / main.ts / pages.json / manifest.json / uni.scss
└── ...
```

---

## 二、启动与构建

```bash
# 开发（微信小程序）
pnpm --filter 用户端 dev:mp-weixin
# 或
pnpm dev:user

# 打开微信开发者工具 → 导入 用户端/dist/dev/mp-weixin/
# appId：在 src/manifest.json.mp-weixin.appid 填入测试号或正式 appid

# 开发（H5 预览，浏览器调试）
pnpm --filter 用户端 dev:h5

# 生产构建（微信小程序）
pnpm --filter 用户端 build:mp-weixin
# 产物：用户端/dist/build/mp-weixin/

# 代码检查
pnpm --filter 用户端 lint:check
pnpm --filter 用户端 lint:stylelint:check
```

---

## 三、环境变量

| 变量                   | 用途                                    | 默认                         |
| ---------------------- | --------------------------------------- | ---------------------------- |
| `VITE_APP_ENV`         | 环境标识（development/production）      | development                  |
| `VITE_APP_VERSION`     | 应用版本（写入 useAppStore.appVersion） | 0.1.0                        |
| `VITE_API_BASE_URL`    | 后端 API 前缀（含 /api/v1）             | http://localhost:3000/api/v1 |
| `VITE_API_TIMEOUT`     | 请求超时（毫秒）                        | 15000                        |
| `VITE_WS_BASE_URL`     | WebSocket 前缀（订单状态推送）          | ws://localhost:3000/ws       |
| `VITE_MAP_PROVIDER`    | 地图 SDK 提供商（amap/baidu）           | amap                         |
| `VITE_WECHAT_MP_APPID` | 微信小程序 appId                        | （上线前填入）               |

`.env.development`、`.env.production` 模板已就位于 `env/`，正式密钥由 CI/CD 注入。

---

## 四、关键模块（P5 已落地）

### 4.1 工程基础

- **request.ts**：基于 `uni.request` 封装，token 自动注入、401 静默 refresh、网络错误指数退避（最多 3 次）、错误码统一 toast、X-Idem-Key 幂等
- **ws.ts**：WebSocket 心跳 30s + 断线重连（指数退避，最多 5 次）+ topic 订阅模式（`order:status:changed` / `dispatch:rider:notified` / `payment:result`）
- **location.ts**：定位授权 + 反查城市 + 地址选择
- **track.ts**：埋点批量缓冲 + 10s flush；30+ 标准事件（TRACK 常量）
- **subscribe.ts**：微信订阅消息授权封装（每次下单前调用）
- **format.ts**：金额（currency.js 大数库）/ 时间（dayjs）/ 距离 / 脱敏

### 4.2 状态管理（Pinia + persistedstate）

| Store            | 内容                            | 持久化           |
| ---------------- | ------------------------------- | ---------------- |
| useAppStore      | 系统信息、版本、主题、引导标记  | theme/guideFlags |
| useUserStore     | token / refreshToken / 用户资料 | 全部             |
| useLocationStore | 当前坐标、城市、收货地址        | city/address     |
| useCartStore     | 多店购物车（按 shopId）         | 全部（7 天过期） |
| useOrderStore    | 进行中订单数、最近详情快照      | 否               |
| useMsgStore      | 未读数、消息列表                | 否               |
| useUiStore       | 全局 loading 计数               | 否               |

### 4.3 全局组件（components/biz/）

- BizEmpty / BizLoading / BizError / BizDialog / Guide
- ShopCard / ProductCard / ShopList / ProductDetail / CartSheet
- PriceEstimate / PickupCode / RiderMap

### 4.4 接口对接（详见 docs/P5\_用户端开发/api-mapping.md）

完整对接 P3/P4 后端 200+ HTTP 端点：

- Auth: 微信小程序登录 / 手机号绑定 / refresh
- Shop: GEO 排序店铺列表 / 详情 / 商品 / 评价
- Order: 外卖下单 / 跑腿下单 + 价格预估 / 列表（keyset） / 详情 / 取消 / 售后
- Payment: 微信 JSAPI / 余额 / 状态查询
- Coupon / Wallet / Invoice / Favorite / Realname / Map (within-area, geocode, rider track) / Message

---

## 五、目标平台

| 平台                   | 支持    | 说明                           |
| ---------------------- | ------- | ------------------------------ |
| 微信小程序 `mp-weixin` | ✅ 主   | PRD §3.1 指定                  |
| H5                     | ✅ 辅   | 开发调试用                     |
| App-plus               | ⚠️ 可编 | manifest 已预留，P5 非默认目标 |

---

## 六、合规与安全

- 用户授权文案清晰（位置 / 相机 / 相册 / 订阅消息），拒绝不影响浏览
- 敏感字段（mobile / 身份证）默认显示 `_tail4`，详情按权限可见全号
- 全局 token 注入 `Authorization: Bearer <jwt>`；过期自动 refresh；refresh 失败跳登录
- 微信小程序合规：不诱导分享、不使用违禁词、用户协议 + 隐私政策齐全

---

## 七、常见问题

- **微信开发者工具提示"未定义 appid"**：`src/manifest.json` → `mp-weixin.appid` 填入测试号或正式号
- **uView Plus 组件样式异常**：确认 `src/uni.scss` 顶部 `@import 'uview-plus/theme';` 未被注释
- **定位权限**：`manifest.json.mp-weixin.permission.scope.userLocation.desc` 已配置
- **分包过大**：当前主包 + 6 个分包，每包均 ≤ 2MB；新增页面请按业务归类到对应分包
- **TypeScript 严格模式**：禁止 `any`（用 `unknown` + 类型守卫）；禁止 `console.log`（用 `@/utils/logger`）

---

## 八、相关文档

- `docs/P5_用户端开发/DESIGN_P5_用户端开发.md` —— 详细设计（权威基准）
- `docs/P5_用户端开发/ACCEPTANCE_P5_用户端开发.md` —— 验收标准 V5.1~V5.25
- `docs/P5_用户端开发/api-mapping.md` —— API 对照（前后端字段映射）
- `docs/P5_用户端开发/components.md` —— 业务组件文档
- `docs/P5_用户端开发/tracking.md` —— 埋点事件清单
- `docs/P4_后端业务服务/P4_COMPLETION_REPORT.md` §10 —— 后端接口对接建议
