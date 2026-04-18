# 商户端（O2O · iOS+Android APP & 微信小程序）

> B 端商户操作台。对应 **PRD §3.2** 六大模块：登录认证 / 店铺管理 / 订单管理 / 商品管理 / 财务结算 / 数据统计。
>
> 技术栈：**uni-app + Vue3 + Pinia + uView Plus**。主编译目标 `app-plus`，兼容 `mp-weixin`。

---

## 一、目录结构

```
商户端/
├── src/
│   ├── pages/
│   │   ├── login/     # 登录与认证（§3.2.1）
│   │   ├── shop/      # 店铺管理（§3.2.2）
│   │   ├── order/     # 订单管理（§3.2.3）
│   │   ├── product/   # 商品管理（§3.2.4）
│   │   ├── finance/   # 财务结算（§3.2.5）
│   │   └── data/      # 数据统计（§3.2.6）
│   ├── components/  api/  store/  utils/  static/
│   ├── App.vue  main.ts  pages.json  manifest.json  uni.scss
├── env/.env.development  env/.env.production
├── index.html / package.json / tsconfig.json / vite.config.ts / uni.config.ts
└── README.md
```

---

## 二、启动与构建

```bash
# APP 端（iOS+Android，推荐 HBuilderX 真机/模拟器）
pnpm --filter 商户端 dev:app
pnpm --filter 商户端 dev:app-android
pnpm --filter 商户端 dev:app-ios

# 微信小程序
pnpm --filter 商户端 dev:mp-weixin

# H5 调试
pnpm --filter 商户端 dev:h5

# 生产构建
pnpm --filter 商户端 build:app
pnpm --filter 商户端 build:mp-weixin
```

开发阶段推荐用 HBuilderX 打开 `商户端/`，选择"运行 → 运行到手机或模拟器 → 运行到 Android/iOS APP 基座"。

---

## 三、关键能力（P6 阶段实现，P1 仅保留占位）

| 能力 | 对应 manifest / plugin |
|---|---|
| 蓝牙打印（PRD §3.2.3 订单小票自动打印） | `app-plus.modules.Bluetooth` |
| 第三方 OAuth 登录 | `app-plus.modules.OAuth` |
| APP 推送（新订单提醒） | `app-plus.modules.Push` |
| 相机 / 相册（商品图上传、资质认证） | Android `CAMERA`、iOS `NSCameraUsageDescription` |

权限清单与隐私说明详见 `src/manifest.json.app-plus.distribute`。

---

## 四、环境变量

| 变量 | 用途 |
|---|---|
| `VITE_APP_ENV` / `VITE_APP_NAME` | 基础 |
| `VITE_API_BASE_URL` / `VITE_API_TIMEOUT` / `VITE_WS_BASE_URL` | 后端联调 |
| `VITE_MAP_PROVIDER` / `VITE_MAP_AK` | 地图（配送范围绘制、门店定位） |
| `VITE_PUSH_PROVIDER` / `VITE_PUSH_APPKEY` | APP 推送（极光/个推） |
| `VITE_BT_PRINTER_ENABLED` | 蓝牙打印开关 |

---

## 五、常见问题

- **APP 运行白屏**：确保 HBuilderX 基座版本 ≥ 3.0；检查 `manifest.json.vueVersion = "3"`。
- **蓝牙找不到打印机**：先在系统设置授权蓝牙权限；Android 12+ 需运行时申请 `BLUETOOTH_CONNECT`。
- **小程序包体超限**：P6 阶段采用分包（小程序 ≤ 16MB 主包）。
