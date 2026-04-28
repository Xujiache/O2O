import { Module } from '@nestjs/common'

/**
 * 数据大盘 / 统计模块
 * 功能：对齐 PRD §3.4.1 数据大盘，提供实时订单量、交易额、增长趋势、运营数据聚合接口
 * 参数：无
 * 返回值：StatsModule
 * 用途：统计聚合查询（已在 AdminDashboardController 中实现管理端接口）
 */
@Module({})
export class StatsModule {}
