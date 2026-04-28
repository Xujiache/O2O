import { Module } from '@nestjs/common'

/**
 * 客服与风控模块
 * 功能：对齐 PRD §3.4.10 客服与风控，管理工单、仲裁、异常行为规则、刷单识别、违规处理
 * 参数：无
 * 返回值：CustomerModule
 * 用途：工单/仲裁管理（已在 ReviewModule 的 admin-review.controller 中集成仲裁，
 *        风控相关在 AdminOpsController 中提供扩展）
 */
@Module({})
export class CustomerModule {}
