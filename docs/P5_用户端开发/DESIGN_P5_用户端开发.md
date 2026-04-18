# DESIGN_P5_用户端开发

## 一、工程目录

```
用户端/
├── src/
│   ├── pages/                 # 主包
│   │   ├── index/             # 首页相关
│   │   ├── login/             # 登录
│   │   └── tabBar/            # tab 页面
│   ├── pages-takeout/         # 外卖分包
│   ├── pages-errand/          # 跑腿分包
│   ├── pages-order/           # 订单分包
│   ├── pages-user/            # 个人中心分包
│   ├── pages-pay/             # 支付分包
│   ├── pages-msg/             # 消息分包
│   ├── components/
│   │   ├── biz/               # 业务组件
│   │   │   ├── ShopCard.vue
│   │   │   ├── ProductCard.vue
│   │   │   ├── CartBar.vue
│   │   │   ├── OrderCard.vue
│   │   │   ├── CouponCard.vue
│   │   │   ├── AddressPicker.vue
│   │   │   ├── RiderMap.vue
│   │   │   └── ...
│   │   └── common/            # 通用
│   ├── store/
│   │   ├── app.ts
│   │   ├── user.ts
│   │   ├── location.ts
│   │   ├── cart.ts
│   │   ├── order.ts
│   │   └── msg.ts
│   ├── api/
│   │   ├── auth.ts
│   │   ├── user.ts
│   │   ├── shop.ts
│   │   ├── product.ts
│   │   ├── cart.ts
│   │   ├── order.ts
│   │   ├── errand.ts
│   │   ├── coupon.ts
│   │   ├── address.ts
│   │   ├── pay.ts
│   │   ├── msg.ts
│   │   └── map.ts
│   ├── utils/
│   │   ├── request.ts
│   │   ├── ws.ts
│   │   ├── track.ts
│   │   ├── auth.ts
│   │   ├── format.ts
│   │   └── validator.ts
│   ├── types/                 # 接口类型（从 OpenAPI 生成）
│   ├── static/                # 图标、图片
│   ├── styles/
│   │   └── var.scss
│   ├── App.vue
│   ├── main.ts
│   ├── manifest.json
│   ├── pages.json
│   └── uni.scss
├── env/
│   ├── .env.development
│   └── .env.production
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 二、pages.json 关键配置

```jsonc
{
  "pages": [
    { "path": "pages/index/index", "style": { "navigationStyle": "custom" } },
    { "path": "pages/login/index", "style": { "navigationBarTitleText": "登录" } }
  ],
  "subPackages": [
    { "root": "pages-takeout",  "pages": [ ... ] },
    { "root": "pages-errand",   "pages": [ ... ] },
    { "root": "pages-order",    "pages": [ ... ] },
    { "root": "pages-user",     "pages": [ ... ] },
    { "root": "pages-pay",      "pages": [ ... ] },
    { "root": "pages-msg",      "pages": [ ... ] }
  ],
  "preloadRule": {
    "pages/index/index": { "packages": ["pages-takeout","pages-errand"] }
  },
  "tabBar": {
    "list": [
      { "text":"首页",   "pagePath":"pages/index/index" },
      { "text":"订单",   "pagePath":"pages/tabBar/order" },
      { "text":"消息",   "pagePath":"pages/tabBar/msg" },
      { "text":"我的",   "pagePath":"pages/tabBar/user" }
    ]
  }
}
```

## 三、首页设计（§3.1.1）

### 3.1 布局
```
┌ 自定义导航栏（定位 + 搜索） ┐
├ Banner 轮播（运营位）      ┤
├ 快捷入口（外卖|跑腿|券|活动）┤
├ 公告跑马灯                 ┤
├ 附近推荐（Tab：热门/优惠/销量/新店）│
├ 无限滚动店铺列表           ┤
└ 底部 TabBar                ┘
```

### 3.2 接口
| 接口 | 说明 |
|---|---|
| `GET /banners?position=HOME_TOP&cityCode=xxx` | 首页 Banner |
| `GET /quick-entries?cityCode=xxx` | 快捷入口 |
| `GET /notices?cityCode=xxx&top=1` | 公告 |
| `GET /shops?cityCode&lng&lat&sort&page` | 店铺推荐/列表 |
| `GET /hot-searches?cityCode=xxx` | 热搜 |

## 四、外卖模块设计（§3.1.2）

### 4.1 店铺详情
- 顶部视差 Header：店铺封面、评分、距离、营业时间、配送费、起送、优惠活动
- 左侧分类菜单 + 右侧商品列表（sticky）
- 底部购物车浮层（商品数、总价、去结算）

### 4.2 下单结算
表单项：
1. 收货地址（必选）
2. 配送时间（立即/预约）
3. 餐具数量
4. 备注
5. 优惠券（自动推荐最优）
6. 发票（可选）
7. 支付方式（微信/余额）

字段实时校验 + 金额明细展示（商品/配送/优惠/总计）

### 4.3 购物车 Store
```ts
// store/cart.ts
interface CartItem { skuId; productId; count; spec; unitPrice; ... }
interface ShopCart {
  shopId: number;
  shopName: string;
  items: CartItem[];
  updatedAt: number;
}
```
本地持久化：`uni.setStorageSync('cart', state.shopCarts)`；7 天过期清理

## 五、跑腿模块设计（§3.1.3）

### 5.1 4 种服务共用表单组件
- `<AddressPicker mode="pickup|delivery" />`
- `<ItemInfoForm />`（物品类型/重量/保价）
- `<TimePicker />`（取件/送达时间）

### 5.2 帮买特有
- 商品清单编辑器（文本 + 图片 + 预算）

### 5.3 帮排队特有
- 排队场所、排队类型、预估时长滑块（30min~8h）

### 5.4 价格预估
下单前调 `POST /order/errand/price`：输入距离/重量/时段 → 返回明细 → 下单时携带幂等 key

### 5.5 实时跟踪
```
┌ 导航栏（倒计时/状态） ┐
├ 地图（骑手头像 + 路径） │
│   ├ 骑手图标动画    │
│   ├ 取件/送达点     │
│   └ 路线（高德路径） │
├ 骑手信息 + 拨打     │
├ 凭证展示           │
└ 取件码（仅帮送）    ┘
```
数据源：
- WS 接收骑手位置 → 插值平滑
- HTTP 轮询订单状态（3s，作为 WS 兜底）

## 六、订单模块设计（§3.1.4）

### 6.1 列表
- Tab：全部 / 进行中 / 待评价 / 已完成 / 售后
- 支持筛选：外卖 / 跑腿
- keyset 分页

### 6.2 详情操作按钮
| 状态 | 按钮 |
|---|---|
| 待支付 | 去支付 / 取消订单 |
| 待接单 | 催单 / 取消订单 |
| 出餐中/配送中 | 联系商家 / 联系骑手 / 查看配送 |
| 已完成 | 再来一单 / 去评价 / 申请售后 / 投诉 |
| 售后中 | 查看进度 / 申请仲裁 |

## 七、个人中心模块设计（§3.1.5）

### 7.1 头部卡片
头像、昵称、钱包余额、积分、优惠券数、实名状态

### 7.2 功能九宫格
按 PRD §3.1.5 完整对齐（地址/钱包/券/积分/邀请/收藏/发票/客服/设置）

### 7.3 实名认证流程
1. 填写姓名 + 身份证 → 提交
2. 调后端（后端再调三方二要素/三要素）
3. 成功：`is_realname=1`
4. 失败：提示原因，允许重试

### 7.4 钱包
- 余额 + 充值（V2，首版只展示）
- 账单明细（支出/收入/退款）

## 八、支付与消息设计（§3.1.6）

### 8.1 支付收银台
```
┌ 订单金额、倒计时 ┐
├ 支付方式列表   ┤
│  ○ 微信支付（默认）│
│  ○ 余额（显示余额）│
└ 立即支付      ┘
```
流程：
1. 创建订单（待支付）
2. 去支付 → 调 `POST /payment/create` 获 JSAPI 参数
3. `uni.requestPayment` → 结果回调
4. 成功 → 结果页；失败 → 留收银台

### 8.2 订阅消息
下单前调 `uni.requestSubscribeMessage({tmplIds: [...]})`，模板 ID 从 `sys_config` 拉取

### 8.3 消息中心
- 分类：订单、优惠活动、平台公告
- 未读红点（WS 推送 +  进入页时 mark-read）
- 支持左滑删除、批量已读

## 九、组件设计精选

### 9.1 ShopCard
```vue
<template>
  <view class="shop-card" @tap="go(shop.id)">
    <image :src="shop.logo" mode="aspectFill" />
    <view class="info">
      <view class="name">{{ shop.name }}</view>
      <view class="meta">
        <text>★ {{ shop.scoreAvg.toFixed(1) }}</text>
        <text>月售 {{ shop.monthSales }}</text>
        <text>{{ shop.distance }}m</text>
      </view>
      <view class="fee">起送¥{{ shop.minAmount }} · 配送¥{{ shop.deliveryFee }} · {{ shop.prepareMin }}分钟</view>
      <view class="tags"><uni-tag v-for="t in shop.tags" :text="t" /></view>
    </view>
  </view>
</template>
```

### 9.2 RiderMap
- props: `orderNo, riderPoint, fromPoint, toPoint, polyline`
- 接收 WS 数据更新，插值平滑
- 提供"返回""联系骑手"操作

## 十、工具类设计

### 10.1 request.ts
```ts
export async function request<T>(opt: RequestOpt): Promise<T> {
  // 注入 token / traceId / version
  // 统一错误码处理；401 → refresh；限流提示；网络异常重试 1 次
}
```

### 10.2 ws.ts
```ts
class WSClient {
  connect(url, token);
  subscribe(topic, cb);
  disconnect();
  // 心跳 30s + 断线重连（1s→2s→4s→8s 最大 30s）
}
```

### 10.3 track.ts
埋点统一上报，批量 + flush，结构：`{eventId, ts, uid, params, from, to}`

## 十一、主题与样式

- 主色 `#FF6A1A`、辅色 `#333 #999 #eee #F7F7F7`
- 圆角 8rpx / 16rpx / 24rpx
- 阴影 `0 2px 8px rgba(0,0,0,.06)`
- 间距 4/8/12/16/24
- `rpx` 统一尺寸

## 十二、产物
- 小程序源码包
- 文档：`docs/P5_用户端开发/api-mapping.md`、`components.md`、`tracking.md`
