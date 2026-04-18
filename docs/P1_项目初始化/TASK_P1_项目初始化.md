# TASK_P1_项目初始化

> 本文件为 P1 阶段**任务拆解（WBS）**，按执行顺序列出全部原子任务、依赖关系、预估工时。

---

## 一、WBS（工作分解结构）

| 编号 | 任务 | 依赖 | 产出 | 工时(h) | 负责人 |
|---|---|---|---|---|---|
| T1.1 | 初始化 Git 仓库、`.gitignore`、`.gitattributes` | - | 仓库就绪 | 0.5 | DevOps |
| T1.2 | 创建 `pnpm-workspace.yaml` 与根 `package.json` | T1.1 | workspace 就绪 | 0.5 | DevOps |
| T1.3 | 根目录 `.editorconfig`、`.prettierrc`、`eslint.config.mjs`、`.stylelintrc.cjs` | T1.2 | 规范文件 | 1 | 架构 |
| T1.4 | 配置 husky + lint-staged + commitlint + cz-git | T1.3 | Git hooks | 1 | 架构 |
| T1.5 | 用户端 uni-app 脚手架（Vite 模板，target: mp-weixin） | T1.2 | `用户端/` 可 dev | 2 | 前端 |
| T1.6 | 商户端 uni-app 脚手架（target: app-plus + mp-weixin） | T1.2 | `商户端/` 可 dev | 2 | 前端 |
| T1.7 | 骑手端 uni-app 脚手架（target: app-plus） | T1.2 | `骑手端/` 可 dev | 2 | 前端 |
| T1.8 | 三端安装 uView Plus + Pinia + axios 封装 | T1.5,T1.6,T1.7 | 可跑通空页面 | 2 | 前端 |
| T1.9 | 三端环境变量分层（.env.dev / .env.prod） | T1.8 | 多环境可切换 | 1 | 前端 |
| T1.10 | 管理后台纳入 workspace（根 `pnpm install` 无冲突） | T1.2 | 管理后台可 dev | 1 | 前端 |
| T1.11 | NestJS 后端脚手架（`nest new 后端`） | T1.2 | `后端/` 可 start:dev | 1 | 后端 |
| T1.12 | 后端安装 TypeORM + Redis + Swagger + JWT + Bull + Joi | T1.11 | 依赖就绪 | 1 | 后端 |
| T1.13 | 后端 `config/` 模块 + 环境变量校验（joi） | T1.12 | 配置中心 | 2 | 后端 |
| T1.14 | 后端 `main.ts` 全局管道/过滤器/拦截器/Swagger | T1.13 | 启动可访问 `/docs` | 2 | 后端 |
| T1.15 | 后端 `/health` 健康检查（db/redis） | T1.14 | 可探活 | 1 | 后端 |
| T1.16 | 后端 `modules/` 16 个业务占位目录 | T1.14 | 目录骨架 | 1 | 后端 |
| T1.17 | `部署/docker-compose.dev.yml`（mysql/redis/rabbit/minio） | T1.2 | 一键拉起依赖 | 2 | DevOps |
| T1.18 | 后端 `Dockerfile`（多阶段构建） | T1.14 | 镜像可构建 | 1 | DevOps |
| T1.19 | 根 README.md 编写 | T1.5~T1.17 | 文档 | 2 | 架构 |
| T1.20 | 各端 README.md 编写 | T1.5~T1.15 | 文档 | 2 | 各端 |
| T1.21 | 首次完整联通测试（docker up + 各端 dev） | T1.18,T1.20 | 验收通过 | 2 | 全体 |
| T1.22 | 更新 `说明文档.md` 进度记录 | T1.21 | 进度留痕 | 0.5 | PM |

**合计：约 28h ≈ 3.5 人日**

---

## 二、依赖关系图

```
T1.1 → T1.2 ──┬─→ T1.3 → T1.4
              ├─→ T1.5 ┐
              ├─→ T1.6 ├─→ T1.8 → T1.9
              ├─→ T1.7 ┘
              ├─→ T1.10
              ├─→ T1.11 → T1.12 → T1.13 → T1.14 → T1.15
              │                              └──→ T1.16
              └─→ T1.17 → T1.18
                       T1.19 ← (T1.5~T1.17)
                       T1.20 ← (各端)
                       T1.21 ← (全部) → T1.22
```

---

## 三、优先级划分

| 级别 | 任务 |
|---|---|
| P0（阻断） | T1.1、T1.2、T1.17 |
| P1（核心） | T1.3~T1.16 |
| P2（收尾） | T1.18~T1.22 |

---

## 四、风险任务与预案

| 任务 | 风险 | 预案 |
|---|---|---|
| T1.5~T1.7 | uni-app 中文路径问题 | 切换到 HBuilderX 或使用 cross-env |
| T1.10 | workspace 依赖提升冲突 | 配置 `.npmrc` `shamefully-hoist=false` |
| T1.17 | 本地端口冲突 | 统一使用 `3306/6379/5672/9000/9001`，冲突则改 compose 映射 |

---

## 五、里程碑

- **M1.1**（T1.1~T1.4）：仓库与规范就绪，可提交代码
- **M1.2**（T1.5~T1.10）：四端前端骨架可 dev
- **M1.3**（T1.11~T1.18）：后端 + 容器依赖就绪
- **M1.4**（T1.19~T1.22）：文档齐全，全链路可启动，进入 P2

---

## 六、状态跟踪

见同目录 `TODO_P1_项目初始化.md`，每完成一项即移入 “已完成” 并补充结果说明。
