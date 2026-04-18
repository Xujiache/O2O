# ALIGNMENT_P8_管理后台开发

> 本文件用于 P8 阶段**需求对齐**，严格基于 PRD §3.4 平台管理后台（Web 端）。

## 一、PRD 原文回溯

### 1.1 端定位（§3.4 / §5）
- 技术栈：Vue3 + Vite + Element Plus + Pinia + Vue Router
- 已有框架：`管理后台/`（基于 Art Design Pro 精简版），默认账号 `Super / 123456`
- 角色：平台管理员 —— 运营、管控、审核、风控

### 1.2 十大模块（PRD §3.4.1 ~ §3.4.10）

| 编号 | 模块 | PRD 章节 | 核心功能 |
|---|---|---|---|
| M1 | 数据大盘 | §3.4.1 | 核心数据概览、趋势图、运营数据、实时监控 |
| M2 | 用户管理 | §3.4.2 | 用户列表/详情、风控 |
| M3 | 商户管理 | §3.4.3 | 入驻审核、商户列表、店铺管理、风控 |
| M4 | 骑手管理 | §3.4.4 | 入驻审核、骑手列表、配送管理、奖惩、风控 |
| M5 | 订单管理 | §3.4.5 | 全量订单、详情、异常处理、导出 |
| M6 | 商品与内容管理 | §3.4.6 | 商品、内容（Banner/运营位/公告/热搜/快捷入口）、评价 |
| M7 | 运营管理 | §3.4.7 | 优惠活动、营销、消息推送、区域 |
| M8 | 财务管理 | §3.4.8 | 财务概览、分账、提现、账单、发票 |
| M9 | 系统管理 | §3.4.9 | 权限、字典、日志、系统设置 |
| M10 | 客服与风控 | §3.4.10 | 工单、仲裁、风控规则、违规处理 |

### 1.3 易用性要求（§4.5.3）
- 操作逻辑符合运营人员使用习惯
- 批量操作便捷、数据可视化清晰、操作有二次确认

### 1.4 兼容性（§4.2.3）
- Chrome、Edge、Firefox 最新 2 个版本

## 二、P8 范围

### 2.1 in-scope
- 基于现有 `管理后台/` 新增 10 大模块业务页面
- 统一菜单、路由、权限码、国际化（中英）
- 数据大盘：ECharts 可视化（已安装 echarts 6）
- 表格：统一封装（搜索、筛选、导出、批量）
- 表单：含审核流、二次确认、自动保存
- 文件上传：对接后端 File 模块
- 导出：`xlsx` + 大数据量分批异步导出
- 审批流程可视化（商户/骑手入驻、提现、售后仲裁）
- 富文本（已安装 wangeditor）：公告、模板
- 视频（已安装 xgplayer）：凭证播放

### 2.2 out-of-scope
- BI 系统 / 数仓（超出 P8 范围）
- 复杂报表定制（V2）
- 多租户运营分离（V2）

## 三、页面与功能清单（逐个 §3.4 展开）

### 3.1 数据大盘（§3.4.1）
- `/dashboard/overview` 数据大盘（实时数据、今日、累计）
- `/dashboard/trend` 趋势图（订单量/交易额/用户增长/商户增长）
- `/dashboard/ops` 运营数据（热门商家/商品、骑手排行、区域分布、异常统计）
- `/dashboard/monitor` 实时监控（待仲裁、待审核、异常订单）

### 3.2 用户管理（§3.4.2）
- `/user/list` 用户列表
- `/user/detail/:id` 用户详情（订单/消费/地址/券/余额/投诉）
- `/user/risk` 封禁/黑名单/异常消费

### 3.3 商户管理（§3.4.3）
- `/merchant/audit` 入驻审核
- `/merchant/list` 商户列表
- `/merchant/detail/:id` 商户详情
- `/shop/list` 店铺列表
- `/shop/notice-audit` 店铺公告审核
- `/merchant/risk` 违规/差评/投诉/保证金

### 3.4 骑手管理（§3.4.4）
- `/rider/audit` 入驻审核
- `/rider/list` 骑手列表
- `/rider/detail/:id` 骑手详情（订单/轨迹/统计）
- `/rider/transfer-audit` 转单审核
- `/rider/reward` 奖惩配置
- `/rider/level-config` 等级 & 权限配置
- `/rider/risk` 异常/黑名单

### 3.5 订单管理（§3.4.5）
- `/order/list` 全量订单
- `/order/detail/:orderNo` 订单详情（流程/支付/轨迹/用户/商家/骑手）
- `/order/cancel-refund-audit` 取消/退款审核
- `/order/complaint` 投诉订单
- `/order/arbitration` 仲裁订单 + 录入
- `/order/export` 导出

### 3.6 商品与内容（§3.4.6）
- `/product/list` 全平台商品
- `/product/violation` 违规商品
- `/product/category` 品类管理
- `/content/banner` Banner
- `/content/quick-entry` 快捷入口
- `/content/notice` 公告
- `/content/hot-search` 热搜
- `/review/list` 评价管理
- `/review/appeal` 差评申诉

### 3.7 运营管理（§3.4.7）
- `/ops/coupon` 优惠券 / 红包
- `/ops/promotion` 满减/折扣/拼单/邀请/新客
- `/ops/push` 消息推送
- `/ops/push-template` 订阅模板配置
- `/ops/region` 城市/区域/配送参数

### 3.8 财务管理（§3.4.8）
- `/finance/overview` 财务概览
- `/finance/settlement-rule` 分账规则
- `/finance/settlement-record` 分账记录
- `/finance/withdraw-audit` 提现审核
- `/finance/bill` 账单对账
- `/finance/invoice-audit` 发票审核
- `/finance/reconciliation` 对账管理

### 3.9 系统管理（§3.4.9）
- `/system/admin` 管理员
- `/system/role` 角色
- `/system/permission` 权限
- `/system/dict` 字典
- `/system/operation-log` 操作日志
- `/system/api-log` 接口日志
- `/system/system-config` 系统设置
- `/system/app-config` 支付/地图/推送/安全规则

### 3.10 客服与风控（§3.4.10）
- `/cs/ticket` 工单
- `/cs/arbitration` 仲裁
- `/risk/rule` 风控规则
- `/risk/risk-order` 风险订单
- `/risk/cheat` 刷单/套现识别
- `/risk/record` 违规处理记录

## 四、关键交互约束
- 所有敏感操作二次确认（删除、封禁、审核）
- 所有列表支持筛选 + 分页 + 批量
- 所有表单支持草稿（自动保存 localStorage）
- 导出按数据量：< 1000 同步下载；≥ 1000 异步生成链接
- 操作日志全量记录

## 五、待澄清
| 编号 | 问题 | 默认 |
|---|---|---|
| Q8.1 | 菜单分组 | 按 10 模块顶级分组 |
| Q8.2 | 多语言 | 中英文双语 |
| Q8.3 | 主题 | 白/暗双主题（沿用框架能力） |
| Q8.4 | 权限粒度 | 菜单 + 按钮 + 接口三级 |
| Q8.5 | 数据导出格式 | Excel + CSV 双选 |

## 六、对齐结论
- 10 模块、80+ 页面识别完成
- 完全基于现有 `管理后台/` 框架增量开发
- 进入 CONSENSUS
