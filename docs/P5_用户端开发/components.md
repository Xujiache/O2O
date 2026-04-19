# P5 用户端业务组件文档

> 本文档列出 `用户端/src/components/biz/` 下的所有业务组件，说明 props/events/用法。

## 1. 全局 4 件套

### 1.1 BizEmpty.vue —— 空态
```vue
<BizEmpty text="暂无订单" actionText="去逛逛" @action="goHome" />
```
| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| text | string | '暂无数据' | 文案 |
| icon | string | uViewUI 默认空态 | 自定义图标 URL |
| actionText | string | '' | 按钮文案，传入即显示 |

### 1.2 BizLoading.vue —— 加载中
```vue
<BizLoading text="加载中..." :fullscreen="true" />
```
| Prop | 类型 | 默认 |
|---|---|---|
| visible | boolean | true |
| text | string | '加载中...' |
| fullscreen | boolean | false |

### 1.3 BizError.vue —— 错误态
```vue
<BizError title="加载失败" :desc="errMsg" @retry="reload" />
```
| Prop | 类型 | 默认 |
|---|---|---|
| title | string | '加载失败' |
| desc | string | '' |

### 1.4 BizDialog.vue —— 确认对话框
```vue
<BizDialog
  v-model:visible="visible"
  title="提示"
  content="是否取消订单？"
  @confirm="onCancel"
/>
```
| Prop | 类型 | 默认 |
|---|---|---|
| visible | boolean | - |
| title | string | '提示' |
| content | string | '' |
| confirmText | string | '确定' |
| cancelText | string | '取消' |
| showCancel | boolean | true |

### 1.5 Guide.vue —— 新手引导
```vue
<Guide v-model:visible="showGuide" :steps="steps" @finish="markRead" />
```

## 2. 业务卡片组件

### 2.1 ShopCard / ShopList
店铺列表卡片 + 列表容器

### 2.2 ProductCard / ProductDetail
商品列表项 + 详情弹窗（多 SKU 选择）

### 2.3 CartSheet
购物车弹层（按 shopId 显示当前店购物车）

### 2.4 PriceEstimate
跑腿价格预估卡片（debounce 500ms 自动刷新）

### 2.5 PickupCode
取件码（CHAR(6)）+ 凭证图集

### 2.6 RiderMap
骑手实时位置地图（含 polyline 路径 + 插值平滑）

## 3. 使用规范

1. **样式变量**：直接使用 `$color-primary` 等，无需 `@import`（uni.scss 全局注入）
2. **类型**：严格 TypeScript；禁止 `any`
3. **事件**：用 `defineEmits<{ ... }>()` 强类型
4. **生命周期**：用 `@dcloudio/uni-app` 的 `onLoad/onShow/onUnload`
5. **API 调用**：通过 `@/api/*` 模块；禁止直接 `uni.request`
