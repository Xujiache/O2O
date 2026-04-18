# ALIGNMENT_P6_商户端开发

> 本文件用于 P6 阶段**需求对齐**，严格基于 PRD §3.2 商户端（uni-app，编译 APP / 微信小程序）。

## 一、PRD 原文回溯

### 1.1 端定位（§3.2 / §5）
- 技术栈：uni-app + Vue3 + Pinia + uView Plus
- 编译目标：iOS + Android APP（主）、微信小程序（辅）
- 角色：入驻商户 —— 外卖商家，负责商品管理、订单接单出餐、店铺运营

### 1.2 六大模块（PRD §3.2.1 ~ §3.2.6）

| 模块 | PRD 章节 | 核心功能 |
|---|---|---|
| 登录与认证 | §3.2.1 | 手机号验证码/密码登录；资质认证；账号管理 |
| 店铺管理 | §3.2.2 | 店铺信息；营业状态；配送设置；评价管理 |
| 订单管理 | §3.2.3 | 实时提醒；全流程订单；接单/拒单/出餐/打印；异常处理 |
| 商品管理 | §3.2.4 | 分类；商品；规格；套餐；优惠商品 |
| 财务结算 | §3.2.5 | 数据概览；账单明细；提现；发票 |
| 数据统计与消息 | §3.2.6 | 数据统计；消息中心；营销工具 |

### 1.3 兼容性与易用性
- Android 8.0+、iOS 13.0+（§4.2.2）
- 高频操作一键可达，语音播报（§4.5.2）
- 支持蓝牙打印机（§3.2.3.5）

## 二、P6 范围

### 2.1 in-scope
- 6 大模块全部页面
- 新订单**语音 + 弹窗提醒**（APP 长时间保活 + WebSocket + 前台 Service）
- 蓝牙打印机对接（ESC/POS 58mm/80mm）
- 营销工具：店铺券/满减/折扣/拼单配置
- 实名认证上传 & 审核状态查询
- 打包：iOS IPA + Android APK + 微信小程序
- 埋点 & 崩溃监控（Sentry 或同类）

### 2.2 out-of-scope
- 商户 ERP 深度集成（PRD 明确排除，§1.3）
- 多门店跨商户聚合（单商户多店已支持）
- 线下 POS（PRD 排除）

## 三、页面清单（由 §3.2 推导）

### 3.1 登录与认证
- `/pages/login/login` 账号登录
- `/pages/login/sms-login` 短信登录
- `/pages/login/register` 入驻申请
- `/pages/login/qualification` 资质提交
- `/pages/login/audit-status` 审核进度
- `/pages/login/reset-password` 改密

### 3.2 首页 / 工作台
- `/pages/home/workbench` 工作台（今日营业额、待处理订单、消息红点、快捷入口）

### 3.3 店铺管理
- `/pages/shop/list` 店铺列表（单商户多店）
- `/pages/shop/detail`、`/pages/shop/edit` 信息编辑
- `/pages/shop/business-hour` 营业时间
- `/pages/shop/delivery-area` 配送范围（地图圈选 polygon）
- `/pages/shop/delivery-config` 配送费/起送价/预订单/配送时长
- `/pages/shop/notice` 店铺公告
- `/pages/shop/review` 评价管理（回复/申诉/统计）
- `/pages/shop/status-toggle` 营业状态一键切换

### 3.4 订单管理
- `/pages/order/list` Tab（待接单/待出餐/配送中/已完成/已取消/售后中）
- `/pages/order/detail` 订单详情（含打印按钮）
- `/pages/order/accept` 接单弹窗
- `/pages/order/reject` 拒单（原因）
- `/pages/order/ready` 出餐完成
- `/pages/order/refund-audit` 退款审核
- `/pages/order/abnormal` 异常上报
- `/pages/order/print-setting` 打印机设置

### 3.5 商品管理
- `/pages/product/category-list`、`/pages/product/category-edit`
- `/pages/product/list` 商品列表（批量上下架/排序）
- `/pages/product/edit` 商品新增/编辑（名称/图/规格/价格/库存/配料/标签）
- `/pages/product/sku-edit` 规格多价多库
- `/pages/product/combo-edit` 套餐组成
- `/pages/product/discount` 特价/限时折扣

### 3.6 财务结算
- `/pages/finance/overview` 数据概览
- `/pages/finance/bill-list` 账单明细
- `/pages/finance/withdraw` 提现申请 + 银行卡管理
- `/pages/finance/invoice-apply`、`/pages/finance/invoice-list`

### 3.7 数据统计 & 消息
- `/pages/stat/index` 订单量/营业额/商品销量排行/复购/评分
- `/pages/msg/center`、`/pages/msg/detail`
- `/pages/marketing/coupon` 店铺券
- `/pages/marketing/promotion` 满减/折扣/拼单
- `/pages/marketing/new-product` 新品推荐

### 3.8 设置与账号
- `/pages/setting/staff-list`、`/pages/setting/staff-edit` 子账号
- `/pages/setting/security` 账号安全/密码
- `/pages/setting/notify` 通知设置（推送/语音/铃声）

## 四、关键交互约束
- **新订单播报**：收到 `MERCHANT_NEW_ORDER` → 弹出全屏浮层 + 铃声（循环直至操作）+ TTS 播报金额
- **APP 保活**：Android Foreground Service；iOS 静音音频维持 WS；后端也推送推送
- **自动接单**：开关开启且营业中，后端直接 accept，前端仅语音提醒"新订单已自动接单"
- **蓝牙打印**：支持多台并发；标签支持定制（门店/备注/取件码）
- **离线策略**：断网时离线订单不可接；UI 显示离线标识并自动重试

## 五、待澄清
| 编号 | 问题 | 默认 |
|---|---|---|
| Q6.1 | APP 保活方案 | Android Foreground Service；iOS 静音音频 + 后台刷新 |
| Q6.2 | 打印机协议 | ESC/POS（58/80mm 热敏） |
| Q6.3 | 商户小程序简化版 | 仅工作台 + 订单 + 基础商品，其他 APP 专属 |
| Q6.4 | 语音合成 | APP 原生 TTS（plus.speech）；小程序端不支持，改振动+弹窗 |

## 六、对齐结论
- 6 大模块全覆盖，35+ 页面识别完成
- APP + 小程序双目标明确
- 进入 CONSENSUS
