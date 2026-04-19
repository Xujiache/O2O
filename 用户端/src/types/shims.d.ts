/**
 * @file shims.d.ts
 * @stage P5/T5.6 (Sprint 1)
 * @desc 第三方库类型补丁；vue-tsc 严格模式兜底
 * @author 单 Agent V2.0
 */

declare module 'uview-plus' {
  /** uView Plus 通过 Vue 插件形式注册，提供全局 $u 对象与大量组件 */
  const uViewPlus: {
    install: (app: unknown) => void
    [key: string]: unknown
  }
  export default uViewPlus
}

declare module 'pinia-plugin-persistedstate'
