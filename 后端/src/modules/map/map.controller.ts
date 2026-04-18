/**
 * @file map.controller.ts
 * @stage P3/T3.19~T3.22 + P3-REVIEW-01 R1（I-02 修复）
 * @desc Map 模块 7 个对外接口（含 1 个内部 shop-area 缓存预热）
 * @author 员工 C 初版 + 员工 A R1 接管（加守卫 + UserTypes 限制 + rider/report 防伪造）
 *
 * R1 修复点：
 *   1. 类级 @UseGuards(JwtAuthGuard)（已有 @ApiBearerAuth）—— 全部接口必须登录
 *   2. POST /rider/report           覆盖为 @UserTypes('rider')；service 层校验 dto.riderId === user.uid
 *   3. GET  /rider/:id/track/:orderNo  限 user / rider / admin 访问
 *   4. POST /shop-area              限 merchant / admin 访问
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator'
import { UserTypes } from '../auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '../auth/guards/user-type.guard'
import { BizErrorCode, BusinessException } from '@/common'
import {
  DistanceQueryDto,
  DistanceResultDto,
  GeocodeQueryDto,
  GeocodeResultDto,
  RegeocodeQueryDto,
  RegeocodeResultDto,
  RiderReportDto,
  RiderReportResultDto,
  RoutingQueryDto,
  RoutingResultDto,
  SetShopAreaDto,
  TrackQueryDto,
  TrackResultDto,
  WithinAreaDto,
  WithinAreaResultDto
} from './dto/map.dto'
import { MapService } from './map.service'
import { RiderLocationService } from './rider-location.service'

/**
 * Map Controller —— 7 个对外接口
 *
 * 路径前缀：/api/v1/map
 * 鉴权（R1 加固）：
 *   类级 @UseGuards(JwtAuthGuard)：所有接口必须登录
 *   3 个特殊接口在方法级追加 UserTypeGuard：
 *     - POST /rider/report             仅 rider（且 dto.riderId 必须 === user.uid）
 *     - GET  /rider/:id/track/:orderNo  user / rider / admin
 *     - POST /shop-area                merchant / admin
 *
 * 接口列表：
 *   GET  /geocode                  地址 → 坐标
 *   GET  /regeocode                坐标 → 地址
 *   GET  /distance                 两点距离
 *   GET  /routing                  路径规划
 *   POST /within-area              配送范围校验
 *   POST /shop-area                运营预热商户配送 polygon 缓存（merchant/admin）
 *   POST /rider/report             骑手位置上报（rider 专属）
 *   GET  /rider/:id/track/:orderNo 轨迹查询（user/rider/admin）
 */
@ApiTags('地图 / Map')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('map')
export class MapController {
  constructor(
    private readonly mapService: MapService,
    private readonly riderLocService: RiderLocationService
  ) {}

  /**
   * 地址 → 坐标
   * 参数：query GeocodeQueryDto
   * 返回值：GeocodeResultDto
   */
  @Get('geocode')
  @ApiOperation({
    summary: '地理编码：地址→坐标',
    description:
      '调用高德 v3/geocode/geo；命中 Redis `geocode:{md5(address)}` 7d；错误码 40004 MAP_PROVIDER_ERROR'
  })
  @ApiResponse({ status: 200, description: '解析成功', type: GeocodeResultDto })
  @ApiResponse({ status: 502, description: '高德 HTTP 异常 / 业务 status=0' })
  async geocode(@Query() query: GeocodeQueryDto): Promise<GeocodeResultDto> {
    return this.mapService.geocode(query.address, query.city)
  }

  /**
   * 坐标 → 地址
   * 参数：query RegeocodeQueryDto
   * 返回值：RegeocodeResultDto
   */
  @Get('regeocode')
  @ApiOperation({
    summary: '逆地理编码：坐标→地址',
    description: '调用高德 v3/geocode/regeo；命中 Redis `regeocode:{lng,lat round5}` 1d'
  })
  @ApiResponse({ status: 200, description: '解析成功', type: RegeocodeResultDto })
  async regeocode(@Query() query: RegeocodeQueryDto): Promise<RegeocodeResultDto> {
    return this.mapService.regeocode(query.lng, query.lat)
  }

  /**
   * 两点距离
   * 参数：query DistanceQueryDto
   * 返回值：DistanceResultDto
   */
  @Get('distance')
  @ApiOperation({
    summary: '两点距离（直线 / 驾车 / 步行）',
    description:
      'type=0 直线（应用层 Haversine，0 网络往返）；type=1 驾车 / type=3 步行 走高德 v3/distance'
  })
  @ApiResponse({ status: 200, description: '计算成功', type: DistanceResultDto })
  async distance(@Query() query: DistanceQueryDto): Promise<DistanceResultDto> {
    return this.mapService.distance(
      query.fromLng,
      query.fromLat,
      query.toLng,
      query.toLat,
      (query.type ?? '0') as '0' | '1' | '3'
    )
  }

  /**
   * 路径规划
   * 参数：query RoutingQueryDto
   * 返回值：RoutingResultDto
   */
  @Get('routing')
  @ApiOperation({
    summary: '路径规划（驾车 / 步行 / 骑行 / 电动车）',
    description:
      '命中 Redis `route:{from}:{to}:{type}` 30min；返回 GeoJSON 风格路径节点 path: number[][]'
  })
  @ApiResponse({ status: 200, description: '路径成功', type: RoutingResultDto })
  async routing(@Query() query: RoutingQueryDto): Promise<RoutingResultDto> {
    return this.mapService.routing(
      query.fromLng,
      query.fromLat,
      query.toLng,
      query.toLat,
      query.routeType ?? 'driving'
    )
  }

  /**
   * 配送范围校验
   * 参数：dto WithinAreaDto
   * 返回值：WithinAreaResultDto
   */
  @Post('within-area')
  @ApiOperation({
    summary: '配送范围校验（点-多边形）',
    description:
      '取 Redis `shop:deliveryArea:{shopId}` 5min；miss 查 MySQL delivery_area；用 turf.booleanPointInPolygon 判定'
  })
  @ApiResponse({ status: 200, description: '校验成功', type: WithinAreaResultDto })
  async withinArea(@Body() dto: WithinAreaDto): Promise<WithinAreaResultDto> {
    return this.mapService.withinArea(dto)
  }

  /**
   * 运营预热商户配送 polygon 缓存（仅 merchant / admin）
   * 参数：dto SetShopAreaDto
   * 返回值：{ ok: true }
   */
  @Post('shop-area')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant', 'admin')
  @ApiOperation({
    summary: '【内部】预热商户配送 polygon 缓存（merchant / admin）',
    description:
      '商户后台保存 polygon 后调用，TTL 5 分钟；不写库（写库由商户后台 service 自行处理）'
  })
  @ApiResponse({ status: 200, description: '已写入缓存' })
  async setShopArea(@Body() dto: SetShopAreaDto): Promise<{ ok: true }> {
    await this.mapService.setShopArea(dto)
    return { ok: true }
  }

  /**
   * 骑手位置上报（仅 rider）
   * 参数：dto RiderReportDto；user AuthUser
   * 返回值：RiderReportResultDto
   *
   * 防伪造：
   *   - 类级 JwtAuthGuard 解析出 user.userType / user.uid
   *   - 方法级 UserTypeGuard 限定 'rider'
   *   - 业务校验：dto.riderId 必须 === user.uid（防止骑手 A 伪造骑手 B 的位置）
   *   - 不通过抛 20003 AUTH_PERMISSION_DENIED
   */
  @Post('rider/report')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider')
  @ApiOperation({
    summary: '骑手位置上报（异步入 TimescaleDB；仅 rider 端）',
    description:
      '同步：写 Redis Hash `rider:loc:{riderId}` (60s) + GEO `rider:online:{cityCode}`；\n' +
      '异步：投递 RabbitMQ `rider.location` → consumer 每秒批量写 TimescaleDB（默认 2000 条/批）。\n' +
      '严禁同步直写 TimescaleDB；接口 P95 ≤ 50ms；\n' +
      '入参 dto.riderId 必须 === 当前登录骑手 uid，否则 20003 AUTH_PERMISSION_DENIED'
  })
  @ApiResponse({ status: 200, description: '上报成功', type: RiderReportResultDto })
  @ApiResponse({ status: 502, description: 'MQ 投递失败' })
  async report(
    @Body() dto: RiderReportDto,
    @CurrentUser() user: AuthUser
  ): Promise<RiderReportResultDto> {
    if (dto.riderId !== user.uid) {
      throw new BusinessException(
        BizErrorCode.AUTH_PERMISSION_DENIED,
        `dto.riderId(${dto.riderId}) 与登录骑手 uid(${user.uid}) 不一致，禁止伪造他人位置`
      )
    }
    return this.riderLocService.reportBatch(dto)
  }

  /**
   * 轨迹查询（user / rider / admin）
   * 参数：riderId / orderNo / fromTs / toTs
   * 返回值：TrackResultDto（含 GeoJSON LineString）
   *
   * 安全：
   *   - 用户端只能查自己订单的骑手轨迹（业务侧应通过 orderNo 反查 user_id 比对，
   *     本期由调用方 P4 接入；本控制器仅做 userType 维度限制）
   *   - 骑手端只能查自己的轨迹（同样应在 service 层比对，本期透传）
   *   - 管理员端无限制
   */
  @Get('rider/:id/track/:orderNo')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user', 'rider', 'admin')
  @ApiOperation({
    summary: '轨迹查询（GeoJSON LineString；user / rider / admin）',
    description: '直查 TimescaleDB rider_location_ts；按 (rider_id, time DESC) 索引；最多 5000 点'
  })
  @ApiParam({ name: 'id', description: '骑手 ID', example: '8000000000000000001' })
  @ApiParam({ name: 'orderNo', description: '订单号', example: 'T20260419AB123' })
  @ApiResponse({ status: 200, description: '查询成功', type: TrackResultDto })
  async track(
    @Param('id') riderId: string,
    @Param('orderNo') orderNo: string,
    @Query() query: TrackQueryDto
  ): Promise<TrackResultDto> {
    return this.mapService.queryTrack(riderId, orderNo, query.fromTs, query.toTs)
  }
}
