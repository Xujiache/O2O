# 用户端（O2O · 微信小程序）

> C 端用户下单入口。对应 **PRD §3.1** 六大模块：首页 / 外卖点餐 / 同城跑腿 / 订单 / 个人中心 / 支付与消息。
>
> 技术栈：**uni-app + Vue3 + Pinia + uView Plus**。主编译目标 `mp-weixin`。

---

## 一、目录结构（DESIGN_P1 §3）

```
用户端/
├── src/
│   ├── pages/                    # PRD §3.1 六大模块占位
│   │   ├── index/                # 首页（§3.1.1）
│   │   ├── takeout/              # 外卖点餐（§3.1.2）
│   │   ├── errand/               # 同城跑腿（§3.1.3）
│   │   ├── order/                # 订单管理（§3.1.4）
│   │   ├── user/                 # 个人中心（§3.1.5）
│   │   └── pay/                  # 支付与消息（§3.1.6）
│   ├── components/               # 通用业务组件
│   ├── api/                      # 业务 API 封装
│   ├── store/                    # Pinia 状态管理
│   ├── utils/                    # axios 封装等
│   ├── static/                   # 图片、字体、icon 等静态资源
│   ├── App.vue
│   ├── main.ts
│   ├── manifest.json             # uni-app 应用清单
│   ├── pages.json                # 路由 + tabBar + easycom
│   └── uni.scss                  # 全局样式变量
├── env/
│   ├── .env.development
│   └── .env.production
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── uni.config.ts
└── README.md
```

---

## 二、启动与构建

> 必须先在仓库根目录执行 `pnpm install`，由 workspace 统一安装依赖。

```bash
# 开发（微信小程序）
pnpm --filter 用户端 dev:mp-weixin
# 或
pnpm dev:user

# 打开微信开发者工具 → 导入 用户端/unpackage/dist/dev/mp-weixin/
# appId 首次开发可勾选"测试号"；正式上线时在 src/manifest.json.mp-weixin.appid 填入真实 appId

# 开发（H5 预览，调试最快）
pnpm --filter 用户端 dev:h5

# 生产构建
pnpm --filter 用户端 build:mp-weixin   # 产物：unpackage/dist/build/mp-weixin/
pnpm --filter 用户端 build:h5          # 产物：unpackage/dist/build/h5/

# 类型检查
pnpm --filter 用户端 type-check
```

---

## 三、环境变量

| 变量 | 用途 |
|---|---|
| `VITE_APP_ENV` | 环境标识 |
| `VITE_API_BASE_URL` | 后端 API 前缀 |
| `VITE_API_TIMEOUT` | 请求超时毫秒 |
| `VITE_WS_BASE_URL` | WebSocket 前缀（订单状态推送） |
| `VITE_MAP_PROVIDER` / `VITE_MAP_AK` | 地图 SDK（高德/百度） |
| `VITE_WECHAT_MP_APPID` | 微信小程序 appId（构建时回填 manifest） |

`.env.development`、`.env.production` 模板已就位于 `env/`，需手工填入正式密钥。

---

## 四、目标平台

| 平台 | 支持 | 说明 |
|---|---|---|
| 微信小程序 `mp-weixin` | ✅ 主 | PRD §3.1 指定 |
| H5 | ✅ 辅 | 开发调试用 |
| App-plus (iOS/Android) | ✅ 可编 | manifest 已预留，P5 非默认目标 |

---

## 五、常见问题

- **微信开发者工具提示"未定义 appid"**：`src/manifest.json` → `mp-weixin.appid` 填入测试号或正式号。
- **uView Plus 组件样式异常**：确认 `src/uni.scss` 顶部 `@import 'uview-plus/theme.scss';` 未被注释。
- **定位权限**：`manifest.json.mp-weixin.permission.scope.userLocation.desc` 已配置。
- **分包/主包过大**：P5 阶段按业务模块拆分包，P1 阶段无需关注。
