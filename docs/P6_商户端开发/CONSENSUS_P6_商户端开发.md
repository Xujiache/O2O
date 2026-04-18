# CONSENSUS_P6_商户端开发

## 一、范围与分工
- 6 大模块、35+ 页面全部落地
- 目标：**APP 为主**（iOS + Android），**小程序为辅**（简化版：工作台+订单+基础商品）
- 依赖：P4 后端业务服务交付

## 二、技术方案共识

### 2.1 工程栈
- uni-app CLI（Vite 模板）
- Vue3 `<script setup>` + TypeScript
- Pinia Store；uView Plus 3
- 请求/WS：同用户端复用封装
- 语音：`plus.speech`（APP）；弹窗 + 震动兜底
- 打印：封装 `BluetoothPrinter` 服务，暴露 `connect/disconnect/print(order)`
- 地图：APP 内嵌高德 SDK；小程序用原生 `map`

### 2.2 状态 Store
| Store | 内容 |
|---|---|
| useAuthStore | 商户 + 子账号 token、当前店铺 shopId |
| useShopStore | 当前店铺信息、营业状态、自动接单开关 |
| useOrderStore | 新订单队列、待处理计数、打印队列 |
| usePrinterStore | 已连接打印机、参数 |
| useMsgStore | 消息未读/分类 |
| useStatStore | 统计缓存 |

### 2.3 订单实时通知双通道
1. **WebSocket**：前台打开时主通道
2. **APP 推送（极光）**：后台唤醒 + 通知栏弹窗 + 铃声 + 点击拉起订单详情
3. **保活**：Android Foreground Service（显示常驻通知："外卖商家端 正在等待订单"）；iOS 静音音频 + VoIP 推送（可选）

### 2.4 蓝牙打印机
- 协议：ESC/POS
- 模板：店铺名（大字）+ 取件码（大字）+ 订单号 + 菜品清单 + 备注 + 地址（脱敏）+ 条形码
- 使用 `uni.openBluetoothAdapter` / `getBluetoothDevices` / `createBLEConnection` / `writeBLECharacteristicValue`
- 状态：`disconnected / connecting / connected / printing / error`
- 自动重连 & 多打印机并发

### 2.5 权限控制（RBAC 前端实现）
- 登录后拉取 `menus + permissions`
- 菜单按权限生成；按钮 `<BizBtn perm="order:accept" />`
- 子账号（店长/店员/收银）默认角色映射

### 2.6 新订单全屏浮层
```
┌ 全屏（半透明黑底） ┐
│  【新订单 外卖】        │
│  ¥32.50                 │
│  北京市朝阳区 ****1234  │
│  商品：xxx x1 ...        │
│                         │
│ [ 立即接单 ] [ 查看详情 ]│
└ 持续响铃直至操作 ┘
```
长按 2s 可静音本条。

## 三、交付标准
- [ ] 6 大模块全部完成
- [ ] APP 在 Android 8+ 与 iOS 13+ 实机通过
- [ ] 小程序简化版通过微信开发者工具真机
- [ ] 打印机实测（58/80mm）成功打印
- [ ] 保活 & 推送真机测试通过（熄屏 30min 可收新单）
- [ ] 崩溃监控 + 埋点齐备
- [ ] 自动化冒烟脚本

## 四、风险与应对
| 风险 | 应对 |
|---|---|
| iOS 后台保活受限 | 运营引导开启通知 + VoIP 推送 + 服务器降级推送 |
| 蓝牙 BLE 稳定性 | 多层重试 + 打印队列持久化 |
| 极光 token 失效 | 登录/恢复前台时刷新 |
| 自动接单误触 | 开关二次确认 + 记录操作日志 |
| 多店铺切换 | 顶部店铺选择器 + 全局 shopId 共享 |

## 五、结论
- 方案锁定，进入 DESIGN
