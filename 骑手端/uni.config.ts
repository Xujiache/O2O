/**
 * 骑手端 uni-app 运行时配置
 * 功能：声明需要被 uni-app 构建器额外转译（babel/swc 处理）的 node_modules 依赖
 * 参数：无（uni-cli 在启动/打包阶段读取本文件）
 * 返回值：对象 { transpileDependencies: string[] } —— 需转译包名数组
 * 用途：对齐 DESIGN_P1 §3「三端 uni-app 骨架设计」；当 P7 阶段引入含 ESM-only
 *       私有依赖（如地图 SDK、语音 SDK）时在此登记其包名以确保多端编译通过
 */
export default {
  transpileDependencies: []
}
