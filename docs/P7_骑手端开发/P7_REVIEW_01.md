# P7 骑手端开发 审查报告 R1（P7-REVIEW-01）

> **审查日期**：2026-04-19
> **审查者**：审查 Agent（V2.0 单 Agent 工作流）
> **被审查 commit**：`5a720bc` ~ `8959812`（共 8 个 P7 commit）
> **状态**：🟡 **核心质量优秀，但 1 项 R-01 必修方可 PASS**

---

## 一、整体评估

| 维度 | 数据 | 结论 |
|---|---|---|
| 入库 | 8 commit / main↔origin / 124 文件 / git 干净 | ✅ |
| WBS | 51/51 | ✅ |
| 功能验收 | 35/36 ✅ + 1 ⚠️（V7.23 真机依赖）+ 0 ❌ | ✅ |
| NFR | 6/6 ⚠️（依赖真机）| ✅ 合理 |
| 4 项门禁（lint / stylelint / vue-tsc / build:h5） | 全过 | ✅ |
| 卡尔曼单测（kalman.spec.ts）| 7/7 PASS（首次出现独立 spec）| ✅ |
| 禁忌项扫描 | 全部 0 命中 | ✅ |
| 10 项 P5/P6 教训规避（提示词 §4.3）| 9/10 ✅ + **1/10 部分**（mp3 占位仅 0B）| 🟡 |
| 单 Agent V2.0 模式 | 严格执行 | ✅ |

---

## 二、P5/P6 教训规避对照（10 项）

| # | 教训来源 | 本期规避情况 | 评定 |
|---|---|---|---|
| 1 | P5 金额精度（Number 直接比） | `Number(amount\|fee\|balance\|salary\|income)` grep 0 命中；钱包/账单/提现/薪资 100% currency.js | ✅ |
| 2 | P5 状态机 Tab 重复 | 6 Tab 各 status + 子条件唯一区分（pending=20 / picking=30 / delivering=40 / finished=50 / canceled=60 / abnormal=isException=1）| ✅ |
| 3 | P5 库存上限校验 | accept maxConcurrent + radius 上下限 + 后端 Lua 原子 | ✅ |
| 4 | **P6/I-01 nativePlugin 仅 TODO** | ⭐ 真编 515 行 Java（LocationFgsService 308 + LocationFgsModule 135 + AndroidManifest 等）| ✅ |
| 5 | **P6/I-02 批量字段不消费** | location-service.ts 切片 100/批真循环；JSDoc 显式标注教训 | ✅ |
| 6 | **P6/I-03 静态资源不创建占位** | silent.wav 45B 真有效 / marker 3 张 67B 真 PNG / **new-dispatch.mp3 0B 仅占位** | 🟡 **R-01 部分** |
| 7 | **P6/I-04 文案-代码-JSDoc 三方不一致** | DispatchModal `🔔 点击静音本条` + `@click` + JSDoc "P6-R1/I-04 教训"明确；grep `长按 2s` = 0 | ✅ |
| 8 | **P6/I-05 STORAGE_KEYS 硬编码** | 17 个常量集中（含 LOCATION_OFFLINE_QUEUE / NAV_VENDOR / CALL_RELAY） | ✅ |
| 9 | **P6/I-06 Sass @import 弃用** | uni.scss `@use 'uview-plus/theme' as *`；build `[import]` 警告 = 0 | ✅ |
| 10 | **P6/I-07 onShow 频繁刷新** | order store refreshIfStale 5min / dispatch hall 5s 节流 | ✅ |
| 附 | **P5/P6 骑手端/.gitignore 重复创建** | ✅ 不存在（合规，第 3 阶段终于不犯）| ✅ |

---

## 三、问题清单

### P0 阻塞 / P1 严重 / P2 中等：**全部 0 项**

### **R-01 [P3 但本轮必修]** new-dispatch.mp3 0 字节占位（与 P6/I-03 R-02 同款重现）

**位置**：`骑手端/src/static/audio/new-dispatch.mp3`（0 字节）

**问题**：
- P6 R1 修复时已经发现 `new-order.mp3 0 字节` 问题（标 R-02 残留），归 P9
- P7 提示词 §4.3.6 明确写"P6/I-03 静态资源不创建占位 → 本期需要 5 个资源 / **每个都必须创建占位文件（哪怕 0 字节，也要在 README 说明 P9 真资源命令）**"
- Agent 创建了文件 + README，但 mp3 仍是 0 字节
- **0 字节 mp3 不是合法 mp3 frame**，audioCtx.play() 会触发 onError；虽然 ringtone.ts 有 onError 兜底（不阻塞），但严格意义上"教训规避"不彻底
- silent.wav (45B) / marker (67B) 都是**真最小有效文件**，唯独 mp3 是 0 字节，是不一致的处理

**为什么必修而不是归 P9**：
- silent.wav 45B 都能做到"最小有效"，mp3 也应该能做到（或至少给一个 ID3v2 header 占位）
- "P5/P6 教训规避"是 V2.0 工作流的核心约束，**不能因为有 audioCtx.onError 兜底就放任**
- 修复成本：1 分钟（生成或下载一个 ≤ 200B 的极简 mp3，commit 1 次）

**修法**：
1. 用任意工具生成一个 ≤ 1KB 的最小有效 MP3（推荐 0.1 秒静音 mp3，~150B）
   - ffmpeg 命令：`ffmpeg -f lavfi -i "anullsrc=r=8000:cl=mono" -t 0.1 -b:a 8k new-dispatch.mp3`
   - 或者下载任意短铃声 mp3
2. 替换 `骑手端/src/static/audio/new-dispatch.mp3`
3. 更新 `骑手端/src/static/README.md` 中 mp3 那一行的字节数与状态描述

---

### R-02 [P3 必归 P9] Sass `[legacy-js-api]` 警告

**位置**：`骑手端/` build:h5 输出 15+ 行 `DEPRECATION WARNING [legacy-js-api]: The legacy JS API is deprecated and will be removed in Dart Sass 2.0.0.`

**问题**：
- sass-loader 内部用了 legacy JS API（与 @import 无关）
- 与 P6/R-03 同款，跨整个 monorepo 影响 P5/P6/P7 三端

**为什么归 P9 而不是本轮修**：
- **Agent 不能独立修**：需要升级 `@dcloudio/vite-plugin-uni` 到支持 Modern API 的版本
- 升级 vite-plugin-uni alpha 版本可能引入 break change，影响 P5 用户端 / P6 商户端 / P7 骑手端 三端构建
- 归 P9 集成测试部署阶段统一升级 + 三端回归 → 更合理

---

### L7-01~L7-14（14 项必归 P9，Agent 物理不可修）

| 类别 | 编号 | 不可修原因 |
|---|---|---|
| 真机率证 | L7-01 (V7.23 iOS) / L7-02 (APK/IPA 大小) / L7-03 (冷启动 / CPU / 耗电) / L7-11 (4 款主流国产真机) / L7-13 (小米/华为权限) | 需要真实 iOS/Android 设备 + HBuilderX 云打包 |
| SDK key 注入 | L7-05 (高德) / L7-06 (极光) / L7-07 (Sentry DSN) / L7-12 (阿里云号码中心) | 需要真实第三方账号 + appKey 申请 |
| nativePlugin 真编 | L7-04 | 需要 HBuilderX 云打包真集成（仅 IDE 操作）|
| UI 资源 | L7-08 (mp3) / L7-09 (marker PNG) | 需设计师产出真资源（占位代码层已就位）|
| E2E | L7-10 | 需要真机录屏 + 测试人员签字 |
| 后端联动 | L7-14 (健康证到期提醒)| 需要后端定时任务调度 |

---

## 四、决议

| 项 | 处理 |
|---|---|
| **R-01** | **本轮 R1 必修** 1 项（补 mp3 占位）|
| R-02 | 必归 P9 工具链 |
| L7-01~L7-14 | 必归 P9 集成测试部署 |
| 其他 | 全部已通过，无需变更 |

**P7 状态**：🟡 R1 修复 1 项后 → ✅ PASS

---

## 五、给 Agent 的 R1 修复提示词

详见 `docs/P7_骑手端开发/P7_R1_修复提示词.md`
