# FINAL_P3_后端基础服务

## 一、交付物清单
- [ ] `后端/src/modules/auth/*`
- [ ] `后端/src/modules/user/*`
- [ ] `后端/src/modules/message/*`
- [ ] `后端/src/modules/file/*`
- [ ] `后端/src/modules/map/*`
- [ ] `后端/src/common/*`（过滤器、拦截器、装饰器）
- [ ] `后端/src/utils/{crypto,password,snowflake,order-no}.ts`
- [ ] `后端/test/*` 单测
- [ ] `docs/P3_后端基础服务/api/{auth,user,message,file,map}.md`
- [ ] Swagger `/docs/*` 分组齐全
- [ ] Postman 冒烟集 `后端/postman.json`

## 二、验收结果
| 项 | 结果 | 备注 |
|---|---|---|
| V3.1~V3.25 功能 | ⬜ | |
| 性能 | ⬜ | |
| 安全 | ⬜ | |
| 文档 | ⬜ | |

## 三、PRD 对齐
| PRD §3.5.1 | 落地 |
|---|---|
| 统一认证授权 | `auth` 模块 + JWT + Refresh + 多端 Guard + 权限 |
| 用户中心 | `user` 模块 + 4 角色 CRUD + 实名 + 地址 + 黑名单 |
| 消息推送 | `message` 模块 + 4 通道 + 模板 + 异步 + 重试 |
| 文件存储 | `file` 模块 + MinIO/OSS 双实现 + STS |
| 地图与定位 | `map` 模块 + 高德 + GEO + TimescaleDB + 轨迹 |

## 四、遗留
| 编号 | 问题 | 处理 |
|---|---|---|
| R3.1 | 第三方密钥测试环境未接入 | 迁入沙箱或 mock |
| R3.2 | 多活区域部署 | P9 |
| R3.3 | API 网关/鉴权中心独立 | 视业务规模决定，当前单体满足 |

## 五、经验沉淀
- Guard 组合优先级：JwtAuth → UserType → Permission → ThrottleSign
- RabbitMQ Consumer 必须幂等（按 msgId 去重）
- 骑手上报批量写入，避免 TimescaleDB 单条写放大
- 高德缓存 key 用地址 md5，空间可控

## 六、阶段结论
- P3 完成，基础服务层就绪
- `说明文档.md` §3.1 更新 P3 状态 🟢 完成
- 可进入 P4 后端业务服务

## 七、签字
| 角色 | 日期 | 签字 |
|---|---|---|
| 架构 | | |
| 后端 | | |
| 安全 | | |
| PM | | |
