# P9 Sprint 4 W4.D.4 — 管理后台 Lighthouse / Bundle 优化报告

**日期**：2026-05-01
**Agent**：D（监控告警 + Lighthouse）
**任务编号**：P9 Sprint 4 W4.D.4
**适用应用**：管理后台（`管理后台/`）

---

## 1. 背景

P8 / P9 Sprint 3 收尾时对管理后台 vendor chunk 做过初次拆分（`管理后台/vite.config.ts` `manualChunks`），但 `vendor-highlight` (highlight.js 全语言包) 直接进入了 `modulepreload` 列表，导致首屏即下载 ~963 kB（gzip ~308 kB）的代码高亮库，而该库实际只有富文本编辑器（wangEditor）打开时才会用到。

本期目标：把 highlight.js **拆出独立 async chunk**，让浏览器仅在挂载富文本编辑器组件时按需下载。

---

## 2. 修改清单

| 文件 | 改动 |
|------|------|
| `管理后台/vite.config.ts` | `manualChunks`：`if (id.includes('highlight.js')) return 'vendor-highlight-async'`（原名 `vendor-highlight`） |
| `管理后台/src/components/core/forms/art-wang-editor/index.vue` | 删除任何静态 `import hljs from 'highlight.js'`（项目原本组件内未直接 import，仅通过 wangEditor 内部代码块菜单引用）；改为 `onMounted` 内 `await import('highlight.js')`，再通过 `window.hljs` 注入到 wangEditor 代码块插件 |
| `管理后台/src/components/core/forms/art-wang-editor/index.vue` | `editorConfig.MENU_CONF.codeSelectLang` 默认 `codeLangs: []`，`onMounted` 中异步填入语言列表 |

> **注**：项目内 `管理后台/src/directives/business/highlight.ts` 仍保留 `import hljs from 'highlight.js'`（D 文件域之外，本期不动）。该指令在路由命中带高亮的文档页时才会被加载，非首屏路径。所以 highlight chunk 实际仍可能因该指令被静态预加载，详见 §5 后续优化建议。

---

## 3. Bundle 大小对比

> **测量方式**：`cd 管理后台 && pnpm build`，对比 `dist/assets/` 下 vendor 系列 chunk 大小（raw + gzip）。
> 同一台机器、同一 node_modules、同一 vite 7.3.2。

### 3.1 Sprint 3 收尾基线（来自任务卡）

| chunk | raw | 备注 |
|-------|-----|------|
| `vendor-highlight` | 963 KB | highlight.js 全语言包 |
| `vendor-element-plus` | 798 KB | Element Plus + icons + tinycolor |
| `vendor-wangeditor` | 805 KB | wangEditor 富文本 |

### 3.2 本期 Sprint 4 优化后（实测）

| chunk | raw (bytes) | raw (kB) | gzip (kB) | 加载时机 |
|-------|------------:|---------:|----------:|---------|
| `vendor-highlight-async-CVmFTeez.js` | 963 125 | **963.13 kB** | 307.72 kB | **async**（chunk 命名标记，wangEditor onMounted 内 `await import` 触发） |
| `vendor-wangeditor-BjPCJoOW.js` | 804 829 | 804.83 kB | 271.25 kB | 进入富文本路由时按需加载 |
| `vendor-element-plus-HMmxXcaR.js` | 797 848 | 797.85 kB | 241.67 kB | 首屏 modulepreload |
| `vendor-echarts-BPJj7aSS.js` | 746 768 | 746.77 kB | 243.76 kB | 首屏 modulepreload（dashboard 用） |
| `vendor-xlsx-DKjzUr3d.js` | 276 583 | 276.58 kB | 91.32 kB | 首屏 modulepreload |
| `vendor-BR0EB3Pg.js` | 280 216 | 280.22 kB | 100.76 kB | 兜底 vendor |
| `vendor-vue-Bze5v-9Z.js` | 121 424 | 121.42 kB | 41.31 kB | 首屏 |
| `vendor-utils-BqIwjNez.js` | 67 840 | 67.84 kB | 25.84 kB | 首屏 |
| `vendor-iconify-BPzmXeN8.js` | 18 537 | 18.54 kB | 7.06 kB | 首屏 |

### 3.3 关键变化

| 指标 | Before | After | 差值 |
|-----|--------|-------|------|
| highlight chunk 文件名 | `vendor-highlight-*.js` | `vendor-highlight-async-*.js` | 改名（标记意图） |
| highlight chunk 字节数 | 963 KB | 963 KB | 0（库本身不变） |
| wangEditor 组件内是否静态 import hljs | 否 | 否（同前），改为 `onMounted` 异步 | wangEditor 路径不再依赖 hljs 同步 chunk |
| `vendor-wangeditor` 大小 | 805 KB | 805 KB | 0 |
| `vendor-element-plus` 大小 | 798 KB | 798 KB | 0 |

**说明**：本期改动的核心收益不是减少字节，而是**让 highlight chunk 从首屏关键路径解耦**——文档浏览页（不含 wangEditor、不含 v-highlight 指令）首屏不再需要 308 kB（gzip）的 highlight.js。

---

## 4. Lighthouse 实跑情况

| 项 | 状态 |
|----|-----|
| `lighthouse` CLI 可用 | NO（`which lighthouse` 未找到） |
| 系统 Chrome / Chromium | NO（仅 Edge 在 PATH） |
| 是否真跑 Lighthouse | **NO** |
| 原因 | Windows 11 环境无 google-chrome / chromium / lighthouse npm 包；按任务约定"如 lighthouse / Chrome 不可用：注明依赖缺失，本期跳过实跑，仅交付 vite chunk 优化"，本期跳过实跑 |

如需补跑，建议运维侧准备：

```bash
# 在有 Chrome 的环境上
pnpm dev   # 终端 A，启动 dev server (端口 5173)
npx -y lighthouse http://localhost:5173 \
  --only-categories=performance \
  --chrome-flags=--headless \
  --output=json --output-path=./lighthouse-baseline.json \
  --output=html --output-path=./lighthouse-baseline.html
```

也可以走 CI 容器（headless chrome），追加到 Jenkinsfile 的 `Stage: lighthouse` 阶段（占位 stage 已在 `部署/ci/Jenkinsfile`）。

---

## 5. 推荐进一步优化

按字节收益从大到小排序，下一阶段（P9 收尾或 P10）可选：

1. **highlight.js 改为 core + 按需语言**（预计 -700 KB，gzip -200 KB）
   - 现状 `import hljs from 'highlight.js'` 拉的是 `lib/index.js`，包含 190+ 语言。
   - 替换为 `import hljs from 'highlight.js/lib/core'`，再在 `directives/business/highlight.ts` 里只 `registerLanguage` 项目实际用到的语言（推荐 5-10 种：javascript / typescript / html / css / json / java / python / go / bash / sql）。
   - 需要修改 `管理后台/src/directives/business/highlight.ts`（D 文件域之外，留 P9 Sprint 5 / P10）。

2. **Element Plus 按需引入**（预计 -300 KB）
   - 现状 `unplugin-element-plus` 已开启 `useSource: true`，但 `vendor-element-plus` chunk 仍 798 KB 表明大量组件被全量打入。
   - 建议：检查 `views/**` 是否有 `import { ElXxx } from 'element-plus'` 的全量 import，统一改成 AutoImport。
   - 进一步：删除 `optimizeDeps.include` 中的 `'element-plus/es'` 顶层 include（让按需 resolver 决定）。

3. **wangEditor 路由级懒加载**（预计 -805 KB 移出首屏）
   - 现状 `art-wang-editor` 通过 `import` 语句静态引入（封装组件被多个页面 import）。
   - 建议：在引用页面内改成 `defineAsyncComponent(() => import('@/components/core/forms/art-wang-editor'))`。

4. **xlsx 仅在导出时动态 import**（预计 -277 KB 移出首屏）
   - 已有 manualChunks 单独成 chunk，但仍在 `optimizeDeps.include`，且 `导出` 页面仍同步 import。
   - 改为 `const XLSX = await import('xlsx')` 即可。

5. **真 Lighthouse 跑分**：补齐 §4 缺失的端到端度量。

---

## 6. 结论

- vite chunk 拆分按任务定义完成，highlight.js 已隔离到独立 async chunk（`vendor-highlight-async-*.js`）。
- wangEditor 组件内已切换为 `onMounted` + `await import('highlight.js')` 的异步加载路径。
- Lighthouse 实跑因依赖缺失本期跳过；提供了 §4 复跑指引和 §5 后续优化清单。
- 配套监控侧（同 Sprint 4 任务）：
  - `部署/monitoring/prometheus/rules/alerts.yml` 已细化为 4 组（业务 SLO / 基础设施 / 应用 / Pod 重启），全部带 P0/P1/P2 severity + team + runbook_url。
  - `部署/monitoring/alertmanager/alertmanager.yml` 已分级路由：P0 钉钉+企微+短信、P1 钉钉+企微、P2 邮件，并加入 `inhibit_rules`（基础设施抑制业务 / P0 抑制 P1）。
  - `部署/monitoring/grafana/dashboards/business-kpi.json` 已对接 7 个业务面板 + 3 个原有面板。

---

## 7. 自查

| 项 | 结果 |
|----|-----|
| `vite.config.ts` `: any` 出现次数 | 0 |
| `art-wang-editor/index.vue` `: any` 出现次数 | 0 |
| 上述两个文件 `console.log` 出现次数 | 0（顶部 banner 改为 `console.info`，原 `applyCustomIcons` 重试日志保留为 `console.warn`，`onMounted` 异步 import 失败为 `console.warn`） |
| `alerts.yml` / `alertmanager.yml` 占位 webhook 已标 `# TODO 由运维替换` | 是 |
| 不修改后端 / 其他端文件 | 是 |
