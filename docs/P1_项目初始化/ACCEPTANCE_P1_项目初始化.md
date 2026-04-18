# ACCEPTANCE_P1_项目初始化

> 本文件为 P1 阶段**验收标准**，逐项可核验。未达标不得进入 P2。

---

## 一、功能验收

| 项 | 验收方法 | 通过标准 |
|---|---|---|
| V1.1 | `git status` 干净 | 无 untracked/已忽略文件 |
| V1.2 | 根目录 `pnpm install` | 全部子项目安装成功，无 peer 警告阻断 |
| V1.3 | `pnpm lint` | 无 ERROR，WARNING ≤ 20 |
| V1.4 | `pnpm dev:user` | 微信开发者工具预览首页空白可加载 |
| V1.5 | `pnpm dev:merchant` | HBuilderX / 模拟器可运行空页 |
| V1.6 | `pnpm dev:rider` | 同上 |
| V1.7 | `pnpm dev:admin` | 浏览器打开登录页（原有） |
| V1.8 | `pnpm dev:server` | 控制台日志显示已启动，`curl http://localhost:3000/health` 返回 `{"status":"ok"...}` |
| V1.9 | 访问 `http://localhost:3000/docs` | 可见 Swagger 页（空接口清单） |
| V1.10 | `pnpm docker:dev:up` | MySQL、Redis、RabbitMQ、MinIO 四服务 `healthy` |
| V1.11 | `git commit -m "test: xxx"` | husky 触发 lint-staged + commitlint 校验 |
| V1.12 | `git commit -m "错误类型"` | 被 commitlint 阻断 |

---

## 二、技术栈合规性验收（PRD §5）

| 检查 | 通过标准 |
|---|---|
| 用户/商户/骑手端 | `package.json` 含 `@dcloudio/uni-app`、`vue@3`、`pinia`、`uview-plus` |
| 管理后台 | 沿用 art-design-pro 精简版，`vue@3 + vite + element-plus + pinia + vue-router` 版本未降级 |
| 后端 | `@nestjs/core ^10`、`typescript ^5.6`、TypeORM + mysql2、Redis(ioredis)、Swagger、JWT |
| 数据库 | Compose 中 MySQL 8.0、Redis 7 |
| 中间件 | Compose 中 RabbitMQ 3.13、MinIO latest |
| 容器 | 后端 Dockerfile 多阶段构建成功 |

---

## 三、代码规范验收

| 检查 | 通过标准 |
|---|---|
| `.editorconfig` | UTF-8 + LF + 2 空格 + 末尾换行 |
| Prettier | 所有子项目能 `prettier --check` |
| ESLint | 根配置 + 子项目继承，无冲突 |
| Stylelint | `.vue`/`.scss`/`.css` 可校验 |
| commitlint | Conventional Commits 强制 |
| lint-staged | 仅对变更文件检查 |

---

## 四、文档验收

| 文档 | 通过标准 |
|---|---|
| 根 `README.md` | 含环境要求、启动命令、目录说明、常见问题 |
| 各端 `README.md` | 含本端启动、打包、目标平台说明 |
| `说明文档.md` | §3 进度记录已更新 P1 任务完成情况 |
| `docs/P1_项目初始化/` | 7 份文档齐全且一致 |

---

## 五、性能与兼容性（P1 范围内仅基础验证）

| 项 | 通过标准 |
|---|---|
| 开发启动时间 | 冷启动后端 ≤ 15s；前端 ≤ 10s |
| Node 版本 | 要求 ≥ 20.19.0 |
| Windows 中文路径 | 所有脚本可运行，无乱码 |

---

## 六、安全验收（P1 基础项）

| 项 | 通过标准 |
|---|---|
| `.env.*` 未入库 | `.gitignore` 忽略，`.env.example` 入库 |
| 默认密码提示 | README 明确：仅开发环境默认密码，生产必须替换 |
| JWT_SECRET 示例 | 使用随机串，提示生产用 64+ 位随机 |

---

## 七、验收负责人签字

| 角色 | 姓名 | 日期 | 签字 |
|---|---|---|---|
| 架构 | | | |
| 后端 | | | |
| 前端 | | | |
| DevOps | | | |
| PM | | | |

---

## 八、验收通过定义

以上全部项通过 ✅ 后，方可进入 P2 数据库设计阶段，并在 `FINAL_P1_项目初始化.md` 与 `说明文档.md` 中留痕。
