# DESIGN_P6_商户端开发

## 一、工程目录

```
商户端/
├── src/
│   ├── pages/
│   │   ├── login/
│   │   ├── home/
│   │   ├── shop/
│   │   ├── order/
│   │   ├── product/
│   │   ├── finance/
│   │   ├── stat/
│   │   ├── msg/
│   │   ├── marketing/
│   │   └── setting/
│   ├── components/
│   │   ├── biz/
│   │   │   ├── NewOrderModal.vue    # 全屏新单浮层
│   │   │   ├── OrderCard.vue
│   │   │   ├── PrinterPanel.vue
│   │   │   ├── ShopSwitcher.vue     # 顶部店铺切换
│   │   │   ├── StatChart.vue
│   │   │   └── PolygonEditor.vue    # 配送范围圈选
│   │   └── common/
│   ├── store/
│   ├── api/
│   ├── utils/
│   │   ├── request.ts
│   │   ├── ws.ts
│   │   ├── jpush.ts
│   │   ├── bluetooth-printer.ts
│   │   ├── tts.ts
│   │   ├── keep-alive-android.ts
│   │   └── foreground-service.ts
│   ├── static/
│   ├── styles/
│   ├── App.vue
│   ├── main.ts
│   ├── manifest.json                # 含 APP 权限
│   ├── pages.json
│   └── uni.scss
├── nativePlugins/                   # 原生插件（打印机、前台服务）
├── env/
├── package.json
└── README.md
```

## 二、manifest.json（APP）核心配置

- `appid`、`versionName`
- `app-plus.nvueLaunchMode=fast`
- 权限：`WRITE_EXTERNAL_STORAGE`、`BLUETOOTH*`、`ACCESS_FINE_LOCATION`、`FOREGROUND_SERVICE`、`POST_NOTIFICATIONS`（Android 13）
- iOS：`UIBackgroundModes = audio,fetch,voip?`
- 启动图、图标
- SDK：高德地图、极光推送、Sentry

## 三、核心模块设计

### 3.1 登录与认证
- 账密 / 短信双登录
- 入驻申请表单：营业执照、食品经营许可、法人信息、店铺信息（图片上传走 File 模块）
- 审核状态页轮询（5s）

### 3.2 工作台（§3.2 总览）
```
┌ Header：店铺切换 + 在线/离线 + 自动接单开关 + 头像 ┐
├ KPI：今日营业额 | 订单数 | 退款数 | 在途 ┤
├ 待办：待接单/待出餐/售后红点直达                ┤
├ 快捷入口：订单/商品/活动/提现                   ┤
├ 评分曲线（近7日）                               ┤
└ 公告&消息                                       ┘
```

### 3.3 店铺管理

**营业状态切换**：`POST /merchant/shop/:id/status`，二次确认 + toast + WS 广播

**配送范围圈选**：`PolygonEditor.vue`
- 打开地图，默认店铺坐标为中心
- 支持多边形、圆形；保存为 GeoJSON polygon
- 可建多个区域，每个独立起送价/配送费

**营业时间**：周一到周日独立 + 复制一周

**评价管理**：列表 + 回复 + 一键申诉（填理由）

### 3.4 订单管理（核心）

**列表**：按状态 Tab；虚拟滚动；每条卡片显示：订单号、金额、取件码、用户脱敏、距离（配送中显示骑手实时）。

**NewOrderModal.vue 触发**：
```ts
watch(() => orderStore.newOrderQueue, (queue) => {
  if (queue.length && !modalOpen.value) {
    playTTS(`您有新订单 ${queue[0].payAmount} 元`);
    vibrate();
    audioCtx.loop(ringtone);
    show(queue[0]);
  }
});
```
点击"立即接单"：调 `POST /merchant/order/:orderNo/accept` → 成功则关闭浮层、出队下一单、停铃

**自动接单**：开关开启 + 后端事件到达 → 订单直接 `accepted`，前端弹轻提示 + 打印

**订单详情操作栏**：
- 待接单：接单 / 拒单
- 待出餐：出餐完成 / 打印
- 配送中：查看骑手位置 / 联系骑手
- 退款申请：同意 / 拒绝
- 打印小票：一键打印（可重打）

### 3.5 商品管理

**商品编辑表单**：
- 基本：名称/分类/封面/图集/描述/配料/标签
- 规格 Tab：多 SKU（规格名/价格/库存/销量）
- 套餐 Tab：勾选子商品 + 数量
- 活动：特价/限时折扣

**批量操作**：多选上下架、分类修改、排序拖拽

### 3.6 财务结算

**概览卡**：今日/昨日/月度 营业额、订单量、实收、分佣、退款

**账单明细**：支持按订单号/时间筛选；每行：订单号/金额/分佣/退款/结算状态

**提现流程**：
1. 选择提现金额（≤ 可用余额）
2. 选择/新增银行卡
3. 提交 → 审核中 → 成功/失败回显

### 3.7 数据统计
- 订单量趋势：折线图（近 7/30 日）
- 营业额趋势：柱状图
- 商品销量 Top 10
- 用户复购率
- 评分分布
- 数据源：后端聚合接口（P4 提供）

### 3.8 消息中心
- 分类：订单 / 退款 / 平台公告 / 营销活动 / 违规提醒
- 已读/未读管理

### 3.9 营销工具
- 店铺优惠券：创建/修改/停用
- 满减活动：阶梯配置（满 A 减 B、满 X 打 N 折）
- 折扣活动：时段配置
- 新品推荐：置顶上首页
- 拼单：门槛/人数/时限

## 四、蓝牙打印机设计

### 4.1 模块
```ts
// utils/bluetooth-printer.ts
export class BluetoothPrinter {
  async init(): Promise<void>;
  async scan(): Promise<BluetoothDevice[]>;
  async connect(deviceId: string): Promise<void>;
  async printOrder(order: OrderPrintDTO): Promise<void>;
  disconnect(): Promise<void>;
  on(event: 'connected'|'disconnected'|'error', cb);
}
```
### 4.2 ESC/POS 模板（58mm 示例）
```
--------- 店铺名（大字）---------
【外卖订单】
订单号：T20260418**0001
下单时间：2026-04-18 12:30
取件码：1234（加粗大号）

商品：
 宫保鸡丁 x1     ¥22.00
 米饭 x1         ¥2.00

配送费：¥3.00
优惠：-¥5.00
--------
实付：¥22.00

备注：不要辣

收货：朝阳区**路**号 138****5678

[条形码]
```

### 4.3 打印队列
- 内存队列 + 持久化（本地存储），离线恢复
- 失败重试 3 次后入错误队列并提示

## 五、保活设计

### 5.1 Android
- Foreground Service（常驻通知）
- 在原生插件中维持 WS 长连接
- 熄屏 + 省电模式时继续收推送
- 引导用户关闭"电池优化"

### 5.2 iOS
- 静音音频占用 audio 后台权限
- VoIP 推送（仅企业号或签约通道，暂留接口）
- 引导用户开启系统通知

### 5.3 降级
- 若 APP 被杀死：依赖极光推送（高优通道）
- 用户打开 APP → 主动拉取"近 5min 内订单"做补偿

## 六、子账号 & 权限

- 子账号角色：店长 / 店员 / 收银
- 权限清单：
  - 店长：全部
  - 店员：订单操作 + 商品查看（不可修改）
  - 收银：订单查看 + 打印
- 前端 `<BizBtn perm="shop:edit" />` 权限控制

## 七、主题与样式
- 主色 `#2F80ED`（稳重蓝，契合商户端）
- 订单状态色：待接单 #FF4D4F（红色强提醒）、配送中 #1890FF、已完成 #52C41A

## 八、产物
- iOS IPA + Android APK 可安装包（debug & release）
- 小程序体验版
- `docs/P6_商户端开发/` 7 份文档
- 蓝牙打印机使用说明书
