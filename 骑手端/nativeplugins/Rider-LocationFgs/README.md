# Rider-LocationFgs nativePlugin

> O2O 骑手端 Android 前台定位服务 nativePlugin（HBuilderX UniApp 标准格式）。
>
> 规避 P6-R1 / I-01 教训：**真编 Java 源码 + AndroidManifest + package.json 描述符**，
> 不留任何 TODO 占位。

## 目录结构

```
Rider-LocationFgs/
├── package.json                                       插件描述符（plugins / permissions / components）
├── README.md                                          本文档
└── android/
    └── src/main/
        ├── AndroidManifest.xml                        Service 声明 + foregroundServiceType="location"
        └── java/com/o2o/rider/fgs/
            ├── LocationFgsModule.java                 JS 入口模块（@UniJSMethod start/stop/updateContent）
            └── LocationFgsService.java                前台 Service（LocationManager + WakeLock）
```

## JS 调用示例

```ts
import { startForegroundService, stopForegroundService, updateForegroundContent } from '@/utils/foreground-service'

startForegroundService({
  title: 'O2O 骑手端 · 接单中',
  content: '正在接收新订单',
  iconRes: 'mipmap/ic_launcher',
  intervalMs: 10_000
})

updateForegroundContent('已在线 30 分钟，今日 12 单')

stopForegroundService()
```

JS 层包装位于 `骑手端/src/utils/foreground-service.ts`。

## 核心设计

### 1. Foreground Service（V7.22 验收）

- Android 8+ Notification Channel `rider_location_fgs`（IMPORTANCE_LOW，无声响）
- Android 14+ 强制 `ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION`
- `setOngoing(true)` 不可滑除
- `onTaskRemoved` 自动重启 Service（防止 APP 滑退被杀）

### 2. LocationManager 自驱定位

- 同时订阅 `GPS_PROVIDER` + `NETWORK_PROVIDER` 双通道（融合精度）
- 上报间隔 = JS 层 `intervalMs`（默认 10s，电量 < 20% 自动改 30s）
- 距上次 ≥ 15m 触发回调（系统级过滤）
- 回调通过 `sendBroadcast(BROADCAST_LOCATION)` 发给 JS 层

### 3. 防 Doze 杀死

- `PowerManager.PARTIAL_WAKE_LOCK` 持有 8 小时（一个班次）
- WAKE_LOCK 自动释放（onDestroy / stopSelf）

### 4. 权限声明（package.json + AndroidManifest 同步）

| 权限                        | 用途                        |
| --------------------------- | --------------------------- |
| ACCESS_FINE_LOCATION        | 高精度 GPS                  |
| ACCESS_COARSE_LOCATION      | 网络定位兜底                |
| ACCESS_BACKGROUND_LOCATION  | 后台持续定位（Android 10+） |
| FOREGROUND_SERVICE          | 前台服务通用                |
| FOREGROUND_SERVICE_LOCATION | Android 14+ 强制            |
| POST_NOTIFICATIONS          | Android 13+ 通知运行时      |
| WAKE_LOCK                   | PARTIAL_WAKE_LOCK           |
| RECEIVE_BOOT_COMPLETED      | 开机自启（可选）            |

## 集成方式（HBuilderX 真机打包）

1. HBuilderX 打开骑手端项目
2. **manifest.json → App 原生插件配置 → 选择本地插件**：勾选 `Rider-LocationFgs`
3. **APP-原生插件包**：在云端打包页选择"使用自定义基座"
4. 重新打包（Android）即可生效

## 开发态调试

```
JS 端日志（开 console）：
  ringtone.play / fgs.start.ok / location.report.start / location.report

Android Studio 端日志（adb logcat）：
  adb logcat | grep -E "LocationFgs|O2ORider"
```

## P9 改进项

- [ ] BROADCAST_LOCATION 动态注册 receiver 接管 JS 层 setInterval（消除双心跳）
- [ ] 接入高德/百度 SDK 替代系统 LocationManager（精度提升）
- [ ] 与 iOS 静音音频保活联动（双端 NFR ≤ 5% CPU / 8h ≤ 30% 电量）
