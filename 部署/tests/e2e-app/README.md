# e2e-app — 商户端 / 骑手端 APP E2E

Sprint 4 / W4.E.2。基于 [WebdriverIO](https://webdriver.io/) + [Appium 2](https://appium.io/) 的双端（Android + iOS）APP 自动化骨架。

## 真机 / 模拟器依赖

本目录仅交付配置 + spec 骨架，运行需以下依赖（不在 CI 默认拉起，需要本地或专用 Runner）：

1. **Appium server ≥ 2.0**

   ```bash
   npm i -g appium@^2.5.0
   appium driver install uiautomator2
   appium driver install xcuitest
   ```

2. **Android**：
   - Android SDK / Platform-Tools 已安装
   - 已启动 Android 模拟器（默认 `emulator-5554`）或连接真机
   - UiAutomator2 driver 已安装
   - 测试 APK 路径通过 `APP_ANDROID_PATH` 指定（默认 `./apps/merchant-debug.apk`）

3. **iOS**（仅 macOS）：
   - Xcode + Command Line Tools
   - XCUITest driver 已安装
   - 启动 iOS 模拟器（默认 `iPhone 15 Simulator`，iOS 17）
   - 测试 .app / .ipa 路径通过 `APP_IOS_PATH` 指定

4. 本目录依赖（按需自行安装；本任务交付不预装）：

   ```bash
   cd 部署/tests/e2e-app
   pnpm install
   ```

## 环境变量

| 变量                                      | 说明               | 默认                        |
| ----------------------------------------- | ------------------ | --------------------------- |
| `APP_ANDROID_PATH`                        | Android APK 路径   | `./apps/merchant-debug.apk` |
| `APP_IOS_PATH`                            | iOS .app/.ipa 路径 | `./apps/Merchant.app`       |
| `ANDROID_DEVICE_NAME`                     | Android device id  | `emulator-5554`             |
| `ANDROID_PLATFORM_VERSION`                | Android 版本       | `13`                        |
| `IOS_DEVICE_NAME`                         | iOS 模拟器名称     | `iPhone 15 Simulator`       |
| `IOS_PLATFORM_VERSION`                    | iOS 版本           | `17.0`                      |
| `MERCHANT_BUNDLE_ID`                      | 商户端 bundle id   | `com.o2o.merchant`          |
| `RIDER_BUNDLE_ID`                         | 骑手端 bundle id   | `com.o2o.rider`             |
| `E2E_MERCHANT_USER` / `E2E_MERCHANT_PASS` | 商户测试账号       | —                           |
| `E2E_RIDER_USER` / `E2E_RIDER_PASS`       | 骑手测试账号       | —                           |

## 运行

```bash
# Android (单端)
pnpm test:android

# iOS (单端)
pnpm test:ios

# 商户端 only
pnpm test:merchant:android

# 骑手端 only
pnpm test:rider:android
```

## Spec 一览

| 文件                                  | 说明     | 步骤数 |
| ------------------------------------- | -------- | ------ |
| `tests/merchant/accept-order.spec.ts` | 商户接单 | 5      |
| `tests/merchant/dispatch.spec.ts`     | 商户派送 | 5      |
| `tests/rider/accept-order.spec.ts`    | 骑手接单 | 5      |
| `tests/rider/deliver.spec.ts`         | 骑手派送 | 5      |

## 注意

- spec 内的元素选择器（`~xxx`）使用 `accessibility id`，业务侧需在测试 build 中给关键元素加 `accessibilityLabel` / `testID`。
- `helpers/login.ts` 提供两种登录通道：表单填写 + deeplink 注入；推荐 dev 包内置 mock 登录入口。
- 不依赖真后端：建议在测试 build 中将 `API_BASE` 指向 mock server（fixture 数据 ID 与 mock 一致）。
