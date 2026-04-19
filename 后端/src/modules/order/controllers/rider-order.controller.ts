/**
 * @file rider-order.controller.ts
 * @stage P4/T4.21（Sprint 3）
 * @desc 骑手端订单动作接口：取件 / 送达 / 异常上报 / 转单（外卖+跑腿共用，按 orderNo 前缀自动分发）
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 路径前缀：/api/v1（main.ts setGlobalPrefix）
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + UserTypes('rider')
 *
 * 接口（4 个）：
 *   - POST /rider/order/:orderNo/pickup     取件 / 取餐
 *   - POST /rider/order/:orderNo/deliver    送达
 *   - POST /rider/order/:orderNo/abnormal   异常上报
 *   - POST /rider/order/:orderNo/transfer   转单申请
 */

import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser, UserTypes, type AuthUser } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  AbnormalReportDto,
  AbnormalReportVo,
  DeliverOrderDto,
  DeliverOrderVo,
  PickupOrderDto,
  PickupOrderVo,
  TransferOrderDto,
  TransferOrderVo
} from '../dto/rider-action.dto'
import { RiderActionService } from '../services/rider-action.service'

@ApiTags('订单 - 骑手动作（骑手端）')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('rider')
@Controller('rider/order')
export class RiderOrderController {
  constructor(private readonly riderActionService: RiderActionService) {}

  /* ==========================================================================
   * 1) 取件 / 取餐（T4.21 V4.14）
   * ========================================================================== */

  /**
   * 骑手取件 / 取餐
   *
   * 流程：
   *   - 校验 rider_id 与当前用户一致（assertRiderOwn）
   *   - 校验 pickupCode（PickupCodeUtil.verify Redis）
   *   - 状态机迁移：外卖 30→40 / 跑腿 20→30（OrderPicked）
   *   - 写 order_proof（proof_type=1，可 0 张图片）
   *   - 状态机内部已发 OrderPicked 事件
   */
  @Post(':orderNo/pickup')
  @ApiOperation({
    summary: '骑手取件 / 取餐',
    description:
      '必填 pickupCode；通过 Redis pickup:code:{orderNo} 校验；状态机外卖 30→40 / 跑腿 20→30；可附 0~6 张取件凭证'
  })
  @ApiParam({ name: 'orderNo', description: '业务订单号（18 位，前缀 T 外卖 / E 跑腿）' })
  @ApiBody({ type: PickupOrderDto })
  @ApiSwaggerResponse({ status: 200, type: PickupOrderVo })
  @ApiSwaggerResponse({
    status: 200,
    description: '订单不存在 10300 / 状态不允许 10301 / 取件码错误 10012 / 非本人订单 20003'
  })
  pickup(
    @CurrentUser() user: AuthUser,
    @Param('orderNo') orderNo: string,
    @Body() dto: PickupOrderDto
  ): Promise<PickupOrderVo> {
    return this.riderActionService.pickup(user, orderNo, dto)
  }

  /* ==========================================================================
   * 2) 送达（T4.21 V4.14）
   * ========================================================================== */

  /**
   * 骑手送达
   *
   * 流程：
   *   - 校验 rider_id（assertRiderOwn）
   *   - 状态机迁移：外卖 40→50 OrderDelivered；跑腿 30→40 或 40→50 OrderDelivered（按当前状态）
   *   - 写 order_proof（proof_type=2，必传 ≥ 1 张图片）
   *   - 状态机内部已发 OrderDelivered 事件
   *   - 自动确认（5 分钟后跑腿 40→50 / 50→55）由 Sprint 8 Orchestration 实现
   */
  @Post(':orderNo/deliver')
  @ApiOperation({
    summary: '骑手送达',
    description: '必传送达凭证 1~6 张；状态机外卖 40→50 / 跑腿 30→40 或 40→50（按当前状态）'
  })
  @ApiParam({ name: 'orderNo', description: '业务订单号' })
  @ApiBody({ type: DeliverOrderDto })
  @ApiSwaggerResponse({ status: 200, type: DeliverOrderVo })
  @ApiSwaggerResponse({
    status: 200,
    description: '订单不存在 10300 / 状态不允许 10301 / 非本人 20003'
  })
  deliver(
    @CurrentUser() user: AuthUser,
    @Param('orderNo') orderNo: string,
    @Body() dto: DeliverOrderDto
  ): Promise<DeliverOrderVo> {
    return this.riderActionService.deliver(user, orderNo, dto)
  }

  /* ==========================================================================
   * 3) 异常上报（T4.21 V4.21）
   * ========================================================================== */

  /**
   * 骑手异常上报
   *
   * 流程：
   *   - 校验 rider_id
   *   - 写 abnormal_report（status=0 待处理）
   *   - 订单状态保持不变；运营介入处理
   *   - 待 OrderEventName 扩展后接入事件总线（本期仅本服务 logger.log）
   */
  @Post(':orderNo/abnormal')
  @ApiOperation({
    summary: '骑手异常上报',
    description:
      '订单状态保持不变；写 abnormal_report 表（status=0 待处理）；运营介入再决定退款 / 转单 / 关单'
  })
  @ApiParam({ name: 'orderNo', description: '业务订单号' })
  @ApiBody({ type: AbnormalReportDto })
  @ApiSwaggerResponse({ status: 200, type: AbnormalReportVo })
  @ApiSwaggerResponse({ status: 200, description: '订单不存在 10300 / 非本人 20003' })
  abnormal(
    @CurrentUser() user: AuthUser,
    @Param('orderNo') orderNo: string,
    @Body() dto: AbnormalReportDto
  ): Promise<AbnormalReportVo> {
    return this.riderActionService.reportAbnormal(user, orderNo, dto)
  }

  /* ==========================================================================
   * 4) 转单申请
   * ========================================================================== */

  /**
   * 骑手转单申请
   *
   * 流程：
   *   - 校验 rider_id
   *   - 防重复：同订单同骑手仅允许 1 条 status=0 待审核记录
   *   - 写 transfer_record（status=0 申请中）
   *   - 订单状态保持
   *   - 管理审核 / 转入新骑手由 Sprint 6 Dispatch.transfer.service 接入
   */
  @Post(':orderNo/transfer')
  @ApiOperation({
    summary: '骑手转单申请',
    description:
      '订单状态保持不变；写 transfer_record（status=0 申请中）；同订单同骑手存在待审核记录则拒绝（10011）'
  })
  @ApiParam({ name: 'orderNo', description: '业务订单号' })
  @ApiBody({ type: TransferOrderDto })
  @ApiSwaggerResponse({ status: 200, type: TransferOrderVo })
  @ApiSwaggerResponse({
    status: 200,
    description: '订单不存在 10300 / 非本人 20003 / 重复申请 10011'
  })
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('orderNo') orderNo: string,
    @Body() dto: TransferOrderDto
  ): Promise<TransferOrderVo> {
    return this.riderActionService.requestTransfer(user, orderNo, dto)
  }
}
