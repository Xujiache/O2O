/**
 * v-biz-auth 业务权限指令
 *
 * 与框架自带的 `v-auth`（基于路由 meta.authList）互补，本指令直接使用 BizPermStore
 * 检查权限码（如 'order:audit'）。
 *
 * ## 使用方式
 *
 * ```vue
 * <el-button v-biz-auth="'order:audit'">审核订单</el-button>
 * <el-button v-biz-auth="['order:audit', 'order:refund']">审核或退款</el-button>
 * ```
 *
 * 权限不足时直接从 DOM 移除元素（不是 v-if 隐藏）。
 *
 * @module directives/business/biz-auth
 */
import type { App, Directive, DirectiveBinding } from 'vue'
import { useBizPermStore } from '@/store/modules/business'

interface BizAuthBinding extends DirectiveBinding {
  value: string | string[]
}

function checkBizAuth(el: HTMLElement, binding: BizAuthBinding): void {
  const perm = useBizPermStore()
  const value = binding.value
  let ok = false
  if (Array.isArray(value)) ok = perm.hasAny(value)
  else if (value) ok = perm.has(value)
  else ok = true
  if (!ok) {
    el.parentNode?.removeChild(el)
  }
}

const bizAuthDirective: Directive = {
  mounted: checkBizAuth,
  updated: checkBizAuth
}

/**
 * 注册 v-biz-auth 指令
 */
export function setupBizAuthDirective(app: App): void {
  app.directive('biz-auth', bizAuthDirective)
}
