# e2e-mp — 用户端微信小程序 E2E

Sprint 4 / W4.E.1。基于 [miniprogram-automator](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/api.html) + Jest 的小程序自动化骨架。

## 真机依赖

本目录仅交付 spec 骨架，运行需以下依赖（不在 CI 默认拉起，需要本地 / 专用 Runner）：

1. 微信开发者工具版本 ≥ 1.06，并在 `设置 → 安全设置` 中开启 `服务端口`（默认 `9420`）。
2. 用户端工程已 build 出 `dist/build/mp-weixin`：

   ```bash
   cd 用户端
   pnpm build:mp-weixin
   ```

3. 本目录依赖（按需自行安装；本任务交付不预装）：

   ```bash
   cd 部署/tests/e2e-mp
   pnpm install
   ```

## 环境变量

| 变量              | 说明                            | 默认                                                       |
| ----------------- | ------------------------------- | ---------------------------------------------------------- |
| `WX_CLI_PATH`     | 微信开发者工具 cli.bat 绝对路径 | `C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat` |
| `MP_PROJECT_PATH` | 已 build 的 mp-weixin 工程路径  | `../../../用户端/dist/build/mp-weixin`                     |
| `WMPA_PORT`       | automator 自动化端口            | `9420`                                                     |
| `WMPA_TIMEOUT`    | 启动超时（ms）                  | `60000`                                                    |
| `MP_TEST_TOKEN`   | 注入的测试 token                | `test-jwt-token-mock-2026`                                 |

## 运行

```bash
# 全量
pnpm test

# 单 spec
pnpm test:order
pnpm test:pay
pnpm test:errand
```

## Spec 一览

| 文件                   | 说明             | 步骤数 |
| ---------------------- | ---------------- | ------ |
| `tests/order.spec.js`  | 用户下单完整路径 | 5      |
| `tests/pay.spec.js`    | 支付路径         | 4      |
| `tests/errand.spec.js` | 跑腿下单         | 5      |

## 注意

- `helpers/login.js` 通过 `mockWxMethod('login')` + 写 storage `token` 的方式绕过真实微信登录链路。
- `helpers/fixtures.js` 与后端 e2e seed 数据保持 ID 一致，需配合后端 seed 脚本初始化。
- 所有真机 / 真接口依赖项均通过 mock 隔离，不依赖真实后端可在骨架层运行（spec 内的 selector 仅作示意，实际接入需对照页面 wxml）。
