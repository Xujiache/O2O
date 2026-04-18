---
description: 阶段 PASS 后的 git commit + push 强制流程
---

# 阶段 PASS 后 git 入库

## 触发条件

`说明文档.md` §3.1 对应阶段行由 🟡 / ⬜ 升为 🟢。

## 远端信息

- `origin`：`https://github.com/Xujiache/O2O.git`
- 主分支：`main`

## 五步固定顺序

### 1. 核对当前改动

// turbo
```powershell
git -C "c:\Users\Administrator\Desktop\O2O跑腿+外卖" status -s
```

### 2. 核对/配置 remote（首次必须）

// turbo
```powershell
git -C "c:\Users\Administrator\Desktop\O2O跑腿+外卖" remote -v
```

若无 `origin`：

```powershell
git -C "c:\Users\Administrator\Desktop\O2O跑腿+外卖" remote add origin https://github.com/Xujiache/O2O.git
```

### 3. 全量暂存

```powershell
git -C "c:\Users\Administrator\Desktop\O2O跑腿+外卖" add -A
```

### 4. 提交（严格遵循 `commitlint.config.cjs`）

- **type** ∈ `feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert`
- **scope** ∈ `用户端 / 商户端 / 骑手端 / 管理后台 / 后端 / 部署 / docs / workspace`（多端联动选 `workspace`）
- **subject**：中文可，简明扼要

```powershell
git -C "c:\Users\Administrator\Desktop\O2O跑腿+外卖" commit -m "feat(<scope>): P(X) [阶段名] PASS — <关键交付摘要>"
```

> 示例（P1）：`feat(workspace): P1 项目初始化 PASS — 五端 monorepo + NestJS 后端 + docker-compose 开发环境 + 63 份阶段文档 + P1-REVIEW 2 轮审查修复闭环`

### 5. 推送

首次：

```powershell
git -C "c:\Users\Administrator\Desktop\O2O跑腿+外卖" push -u origin main
```

后续：

```powershell
git -C "c:\Users\Administrator\Desktop\O2O跑腿+外卖" push
```

推送成功后，在 `说明文档.md` §3.3 追加一条日志：

```
| <日期> | P(X) 已同步至 GitHub main | commit: <短 SHA> ； remote: Xujiache/O2O |
```

## 硬性约束

- ❌ 禁止 `git push --force` / `--force-with-lease` 到 `main`
- ❌ 禁止跨阶段混合 commit；每阶段独立 commit（或多 commit 但严格围绕该阶段）
- ❌ push 失败时禁止绕过：先排查 credentials（Git Credential Manager）/ 网络 / 认证 token
- ❌ 禁止提交 `.env.*`（仅 `.env.example` 允许入库；`.gitignore` 已兜底）
- ❌ 禁止提交 `node_modules/` `dist/` `unpackage/` `coverage/` `docs/**/_verify_*.log` 等 `.gitignore` 名单
- ✅ 冲突时使用 `git pull --rebase origin main` 再 push
- ✅ 如遇首次 push 被要求 GitHub 凭据，按系统凭据弹窗或 `git config --global credential.helper manager` 配置

## 跨阶段示例

| 阶段 | commit 模板 |
|---|---|
| P2 数据库设计 | `feat(后端): P2 数据库设计 PASS — MySQL 100+ 表 DDL + Redis Key + TimescaleDB 轨迹表` |
| P3 后端基础服务 | `feat(后端): P3 后端基础服务 PASS — Auth/User/Message/File/Map 5 大服务` |
| P4 后端业务服务 | `feat(后端): P4 后端业务服务 PASS — 订单/商品/商户/派单/支付/财务/营销/评价` |
| P5 用户端开发 | `feat(用户端): P5 用户端 PASS — PRD §3.1 六大模块 40+ 页面` |
| P6 商户端开发 | `feat(商户端): P6 商户端 PASS — PRD §3.2 六大模块 35+ 页面 + 蓝牙打印` |
| P7 骑手端开发 | `feat(骑手端): P7 骑手端 PASS — PRD §3.3 六大模块 30+ 页面 + 定位上报` |
| P8 管理后台开发 | `feat(管理后台): P8 管理后台 PASS — PRD §3.4 十大模块 80+ 页面` |
| P9 集成测试部署 | `feat(部署): P9 集成测试部署 PASS — 测试/容器/K8s/CI-CD/监控/备份/上架` |
