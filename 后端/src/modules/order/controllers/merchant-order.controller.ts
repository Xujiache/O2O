/**
 * @file merchant-order.controller.ts
 * @stage P4/T4.17 + T4.22（Sprint 3）
 * @desc 商户端订单接口：接单 / 拒单 / 出餐 / 打印 / 列表
 * @author 单 Agent V2.0
 *
 * 鉴权：@UserTypes('merchant')
 * 单订单接口：service 层 assertMerchantShop（10302 非本商户订单）
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
import { type MerchantOrderQueryDto, type OrderKeysetPageVo } from '../dto/order-query.dto'
import { type PrintOrderResultVo, type RejectOrderDto } from '../dto/order-takeout.dto'
import { OrderTakeoutService } from '../services/order-takeout.service'
import { OrderService } from '../services/order.service'

@ApiTags('订单 - 商户端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller()
export class MerchantOrderController {
  constructor(
    private readonly takeoutService: OrderTakeoutService,
    private readonly orderService: OrderService
  ) {}

  /**
   * POST /merchant/order/:orderNo/accept
   */
  @Post('merchant/order/:orderNo/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '商户接单（仅 status=10）' })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '接单成功' })
  @ApiResponse({ status: 400, description: '10301 状态不允许接单' })
  @ApiResponse({ status: 403, description: '10302 非本商户订单' })
  async accept(
    @Param('orderNo') orderNo: string,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    return this.takeoutService.acceptByMerchant(orderNo, this.resolveMerchantId(user))
  }

  /**
   * POST /merchant/order/:orderNo/reject
   */
  @Post('merchant/order/:orderNo/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '商户拒单（仅 status=10；reason 必填）' })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '拒单成功；触发退款由 Sprint 4 Payment 订阅事件做' })
  async reject(
    @Param('orderNo') orderNo: string,
    @Body() dto: RejectOrderDto,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    return this.takeoutService.rejectByMerchant(orderNo, this.resolveMerchantId(user), dto)
  }

  /**
   * POST /merchant/order/:orderNo/ready
   */
  @Post('merchant/order/:orderNo/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '出餐完成（仅 status=20）' })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '出餐完成' })
  async ready(
    @Param('orderNo') orderNo: string,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    return this.takeoutService.readyByMerchant(orderNo, this.resolveMerchantId(user))
  }

  /**
   * POST /merchant/order/:orderNo/print
   */
  @Post('merchant/order/:orderNo/print')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '打印小票',
    description: '本期仅打日志返回 success；真打印由商户端 SDK 自接'
  })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '打印请求已记录' })
  async print(
    @Param('orderNo') orderNo: string,
    @CurrentUser() user: AuthUser
  ): Promise<PrintOrderResultVo> {
    return this.takeoutService.printByMerchant(orderNo, this.resolveMerchantId(user))
  }

  /**
   * GET /merchant/orders
   */
  @Get('merchant/orders')
  @ApiOperation({
    summary: '商户订单列表',
    description: '默认按当前商户名下全部店铺过滤；query.shopId 指定具体店铺；keyset 分页 + 多月跨表'
  })
  @ApiResponse({ status: 200, description: '订单列表（外卖；跑腿无商户维度）' })
  async list(
    @Query() query: MerchantOrderQueryDto,
    @CurrentUser() user: AuthUser
  ): Promise<OrderKeysetPageVo> {
    const merchantId = this.resolveMerchantId(user)
    const shopIds = await this.orderService.listMerchantShopIds(merchantId)
    return this.orderService.listByEnd({ kind: 'merchant', merchantId, shopIds }, query)
  }

  /**
   * 子账号场景下，AuthUser.merchantId 优先；否则取 uid 当作商户主体 ID
   */
  private resolveMerchantId(user: AuthUser): string {
    return user.merchantId ?? user.uid
  }
}
