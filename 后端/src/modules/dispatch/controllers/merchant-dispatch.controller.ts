/**
 * @file merchant-dispatch.controller.ts
 * @stage P4/T4.43（Sprint 6）
 * @desc 商户端：配送轨迹摘要查询
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 路径前缀：/api/v1/merchant
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('merchant')
 *
 * 接口清单：
 *   GET /merchant/dispatch/track/:orderNo  配送轨迹摘要（含 owner 校验：order.shop 须属于商户）
 *
 * 注：详细 GPS 轨迹由 MapService.queryTrack 提供（属于 MapModule，本接口仅暴露摘要）
 */

import { Controller, Get, HttpStatus, Param, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { DeliveryTrackSummary } from '@/entities'
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator'
import { UserTypes } from '@/modules/auth/decorators/user-types.decorator'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import { OrderShardingHelper } from '@/modules/order/order-sharding.helper'

/* ============================================================================
 * 出参 VO
 * ============================================================================ */

/**
 * 配送轨迹摘要视图
 */
export class DeliveryTrackSummaryVo {
  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '骑手 ID' })
  riderId!: string

  @ApiProperty({ description: '取件点经度', nullable: true })
  pickupLng!: number | null

  @ApiProperty({ description: '取件点纬度', nullable: true })
  pickupLat!: number | null

  @ApiProperty({ description: '送达点经度', nullable: true })
  deliveryLng!: number | null

  @ApiProperty({ description: '送达点纬度', nullable: true })
  deliveryLat!: number | null

  @ApiProperty({ description: '总配送距离（米）' })
  totalDistanceM!: number

  @ApiProperty({ description: '总配送时长（秒）' })
  totalDurationS!: number

  @ApiProperty({ description: '取件时间', nullable: true })
  pickupAt!: Date | null

  @ApiProperty({ description: '送达时间', nullable: true })
  deliveredAt!: Date | null

  @ApiProperty({ description: '是否准时：0 否 / 1 是 / NULL 未结算', nullable: true })
  isOnTime!: number | null

  @ApiProperty({ description: '延迟秒数（负数=提前送达）', nullable: true })
  delayS!: number | null
}

/* ============================================================================
 * Controller
 * ============================================================================ */

@ApiTags('商户端 - 配送轨迹')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller('merchant')
export class MerchantDispatchController {
  constructor(
    @InjectRepository(DeliveryTrackSummary)
    private readonly summaryRepo: Repository<DeliveryTrackSummary>,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  /**
   * 配送轨迹摘要（owner 校验：order.shop 必须属于商户）
   */
  @Get('dispatch/track/:orderNo')
  @ApiOperation({
    summary: '配送轨迹摘要',
    description:
      'owner 校验：仅订单关联店铺归属当前商户时可查；详细 GPS 轨迹请走 /api/v1/map/rider/:id/track/:orderNo'
  })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiSwaggerResponse({ status: 200, type: DeliveryTrackSummaryVo })
  async getTrack(
    @Param('orderNo') orderNo: string,
    @CurrentUser('uid') merchantId: string
  ): Promise<DeliveryTrackSummaryVo> {
    /* owner 校验 */
    const ok = await this.assertMerchantOwnsOrder(orderNo, merchantId)
    if (!ok) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        '非本商户订单',
        HttpStatus.FORBIDDEN
      )
    }
    /* 摘要不存在 → 给一个 placeholder（pickup/delivery 等为空），便于前端展示"未开始" */
    const summary = await this.summaryRepo.findOne({
      where: { orderNo, isDeleted: 0 }
    })
    if (!summary) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        `订单 ${orderNo} 暂无配送轨迹摘要`
      )
    }
    return {
      orderNo: summary.orderNo,
      orderType: summary.orderType,
      riderId: summary.riderId,
      pickupLng: summary.pickupLng,
      pickupLat: summary.pickupLat,
      deliveryLng: summary.deliveryLng,
      deliveryLat: summary.deliveryLat,
      totalDistanceM: summary.totalDistanceM,
      totalDurationS: summary.totalDurationS,
      pickupAt: summary.pickupAt,
      deliveredAt: summary.deliveredAt,
      isOnTime: summary.isOnTime,
      delayS: summary.delayS
    }
  }

  /* ============================================================================
   * 内部：商户 owner 校验
   * ============================================================================ */

  /**
   * 校验订单所属店铺归属当前商户
   *   仅外卖订单有 merchant_id 字段；跑腿订单（C2C）不归属任何商户 → 直接返回 false
   */
  private async assertMerchantOwnsOrder(orderNo: string, merchantId: string): Promise<boolean> {
    const yyyymm = OrderShardingHelper.yyyymmFromOrderNo(orderNo)
    if (!yyyymm) return false
    const date = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1, 1))
    const table = OrderShardingHelper.tableName('order_takeout', date)
    try {
      const rows = await this.dataSource.query<Array<{ merchant_id: string | null }>>(
        `SELECT merchant_id FROM \`${table}\` WHERE order_no = ? AND is_deleted = 0 LIMIT 1`,
        [orderNo]
      )
      const first = rows[0]
      if (!first) return false
      return first.merchant_id != null && String(first.merchant_id) === merchantId
    } catch {
      return false
    }
  }
}
