# CONSENSUS_P8_管理后台开发

## 一、范围共识
- 10 大模块、80+ 页面全部落地
- 基于 `管理后台/`（art-design-pro 精简版）增量开发
- 沿用原有登录页、用户菜单、主题切换、RBAC 结构
- 依赖：P4 全量业务接口

## 二、技术方案共识

### 2.1 工程沿用
- Vue 3 + Vite 7 + TypeScript
- Element Plus 2.11 + Tailwind CSS 4
- Pinia 3 + pinia-plugin-persistedstate
- Vue Router 4
- echarts 6（已装）
- wangeditor（已装）
- xlsx（已装）
- xgplayer（已装）
- axios（已装）

### 2.2 新增依赖
- `element-plus/es/components/*` 按需导入（已有 `unplugin-element-plus`）
- `vue-json-viewer`：JSON 日志查看
- `vxe-table`（可选）：超大表格；或继续用 Element Plus 虚拟表格

### 2.3 菜单与路由
按 10 模块顶级分组，路由文件组织：
```
src/router/routes/asyncRoutes.ts
├── dashboard
├── user
├── merchant
├── rider
├── order
├── product / content / review
├── ops
├── finance
├── system
└── cs / risk
```
每个路由节点加 `meta.permission` 权限码；后端菜单树动态生成。

### 2.4 权限
- 登录成功后拉取 `menus` + `permissions`（权限码数组）
- 路由守卫按 `meta.permission` 校验
- 按钮级 `<BizAuth code="order:refund-audit" />` 组件
- 接口级由后端 Guard 兜底

### 2.5 统一组件
- `<BizTable />`：表格 + 分页 + 筛选 + 批量 + 导出 + 列自定义 + 高度自适应
- `<BizSearchForm />`：搜索表单自动生成
- `<BizModal />`：弹窗 + 表单统一
- `<BizConfirm />`：二次确认
- `<BizAuth />`：按钮权限
- `<BizUpload />`：图片/视频/附件
- `<BizChart />`：ECharts 封装
- `<BizStatus />`：状态标签（基于字典）

### 2.6 数据字典
- 登录后拉全量 `sys_dict`，Pinia 缓存
- `<BizStatus type="ORDER_STATUS" :code="10" />` 展示标签

### 2.7 大数据量导出
- < 1000 条：前端 xlsx 直出
- ≥ 1000 条：后端生成任务 → 写 MinIO → 返回下载链接；前端轮询

### 2.8 主题 & 国际化
- 沿用框架已有能力
- 新增页面的文案必须走 i18n（zh-CN / en-US）

## 三、交付标准
- [ ] 10 模块、80+ 页面全部实现
- [ ] 菜单树 + 路由 + 权限联动
- [ ] 数据大盘 ECharts 图表准确
- [ ] 表格搜索/筛选/分页/批量全部可用
- [ ] 审批流程可视化
- [ ] 导出 Excel + 异步任务
- [ ] 日志查询 + JSON 展开
- [ ] 响应式适配（≥ 1280px 主）
- [ ] 单测覆盖：工具类 + 关键组件 ≥ 60%
- [ ] Lighthouse Performance ≥ 85

## 四、风险与应对
| 风险 | 应对 |
|---|---|
| 页面数量大 | 按模块并行；统一组件加速 |
| 表格性能（十万级） | 虚拟滚动 + 后端 keyset 分页 |
| 权限遗漏 | 前后端双校验；测试用例覆盖 |
| 长表单误操作 | 自动保存 + 二次确认 + 防抖 |
| 大量导出阻塞 | 异步任务 + 队列限流 |
| 实时监控抖动 | WebSocket 合并推送 + 前端节流 |

## 五、结论
- 方案锁定，进入 DESIGN
