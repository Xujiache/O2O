/**
 * @file user-errand-order.controller.ts
 * @stage P4/T4.18 + T4.19（Sprint 3）
 * @desc 用户端跑腿订单接口：价格预估 + 4 类下单（POST /user/order/errand/*）
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 路径前缀：/api/v1（main.ts setGlobalPrefix）
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + UserTypes('user')
 *
 * 接口（4 个）：
 *   - POST /user/order/errand/price        价格预估（T4.19）
 *   - POST /user/order/errand              通用下单入口（按 dto.serviceType 自动分发）
 *   - POST /user/order/errand/help-buy     可选直走帮买分发（保留语义化路径，便于前端按服务区分）
 *   - POST /user/order/errand/help-queue   可选直走帮排队分发
 *
 * 注：帮送 / 帮取共用统一入口（POST /user/order/errand），由 dto.serviceType 区分
 */

import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser, UserTypes, type AuthUser } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  CreateErrandOrderDto,
  ErrandOrderVo,
  EstimateErrandPriceDto,
  EstimateResultVo
} from '../dto/errand.dto'
import { OrderErrandService } from '../services/order-errand.service'
import { ErrandPricingService } from '../services/errand-pricing.service'

@ApiTags('订单 - 跑腿（用户端）')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
@Controller('user/order/errand')
export class UserErrandOrderController {
  constructor(
    private readonly errandService: OrderErrandService,
    private readonly pricingService: ErrandPricingService
  ) {}

  /* ==========================================================================
   * T4.19 价格预估
   * ========================================================================== */

  /**
   * 跑腿价格预估
   *
   * 业务说明：
   *   - 入参 cityCode 决定从 sys_config 取定价规则；缺配置走 DEFAULT_PRICING（mock）
   *   - 出参含 baseFee / distanceFee / weightFee / nightSurcharge / weatherSurcharge /
   *     insuranceFee / queueFee / serviceFee（已乘服务系数） / estimatedTotal + details 明细
   */
  @Post('price')
  @ApiOperation({
    summary: '跑腿价格预估（T4.19）',
    description:
      '按 sys_config(dispatch.pricing.{cityCode}) 规则 + 距离 / 重量 / 夜间 / 天气 / 保价 / 服务系数 计算；缺配置降级 DEFAULT_PRICING'
  })
  @ApiBody({ type: EstimateErrandPriceDto })
  @ApiSwaggerResponse({ status: 200, type: EstimateResultVo })
  estimatePrice(@Body() dto: EstimateErrandPriceDto): Promise<EstimateResultVo> {
    return this.pricingService.estimate(dto)
  }

  /* ==========================================================================
   * T4.18 跑腿下单（通用入口 + 3 个语义化分发）
   * ========================================================================== */

  /**
   * 跑腿下单（通用入口；4 类 service_type 共用）
   *
   * 流程：
   *   1) 按 serviceType 校验关联字段
   *   2) 幂等 X-Idem-Key SETNX（10 min TTL；命中则查并返回原 orderNo）
   *   3) 取价 + 冻券 + 计算 pay_amount
   *   4) 生成 orderNo + pickupCode → INSERT 主表 + status_log
   *   5) 写 ZSet 待支付超时（15 min）
   *   6) 发 OrderCreated 事件 + 站内信
   */
  @Post()
  @ApiOperation({
    summary: '跑腿下单（T4.18 通用入口；按 serviceType 自动分发到 4 类业务）',
    description:
      '事务内 INSERT order_errand_YYYYMM + INSERT order_status_log + 冻结优惠券；写 ZSet 超时；发 OrderCreated 事件'
  })
  @ApiHeader({
    name: 'X-Idem-Key',
    description: '客户端幂等 ID（可选；同 ID 10 分钟内重复提交直接返回原订单）',
    required: false
  })
  @ApiBody({ type: CreateErrandOrderDto })
  @ApiSwaggerResponse({ status: 200, type: ErrandOrderVo })
  @ApiSwaggerResponse({ status: 200, description: '配送范围外 10101 / 业务校验失败 10001' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateErrandOrderDto,
    @Headers('x-idem-key') idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.errandService.create(user, dto, idemKey)
  }

  /**
   * 跑腿下单 - 帮送（service_type=1 强制）
   *
   * 注：与通用入口等价；保留语义化路径方便前端 SEO 和按服务统计；DTO 内 serviceType 字段会被忽略
   */
  @Post('help-deliver')
  @ApiOperation({
    summary: '跑腿下单 - 帮送（serviceType=1，固定）',
    description: '入参 DTO.serviceType 字段会被强制覆盖为 1'
  })
  @ApiHeader({ name: 'X-Idem-Key', required: false })
  @ApiSwaggerResponse({ status: 200, type: ErrandOrderVo })
  createHelpDeliver(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateErrandOrderDto,
    @Headers('x-idem-key') idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.errandService.createHelpDeliver(user, dto, idemKey)
  }

  /**
   * 跑腿下单 - 帮取（service_type=2 强制）
   */
  @Post('help-fetch')
  @ApiOperation({
    summary: '跑腿下单 - 帮取（serviceType=2，固定）',
    description: '入参 DTO.serviceType 字段会被强制覆盖为 2'
  })
  @ApiHeader({ name: 'X-Idem-Key', required: false })
  @ApiSwaggerResponse({ status: 200, type: ErrandOrderVo })
  createHelpFetch(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateErrandOrderDto,
    @Headers('x-idem-key') idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.errandService.createHelpFetch(user, dto, idemKey)
  }

  /**
   * 跑腿下单 - 帮买（service_type=3 强制；必填 helpBuy.buyList + buyBudget）
   */
  @Post('help-buy')
  @ApiOperation({
    summary: '跑腿下单 - 帮买（serviceType=3，固定）',
    description:
      '必填 helpBuy.buyList（≥ 1 条）+ helpBuy.buyBudget；入参 DTO.serviceType 被强制覆盖为 3'
  })
  @ApiHeader({ name: 'X-Idem-Key', required: false })
  @ApiSwaggerResponse({ status: 200, type: ErrandOrderVo })
  createHelpBuy(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateErrandOrderDto,
    @Headers('x-idem-key') idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.errandService.createHelpBuy(user, dto, idemKey)
  }

  /**
   * 跑腿下单 - 帮排队（service_type=4 强制；必填 helpQueue.{queuePlace, queueType, queueDurationMin}）
   */
  @Post('help-queue')
  @ApiOperation({
    summary: '跑腿下单 - 帮排队（serviceType=4，固定）',
    description:
      '必填 helpQueue.queuePlace + queueType + queueDurationMin；入参 DTO.serviceType 被强制覆盖为 4'
  })
  @ApiHeader({ name: 'X-Idem-Key', required: false })
  @ApiSwaggerResponse({ status: 200, type: ErrandOrderVo })
  createHelpQueue(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateErrandOrderDto,
    @Headers('x-idem-key') idemKey?: string
  ): Promise<ErrandOrderVo> {
    return this.errandService.createHelpQueue(user, dto, idemKey)
  }
}
