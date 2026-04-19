/**
 * @file main.ts
 * @stage P5/T5.5 (Sprint 1)
 * @desc uni-app Vue3 应用入口：注册 Pinia / uView Plus / 全局 store 恢复
 * @author 单 Agent V2.0
 */
import { createSSRApp } from 'vue'
import uviewPlus from 'uview-plus'
import App from './App.vue'
import { setupPinia, useCartStore, useLocationStore } from './store'

/**
 * uni-app Vue3 工厂方法
 * 功能：创建 SSR 兼容的 Vue 应用、挂载 Pinia + uView Plus、恢复跨启动 store
 * 返回值：{ app: App } uni-app 要求的导出对象
 */
export function createApp() {
  const app = createSSRApp(App)
  const pinia = setupPinia()
  app.use(pinia)
  app.use(uviewPlus)

  /* 启动后立即恢复关键 store（购物车 / 城市 / 地址） */
  const cart = useCartStore(pinia)
  cart.restore()
  const location = useLocationStore(pinia)
  location.restore()

  return { app }
}
