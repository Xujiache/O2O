/**
 * @file amqplib-augment.d.ts
 * @stage P3/T3.3（组长协调）
 * @desc 给 @types/amqplib 做 module augmentation：扩展 Connection 接口
 *       附加 createChannel/close（运行时 ChannelModel 已有这些方法，员工 C
 *       的 publisher/consumer 把 ChannelModel 类型断言为 Connection 后调用，
 *       本声明仅修补类型，不改运行时行为）
 * @author 员工 A（组长协调）
 *
 * 背景：amqplib v0.10 起 connect() 返回 ChannelModel，但 Connection 接口
 *       不再含 createChannel/close。C 的 publisher/consumer 沿用旧写法，
 *       为不阻塞集成 build，在此打补丁。后续可由 C 在 P9 阶段统一改用 ChannelModel。
 */

import 'amqplib'

declare module 'amqplib' {
  interface Connection {
    /** 关闭底层 TCP 连接 */
    close(): Promise<void>
    /** 创建一个 channel（实际上由 ChannelModel 提供，运行时存在） */
    createChannel(): Promise<Channel>
  }
}
