/**
 * @file store/index.ts
 * @stage P7/T7.4 (Sprint 1)
 * @desc Pinia store 集中再导出（按模块拆分以便 tree-shake）
 *
 * 8 个 store：auth / work / dispatch / order / location / wallet / msg / ui
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
export { useAuthStore } from './auth'
export { useWorkStore } from './work'
export { useDispatchStore } from './dispatch'
export { useOrderStore } from './order'
export { useLocationStore } from './location'
export { useWalletStore } from './wallet'
export { useMsgStore } from './msg'
export { useUiStore } from './ui'
