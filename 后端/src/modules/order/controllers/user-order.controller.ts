/**
 * @file user-order.controller.ts
 * @stage P4/T4.16 + T4.17 + T4.20 + T4.22（Sprint 3）
 * @desc 用户端订单接口：pre-check / 下单 / 详情 / 列表 / 取消 / 确认收货 / 再来一单
 * @author 单 Agent V2.0
 *
 * 鉴权（任务书 §8.1）：
 *   - 类级 @UseGuards(JwtAuthGuard, UserTypeGuard) @UserTypes('user')
 *   - 详情 / 取消 / 确认收货 / 再来一单：service 层 assertUserOwner（10302）
 *
 * 路径前缀：/api/v1/user/order(s)
 *   - 单数 /user/order   下单 / pre-check / 单订单操作
 *   - 复数 /user/orders  列表
 */

import {
  Body,
  Controller,
  Get,
  Headers,
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
import {
  type ConfirmReceiveDto,
  type CreateTakeoutOrderDto,
  type CreateTakeoutOrderResultVo,
  type ReorderTakeoutDto
} from '../dto/order-takeout.dto'
import { type UserCancelOrderDto } from '../dto/order-cancel.dto'
import {
  type OrderDetailVo,
  type OrderKeysetPageVo,
  type UserOrderQueryDto
} from '../dto/order-query.dto'
import { type TakeoutPreCheckDto, type TakeoutPreCheckResultVo } from '../dto/order-pre-check.dto'
import { OrderTakeoutService } from '../services/order-takeout.service'
import { OrderPreCheckService } from '../services/order-pre-check.service'
import { OrderService } from '../services/order.service'
import { OrderTypeEnum } from '../types/order.types'

@ApiTags('订单 - 用户端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
@Controller()
export class UserOrderController {
  constructor(
    private readonly preCheckService: OrderPreCheckService,
    private readonly takeoutService: OrderTakeoutService,
    private readonly orderService: OrderService
  ) {}

  /**
   * POST /user/order/takeout/pre-check
   * 下单前校验 + 优惠预览（不落库）
   */
  @Post('user/order/takeout/pre-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '外卖下单前校验',
    description:
      '校验链：店铺营业 + 配送范围 + 商品在售 + SKU 库存 + 起送价 + DiscountCalc 优惠预览；不落库'
  })
  @ApiResponse({ status: 200, description: '校验通过 + 价格预览' })
  @ApiResponse({ status: 400, description: '10101 配送外 / 10102 起送价' })
  @ApiResponse({ status: 400, description: '10200 库存不足 / 10201 商品下架 / 10202 店铺打烊' })
  async preCheckTakeout(
    @Body() dto: TakeoutPreCheckDto,
    @CurrentUser() user: AuthUser
  ): Promise<TakeoutPreCheckResultVo> {
    const result = await this.preCheckService.preCheckTakeout(dto, user.uid)
    return result.preview
  }

  /**
   * POST /user/order/takeout
   * 创建外卖订单（待支付，15min 自动关单）
   */
  @Post('user/order/takeout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创建外卖订单',
    description:
      '幂等（Header X-Idem-Key）+ Redis 库存原子扣 + 优惠券冻结 + ZSet/BullMQ 双重超时关单'
  })
  @ApiResponse({ status: 200, description: '下单成功，返回订单号 + 应付金额 + 过期时间' })
  @ApiResponse({ status: 400, description: '10200/10201/10202 等业务错误' })
  async createTakeoutOrder(
    @Body() dto: CreateTakeoutOrderDto,
    @CurrentUser() user: AuthUser,
    @Headers('x-idem-key') idemKeyHeader?: string
  ): Promise<CreateTakeoutOrderResultVo> {
    return this.takeoutService.create(dto, user.uid, idemKeyHeader ?? dto.idemKey)
  }

  /**
   * GET /user/order/:orderNo
   * 订单详情（owner 校验）
   *
   * 兼容外卖 / 跑腿：根据 orderNo 前缀 'T'/'E' 自动识别 orderType
   */
  @Get('user/order/:orderNo')
  @ApiOperation({ summary: '订单详情' })
  @ApiParam({ name: 'orderNo', description: '订单号（18 位）' })
  @ApiResponse({ status: 200, description: '订单详情' })
  @ApiResponse({ status: 404, description: '10300 订单不存在' })
  @ApiResponse({ status: 403, description: '10302 非本人订单' })
  async detail(
    @Param('orderNo') orderNo: string,
    @CurrentUser() user: AuthUser
  ): Promise<OrderDetailVo> {
    const orderType = this.resolveOrderType(orderNo)
    await this.orderService.assertUserOwner(orderNo, user.uid, orderType)
    return this.orderService.detail(orderNo, orderType)
  }

  /**
   * GET /user/orders
   * 用户订单列表（keyset + 多月跨表 UNION）
   */
  @Get('user/orders')
  @ApiOperation({
    summary: '用户订单列表',
    description: '默认近 90 天；keyset 分页（cursor + hasMore + nextCursor）；多端跨月 UNION'
  })
  @ApiResponse({ status: 200, description: '订单列表（外卖 + 跑腿）' })
  async list(
    @Query() query: UserOrderQueryDto,
    @CurrentUser() user: AuthUser
  ): Promise<OrderKeysetPageVo> {
    return this.orderService.listByEnd({ kind: 'user', userId: user.uid }, query)
  }

  /**
   * POST /user/order/:orderNo/cancel
   * 用户取消（仅 status=0/10）
   */
  @Post('user/order/:orderNo/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户取消订单（仅待支付 / 待接单）' })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '取消成功' })
  @ApiResponse({ status: 400, description: '10301 状态不允许取消' })
  @ApiResponse({ status: 403, description: '10302 非本人订单' })
  async cancel(
    @Param('orderNo') orderNo: string,
    @Body() dto: UserCancelOrderDto,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    return this.takeoutService.cancelByUser(orderNo, user.uid, dto)
  }

  /**
   * POST /user/order/:orderNo/confirm-receive
   * 用户确认收货（仅 status=50）
   */
  @Post('user/order/:orderNo/confirm-receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户确认收货', description: '触发 OrderFinished 事件 → 进入分账' })
  @ApiParam({ name: 'orderNo', description: '订单号' })
  @ApiResponse({ status: 200, description: '确认成功' })
  async confirmReceive(
    @Param('orderNo') orderNo: string,
    @Body() dto: ConfirmReceiveDto,
    @CurrentUser() user: AuthUser
  ): Promise<{ ok: true }> {
    return this.takeoutService.confirmReceiveByUser(orderNo, user.uid, dto)
  }

  /**
   * POST /user/order/:orderNo/re-order
   * 再来一单（拷贝原 items + 新地址）
   */
  @Post('user/order/:orderNo/re-order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '再来一单（拷贝原订单商品 + 新地址重新下单）' })
  @ApiParam({ name: 'orderNo', description: '原订单号' })
  @ApiResponse({ status: 200, description: '新订单已创建' })
  async reorder(
    @Param('orderNo') orderNo: string,
    @Body() dto: ReorderTakeoutDto,
    @CurrentUser() user: AuthUser,
    @Headers('x-idem-key') idemKeyHeader?: string
  ): Promise<CreateTakeoutOrderResultVo> {
    return this.takeoutService.reorderByUser(orderNo, user.uid, dto, idemKeyHeader)
  }

  /* ==========================================================================
   * 内部
   * ========================================================================== */

  /**
   * 根据订单号前缀识别订单类型（'T' 外卖 / 'E' 跑腿）
   */
  private resolveOrderType(orderNo: string): 1 | 2 {
    if (!orderNo) return OrderTypeEnum.TAKEOUT
    return orderNo.charAt(0) === 'E' ? OrderTypeEnum.ERRAND : OrderTypeEnum.TAKEOUT
  }
}
