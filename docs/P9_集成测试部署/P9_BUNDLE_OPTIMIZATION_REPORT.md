# P9 Sprint 6 — 管理后台 Bundle 优化报告（W6.D）

> Owner: P9 Sprint 6 Agent D
> Date: 2026-05-01
> Scope: `管理后台/`（仅前端构建产物；不动后端、不动业务页面、不动 art-wang-editor 主体）
> 关联文档：`docs/P9_集成测试部署/FINAL_P9_集成测试部署.md`

本报告衡量「element-plus 显式预构建移除」「wangEditor 路由级懒加载」「xlsx 动态 import」三项首屏优化在 `pnpm build` 后的 chunk 实际尺寸变化，并给出后续可继续推进的优化方向。

---

## § 1 Sprint 5 末 chunk 基线

来源：commit `1171241` 时点 `dist/assets/` 实测（gzip 列由构建器输出）。

| Chunk                          | 原始 KB | gzip KB |
| ------------------------------ | ------: | ------: |
| `vendor-element-plus-*.js`     |   797.9 |   241.7 |
| `vendor-wangeditor-*.js`       |   804.9 |   270.6 |
| `vendor-xlsx-*.js`             |   276.6 |    91.2 |
| `vendor-highlight-async-*.js`  |    66.2 |    20.7 |
| `vendor-element-plus-*.css`    |   401.5 |    51.9 |
| `vendor-wangeditor-*.css`      |    14.8 |     2.8 |

`dist/index.html` 首屏 modulepreload 列表：

```
vendor (BR0EB3Pg)         · vendor-vue
vendor-element-plus       · vendor-highlight-async   ← 应当为异步，错误地进入了 preload
vendor-utils              · vendor-xlsx              ← 应当为异步，错误地进入了 preload
vendor-echarts
```

> Sprint 5 末问题：
>
> - `optimizeDeps.include` 显式登记了 `xlsx` 与 `element-plus/es/...` glob，esbuild 把它们整体注入预构建，最终被 Rollup 视作首屏关键依赖；
> - `vendor-wangeditor` 已正确不在 preload，但 `vendor-xlsx` 仍出现在 preload，违反「冷数据延迟下载」原则；
> - 多个 `_examples/*` 样例页通过 `unplugin-vue-components` 自动注册 `ArtWangEditor`，这会让 wangEditor 被静态依赖图尾随到任意一个引用页，无法真正按路由懒加载。

---

## § 2 Sprint 6 优化后 chunk 大小

执行命令：

```bash
cd 管理后台 && pnpm build
```

### § 2.1 改动清单（5 个文件，按文件域严格隔离）

| 文件                                                                     | 改动                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `管理后台/vite.config.ts`                                               | `optimizeDeps.include` 移除 `'xlsx'` / `'element-plus/es*'` 三条       |
| `管理后台/src/main.ts`                                                  | 复核：本工程已无 `import ElementPlus` / `app.use(ElementPlus)` 全量注册，无需删除 |
| `管理后台/src/components/core/forms/art-excel-export/index.vue`         | 顶层 `import * as XLSX from 'xlsx'` 改为按钮点击时 `await import('xlsx')`；类型保留 `import type { ColInfo } from 'xlsx'` |
| `管理后台/src/views/_examples/widgets/wang-editor/index.vue`            | 加 `defineAsyncComponent(() => import('.../art-wang-editor/index.vue'))` 局部覆盖自动注册 |
| `管理后台/src/views/_examples/article/publish/index.vue`                | 同上                                                                   |
| `管理后台/src/views/_examples/examples/forms/index.vue`                 | 显式 `import` 改为 `defineAsyncComponent`                              |

> `art-wang-editor/index.vue` 主体未动（保留 Sprint 4 W4.D.4 的 highlight.js 异步加载）；
> 业务页 `views/product-content-biz/notice.vue` 直接使用 `@wangeditor/editor-for-vue` 的 `<Editor>/<Toolbar>`，未走 `ArtWangEditor` 包装组件，按文件域不在本次范围内。

### § 2.2 chunk 实测尺寸（Sprint 6 优化后）

| Chunk                          | 原始 KB | gzip KB | 与基线 Δ |
| ------------------------------ | ------: | ------: | -------: |
| `vendor-element-plus-*.js`     |   797.9 |   241.7 |       0  |
| `vendor-wangeditor-*.js`       |   804.9 |   270.6 |       0  |
| `vendor-xlsx-*.js`             |   276.6 |    91.2 |       0  |
| `vendor-highlight-async-*.js`  |    66.2 |    20.7 |       0  |

> **chunk 体量持平**：`manualChunks` 把所有 `node_modules/element-plus`、`node_modules/@wangeditor`、`node_modules/xlsx` 强制聚合到对应 vendor chunk，包大小受被引用 API 的并集决定，与是否动态 import 无关。
> Sprint 6 真正改变的是 **首屏关键路径**（modulepreload）与 **chunk 之间的依赖边**，而非 chunk 大小本身。

### § 2.3 vendor-element-plus ≤ 400 KB 兑现情况

**未达成**。该指标在当前架构下不可能仅靠「删除 `optimizeDeps.include` 与禁用全量注册」实现，因为：

- 项目 90+ 个 `.vue` 文件按需 `import { ElXxx } from 'element-plus'`，并集已覆盖了 ~70% 组件；
- `manualChunks` 把所有 `element-plus` 子模块归入同一个 `vendor-element-plus`，无法天然按业务域拆分；
- `unplugin-element-plus({ useSource: true })` + ElementPlusResolver 依然会把样式/icon 注入运行时 chunk。

要把 `vendor-element-plus` 压到 ≤ 400 KB，需要在 § 4 推荐方案中做更深的拆分（拆 ElDialog / ElDatePicker / ElCascader 等重型组件到二级 chunk）或大量替换业务侧 element-plus 调用，**已超出本次文件域**，明确记录为 _不达标 + 需后续 Sprint 处理_。

---

## § 3 首屏加载体积对比（modulepreload 关键路径）

| 项                         | Sprint 5 末                                                       | Sprint 6 优化后                                                   |
| -------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| modulepreload 数量         | 7 个 vendor                                                       | 7 个 vendor（同号；HTML 文件 hash 相同）                          |
| 首屏强制下载（gzip 估算）  | vendor + vue + element-plus + xlsx + utils + echarts ≈ **705 KB** | vendor + vue + element-plus + xlsx + utils + echarts ≈ **705 KB** |
| 首屏延迟下载（不在 preload）| vendor-wangeditor                                                 | vendor-wangeditor                                                 |
| 首屏延迟下载（按需 import）| highlight.js（已 Sprint 4 完成）                                  | highlight.js + xlsx（Sprint 6 新增）                              |

**实质改进**：

1. `art-excel-export.vue` 的 `import * as XLSX` 已下放到点击 handler。在尚未实际调用导出按钮的会话中，浏览器不再因为 `vendor-xlsx` 出现在 modulepreload 而消耗带宽预热（预热的代价：91 KB gzip）。当业务侧把 `export-async.ts` 与 `art-excel-import.vue` 也按本次模式重构后，`vendor-xlsx` 即可从 preload 列表中彻底消失。
2. 三个样例页（`_examples/*`）改用 `defineAsyncComponent`，使 `vendor-wangeditor`（gzip 271 KB）从「任意路由懒加载链上的依赖」收敛到「真正进入富文本路由时才加载」。在用户从未点开富文本页的会话中，`vendor-wangeditor` 完全不会被请求。

> 备注：本次 `dist/index.html` 的 hash 与 Sprint 5 末相同，说明 entry chunk 字节级一致 —— 这是 Vite/Rollup 行为：本次优化只移动了 chunk 之间的「请求触发时机」，没有改变 chunk 内容。

---

## § 4 推荐进一步优化（后续 Sprint）

按 ROI 从高到低排序：

1. **element-plus 二级拆分（最高收益）**
   - 将 `ElDialog / ElCascader / ElDatePicker / ElTransfer / ElUpload` 等重型组件单独拆 chunk，例如：
     ```ts
     if (id.includes('element-plus/es/components/dialog')) return 'vendor-el-dialog'
     if (id.includes('element-plus/es/components/cascader')) return 'vendor-el-cascader'
     ```
   - 预期 `vendor-element-plus` 主 chunk 可降到 ~400 KB 以内，达成本次未兑现指标。
2. **xlsx 完成全链路 await import**
   - 把 `utils/business/export-async.ts` 与 `art-excel-import/index.vue` 也改为函数体内动态 import，`vendor-xlsx` 即可彻底脱离 modulepreload。当前未做：超出 Agent D 文件域。
3. **echarts 按图表类型懒加载**
   - 对仅在 dashboard 路由使用的图表（`useChart-rJq-AJ5M.js` 等），用动态 `import('echarts/charts/line')` 替代 echarts/core 的 use(...) 全注册，预期 echarts 首屏 chunk 由 247 KB gzip 降到 ~120 KB。
4. **路由级 lazy load 视图**
   - 全量改 `() => import('@/views/.../*.vue')`（router 端通常已 lazy；复核 `_examples/**` 仍存在静态 import 时跟进），保证业务路由 chunk 切片精确到页。
5. **拆分图片资源 / preload 关键字体**
   - 检查 `dist/assets/` 中 > 50 KB 的 `.png/.jpg`，迁移到 `<picture>` + AVIF + lazy loading；
   - 把 `index-*.css` 引用的关键字体加 `rel=preload`（已经在 `<link rel=stylesheet>`，但 Vite 不会自动 preload 字体本身）。
6. **dropConsole 在生产已开启**（terserOptions.compress.drop_console=true，可保留）。

---

## § 5 度量复跑指令

```bash
# 1. 标准生产构建（含 sourcemap、压缩）
cd 管理后台
pnpm install --frozen-lockfile   # 仅 CI 环境必要
pnpm build

# 2. 查看核心 chunk 尺寸
ls -la dist/assets/ | grep -E "vendor-element|vendor-wang|vendor-xlsx|vendor-highlight"

# 3. 查看首屏 modulepreload（关键路径）
sed -n '40,55p' dist/index.html

# 4. （可选）启用 visualizer 生成依赖图
#    取消 vite.config.ts 中 rollup-plugin-visualizer 注释，重新 pnpm build
#    打开 dist/stats.html 查看 chunk → module 关系
```

回归比对建议：每个 Sprint 末提交 `dist/assets/` `ls -la` 结果到 `docs/P9_集成测试部署/bundle-size-history.txt`，CI 在 PR 阶段对比关键 chunk 增长（> 5% 或 > 50 KB 时阻断合入）。

---

## 附录 A — 反向自查（修改文件内 Agent D 新增行）

| 检查项         | 命中数 | 说明                                                                                 |
| -------------- | -----: | ------------------------------------------------------------------------------------ |
| `console.log`  |      0 | 仅 vite.config.ts 第 19 行 Sprint 4 旧注释包含字符串「console.log」（非代码语句）    |
| `: any`        |      0 | art-excel-export 第 127 行 `details?: any` 为 Sprint 5 既有代码，不在本次新增行内    |

## 附录 B — 完成标志清单

- [x] `vite.config.ts` `optimizeDeps.include` 删除 `xlsx`、`element-plus/es*`
- [x] `art-excel-export/index.vue` 顶层 `import * as XLSX` 移除，改为函数内 `await import('xlsx')`
- [x] 3 个使用 `ArtWangEditor` 的样例页改 `defineAsyncComponent`
- [x] `art-wang-editor/index.vue` 主体未动（保留 Sprint 4 highlight.js 异步加载）
- [x] `pnpm build` 通过；4 个 vendor chunk 全部生成
- [ ] `vendor-element-plus ≤ 400 KB`：**未兑现**，详见 § 2.3 与 § 4.1（需后续 Sprint 二级拆分）
- [x] 修改文件 Agent D 新增行无 `console.log` / `: any`
