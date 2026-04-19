/**
 * @file errand.dto.ts
 * @stage P4/T4.18 + T4.19（Sprint 3）
 * @desc 跑腿订单 DTO：4 类 service_type 下单入参 + 价格预估入参/出参 + 订单 VO + pre-check 结构
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 服务类型枚举（与 04_order.sql order_errand_template.service_type 对齐）：
 *   1 帮送  HelpDeliver  - 取件地址 + 送达地址 + item_type + item_weight_g
 *   2 帮取  HelpFetch    - 同 1，方向反向（理论意义；表结构相同）
 *   3 帮买  HelpBuy      - buy_list JSON + buy_budget + 送达地址（取件地址=商家位置）
 *   4 帮排队 HelpQueue   - queue_place + queue_type + queue_duration_min + 送达地址（可选）
 *
 * 金额一律 string + service 层 BigNumber 计算；禁止 number。
 * 经纬度（lng/lat）使用 number；按 04_order.sql DECIMAL(10,7) 落库。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator'

/* ============================================================================
 * 枚举常量
 * ============================================================================ */

/** 服务类型（1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队） */
export const ERRAND_SERVICE_TYPES = [1, 2, 3, 4] as const
export type ErrandServiceType = (typeof ERRAND_SERVICE_TYPES)[number]

/** 城市编码模式（最多 8 位字符，对齐 sys_dict cityCode 长度） */
const CITY_CODE_MAX_LEN = 8

/* ============================================================================
 * 子结构：地址 / 物品 / 帮买清单 / 帮排队信息
 * ============================================================================ */

/**
 * 地址子结构（取件 / 送达 共用，落库到 pickup_snapshot / delivery_snapshot JSON）
 * 字段：
 *   - addressId 用户地址簿 ID（可空：临时输入地址）
 *   - contactName / contactMobile  联系人姓名 / 手机
 *   - province / city / district / detail  四级地址 + 详细
 *   - lng / lat  GCJ-02 经纬度（用于距离 / 派单）
 */
export class ErrandAddressDto {
  @ApiPropertyOptional({ description: '用户地址簿 ID（user_address.id；临时地址可空）' })
  @IsOptional()
  @IsString()
  addressId?: string

  @ApiProperty({ description: '联系人姓名', example: '张三' })
  @IsString()
  @Length(1, 50)
  contactName!: string

  @ApiProperty({ description: '联系人手机号', example: '13800138000' })
  @IsString()
  @Length(11, 20)
  contactMobile!: string

  @ApiProperty({ description: '省', example: '北京市' })
  @IsString()
  @MaxLength(50)
  province!: string

  @ApiProperty({ description: '市', example: '北京市' })
  @IsString()
  @MaxLength(50)
  city!: string

  @ApiProperty({ description: '区/县', example: '海淀区' })
  @IsString()
  @MaxLength(50)
  district!: string

  @ApiProperty({ description: '详细地址', example: '中关村大街 1 号 5 层' })
  @IsString()
  @MaxLength(200)
  detail!: string

  @ApiProperty({ description: '经度（GCJ-02）', example: 116.310003 })
  @Type(() => Number)
  @IsLongitude({ message: 'lng 必须为合法经度' })
  lng!: number

  @ApiProperty({ description: '纬度（GCJ-02）', example: 39.991957 })
  @Type(() => Number)
  @IsLatitude({ message: 'lat 必须为合法纬度' })
  lat!: number
}

/**
 * 帮买清单单条（service_type=3）
 * 字段：
 *   - name 品名（必填，骑手按此购买）
 *   - qty  数量（≥ 1）
 *   - price 单价（元，字符串；可空：到现场询价后填）
 */
export class BuyListItemDto {
  @ApiProperty({ description: '商品名称', example: '可口可乐 330ml' })
  @IsString()
  @Length(1, 64)
  name!: string

  @ApiProperty({ description: '数量', minimum: 1, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number

  @ApiPropertyOptional({
    description: '单价（元，字符串；现场询价填）',
    example: '3.50'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'price 必须为最多 2 位小数的字符串' })
  price?: string
}

/**
 * 帮买专属字段（service_type=3）
 */
export class HelpBuyDetailDto {
  @ApiProperty({ description: '帮买清单（≥ 1 条）', type: BuyListItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1, { message: 'buyList 至少 1 条' })
  @ArrayMaxSize(20, { message: 'buyList 最多 20 条' })
  @ValidateNested({ each: true })
  @Type(() => BuyListItemDto)
  buyList!: BuyListItemDto[]

  @ApiProperty({ description: '帮买预算（元，字符串）', example: '50.00' })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'buyBudget 必须为最多 2 位小数的字符串' })
  buyBudget!: string
}

/**
 * 帮排队专属字段（service_type=4）
 */
export class HelpQueueDetailDto {
  @ApiProperty({ description: '排队场所（医院 / 网红店 / 政务大厅 等）', example: '北京同仁医院' })
  @IsString()
  @Length(2, 200)
  queuePlace!: string

  @ApiProperty({
    description: '排队类型（hospital / restaurant / gov / other）',
    example: 'hospital'
  })
  @IsString()
  @Length(2, 64)
  queueType!: string

  @ApiProperty({
    description: '预计排队时长（分钟，1 ~ 480）',
    minimum: 1,
    maximum: 480,
    example: 60
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  queueDurationMin!: number
}

/* ============================================================================
 * T4.19 价格预估
 * ============================================================================ */

/**
 * 跑腿价格预估入参
 *
 * 业务说明：
 *   - 出发地（pickupLng/pickupLat）→ 送达地（deliveryLng/deliveryLat）距离决定基础+里程费
 *   - 重量超过免重量阈值后按 perKg 加价
 *   - 期望取件时间在夜间时段 → 加价
 *   - 物品申报价值 + 是否保价 → 保价费 = value * insuranceRate
 *   - 帮排队按 queueDurationMin 折算小时 * queueRatePerHour
 */
export class EstimateErrandPriceDto {
  @ApiProperty({
    description: '服务类型：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队',
    enum: ERRAND_SERVICE_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(ERRAND_SERVICE_TYPES as unknown as number[])
  serviceType!: number

  @ApiProperty({
    description: '城市编码（用于读 sys_config dispatch.pricing.{cityCode}）',
    example: '110000'
  })
  @IsString()
  @MaxLength(CITY_CODE_MAX_LEN)
  cityCode!: string

  @ApiProperty({
    description: '取件点经度（service_type=4 帮排队可与送达点同）',
    example: 116.310003
  })
  @Type(() => Number)
  @IsLongitude()
  pickupLng!: number

  @ApiProperty({ description: '取件点纬度', example: 39.991957 })
  @Type(() => Number)
  @IsLatitude()
  pickupLat!: number

  @ApiProperty({ description: '送达点经度', example: 116.405285 })
  @Type(() => Number)
  @IsLongitude()
  deliveryLng!: number

  @ApiProperty({ description: '送达点纬度', example: 39.904989 })
  @Type(() => Number)
  @IsLatitude()
  deliveryLat!: number

  @ApiPropertyOptional({ description: '物品重量（克）', example: 1500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  itemWeightG?: number

  @ApiPropertyOptional({
    description: '物品申报价值（元，字符串；用于计算保价费）',
    example: '200.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'itemValue 必须为最多 2 位小数的字符串' })
  itemValue?: string

  @ApiPropertyOptional({ description: '是否启用保价（true 才计算保价费）', example: true })
  @IsOptional()
  @Type(() => Boolean)
  withInsurance?: boolean

  @ApiPropertyOptional({
    description: '期望取件时间（ISO 字符串；用于判断夜间加价）',
    example: '2026-04-19T22:30:00.000Z'
  })
  @IsOptional()
  @IsString()
  expectedPickupAt?: string

  @ApiPropertyOptional({ description: '帮排队预计时长（分钟，service_type=4 必填）', example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  queueDurationMin?: number

  @ApiPropertyOptional({
    description: '帮买预算（元，service_type=3 时回显到结果中）',
    example: '50.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'buyBudget 必须为最多 2 位小数的字符串' })
  buyBudget?: string
}

/**
 * 跑腿价格预估单条明细
 */
export class EstimatePriceDetailVo {
  @ApiProperty({
    description:
      '明细类型（base / distance / weight / night / weather / insurance / queue / goods）'
  })
  type!: string

  @ApiProperty({ description: '明细标签（用于前端展示）' })
  label!: string

  @ApiProperty({ description: '金额（元，字符串）', example: '8.00' })
  amount!: string

  @ApiPropertyOptional({ description: '辅助说明（如 距离 5.2km）' })
  detail?: string
}

/**
 * 跑腿价格预估结果 VO
 */
export class EstimateResultVo {
  @ApiProperty({ description: '服务类型', example: 1 })
  serviceType!: number

  @ApiProperty({ description: '城市编码' })
  cityCode!: string

  @ApiProperty({ description: '取送距离（米）', example: 5230 })
  distanceM!: number

  @ApiProperty({ description: '基础起步价（元，字符串）', example: '8.00' })
  baseFee!: string

  @ApiProperty({ description: '里程费（超出起步距离部分，元，字符串）', example: '4.46' })
  distanceFee!: string

  @ApiProperty({ description: '超重费（元，字符串；不超重为 0.00）', example: '0.00' })
  weightFee!: string

  @ApiProperty({ description: '夜间加价（元，字符串；非夜间为 0.00）', example: '2.49' })
  nightSurcharge!: string

  @ApiProperty({ description: '恶劣天气加价（元，字符串；运营关时为 0.00）', example: '0.00' })
  weatherSurcharge!: string

  @ApiProperty({ description: '保价费（元，字符串）', example: '1.00' })
  insuranceFee!: string

  @ApiProperty({ description: '排队服务费（元，字符串；非帮排队为 0.00）', example: '0.00' })
  queueFee!: string

  @ApiProperty({
    description: '应收服务费（base + distance + weight + 夜间 + 天气 + queue），未乘服务系数前',
    example: '14.95'
  })
  serviceFeeRaw!: string

  @ApiProperty({ description: '服务类型乘数（如 1.20）', example: '1.20' })
  serviceTypeMultiplier!: string

  @ApiProperty({ description: '应收服务费（已乘服务系数）', example: '17.94' })
  serviceFee!: string

  @ApiProperty({ description: '帮买预估货款（元，字符串；非帮买为 0.00）', example: '50.00' })
  estimatedGoods!: string

  @ApiProperty({ description: '估算总价（含服务费 + 保价费 + 帮买预算）', example: '68.94' })
  estimatedTotal!: string

  @ApiProperty({
    description: '明细行（用于前端按行展示）',
    type: EstimatePriceDetailVo,
    isArray: true
  })
  details!: EstimatePriceDetailVo[]
}

/* ============================================================================
 * T4.18 跑腿下单
 * ============================================================================ */

/**
 * 跑腿下单入参（统一 DTO，按 serviceType 分支校验）
 *
 * 校验规则（service 层兜底）：
 *   - serviceType=1/2 必须传 itemType + itemWeightG + pickupAddress + deliveryAddress
 *   - serviceType=3 必须传 helpBuy（buyList + buyBudget），pickupAddress 可空（取商家位置由前端补齐 / 服务端兜底为送达地址）
 *   - serviceType=4 必须传 helpQueue + deliveryAddress；pickupAddress 可空（=排队场所自动构造）
 */
export class CreateErrandOrderDto {
  @ApiProperty({
    description: '服务类型：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队',
    enum: ERRAND_SERVICE_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(ERRAND_SERVICE_TYPES as unknown as number[])
  serviceType!: number

  @ApiProperty({ description: '城市编码（用于读价格 / 派单候选）', example: '110000' })
  @IsString()
  @MaxLength(CITY_CODE_MAX_LEN)
  cityCode!: string

  @ApiPropertyOptional({ description: '取件地址（serviceType=1/2 必填；3/4 可选）' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ErrandAddressDto)
  pickupAddress?: ErrandAddressDto

  @ApiProperty({ description: '送达地址（4 类均必填）' })
  @ValidateNested()
  @Type(() => ErrandAddressDto)
  deliveryAddress!: ErrandAddressDto

  @ApiPropertyOptional({
    description: '物品类型（文件 / 食品 / 数码 / 其他；serviceType=1/2 推荐填）',
    example: '食品'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemType?: string

  @ApiPropertyOptional({ description: '物品重量（克；serviceType=1/2 推荐填）', example: 1500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  itemWeightG?: number

  @ApiPropertyOptional({
    description: '物品申报价值（元，字符串；保价计费基准）',
    example: '200.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'itemValue 必须为最多 2 位小数的字符串' })
  itemValue?: string

  @ApiPropertyOptional({ description: '是否启用保价', example: false })
  @IsOptional()
  @Type(() => Boolean)
  withInsurance?: boolean

  @ApiPropertyOptional({ description: '帮买详情（serviceType=3 必填）', type: HelpBuyDetailDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HelpBuyDetailDto)
  helpBuy?: HelpBuyDetailDto

  @ApiPropertyOptional({
    description: '帮排队详情（serviceType=4 必填）',
    type: HelpQueueDetailDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => HelpQueueDetailDto)
  helpQueue?: HelpQueueDetailDto

  @ApiPropertyOptional({
    description: '期望取件时间（ISO 字符串；NULL=立即）',
    example: '2026-04-19T22:30:00.000Z'
  })
  @IsOptional()
  @IsString()
  expectedPickupAt?: string

  @ApiPropertyOptional({ description: '小费（元，字符串；默认 0.00）', example: '0.00' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'tipFee 必须为最多 2 位小数的字符串' })
  tipFee?: string

  @ApiPropertyOptional({ description: '用户备注', example: '请走大门' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string

  @ApiPropertyOptional({
    description: '用户主动选择的优惠券 ID 列表（可空：DiscountCalc 自动加载全部可用券）',
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userCouponIds?: string[]

  @ApiPropertyOptional({
    description: '活动 ID 列表（可空：自动加载店铺活动；跑腿一般不填）',
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  promotionIds?: string[]
}

/**
 * 跑腿下单出参 VO
 */
export class ErrandOrderVo {
  @ApiProperty({ description: '业务订单号（18 位）', example: 'E202604011300010012' })
  orderNo!: string

  @ApiProperty({ description: '主键' })
  id!: string

  @ApiProperty({ description: '服务类型：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队' })
  serviceType!: number

  @ApiProperty({ description: '订单状态（10 档；下单成功通常为 0 待支付）' })
  status!: number

  @ApiProperty({ description: '支付状态' })
  payStatus!: number

  @ApiProperty({ description: '应付金额（元，字符串）' })
  payAmount!: string

  @ApiProperty({ description: '服务费（元，字符串）' })
  serviceFee!: string

  @ApiProperty({ description: '小费（元，字符串）' })
  tipFee!: string

  @ApiProperty({ description: '保价费（元，字符串）' })
  insuranceFee!: string

  @ApiProperty({ description: '帮买预估货款（元，字符串）' })
  estimatedGoods!: string

  @ApiPropertyOptional({ description: '取件码（6 位数字；前端展示给用户）', example: '482915' })
  pickupCode!: string | null

  @ApiPropertyOptional({ description: '期望取件时间' })
  expectedPickupAt!: Date | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}

/* ============================================================================
 * 取消订单（用户/系统）
 * ============================================================================ */

/**
 * 取消订单入参
 */
export class CancelErrandOrderDto {
  @ApiProperty({ description: '取消原因', maxLength: 255, example: '不想要了' })
  @IsString()
  @MaxLength(255)
  reason!: string
}

/* ============================================================================
 * Pre-Check（跑腿场景的轻量预检）
 * ============================================================================ */

/**
 * 跑腿下单 pre-check 入参（用于前端二次确认价格 + 服务可用性）
 *
 * 与 EstimateErrandPriceDto 的差异：
 *   - pre-check 增加 cityCode + 期望覆盖券（用于试算最终金额）
 *   - 价格直接复用 EstimateResultVo 字段
 */
export class ErrandPreCheckDto extends EstimateErrandPriceDto {
  @ApiPropertyOptional({
    description: '用户选中的 user_coupon ID（试算抵扣金额）',
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userCouponIds?: string[]
}

/**
 * pre-check 出参（含价格预估 + 抵扣预估 + 最终待支付金额）
 */
export class ErrandPreCheckResultVo {
  @ApiProperty({ description: '价格预估明细', type: EstimateResultVo })
  estimate!: EstimateResultVo

  @ApiProperty({ description: '抵扣总金额（元，字符串）', example: '5.00' })
  discountTotal!: string

  @ApiProperty({ description: '最终应付金额（元，字符串；≥ 0.01）', example: '63.94' })
  finalAmount!: string
}
