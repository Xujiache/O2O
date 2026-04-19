/**
 * @file store/index.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc Pinia 入口 + persistedstate 插件注册；按需 re-export 各 store
 *
 * Stores（DESIGN §3.4 + 商户端补充）：
 *   - useAppStore          系统信息 / 主题 / 引导标记
 *   - useAuthStore         token + 商户/子账号资料 + 权限码
 *   - useShopStore         店铺信息 / 当前 shopId / 营业状态 / 自动接单开关
 *   - useOrderStore        新订单队列 / 待处理计数 / 打印队列
 *   - usePrinterStore      已连接打印机与参数
 *   - useMsgStore          消息未读 / 分类
 *   - useUiStore           loading 计数 / 全局 toast 配置
 *   - useNotifySettingsStore 通知/语音/铃声设置
 *
 * @author 单 Agent V2.0 (P6 商户端)
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
export { useAuthStore } from './auth'
export { useShopStore } from './shop'
export { useOrderStore } from './order'
export { usePrinterStore } from './printer'
export { useMsgStore } from './msg'
export { useUiStore } from './ui'
export { useNotifySettingsStore } from './notify'
