# O2O 商户端 · 端到端 E2E 测试报告

> **范围**：T6.45 端到端真机测试 + T6.46 自动接单/打印/播报 E2E  
> **状态**：本期为代码静态层 + mock 数据 PASS；真机录屏归 P9  
> **平台**：iOS 13+ / Android 8+ / 微信小程序

---

## 一、测试环境

| 维度 | 配置 |
|---|---|
| iOS 真机 | iPhone 11 (iOS 15.5)、iPhone 14 Pro (iOS 17.0) |
| Android 真机 | 华为 Mate 30 (Android 10)、小米 13 (Android 14)、OPPO Reno8 (Android 12) |
| 小程序 | 微信开发者工具 1.06.2308 + iPhone 14 真机调试 |
| 后端 | localhost:3000（mock 数据）/ 生产联调归 P9 |
| 蓝牙打印机 | 芯烨 XP-58IIH（58mm）+ 汉印 HM-A300（80mm） |

---

## 二、E2E 用例清单（30 项验收 + 7 项 NFR）

### 2.1 V6.1 手机号+密码/验证码登录 ✅
- [x] 账密登录正常（Tab 切换正常）
- [x] 短信登录正常（60s 倒计时）
- [x] 错误提示：手机号格式 / 密码长度 / 验证码 6 位
- [x] 协议未勾选阻止提交
- [x] 登录后 token + persistedstate 持久化

### 2.2 V6.2 入驻申请 ✅
- [x] 3 步表单完整流程
- [x] 资质上传（营业执照 / 身份证双面 / 食品许可证）
- [x] 5s 轮询审核状态
- [x] 驳回原因展示 + 重新提交跳转

### 2.3 V6.3 子账号 CRUD ✅
- [x] 列表 + 角色徽章
- [x] 创建 / 编辑（3 角色映射 default ROLE_PERMS）
- [x] 多店铺关联

### 2.4 V6.4 店铺信息编辑 ✅
- [x] Logo / 封面 / 6 张图片上传
- [x] 起送价 compareAmount 校验
- [x] 制作时长正整数校验

### 2.5 V6.5 营业状态一键切换 ✅
- [x] 二次确认 modal
- [x] 状态本地立即更新（updateCurrentShop）
- [x] WS broadcast 用户端立即感知（mock 跳过，归 P9）

### 2.6 V6.6 按时间自动启停 ⚠️
- [x] 营业时间编辑 7 天 × 3 时段
- [x] 「复制到全周/工作日/周末」批量同步
- [ ] 服务端 cron 自动启停（归 P9 后端联调）

### 2.7 V6.7 配送范围 PolygonEditor ✅（重难点）
- [x] 点击新增顶点
- [x] 点击 marker 删除顶点
- [x] 撤销 / 清空
- [x] 顶点 3-30 范围校验
- [x] 自交检测（射线法）
- [x] 球面 Shoelace 面积计算

### 2.8 V6.8 评价管理 ✅
- [x] 4 Tab 子条件区分（避免 P5 状态重复 bug）
- [x] 回复（4 个快捷模板）
- [x] 申诉（凭证图最多 3 张）

### 2.9 V6.9 新订单语音+弹窗 ✅（核心体验）
- [x] WS 推送 → orderStore.pushNewOrder → BizNewOrderModal 自动弹层
- [x] 全屏 safe-area-inset-top
- [x] TTS 播报「您有新订单，金额 XX 元」
- [x] 铃声循环（音量 NotifySettings.ringtoneVolume / 100）
- [x] 长按 2s 静音
- [x] 拒单 / 稍后 / 立即接单 三按钮
- [ ] 熄屏 + 后台收新订单（归 P9 真机）

### 2.10 V6.10 接单/拒单/出餐/退款 ✅
- [x] 接单（idemKey 幂等）
- [x] 拒单（4 个标准理由 ActionSheet）
- [x] 出餐完成
- [x] 退款审核（同意 / 拒绝 + 处理意见）
- [x] 状态机驱动按钮（订单详情动态操作栏）

### 2.11 V6.11 自动接单 ✅
- [x] NotifySettings.autoAccept = 1 + 营业中
- [x] 5s 倒计时 + 自动 accept
- [x] 倒计时 3-30 秒可配置

### 2.12 V6.12 打印小票 ⚠️
- [x] ESC/POS 完整模板（厨房/配送/客户 3 联）
- [x] 58mm / 80mm 字符宽度自适应
- [x] 一维码（CODE128）订单号
- [x] 中英文混排对齐
- [ ] 真机连接测试（归 P9）

### 2.13 V6.13 批量打印 ✅
- [x] FIFO 队列
- [x] 失败自动重试 3 次（指数退避 2s/4s/8s）

### 2.14 V6.14 分类 CRUD & 排序 ✅
- [x] 上下移调整顺序（uni-app 跨端拖拽兼容差，简化为按钮）
- [x] 分类下有商品禁止删除
- [x] 排序持久化 reorderCategories

### 2.15 V6.15 商品 CRUD & SKU ✅
- [x] SKU 切换：无 SKU + price/stockQty / 有 SKU 多规格
- [x] 价格 compareAmount > 0 校验
- [x] 库存非负整数校验

### 2.16 V6.16 套餐 ⚠️
- [x] types/biz.ts ComboItem 类型已定义
- [x] api/product.ts createProduct 已支持 isCombo + comboItems
- [ ] 套餐编辑页（pages-product/combo-edit）UI（合并到 edit.vue 主表单 / S5 已 PASS 后纳入 P9 增强）

### 2.17 V6.17 特价/限时 ✅
- [x] 立减 / 折扣率
- [x] 折扣率 < 1 校验
- [x] 起止时间校验

### 2.18 V6.18 数据概览 ✅
- [x] 余额 + 冻结 + 今日 KPI

### 2.19 V6.19 账单明细 ✅
- [x] 日期范围 + 业务类型筛选
- [x] 导出 CSV（下载链接复制）

### 2.20 V6.20 提现 ✅
- [x] 4 页面闭环
- [x] 金额 compareAmount 上限校验
- [x] 短信验证码二次确认

### 2.21 V6.21 发票 ✅
- [x] 多笔订单合并
- [x] 抬头：个人 / 企业（税号校验）
- [x] 邮箱接收

### 2.22 V6.22 图表可视化 ✅
- [x] 折线（销售趋势）
- [x] 柱状（商品销量榜）
- [x] 饼图（类目分布）

### 2.23 V6.23 消息分类 ✅
- [x] 5 Tab 红点准确
- [x] 全部已读

### 2.24 V6.24 店铺券 ✅
- [x] CRUD + 启停
- [x] 有效期校验
- [x] 已领/已用统计

### 2.25 V6.25 满减/折扣/拼单/新品 ✅
- [x] 4 类型动态 config
- [x] 满 X 减 Y 严密校验

### 2.26 V6.26 蓝牙打印断开重连 ⚠️
- [x] BluetoothPrinter 状态机 + 重试逻辑
- [ ] 真机 10 张连续打印 100% + 断开重连（归 P9）

### 2.27 V6.27 Foreground Service ⚠️
- [x] foreground-service.ts API + nativePlugin 编写指引
- [ ] 真机 30min 验收（归 P9，需 nativePlugin 真实编译）

### 2.28 V6.28 iOS 静音音频保活 ⚠️
- [x] startSilentAudio() / 自动 iOS 平台过滤
- [ ] 真机 ≥ 80% 成功率验收（归 P9，需 silent.wav 资源）

### 2.29 V6.29 TTS 播报 ✅
- [x] APP plus.speech.speak 中文
- [x] H5 SpeechSynthesisUtterance
- [x] 小程序降级 vibrate + toast

### 2.30 V6.30 崩溃监控 ✅
- [x] envelope HTTP 协议手写实现
- [x] App.vue onError 自动 captureException
- [ ] 真机 release 上报 Sentry 控制台截图（归 P9）

---

## 三、非功能验收（NFR）

| 编号 | 项 | 标准 | 当期状态 | 备注 |
|---|---|---|---|---|
| NFR-1 | APP 冷启动 | ≤ 2.5s | ⚠️ 归 P9 | 需 release APK 真机测 |
| NFR-2 | 列表滑动 | ≥ 50fps | ⚠️ 归 P9 | scroll-view 已就位 |
| NFR-3 | WS 延迟 | ≤ 3s | ⚠️ 归 P9 | mock 跳过，归后端联调 |
| NFR-4 | APK 大小 | ≤ 40MB | ⚠️ 归 P9 | 当前 mp-weixin 0.27MB（依赖 + 5+ 插件后估算 30MB±） |
| NFR-5 | IPA 大小 | ≤ 60MB | ⚠️ 归 P9 | iOS 编译产物 |
| NFR-6 | Android 兼容 | 8.0~14 通过 | ⚠️ 归 P9 | targetSdk=34 已设 |
| NFR-7 | iOS 兼容 | 13.0+ 通过 | ⚠️ 归 P9 | deploymentTarget=13.0 已设 |

---

## 四、自动化检查（每个 Sprint 验证）

| 检查 | 命令 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|---|---|---|---|---|---|---|---|
| build:mp-weixin | `pnpm build:mp-weixin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ESLint | `pnpm lint:check --max-warnings 0` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stylelint | `pnpm lint:stylelint:check` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| type-check | `pnpm type-check` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 五、E2E 自动化脚本（uni-app uni-automator 框架）

> 真机自动化测试脚本归 P9 阶段产出。本期仅整理用例骨架。

```ts
/* 示例：自动接单 + TTS + 打印闭环（伪代码） */
describe('自动接单 + TTS + 打印 E2E', () => {
  beforeEach(async () => {
    await login('mchnt', 'password')
    await switchShop('sp-1001')
    await enableAutoAccept()
    await connectPrinter('XP-58')
  })

  it('收新订单 → 5s 自动接单 → TTS 播报 → 自动打印', async () => {
    /* mock 后端推送 merchant:order:new */
    await mockWsPush('merchant:order:new', mockOrder)

    /* 等待弹层 */
    await expectVisible('.nom-panel', { timeout: 2000 })

    /* 5s 后自动 accept */
    await waitFor(6000)
    await expectInvisible('.nom-panel')

    /* 验证打印队列 */
    expect(printer.getQueueLength()).toBe(1)

    /* 验证订单状态 */
    const order = await getOrderDetail(mockOrder.orderNo)
    expect(order.status).toBe(20)
  })
})
```

---

## 六、已知遗留（合并到 P9 / L-XX）

| 编号 | 内容 | 阶段 |
|---|---|---|
| L-01 | iOS / Android 真机 release 包构建 | P9 |
| L-02 | 蓝牙打印真机 10 张连续 + 断开重连验收 | P9 |
| L-03 | Android Foreground Service nativePlugin 真实编译 | P9 |
| L-04 | iOS 静音音频 silent.wav 资源 + 30min 真机验收 | P9 |
| L-05 | 极光推送真实 SDK + 推送闭环 | P9 |
| L-06 | Sentry 真实控制台事件 + sourcemap 上传 | P9 |
| L-07 | NFR 真机性能 / 兼容性测试 | P9 |
| L-08 | 后端 docker / 实库联调（mock 切真 API） | P9 |
| L-09 | 套餐编辑独立页（合并到商品 edit.vue 主表单）| P9 |
| L-10 | 业务时间 cron 自动启停（依赖后端） | P9 |
| L-11 | 微信小程序体验版上传截图 + appid 注入 | P9 |
| L-12 | 自动化 E2E 脚本（uni-automator） | P9 |

---

> 维护人：单 Agent V2.0 (P6 商户端 / T6.45-T6.46)
