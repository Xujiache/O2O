# DESIGN_P8_管理后台开发

## 一、工程结构（在已有 `管理后台/src/` 基础上扩展）

```
管理后台/src/
├── api/
│   ├── business/              # 本期新增
│   │   ├── dashboard.ts
│   │   ├── user.ts
│   │   ├── merchant.ts
│   │   ├── rider.ts
│   │   ├── shop.ts
│   │   ├── product.ts
│   │   ├── order.ts
│   │   ├── content.ts
│   │   ├── review.ts
│   │   ├── marketing.ts
│   │   ├── region.ts
│   │   ├── finance.ts
│   │   ├── system.ts
│   │   └── risk.ts
│   └── （已有 index/system 等）
├── components/
│   ├── biz/                   # 本期新增统一组件
│   │   ├── BizTable.vue
│   │   ├── BizSearchForm.vue
│   │   ├── BizModal.vue
│   │   ├── BizConfirm.ts
│   │   ├── BizAuth.vue
│   │   ├── BizUpload.vue
│   │   ├── BizChart.vue
│   │   ├── BizStatus.vue
│   │   ├── BizExport.vue
│   │   ├── BizPolygonEditor.vue
│   │   ├── BizOrderFlow.vue    # 订单状态流程图
│   │   └── BizJsonViewer.vue
├── views/
│   ├── dashboard/              # 本期新增
│   │   ├── overview.vue
│   │   ├── trend.vue
│   │   ├── ops.vue
│   │   └── monitor.vue
│   ├── user/
│   │   ├── list.vue
│   │   ├── detail.vue
│   │   └── risk.vue
│   ├── merchant/ { audit, list, detail, risk }
│   ├── rider/ { audit, list, detail, transfer-audit, reward, level-config, risk }
│   ├── shop/ { list, notice-audit }
│   ├── order/ { list, detail, cancel-refund-audit, complaint, arbitration, export }
│   ├── product/ { list, violation, category }
│   ├── content/ { banner, quick-entry, notice, hot-search }
│   ├── review/ { list, appeal }
│   ├── ops/ { coupon, promotion, push, push-template, region }
│   ├── finance/ { overview, settlement-rule, settlement-record, withdraw-audit, bill, invoice-audit, reconciliation }
│   ├── system/ { admin, role, permission, dict, operation-log, api-log, system-config, app-config }
│   ├── cs/ { ticket, arbitration }
│   └── risk/ { rule, risk-order, cheat, record }
├── router/
│   └── routes/business.ts      # 本期新增异步路由
├── store/
│   ├── business/
│   │   ├── dict.ts
│   │   ├── perm.ts
│   │   └── app-config.ts
├── locales/
│   ├── zh-CN/business.ts
│   └── en-US/business.ts
├── types/business/...
└── utils/
    ├── export.ts
    ├── exportAsync.ts
    ├── format.ts（手机号/身份证/金额脱敏）
    └── ws-admin.ts
```

## 二、路由示例（business.ts）

```ts
export const businessRoutes: RouteRecordRaw[] = [
  {
    path: '/dashboard',
    component: Layout,
    meta: { title: '数据大盘', icon: 'Odometer' },
    children: [
      { path: 'overview', component: () => import('@/views/dashboard/overview.vue'),
        meta: { title: '概览', permission: 'dashboard:overview' } },
      { path: 'trend', component: () => import('@/views/dashboard/trend.vue'),
        meta: { title: '趋势', permission: 'dashboard:trend' } },
      // ...
    ]
  },
  // 其他 9 大模块...
];
```

## 三、模块页面详设

### 3.1 数据大盘（§3.4.1）

**overview.vue 布局**：
```
┌ 核心 KPI 4 张卡：实时订单量 | 今日交易额 | 累计用户数 | 累计商户数 ┐
├ 第二行：在线骑手 | 今日配送完成率 | 待处理仲裁 | 待审核入驻        ┤
├ 主图：订单量趋势（24h 实时）+ 交易额趋势（折线图）                 ┤
├ 左下：热门商家 Top 10；右下：热门商品 Top 10                      ┤
└ 底部：异常订单实时表（最新 20 条）                                ┘
```
实时数据：WebSocket `/ws/admin/dashboard` 每 5s 推送；前端 debounce。

### 3.2 用户管理（§3.4.2）

**list.vue** 用 `<BizTable />`：
- 搜索：昵称/手机号/注册时间/订单数量
- 列：id/昵称/手机号(脱敏)/注册渠道/订单数/消费总额/状态
- 行操作：详情、封禁/解封

**detail.vue** Tab 页：基础信息 / 订单记录 / 消费数据 / 地址 / 优惠券 / 余额明细 / 投诉

**risk.vue**：黑名单列表 + 添加/移除

### 3.3 商户管理（§3.4.3）

**audit.vue**：待审核列表 + 资质详情弹窗（多图预览） + 通过/驳回（驳回必填原因）

**list.vue**：商户列表 + 店铺数量 + 状态 + 营业状态 + 编辑/封禁

**shop/list.vue**：全平台店铺，支持按城市/区域/状态筛选，编辑配送范围、公告审核

### 3.4 骑手管理（§3.4.4）

**audit.vue**：类似商户审核

**list.vue**：骑手列表（在线状态、接单区域、等级筛选）

**detail.vue**：
- 订单记录
- 配送轨迹回放（地图 + 时间轴播放）
- 准时率 / 好评率 / 投诉统计
- 奖惩记录

**reward.vue**：奖惩配置（规则引擎）
- 规则：单均配送时长 ≥ X 分钟罚 N 元；连续 7 天满 M 单奖 P 元
- 可批量发放奖励

**level-config.vue**：1~5 级配置（升级条件、派单加权）

### 3.5 订单管理（§3.4.5）

**list.vue**：
- 超强筛选：订单号/手机号/状态/类型（外卖+跑腿 4 子类）/时间/城市/金额范围
- 批量导出（异步）
- 行操作：详情、强制取消、仲裁

**detail.vue**：
```
┌ 订单基础信息 ┐
├ 状态流程图（BizOrderFlow 组件，横向） ┤
├ 商品清单 / 跑腿服务信息               ┤
├ 支付信息 + 退款记录                   ┤
├ 配送轨迹回放                          ┤
├ 用户 / 商家 / 骑手 卡片                ┤
├ 操作日志                              ┤
└ 操作按钮（强制取消、仲裁、退款） ┘
```

### 3.6 商品与内容（§3.4.6）

**product/list.vue**：全平台商品（关键词/店铺/分类/销量）

**product/violation.vue**：违规商品处置（强制下架 + 通知商户）

**content/banner.vue**：CRUD + 图上传 + 排序 + 有效期 + 城市定向

**content/notice.vue**：富文本（wangeditor）+ 发布/撤回 + 受众选择

**review/list.vue**：评价审核 + 违规评价隐藏/删除

**review/appeal.vue**：商户/骑手差评申诉审核

### 3.7 运营管理（§3.4.7）

**ops/coupon.vue**：
- 优惠券模板 CRUD
- 发放策略：手动批量 / 定时 / 触发式（注册/邀请/订单返券）
- 数据：领取量/核销率/拉动 GMV

**ops/promotion.vue**：满减/折扣/拼单/邀请/新客 配置（规则阶梯可视化）

**ops/push.vue**：
- 定向推送（全体/城市/用户标签）
- 多通道（订阅消息/APP/短信/站内）
- 模板选择

**ops/region.vue**：城市开启/关闭、运营参数（基础配送费、阶梯、跑腿定价公式）

### 3.8 财务管理（§3.4.8）

**overview.vue**：
- 营收、分佣、退款、流水趋势（折线图）
- 按日/周/月切换

**settlement-rule.vue**：分账规则 CRUD（按场景/城市/店铺维度 override）

**settlement-record.vue**：分账记录查询 + 异常重跑

**withdraw-audit.vue**：
- 列表 + 筛选
- 详情弹窗（申请人/金额/银行卡脱敏/申请时间）
- 审核通过/驳回；支持批量通过

**bill.vue**：商户/骑手账单对账

**invoice-audit.vue**：发票申请审核 + 开票上传 PDF

**reconciliation.vue**：对账表 + 差异查看 + 导出

### 3.9 系统管理（§3.4.9）

**admin.vue**：管理员 CRUD + 分配角色

**role.vue**：角色 CRUD + 权限树分配

**permission.vue**：权限点 CRUD（菜单/按钮/接口）

**dict.vue**：字典 CRUD（订单状态等）

**operation-log.vue**：操作日志（模块/动作/ip/时间筛选；JSON 展开）

**api-log.vue**：接口日志（trace_id/path/status/cost/错误）

**system-config.vue**：平台基础信息

**app-config.vue**：支付、地图、推送、安全规则（JSON/YAML 可视化编辑）

### 3.10 客服与风控（§3.4.10）

**cs/ticket.vue**：工单列表 + 分配 + 跟进 + 关闭

**cs/arbitration.vue**：仲裁申请列表 + 详情 + 判定（支持用户/商户/骑手）+ 退款录入

**risk/rule.vue**：风控规则配置（频率限制、异常消费、刷单特征）

**risk/risk-order.vue**：风险订单列表 + 人工复核

**risk/cheat.vue**：刷单/套现识别结果（算法打标）

**risk/record.vue**：违规处理记录 + 申诉入口

## 四、组件设计

### 4.1 BizTable（统一封装）
```vue
<BizTable
  :columns="columns"
  :fetch="api.user.list"
  :search-schema="searchSchema"
  :batch-actions="[{ label:'封禁', onClick }]"
  :row-actions="[{ label:'详情', to:'/user/detail/:id' }]"
  export-api="api.user.export"
  permission-prefix="user"
/>
```
内部：
- 搜索区 BizSearchForm 自动生成
- 分页 keyset / offset 可选
- 列自定义（显示/隐藏/排序/固定）
- 批量选择 + 按钮权限
- 导出（< 1000 同步 / ≥ 1000 异步）

### 4.2 BizOrderFlow
- 横向节点：下单 → 支付 → 接单 → 出餐 → 取件 → 配送 → 送达 → 完成
- 每个节点显示时间 + 操作人
- 当前节点高亮，已完成打勾

### 4.3 BizUpload
- 支持 图片/视频/附件
- 直传 MinIO/OSS（通过后端 STS）
- 多选 + 拖拽 + 预览 + 水印预览

### 4.4 BizChart
- 封装 ECharts，按 props 决定图表类型（line/bar/pie/radar/map）
- 自动响应式 + 主题切换

## 五、状态管理

### 5.1 `store/business/dict.ts`
```ts
export const useDictStore = defineStore('dict', {
  state: () => ({ dictMap: {} as Record<string, DictItem[]> }),
  actions: {
    async loadAll() { this.dictMap = await api.system.dictAll(); },
    getLabel(type, code) { ... }
  },
  persist: true
});
```

### 5.2 `store/business/perm.ts`
```ts
{ menus: [], permissions: [] as string[] }
has(code): boolean
```

## 六、国际化
- `locales/zh-CN/business.ts` + `en-US/business.ts`
- 按模块组织命名空间：`dashboard.*`、`user.*` 等

## 七、性能
- 路由懒加载（所有业务页面）
- 图表按需加载 ECharts 子模块
- 表格虚拟滚动（≥ 200 行数据）
- 图片懒加载 + WebP
- 首屏路由 prefetch

## 八、安全
- 所有请求带 token + X-Sign
- 超时再认证
- 敏感字段脱敏展示（手机号/身份证/银行卡）
- 操作日志覆盖全量写操作
- Content-Security-Policy（部署时配置）

## 九、产物
- 10 模块、80+ 页面 Vue 源码
- 统一组件 12+
- i18n 双语文件
- 管理后台 README 增量更新
- 打包产物 `dist/`
