/**
 * 模块类型补丁：为缺少 .d.ts 的纯 JS 第三方库提供最小声明
 * 功能：让 vue-tsc 在严格 TS 模式下放行缺类型声明的运行时依赖（uview-plus 等）
 * 参数：无
 * 返回值：无
 * 用途：仅影响编译期类型检查，不改变运行时
 */

declare module 'uview-plus' {
  // uView Plus 通过 Vue 插件形式注册，提供全局 $u 对象与大量组件
  // 此处仅做最小声明，P5 阶段按需补全具体接口
  const uViewPlus: {
    install: (app: unknown) => void
    [key: string]: unknown
  }
  export default uViewPlus
}

// uni-app 全局对象的补充（@dcloudio/types 已提供主要类型，此处兜底）
declare const uni: Record<string, unknown>
