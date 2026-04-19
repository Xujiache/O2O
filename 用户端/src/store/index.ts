/**
 * @file store/index.ts
 * @stage P5/T5.5 (Sprint 1)
 * @desc Pinia 入口 + persistedstate 插件注册；按需 re-export 各 store
 * @author 单 Agent V2.0
 */
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

/** 创建 Pinia 实例（在 main.ts 注入） */
export function setupPinia() {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  return pinia
}

export { useAppStore } from './app'
export { useUserStore } from './user'
export { useLocationStore } from './location'
export { useCartStore } from './cart'
export { useOrderStore } from './order'
export { useMsgStore } from './msg'
export { useUiStore } from './ui'
