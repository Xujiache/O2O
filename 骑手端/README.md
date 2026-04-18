# 骑手端（O2O · iOS+Android APP）

> 平台骑手工作台。对应 **PRD §3.3** 六大模块：登录认证 / 接单大厅 / 订单配送 / 我的钱包 / 考勤统计 / 消息与设置。
>
> 技术栈：**uni-app + Vue3 + Pinia + uView Plus**。主编译目标 `app-plus`（iOS + Android）。

---

## 一、目录结构

```
骑手端/
├── src/
│   ├── pages/
│   │   ├── login/        # 登录与认证（§3.3.1）
│   │   ├── hall/         # 接单大厅（§3.3.2）
│   │   ├── delivery/     # 订单配送（§3.3.3）
│   │   ├── wallet/       # 我的钱包（§3.3.4）
│   │   ├── attendance/   # 考勤统计（§3.3.5）
│   │   └── message/      # 消息与设置（§3.3.6）
│   ├── components/  api/  store/  utils/  static/
│   ├── App.vue  main.ts  pages.json  manifest.json  uni.scss
├── env/.env.development  env/.env.production
├── index.html / package.json / tsconfig.json / vite.config.ts / uni.config.ts
└── README.md
```

---

## 二、启动与构建

```bash
# APP 端
pnpm --filter 骑手端 dev:app
pnpm --filter 骑手端 dev:app-android
pnpm --filter 骑手端 dev:app-ios

# H5 调试
pnpm --filter 骑手端 dev:h5

# 生产构建
pnpm --filter 骑手端 build:app
pnpm --filter 骑手端 build:app-android
pnpm --filter 骑手端 build:app-ios
```

---

## 三、骑手端核心能力（P7 阶段实现，P1 仅保留占位）

| 能力 | 备注 |
|---|---|
| **定位实时上报** | 对齐 PRD §4.1：频率 ≥ 10 秒/次；manifest 已声明 `ACCESS_BACKGROUND_LOCATION`、`FOREGROUND_SERVICE_LOCATION`；iOS `NSLocationAlwaysAndWhenInUseUsageDescription` 已填 |
| **新订单语音播报** | `app-plus.modules.Speech`；订单推送延迟 ≤ 3s（PRD §4.1） |
| **后台保活** | Android `FOREGROUND_SERVICE` + `WAKE_LOCK`；iOS 开启 Background Modes > Location |
| **导航** | 内嵌高德 / 百度导航 SDK（P7 阶段引入） |
| **取送凭证拍照** | Android `CAMERA`、iOS `NSCameraUsageDescription` |
| **紧急求助** | PRD §3.3.6；需设备震动 + 电话外拨权限 |

---

## 四、环境变量（骑手端特有）

| 变量 | 用途 |
|---|---|
| `VITE_LOCATION_REPORT_INTERVAL` | 定位上报间隔（秒），默认 10 |
| `VITE_LOCATION_REPORT_ACCURACY` | 定位精度（`high` / `low`），默认 `high` |
| `VITE_MAP_PROVIDER` / `VITE_MAP_AK` | 地图 SDK |
| `VITE_PUSH_PROVIDER` / `VITE_PUSH_APPKEY` | APP 推送 |

---

## 五、权限清单要点

### Android（`manifest.json.app-plus.distribute.android.permissions`）
- `INTERNET` / `ACCESS_NETWORK_STATE`
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` / `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION` / `WAKE_LOCK`
- `VIBRATE` / `CAMERA` / `RECORD_AUDIO`

### iOS（`privacyDescription`）
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`

---

## 六、常见问题

- **后台定位失效**：确认已授权"始终允许"；Android 10+ 需动态申请 `ACCESS_BACKGROUND_LOCATION`；Android 14 还需 `FOREGROUND_SERVICE_LOCATION`。
- **语音不播报**：系统媒体音量为 0，或用户关闭系统 TTS。
- **电量异常**：`VITE_LOCATION_REPORT_INTERVAL` 可按场景动态调整（接单前 30s，接单后 10s）。
