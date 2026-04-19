import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersistedstate from 'pinia-plugin-persistedstate'
import uviewPlus from 'uview-plus'
import App from './App.vue'

/**
 * uni-app Vue3 应用工厂
 * 功能：创建 SSR 兼容的 Vue 应用实例、挂载 Pinia（持久化插件）与 uView Plus UI 组件库。
 * 参数：无（uni-app 框架在启动时调用）
 * 返回值：{ app: App } uni-app 要求的导出对象
 * 用途：骑手端启动入口；后续在 App.vue / store 内串联定位上报、JPush、Sentry、TTS 等
 */
export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  pinia.use(piniaPersistedstate)
  app.use(pinia)
  app.use(uviewPlus)
  return { app }
}
