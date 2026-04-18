# ALIGNMENT_P7_骑手端开发

> 本文件用于 P7 阶段**需求对齐**，严格基于 PRD §3.3 骑手端（uni-app，优先编译为 iOS/Android APP）。

## 一、PRD 原文回溯

### 1.1 端定位（§3.3 / §5）
- 技术栈：uni-app + Vue3 + Pinia + uView Plus
- 编译目标：**iOS + Android APP**（优先）
- 角色：平台骑手 —— 配送服务提供方，外卖 + 跑腿订单的取送履约

### 1.2 六大模块（PRD §3.3.1 ~ §3.3.6）

| 模块 | PRD 章节 | 核心功能 |
|---|---|---|
| 登录与认证 | §3.3.1 | 手机号验证码/密码；实名+健康证+车辆+从业资格；保证金缴纳 |
| 接单大厅 | §3.3.2 | 附近可接订单；抢单/派单双模式；偏好设置；顺路单 |
| 订单配送 | §3.3.3 | 取件/送达全流程；导航；取件码核验；凭证上传；异常处理 |
| 我的钱包 | §3.3.4 | 数据概览；账单明细；提现；薪资结算 |
| 考勤与统计 | §3.3.5 | 打卡；在线时长；排班；数据统计；等级奖惩 |
| 消息与设置 | §3.3.6 | 消息中心；接单设置；通知设置；紧急求助 |

### 1.3 非功能要求
- 骑手定位上报 ≥ 10s/次（§4.1.4）
- 订单状态推送延迟 ≤ 3s
- Android 8.0+ / iOS 13.0+（§4.2.2）
- 核心操作一键可达；语音播报、快捷操作适配线下场景（§4.5.2）

## 二、P7 范围

### 2.1 in-scope
- 6 大模块全部页面
- 系统派单 + 抢单双模式交互
- **高德地图 SDK** 原生导航（内置 + 外跳三方导航）
- 骑手位置后台持续上报（10s/次）
- 新订单**语音 + 弹窗 + 振动**
- 取件码输入校验 + 扫码（OCR/二维码）
- 凭证拍照上传
- 考勤打卡（地点限制 + 人脸校验预留）
- 紧急求助（一键电话 110/客服）
- 打包：iOS IPA + Android APK

### 2.2 out-of-scope
- 骑手招聘、培训管理（运营内容，非本期）
- 跨城配送、跨国（PRD §1.3 排除）
- 专业调度室系统（留给管理后台）

## 三、页面清单（由 §3.3 推导）

### 3.1 登录与认证
- `/pages/login/login`、`/pages/login/sms-login`
- `/pages/login/register` 骑手注册
- `/pages/login/qualification`（实名+健康证+车辆+从业资格）
- `/pages/login/deposit` 保证金缴纳
- `/pages/login/audit-status`

### 3.2 工作台/接单大厅
- `/pages/home/workbench` 工作台（上/下班、当前订单、实时数据）
- `/pages/dispatch/hall` 接单大厅（抢单池 + 系统派单弹窗）
- `/pages/dispatch/detail` 订单详情（接单前）
- `/pages/dispatch/preference` 接单偏好设置

### 3.3 订单配送
- `/pages/order/list`（进行中/已完成/已取消 分 Tab）
- `/pages/order/detail`（取件/送达/异常/转单）
- `/pages/order/pickup-scan` 取件码扫码/输入
- `/pages/order/proof-upload` 取件/送达凭证上传
- `/pages/order/abnormal` 异常上报
- `/pages/order/transfer` 转单申请
- `/pages/order/nav` 内置导航（或外跳高德/百度）

### 3.4 我的钱包
- `/pages/wallet/overview`
- `/pages/wallet/bill-list`
- `/pages/wallet/withdraw` + 银行卡
- `/pages/wallet/salary-rule` 薪资规则说明
- `/pages/wallet/salary-export` 导出明细

### 3.5 考勤与统计
- `/pages/attendance/checkin`、`/pages/attendance/history`
- `/pages/attendance/schedule` 排班
- `/pages/attendance/leave` 请假申请
- `/pages/stat/index` 数据统计（单量/准时率/好评率/差评/投诉）
- `/pages/level/index` 等级 + 积分
- `/pages/reward/list` 奖励/罚款/申诉入口

### 3.6 消息与设置
- `/pages/msg/center`、`/pages/msg/detail`
- `/pages/setting/accept` 接单模式/类型/半径
- `/pages/setting/notify` 通知/语音/铃声
- `/pages/setting/security` 账号安全
- `/pages/setting/help`、`/pages/setting/feedback`、`/pages/setting/about`
- `/pages/emergency/index` 紧急求助

## 四、关键交互约束
- **上/下班**：上班 → 开始定位上报 + 接单；下班 → 停止定位 + 不接单；必须打卡
- **定位上报**：前台 5s/次；后台 10s/次；弱电量降频；位置变化显著才入库（> 15m）
- **系统派单**：弹窗 15s 倒计时；超时不响应记为"拒绝"；拒单过多会降权
- **抢单**：点击抢单 → 原子锁 → 成功分配
- **取件码**：外卖必须输入 4 位商户取件码；跑腿输入取件方 6 位码
- **凭证上传**：取件凭证（可选）、送达凭证（必选）
- **通话**：用户/商家号码通过虚拟中转（后端代拨）防泄漏

## 五、待澄清
| 编号 | 问题 | 默认 |
|---|---|---|
| Q7.1 | 导航方式 | 内置简版（弹层）+ 外跳高德/百度 APP |
| Q7.2 | 定位精度 | 高精度（GPS+Wi-Fi+基站 融合） |
| Q7.3 | 虚拟号码 | 对接三方号中（如阿里云号码中心） |
| Q7.4 | 人脸上班 | V1 不做，V2 视合规要求 |
| Q7.5 | 骑手车辆类型 | 电动车 / 单车 / 步行 三种 |

## 六、对齐结论
- 6 大模块全覆盖，30+ 页面识别完成
- 进入 CONSENSUS
