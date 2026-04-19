import type { App } from 'vue'
import { setupAuthDirective } from './core/auth'
import { setupHighlightDirective } from './business/highlight'
import { setupRippleDirective } from './business/ripple'
import { setupRolesDirective } from './core/roles'
import { setupBizAuthDirective } from './business/biz-auth'

export function setupGlobDirectives(app: App) {
  setupAuthDirective(app) // 权限指令（基于路由 meta.authList）
  setupRolesDirective(app) // 角色权限指令
  setupHighlightDirective(app) // 高亮指令
  setupRippleDirective(app) // 水波纹指令
  setupBizAuthDirective(app) // 业务权限指令（基于 BizPermStore.permission code）
}
