import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import uviewPlus from 'uview-plus'
import App from './App.vue'

/**
 * uni-app Vue3 应用工厂
 * 功能：创建 SSR 兼容的 Vue 应用实例、挂载 Pinia 状态树与 uView Plus UI 组件库。
 * 参数：无（uni-app 框架在启动时调用）
 * 返回值：{ app: App } uni-app 要求的导出对象
 * 用途：uni-app 启动入口，P5 阶段基于此扩展全局拦截、路由守卫、埋点等
 */
export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(uviewPlus)
  return { app }
}
