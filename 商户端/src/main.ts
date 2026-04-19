/**
 * @file main.ts
 * @stage P6/T6.1 (Sprint 1)
 * @desc uni-app Vue3 应用入口：注册 Pinia + persistedstate + uView Plus + 全局 store 恢复
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { createSSRApp } from 'vue'
import uviewPlus from 'uview-plus'
import App from './App.vue'
import { setupPinia, useAppStore, useAuthStore, useShopStore, usePrinterStore } from './store'
import { initSentry } from './utils/sentry'

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

  /* 启动后立即恢复关键 store */
  const auth = useAuthStore(pinia)
  auth.restore()
  const shop = useShopStore(pinia)
  shop.restore()
  const printer = usePrinterStore(pinia)
  printer.restore()
  const appStore = useAppStore(pinia)
  appStore.initSysInfo()

  /* 初始化 Sentry（dsn 由 env 注入；无 dsn 则跳过） */
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  if (env?.VITE_SENTRY_DSN) {
    initSentry({
      dsn: env.VITE_SENTRY_DSN,
      environment: env.VITE_APP_ENV ?? 'development',
      release: env.VITE_APP_VERSION ?? '0.1.0'
    })
  }

  return { app }
}
