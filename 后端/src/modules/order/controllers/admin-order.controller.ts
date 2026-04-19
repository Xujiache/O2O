/**
 * @file admin-order.controller.ts
 * @stage P4/T4.20 + T4.22（Sprint 3）
 * @desc 管理端订单接口：全量分页 + 强制取消 + 仲裁
 * @author 单 Agent V2.0
 *
 * 鉴权：@UserTypes('admin')
 * 写操作（force-cancel / arbitrate）必入 OperationLog（service 内已做）
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser, type AuthUser } from '@/modules/auth/decorators/current-user.decorator'
import { UserTypes } from '@/modules/auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '@/modules/auth/guards/user-type.guard'
import { type AdminArbitrateDto, type AdminForceCancelDto } from '../dto/order-cancel.dto'
import { type AdminOrderQueryDto, type OrderKeysetPageVo } from '../dto/order-query.dto'
import { OrderTakeoutService } from '../services/order-takeout.service'
import { OrderService } from '../services/order.service'

@ApiTags('订单 - 管理端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('admin')
@Controller()
export class AdminOrderController {
  constructor(
    private readonly takeoutService: OrderTakeoutService,
    private readonly orderService: OrderService
  ) {}

  /**
   * GET /admin/orders
   * 全量分页（外卖 + 跑腿）；可按 userId / shopId / riderId / cityCode / orderType / status / dateRange 过滤
   */
  @Get('admin/orders')
  @ApiOperation({
    summary: '管理员订单列表',
    description: '无 owner 限制；支持多维过滤；keyset 分页；多月跨表 UNION'
  })
  @ApiResponse({ status: 200, description: '订单列表' })
  async list(@Query() query: AdminOrderQueryDto): Promise<OrderKeysetPageVo> {
    return this.orderService.listByEnd({ kind: 'admin' }, query)
  }

  /**
   * POST /admin/order/:orderNo/force-cancel
   */
  @Post('admin/order/:orderNo/force-cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '强制取消订单',
    description:
      '写 OperationLog + transit → 60；释放库存 + 释放冻结券；triggerRefund=true 时由 Sprint 4 Payment 订阅事件做退款'
  })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '取消成功' })
  async forceCancel(
    @Param('orderNo') orderNo: string,
    @Body() dto: AdminForceCancelDto,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    return this.takeoutService.forceCancelByAdmin(orderNo, user.uid, dto)
  }

  /**
   * POST /admin/order/:orderNo/arbitrate
   */
  @Post('admin/order/:orderNo/arbitrate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '订单仲裁（标记 status=70 售后中）',
    description: '写 OperationLog；具体仲裁判定由 Sprint 7 Review 接入'
  })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '已标记售后中' })
  async arbitrate(
    @Param('orderNo') orderNo: string,
    @Body() dto: AdminArbitrateDto,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    return this.takeoutService.arbitrateByAdmin(orderNo, user.uid, dto)
  }
}
