# CONSENSUS_P7_骑手端开发

## 一、范围共识
- 6 大模块、30+ 页面全部落地
- 目标：iOS + Android APP（主）；小程序版本不做
- 依赖：P4 后端业务服务（订单、派单、支付分账、钱包、考勤）+ P3 地图 & 消息基础服务

## 二、技术方案共识

### 2.1 工程栈
- uni-app CLI（Vite 模板）
- Vue3 `<script setup>` + TypeScript
- Pinia Store；uView Plus 3.x
- 高德地图 SDK（原生） + 内置 H5 简版
- 极光推送
- `plus.geolocation` 后台定位（Android Foreground Service）
- `plus.speech` TTS 播报
- Sentry 崩溃监控

### 2.2 Pinia Store
| Store | 内容 |
|---|---|
| useAuthStore | 骑手 token / 个人信息 / 实名状态 |
| useWorkStore | 上/下班状态 / 当日工作时长 / 接单模式 / 偏好 |
| useOrderStore | 当前进行中订单列表（支持多单并行） / 待抢池 |
| useLocationStore | 当前位置 / 精度 / 电量 / 上报频率 |
| useWalletStore | 余额 / 今日收入 |
| useMsgStore | 消息未读 / 分类 |

### 2.3 定位上报机制
1. 上班 → 启动 Foreground Service（Android）/ 静音音频（iOS）
2. 获取位置（高德融合定位）
3. 条件上报：
   - 距上次 ≥ 15m 或超过 10s 均上报
4. 批量上送：每 10s 打包一次 `/map/rider/report`
5. 断网：本地 IndexedDB 缓存 → 恢复后补传
6. 低电量（< 20%）：10s → 30s
7. 下班 → 停止服务

### 2.4 派单交互
- **系统派单**：WS / 极光推送到达 → 全屏浮层（铃声 + TTS + 15s 倒计时）
  - 接单 → `POST /dispatch/:orderNo/accept`
  - 拒绝 → `POST /dispatch/:orderNo/reject`
  - 超时 → 自动标记为 timeout
- **抢单**：接单大厅列表（Pull 刷新，5s 轮询或 WS 推送）
  - 点击抢单按钮 → 原子抢占（后端 Redis Lua）
- **模式切换**：`POST /rider/preference { mode }` 立即生效

### 2.5 导航设计
- 内置简版：Map 组件 + 路径折线 + 距离/时间；仅展示，不导航语音
- 外跳：高德/百度 APP；Schema：`androidamap://route?...` / `baidumap://map/direction?...`
- 用户可选默认跳转

### 2.6 通话
- 所有号码均通过后端虚拟中转：`POST /rider/call-relay { orderNo, to }` 返回临时号码

### 2.7 主题
- 主色 `#00B578`（绿色，安全/配送感）
- 紧急红 `#FF4D4F`

## 三、交付标准
- [ ] 6 大模块全部完成
- [ ] Android 8+ 持续上报 30min 稳定（熄屏）
- [ ] iOS 13+ 前后台 10min 稳定
- [ ] 派单浮层成功率 ≥ 99%
- [ ] 取件码扫码 + 输入均可
- [ ] 凭证上传成功率 ≥ 99%
- [ ] 崩溃率 ≤ 0.3%

## 四、风险与应对
| 风险 | 应对 |
|---|---|
| iOS 后台定位限制 | 利用 `audio` 后台 + VoIP 推送 + 引导常亮 |
| 定位漂移 | 高德融合 + 卡尔曼滤波（前端 / 后端） |
| 派单浮层被系统覆盖 | APP 内自绘浮层 + 系统通知兜底 |
| 电量消耗 | 动态调节采样频率 + 电量提示 |
| 网络不稳定 | 本地缓存 + 指数退避重传 |
| 骑手跨城 | 校验 service_city_code 不匹配拒单 |

## 五、结论
- 方案锁定，进入 DESIGN
