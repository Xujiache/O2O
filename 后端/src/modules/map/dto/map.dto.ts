import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator'

/** 路径规划方式（高德 v3 API） */
export const ROUTING_TYPES = ['driving', 'walking', 'bicycling', 'electrobike'] as const
export type RoutingType = (typeof ROUTING_TYPES)[number]

/**
 * 地理编码（地址 → 坐标）
 * 接口：GET /api/v1/map/geocode?address=xxx&city=xxx
 */
export class GeocodeQueryDto {
  @ApiProperty({ description: '完整地址（建议含市/区）', example: '北京市朝阳区望京 SOHO 塔1' })
  @IsString()
  @MaxLength(255)
  address!: string

  @ApiProperty({
    description: '城市编码 / 中文名（提高准确度）',
    required: false,
    example: '110000'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string
}

/**
 * 地理编码返回（高德 status=1 时取 geocodes[0]）
 */
export class GeocodeResultDto {
  @ApiProperty({ description: '经度（GCJ-02）', example: 116.4806 })
  lng!: number

  @ApiProperty({ description: '纬度（GCJ-02）', example: 39.9938 })
  lat!: number

  @ApiProperty({
    description: '匹配级别（country / province / city / district / poi）',
    example: 'poi'
  })
  level!: string

  @ApiProperty({ description: '完整匹配地址', example: '北京市朝阳区望京 SOHO 塔1' })
  formatted!: string

  @ApiProperty({ description: '城市编码', required: false, example: '110000' })
  cityCode?: string

  @ApiProperty({ description: '区县编码', required: false, example: '110105' })
  adcode?: string
}

/**
 * 逆地理编码（坐标 → 地址）
 * 接口：GET /api/v1/map/regeocode?lng=xxx&lat=xxx
 */
export class RegeocodeQueryDto {
  @ApiProperty({ description: '经度', example: 116.4806 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number

  @ApiProperty({ description: '纬度', example: 39.9938 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number
}

export class RegeocodeResultDto {
  @ApiProperty({ description: '完整地址', example: '北京市朝阳区望京街' })
  formatted!: string

  @ApiProperty({ description: '省', example: '北京市' })
  province!: string

  @ApiProperty({ description: '市', example: '北京市' })
  city!: string

  @ApiProperty({ description: '区/县', example: '朝阳区' })
  district!: string

  @ApiProperty({ description: '城市编码', required: false, example: '110000' })
  cityCode?: string

  @ApiProperty({ description: '区县编码', required: false, example: '110105' })
  adcode?: string
}

/**
 * 距离计算
 * 接口：GET /api/v1/map/distance?fromLng=&fromLat=&toLng=&toLat=&type=
 */
export class DistanceQueryDto {
  @ApiProperty({ description: '起点经度', example: 116.4806 })
  @Type(() => Number)
  @IsLongitude()
  fromLng!: number

  @ApiProperty({ description: '起点纬度', example: 39.9938 })
  @Type(() => Number)
  @IsLatitude()
  fromLat!: number

  @ApiProperty({ description: '终点经度', example: 116.4047 })
  @Type(() => Number)
  @IsLongitude()
  toLng!: number

  @ApiProperty({ description: '终点纬度', example: 39.9145 })
  @Type(() => Number)
  @IsLatitude()
  toLat!: number

  @ApiProperty({
    description: '距离类型：0 直线（haversine 应用层算）；1 驾车；3 步行；以高德 distance 接口为准',
    required: false,
    enum: ['0', '1', '3'],
    default: '0',
    example: '0'
  })
  @IsOptional()
  @IsIn(['0', '1', '3'])
  type?: string = '0'
}

export class DistanceResultDto {
  @ApiProperty({ description: '距离（米）', example: 8125 })
  distance!: number

  @ApiProperty({ description: '驾车/步行预计耗时（秒）；直线模式为 0', example: 1080 })
  duration!: number

  @ApiProperty({ description: '类型：line / driving / walking', example: 'line' })
  type!: string
}

/**
 * 路径规划
 * 接口：GET /api/v1/map/routing?fromLng=&fromLat=&toLng=&toLat=&type=
 */
export class RoutingQueryDto extends DistanceQueryDto {
  @ApiProperty({
    description: '路径类型',
    enum: ROUTING_TYPES,
    default: 'driving',
    example: 'driving'
  })
  @IsOptional()
  @IsIn(ROUTING_TYPES as unknown as string[])
  routeType?: RoutingType = 'driving'
}

export class RoutingResultDto {
  @ApiProperty({ description: '总距离（米）', example: 8125 })
  distance!: number

  @ApiProperty({ description: '总耗时（秒）', example: 1080 })
  duration!: number

  @ApiProperty({
    description: '路径节点（GeoJSON LineString.coordinates）',
    example: [
      [116.4806, 39.9938],
      [116.4047, 39.9145]
    ]
  })
  path!: number[][]

  @ApiProperty({ description: '路径类型', example: 'driving' })
  type!: string
}

/**
 * 配送范围校验
 * 接口：POST /api/v1/map/within-area
 */
export class WithinAreaDto {
  @ApiProperty({
    description: '商户/服务区 ID（type=1 时为 shop.id；type=2 时为 area.id）',
    example: '7000000000000000001'
  })
  @IsString()
  @MaxLength(32)
  shopId!: string

  @ApiProperty({ description: '校验经度', example: 116.4806 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number

  @ApiProperty({ description: '校验纬度', example: 39.9938 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number
}

export class WithinAreaResultDto {
  @ApiProperty({ description: '是否在配送范围内', example: true })
  within!: boolean

  @ApiProperty({
    description: '所属配送区域 ID（命中时）',
    required: false,
    example: '7000000000000000003'
  })
  areaId?: string

  @ApiProperty({ description: '基础配送费（type=1 时返回）', required: false, example: 5 })
  deliveryFee?: number

  @ApiProperty({ description: '起送价（type=1 时返回）', required: false, example: 20 })
  minOrder?: number
}

/**
 * 单条骑手位置
 */
export class RiderLocationItemDto {
  @ApiProperty({ description: '上报时刻（毫秒时间戳）', example: 1745040000000 })
  @IsInt()
  @Min(0)
  ts!: number

  @ApiProperty({ description: '经度', example: 116.4806 })
  @IsLongitude()
  lng!: number

  @ApiProperty({ description: '纬度', example: 39.9938 })
  @IsLatitude()
  lat!: number

  @ApiProperty({ description: '速度（公里/小时）', required: false, example: 18 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  speedKmh?: number

  @ApiProperty({ description: '方向（度，0~359）', required: false, example: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(359)
  dir?: number

  @ApiProperty({ description: '定位精度（米）', required: false, example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  acc?: number

  @ApiProperty({ description: '电池电量（百分比）', required: false, example: 80 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  battery?: number

  @ApiProperty({
    description: '关联订单号（无单时为 null）',
    required: false,
    example: 'T20260419AB123'
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNo?: string | null
}

/**
 * 骑手位置上报
 * 接口：POST /api/v1/map/rider/report
 */
export class RiderReportDto {
  @ApiProperty({ description: '骑手 ID', example: '8000000000000000001' })
  @IsString()
  riderId!: string

  @ApiProperty({ description: '城市编码（用于 Redis GEO 分组）', example: '110100' })
  @IsString()
  @MaxLength(8)
  cityCode!: string

  @ApiProperty({
    description: '一批位置（建议 1~6 条，覆盖最近 60 秒）',
    type: [RiderLocationItemDto]
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => RiderLocationItemDto)
  locations!: RiderLocationItemDto[]
}

export class RiderReportResultDto {
  @ApiProperty({ description: '本次接收上报点数', example: 1 })
  accepted!: number

  @ApiProperty({ description: 'Redis GEO 是否更新', example: true })
  geoUpdated!: boolean

  @ApiProperty({ description: 'MQ 投递批次 ID', example: 'rider-loc-1745040000000-7' })
  batchId!: string
}

/**
 * 轨迹查询
 * 接口：GET /api/v1/map/rider/:id/track/:orderNo
 */
export class TrackQueryDto {
  @ApiProperty({ description: '可选起始时间 ISO；默认订单创建后', required: false })
  @IsOptional()
  @IsString()
  fromTs?: string

  @ApiProperty({ description: '可选结束时间 ISO；默认 now', required: false })
  @IsOptional()
  @IsString()
  toTs?: string
}

export class TrackResultDto {
  @ApiProperty({ description: '骑手 ID', example: '8000000000000000001' })
  riderId!: string

  @ApiProperty({ description: '订单号', example: 'T20260419AB123' })
  orderNo!: string

  @ApiProperty({ description: '点数', example: 47 })
  pointCount!: number

  @ApiProperty({
    description: 'GeoJSON LineString',
    example: {
      type: 'LineString',
      coordinates: [
        [116.4806, 39.9938],
        [116.4047, 39.9145]
      ]
    }
  })
  geometry!: { type: 'LineString'; coordinates: number[][] }

  @ApiProperty({
    description: '原始时刻数组（毫秒时间戳）',
    example: [1745040000000, 1745040010000]
  })
  timestamps!: number[]

  @ApiProperty({
    description: '可选 properties：起止时间 / 总距离米 / 平均速度 km/h',
    example: { startMs: 1745040000000, endMs: 1745040600000, totalDistanceM: 8125, avgSpeedKmh: 28 }
  })
  properties!: {
    startMs: number
    endMs: number
    totalDistanceM: number
    avgSpeedKmh: number
  }
}

/**
 * 配送 polygon 缓存输入（业务模块若直接调用 setShopArea 时使用，本期对外不暴露 controller）
 */
export class SetShopAreaDto {
  @ApiProperty({ description: '商户 ID', example: '7000000000000000001' })
  @IsString()
  shopId!: string

  @ApiProperty({
    description: 'GeoJSON Polygon（外环顺时针；首尾必须闭合）',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [116.47, 39.99],
          [116.49, 39.99],
          [116.49, 39.97],
          [116.47, 39.97],
          [116.47, 39.99]
        ]
      ]
    }
  })
  polygon!: { type: 'Polygon'; coordinates: number[][][] }

  @ApiProperty({ description: '基础配送费', required: false, example: 5 })
  @IsOptional()
  @IsNumber()
  deliveryFee?: number

  @ApiProperty({ description: '起送价', required: false, example: 20 })
  @IsOptional()
  @IsNumber()
  minOrder?: number

  @ApiProperty({ description: '是否覆盖既有缓存', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean = true
}
