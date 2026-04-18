# CONSENSUS_P5_用户端开发

## 一、范围与分工
- 编译目标：仅微信小程序（`MP-WEIXIN`）
- 6 大模块 40+ 页面全部落地
- 依赖：P3 / P4 后端 API 已交付
- 并行：与 P6 / P7 独立

## 二、技术方案共识

### 2.1 工程规范
- uni-app CLI（Vite 模板）
- Vue3 Composition + `<script setup>`
- TypeScript 严格模式
- Pinia Store（按域拆：`user/location/cart/order/msg/app`）
- uView Plus 3.x 基础 UI
- 自研业务组件 `src/components/biz/*`
- SCSS 变量 + `uni.scss`
- 统一请求 `src/utils/request.ts`（基于 `uni.request` 封装；拦截 401 → 重登）
- WebSocket：`src/utils/ws.ts`（心跳 + 断线重连）

### 2.2 状态与缓存
| Store | 内容 |
|---|---|
| useAppStore | 主题、系统信息、版本、首次引导 |
| useUserStore | token、用户信息、授权状态 |
| useLocationStore | 当前城市、当前收货地址、定位坐标 |
| useCartStore | 按 shopId 维护多购物车 |
| useOrderStore | 进行中订单列表、实时状态 |
| useMsgStore | 未读数、消息中心 |

本地存储（`uni.setStorageSync`）：token、用户信息、地址、当前城市、新手引导标记

### 2.3 请求与鉴权
- 请求基 URL 从 `.env.*` 注入
- Token 放 `Authorization: Bearer xxx`
- 401 → 静默刷新（refresh）→ 仍失败跳登录页
- 错误码集中处理（沿用后端约定）

### 2.4 支付
- JSAPI：`uni.requestPayment({provider:'wxpay', ...})`
- 订阅消息：`uni.requestSubscribeMessage` 在下单前触发

### 2.5 地图与实时跟踪
- 跑腿跟踪页：uni 原生 `map` + `covers`（骑手/取件/送达点）
- WebSocket 订阅 `/ws/user/{uid}` 推送订单状态 + 骑手位置
- 位置平滑：前端插值（每 1s 插值 10 次）

### 2.6 性能优化
- 分包加载：`pages/index` 主包；外卖、跑腿、个人中心、订单分包
- 图片统一 WebP + CDN
- 列表虚拟滚动（uView virtual-list）
- 首页 SSR（预渲染首屏）
- 请求缓存（店铺列表 2min）

### 2.7 错误与空态
- 网络异常：全局 Toast + 重试按钮
- 无数据：空态组件 `<BizEmpty />`
- 授权被拒：友好提示 + "去设置"入口

## 三、交付标准
- [ ] 40+ 页面全部实现，功能覆盖 PRD §3.1
- [ ] 通过微信开发者工具真机预览
- [ ] 首屏 ≤ 2s（真机弱网 3G 下 ≤ 3s）
- [ ] 页面切换 ≤ 300ms
- [ ] 主流机型（iPhone 12/13/14、主流 Android 6"+ 分辨率）无错乱
- [ ] Lighthouse 小程序评分 ≥ 90
- [ ] 完整的错误处理、空态、加载态
- [ ] 自动化埋点 ≥ 30 事件点

## 四、风险与应对
| 风险 | 应对 |
|---|---|
| 订阅消息一次性 | 下单前每次请求；模板 ID 可配置 |
| 定位失败 | 手动选城市/地址兜底 |
| 图片/视频体积 | CDN + 懒加载 + WebP |
| 分包超 2MB | 按业务严格拆分；静态资源走 CDN |
| WS 断连 | 心跳 30s + 指数退避重连 |
| iOS 键盘遮挡 | 全局 `page-meta + resize` 适配 |

## 五、结论
- 方案锁定，进入 DESIGN
