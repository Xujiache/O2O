# DESIGN_P7_骑手端开发

## 一、工程目录
```
骑手端/
├── src/
│   ├── pages/
│   │   ├── login/
│   │   ├── home/workbench.vue
│   │   ├── dispatch/{hall,detail,preference}.vue
│   │   ├── order/{list,detail,pickup-scan,proof-upload,abnormal,transfer,nav}.vue
│   │   ├── wallet/{overview,bill-list,withdraw,salary-rule,salary-export}.vue
│   │   ├── attendance/{checkin,history,schedule,leave}.vue
│   │   ├── stat/index.vue
│   │   ├── level/index.vue
│   │   ├── reward/list.vue
│   │   ├── msg/{center,detail}.vue
│   │   ├── setting/{accept,notify,security,help,feedback,about}.vue
│   │   └── emergency/index.vue
│   ├── components/
│   │   ├── biz/
│   │   │   ├── DispatchModal.vue    # 系统派单全屏浮层
│   │   │   ├── OrderCard.vue
│   │   │   ├── PickupCodeInput.vue  # 4/6 位验证码
│   │   │   ├── ProofUploader.vue    # 拍照 + 上传
│   │   │   ├── RiderMap.vue         # 内置地图
│   │   │   ├── WorkSwitcher.vue     # 上下班切换
│   │   │   └── EmergencyButton.vue
│   │   └── common/
│   ├── store/{auth,work,order,location,wallet,msg}.ts
│   ├── api/
│   ├── utils/
│   │   ├── request.ts / ws.ts
│   │   ├── jpush.ts
│   │   ├── location-service.ts     # 核心定位上报
│   │   ├── kalman.ts               # 位置滤波
│   │   ├── tts.ts
│   │   ├── navigator.ts            # 外跳导航 Schema
│   │   ├── offline-queue.ts        # 位置/凭证离线队列
│   │   └── call-relay.ts
│   ├── static/
│   ├── styles/
│   ├── App.vue / main.ts / manifest.json / pages.json / uni.scss
├── nativePlugins/
│   ├── ForegroundServicePlugin/    # Android
│   └── AmapLocationPlugin/
├── env/
└── README.md
```

## 二、manifest.json 关键
- Android 权限：
  - `ACCESS_FINE_LOCATION`、`ACCESS_COARSE_LOCATION`、`ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_LOCATION`（Android 14）
  - `POST_NOTIFICATIONS`、`CAMERA`、`RECORD_AUDIO`（TTS）
  - `CALL_PHONE`、`VIBRATE`
- iOS：
  - `NSLocationAlwaysAndWhenInUseUsageDescription`
  - `UIBackgroundModes = [location, audio, fetch, voip?]`
  - `NSCameraUsageDescription`、`NSMicrophoneUsageDescription`

## 三、核心模块设计

### 3.1 登录与认证
- 同商户端结构，但资质字段不同：实名 + 身份证正反 + 健康证 + 健康证有效期 + 车辆照片 + 车牌 + 从业资格证
- 保证金缴纳页：配置金额（如 500 元） → 微信/支付宝支付 → `rider_deposit` 记录

### 3.2 工作台 / 上下班
```
┌ Header：姓名 + 等级 + 积分 ┐
├ 大按钮：【开始接单】/【结束接单】（红绿切换） ┤
├ 今日：收入 / 单量 / 准时率 / 好评率          ┤
├ 进行中订单：最多 N 单（可配置，如 3）         ┤
├ 快捷入口：接单大厅 / 钱包 / 考勤 / 消息       ┤
└ 底部：紧急求助按钮                           ┘
```

"开始接单"流程：
1. 校验资质、健康证有效期、保证金
2. 打卡（时间+位置）写 `rider_attendance`
3. 启动 Foreground Service；开始位置上报
4. 更新 `work_status = 1 在线`

### 3.3 接单大厅
- **系统派单弹窗 DispatchModal**：铃声 + TTS 播报"新订单：外卖，距离 500 米，配送费 8 元" + 15s 倒计时
- **抢单列表**：每条卡片含距离、配送费、预估时长、路径缩略
- 多单并行：骑手在配送中仍可接顺路单

### 3.4 订单配送

**订单卡片操作栏**：
| 订单状态 | 按钮 |
|---|---|
| 已接单（20） | 导航到取件地 / 联系商家 / 联系用户 / 异常 / 转单 |
| 待取件 | 扫码取件 / 输入取件码 / 异常 |
| 配送中 | 导航到送达地 / 联系用户 / 送达 / 异常 |
| 已完成 | 查看详情 |

**取件流程**：
1. 到达商家附近（后端校验距离 ≤ 100m）
2. 打开取件码输入页（4 位外卖 / 6 位跑腿）
3. 扫码或手动输入 → `POST /rider/order/:orderNo/pickup`
4. 可选上传凭证（跑腿必须）

**送达流程**：
1. 到达收件地附近
2. 拍照上传凭证 → `POST /rider/order/:orderNo/deliver`
3. 订单状态 → 50

**导航**：
```ts
// utils/navigator.ts
export function openExternalNav(from, to, vendor='amap'|'baidu') {
  // 构造 Schema
  // plus.runtime.openURL(schema)
}
```

### 3.5 钱包
- 今日 / 昨日 / 月度：收入、奖励、罚款、净额
- 账单列表：订单号 / 类型 / 金额 / 时间（外卖/跑腿颜色区分）
- 提现：选金额 → 银行卡 → 提交 → 状态
- 薪资规则：展示后端配置的规则文案（`sys_config`）

### 3.6 考勤
- 打卡：上班/下班，校验 GPS + 时间
- 在线时长：前端计时 + 后端聚合校对
- 排班：展示 `admin` 配置的班次表
- 请假：填写理由 → 待审核

### 3.7 统计与等级
- 单量趋势、准时率、好评率、差评、投诉
- 等级：1~5 级，升级条件（配送单量/好评率）
- 积分：初始 100，奖励加、罚款扣，影响派单优先级
- 奖惩申诉：7 天内可申诉

### 3.8 消息
- 分类：订单推送、系统公告、奖惩通知、活动通知
- 订单推送 → 点击直达订单

### 3.9 设置
- 接单偏好：模式（抢单/系统派单）、类型（外卖/跑腿/全部）、半径
- 通知：推送/铃声/振动/TTS 开关
- 账号安全、帮助、反馈、关于

### 3.10 紧急求助
```
┌ 红色大按钮：【一键紧急求助】┐
│  点击倒计时 3s → 拨打 110   │
│  同时发送位置 + 订单信息到客服│
└ 辅助：快速联系平台客服      ┘
```

## 四、定位上报核心实现

### 4.1 location-service.ts
```ts
class LocationService {
  private timer: any;
  private offlineQueue: Location[] = [];
  private last: Location | null = null;

  start() {
    this.ensureForegroundService(); // Android
    this.watchBattery();
    this.timer = setInterval(() => this.tick(), this.interval());
  }

  private async tick() {
    const loc = await this.getLocation();
    if (this.shouldReport(loc)) {
      this.offlineQueue.push(loc);
      await this.flush();
    }
    this.last = loc;
  }

  private shouldReport(loc): boolean {
    if (!this.last) return true;
    const dist = haversine(this.last, loc);
    return dist > 15 || (Date.now() - this.last.ts) > 10000;
  }

  private async flush() {
    if (this.offlineQueue.length === 0) return;
    try {
      await api.map.riderReport({ locations: this.offlineQueue });
      this.offlineQueue = [];
    } catch { /* 下次再试 */ }
  }

  private interval() {
    return this.battery < 20 ? 30000 : 10000;
  }

  stop() { clearInterval(this.timer); this.stopForegroundService(); }
}
```

### 4.2 卡尔曼滤波
滤除漂移毛刺，输入 `(lng, lat, speed, acc)`，输出平滑坐标。

## 五、安全与合规

- 取件码校验：位数 + 格式 + 过期（12h）
- 凭证照片：强制水印（时间 + 订单号 + 位置脱敏）
- 虚拟号码：不暴露真实手机号
- 紧急求助：同时自动上报位置 + 订单 → 平台客服
- 健康证到期前 15 天提醒，到期自动停止接单

## 六、产物
- iOS IPA + Android APK
- 原生插件源码（前台服务、高德定位）
- 定位策略文档、保活指引
- 紧急求助流程说明
- `docs/P7_骑手端开发/` 7 份阶段文档
