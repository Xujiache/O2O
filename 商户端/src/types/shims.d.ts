/**
 * 模块类型补丁：为缺少 .d.ts 的纯 JS 第三方库提供最小声明
 * 注意：不要重复声明 `uni` / `plus`，@dcloudio/types 已提供完整 namespace；
 *       商户端原生扩展（plus.speech.speak / plus.push）通过 utils 内 type assertion 访问
 */

declare module 'uview-plus' {
  const uViewPlus: {
    install: (app: unknown) => void
    [key: string]: unknown
  }
  export default uViewPlus
}

declare module '@qiun/ucharts' {
  /** uCharts 跨端图表类构造器 */
  export default class UCharts {
    constructor(opts: Record<string, unknown>)
    updateData(data: Record<string, unknown>): void
    showToolTip(e: unknown, opts?: Record<string, unknown>): void
    touchLegend(e: unknown): void
    scrollStart(e: unknown): void
    scroll(e: unknown): void
    scrollEnd(e: unknown): void
  }
}

/** 微信小程序全局 wx；@dcloudio/types 在 mp-weixin 编译目标下提供，但 H5/APP 编译时未定义 */
declare const wx: Record<string, unknown> | undefined
