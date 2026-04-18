/**
 * 模块类型补丁：为缺少 .d.ts 的纯 JS 第三方库提供最小声明
 * 功能：让 vue-tsc 在严格 TS 模式下放行缺类型声明的运行时依赖（uview-plus 等）
 * 参数：无
 * 返回值：无
 * 用途：仅影响编译期类型检查，不改变运行时
 */

declare module 'uview-plus' {
  const uViewPlus: {
    install: (app: unknown) => void
    [key: string]: unknown
  }
  export default uViewPlus
}

declare const uni: Record<string, unknown>
