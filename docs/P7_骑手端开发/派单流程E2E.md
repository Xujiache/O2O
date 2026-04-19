# 派单流程 E2E 测试用例（V7.7）

> 阶段：P7 / Sprint 7 / T7.49
> 编制：单 Agent V2.0
> 验收基准：ACCEPTANCE_P7 §一 V7.7

## 一、E2E 链路全图

```
[订单端用户] 下单 (POST /order/create)
   ↓
[Order Service] 状态机 PENDING (10) → 调度 (DispatchService)
   ↓
[Dispatch Service] 评分匹配 → 选骑手 → 写 dispatch_log
   ↓ 双路推送
   ├── WS rider:dispatch:new → 骑手端 store.handleNewDispatch
   └── JPush 透传 → 骑手端 onJPushTransparentMessage
   ↓
[骑手端] DispatchModal 弹层（15s 倒计时 + TTS + 铃声）
   ↓ 三选一
   ├── 接单 → POST /rider/dispatch/{orderNo}/accept → status 20
   ├── 拒单 → POST /rider/dispatch/{orderNo}/reject → 重新派给下一个骑手
   └── 超时 (15s) → POST /rider/dispatch/{orderNo}/timeout → 自动拒单
   ↓
[Order Service] status 20 → 推送给用户"已接单"
```

## 二、E2E 用例

### 2.1 正常流：接单成功

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 用户端下单 → orderNo=DD20260419120001 | 后端 dispatch 选定骑手 R20260419000001 |
| 2 | 后端 WS push `rider:dispatch:new` | 骑手端 store.queue 入队 |
| 3 | DispatchModal 自动弹层 | 显示 15s 倒计时 + TTS"新订单..." + 铃声 |
| 4 | 5 秒后骑手点"立即接单" | acceptDispatch + 跳订单详情 |
| 5 | 后端验证 | order status 10 → 20 + WS rider:order:status:changed |
| 6 | 用户端 | 收到"已接单"消息 |

**断言**：
- DispatchModal 视觉显示秒数 = 15-5 = 10
- 接单按钮文案 = "接单 (10)"
- 接单成功 toast"接单成功" + 跳 /pages-order/detail
- 后端 dispatch_log 状态 = ACCEPTED

### 2.2 拒单流

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 同 2.1 步骤 1-3 | 同上 |
| 4 | 骑手点"拒单" | rejectDispatch + 弹层关闭 |
| 5 | 后端 dispatch 重新选下一名骑手 | 第二骑手收 WS push |
| 6 | 第二骑手接单 → status 20 | 闭环 |

**断言**：
- 第一骑手 dispatch_log status = REJECTED
- 第二骑手 dispatch_log status = ACCEPTED + 新 dispatch_no

### 2.3 超时流（V7.7 核心）

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 同 2.1 步骤 1-3 | 同上 |
| 4 | 骑手不操作 | 倒计时 15 → 0 |
| 5 | 倒计时归零 → 自动 timeoutDispatch | POST /timeout |
| 6 | 后端 dispatch 重新选 | 同 2.2 步骤 5-6 |

**断言**：
- 倒计时 15 → 0 的视觉变化（5s 内字体变红）
- toast"已超时自动拒单"
- track DISPATCH_TIMEOUT 上报

### 2.4 抢单流（V7.8）

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 用户端下单 → 进入抢单池 | dispatch_mode=2 |
| 2 | 骑手端切到接单大厅 | 列表展示该订单 |
| 3 | 骑手点"立即抢单" | grabOrder + 后端 Redis Lua 原子 SET |
| 4 | 抢单成功 | 跳订单详情 + 列表移除 |
| 5 | 第二骑手同时点抢单 | 失败 toast"已被抢走" + 列表 refresh |

**断言**：
- 后端 Redis SET NX EX 原子执行（参考 P4 dispatch service Lua）
- 后端 dispatch_log 仅 1 条 ACCEPTED

### 2.5 顺路单流（V7.9）

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | 骑手 A 已接单 ORD1（配送中 status=40） | inProgress.length === 1 |
| 2 | 用户下单 ORD2，与 ORD1 同向 | dispatch 评分高 |
| 3 | DispatchModal 弹层（推 ORD2） | 同时存在 inProgress[ORD1] + queue[ORD2] |
| 4 | 骑手接 ORD2 | inProgress.length === 2 |
| 5 | location-service.setCurrentOrder | 切到 ORD2 |

**断言**：
- maxConcurrent 校验：超过 preference.maxConcurrent 不再推
- inProgress 聚合显示 2 单

### 2.6 静音切换（V7.7 子用例 + P6/I-04 教训）

| 步骤 | 操作 | 期望 |
|---|---|---|
| 1 | DispatchModal 弹层 + 铃声响 | 文案"🔔 点击静音本条" |
| 2 | 单击该文案 | 文案变"🔕 已静音本条" + 铃声停 |
| 3 | 再次单击 | 文案变回（mute 切换） |

**断言**：
- 文案 ↔ 代码 ↔ JSDoc 三方一致
- mute 仅当前条生效；下条派单恢复响铃

## 三、自动化脚本（占位，归 P9）

```bash
# adb 自动化（P9 集成）
adb shell am start -n com.o2o.rider/.MainActivity
adb shell input tap 540 1200  # 上班按钮
sleep 5
# 模拟 WS push
curl -X POST http://localhost:3000/api/v1/dispatch/test-push \
  -H "Content-Type: application/json" \
  -d '{"riderId":"R20260419000001","orderNo":"DD-E2E-1"}'
sleep 2
# 检查弹层
adb shell uiautomator dump
adb pull /sdcard/window_dump.xml
grep -q "新订单" window_dump.xml || exit 1
# 模拟接单
adb shell input tap 600 1500
sleep 1
# 检查跳转
adb shell uiautomator dump
grep -q "订单号 DD-E2E-1" window_dump.xml || exit 1
```

## 四、结论

代码层 PASS，2.6 静音文案修复（P6/I-04 同款坑）已规避。
2.1~2.5 真机端到端归 P9 集成测试。
