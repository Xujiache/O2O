/**
 * @file order-pre-check.dto.ts
 * @stage P4/T4.16（Sprint 3）
 * @desc 外卖下单前校验 DTO：入参 + 单项 + 出参
 * @author 单 Agent V2.0
 *
 * 用途：POST /user/order/takeout/pre-check
 *
 * 校验链：店铺营业 + 配送范围 + 商品在售 + SKU 库存 ≥ qty + 起送价 → DiscountCalc.calc → 价格预览
 *
 * 注：本 DTO 不复用 CreateTakeoutOrderDto，因为 pre-check 不需要 idemKey / 收货人脱敏等下单专属字段；
 *      但下单时 service 内部会复用 preCheck 校验链以保证两次结果一致。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator'
import type { DiscountItemDto } from '@/modules/marketing/dto/discount-calc.dto'

/* ============================================================================
 * 入参
 * ============================================================================ */

/**
 * 单条 SKU 项
 *   - productId 商品 ID（用于 applicable_products 命中 + 校验在售）
 *   - skuId     SKU 主键
 *   - qty       数量（≥ 1，≤ 999）
 */
export class PreCheckItemDto {
  @ApiProperty({ description: '商品 ID（雪花字符串）', example: '180000000000000010' })
  @IsString()
  @Length(1, 32)
  productId!: string

  @ApiProperty({ description: 'SKU 主键（雪花字符串）', example: '180000000000000020' })
  @IsString()
  @Length(1, 32)
  skuId!: string

  @ApiProperty({ description: '购买数量（1~999）', example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number
}

/**
 * 收货地址（pre-check 时仍需经纬度做配送范围校验；下单时再按需冻结快照）
 */
export class PreCheckAddressDto {
  @ApiPropertyOptional({ description: '已存在地址 ID（user_address.id）', example: '13000001' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  addressId?: string

  @ApiProperty({ description: '收货人姓名', example: '张三' })
  @IsString()
  @MaxLength(64)
  receiverName!: string

  @ApiProperty({ description: '收货人手机号', example: '13800138000' })
  @IsString()
  @MaxLength(32)
  receiverMobile!: string

  @ApiProperty({ description: '省名称', example: '北京市' })
  @IsString()
  @MaxLength(32)
  province!: string

  @ApiProperty({ description: '市名称', example: '北京市' })
  @IsString()
  @MaxLength(32)
  city!: string

  @ApiProperty({ description: '区/县名称', example: '朝阳区' })
  @IsString()
  @MaxLength(32)
  district!: string

  @ApiProperty({ description: '详细地址', example: '望京 SOHO T1 1601' })
  @IsString()
  @MaxLength(255)
  detail!: string

  @ApiProperty({ description: '经度（GCJ-02）', example: 116.4806 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number

  @ApiProperty({ description: '纬度（GCJ-02）', example: 39.9938 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number

  @ApiPropertyOptional({ description: '地址标签（家/公司/学校/其他）', example: '公司' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  tag?: string
}

/**
 * 外卖下单前校验入参
 *
 * 说明：
 *   - shopId / items / address 必填
 *   - userCouponIds / promotionIds 可选；不传 = 自动按用户全部可用券 + 店铺全部进行中活动算
 *   - isNewUser 可选；ProductService / UserService 后续完善后可由 service 层自动判断；本期接入 false 兜底
 */
export class TakeoutPreCheckDto {
  @ApiProperty({ description: '店铺 ID（雪花字符串）', example: '180000000000000001' })
  @IsString()
  @Length(1, 32)
  shopId!: string

  @ApiProperty({
    description: '商品项列表（1~50）',
    type: [PreCheckItemDto]
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PreCheckItemDto)
  items!: PreCheckItemDto[]

  @ApiProperty({ description: '收货地址（含坐标）', type: PreCheckAddressDto })
  @ValidateNested()
  @Type(() => PreCheckAddressDto)
  address!: PreCheckAddressDto

  @ApiPropertyOptional({
    description: '用户主动选中的 user_coupon ID（不传 = 自动加载用户全部可用券）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  userCouponIds?: string[]

  @ApiPropertyOptional({
    description: '活动 ID（不传 = 自动加载店铺全部进行中活动）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  promotionIds?: string[]

  @ApiPropertyOptional({ description: '附加配送费（运营定价）覆盖店铺基础', example: '0.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  deliveryFeeOverride?: string

  @ApiPropertyOptional({ description: '用户备注', example: '不要香菜' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/* ============================================================================
 * 出参
 * ============================================================================ */

/**
 * 价格明细单条 SKU
 */
export class PreCheckItemPriceVo {
  @ApiProperty({ description: '商品 ID' })
  productId!: string

  @ApiProperty({ description: 'SKU ID' })
  skuId!: string

  @ApiProperty({ description: '商品名称快照' })
  productName!: string

  @ApiProperty({ description: '规格描述', nullable: true })
  skuSpec!: string | null

  @ApiProperty({ description: 'SKU 单价（元，字符串）', example: '15.80' })
  unitPrice!: string

  @ApiProperty({ description: '数量' })
  qty!: number

  @ApiProperty({ description: 'SKU 小计（unit_price × qty，元）', example: '31.60' })
  totalPrice!: string

  @ApiProperty({ description: 'SKU 级打包费合计（元）', example: '1.00' })
  packageFee!: string

  @ApiProperty({ description: '主图 URL', nullable: true })
  imageUrl!: string | null
}

/**
 * 单条抵扣明细（与 marketing/discount-calc DiscountItemDto 字段一致；本处独立类型避免跨模块裸引用）
 */
export class PreCheckDiscountVo {
  @ApiProperty({ description: '类型（coupon / promotion / red_packet）', example: 'coupon' })
  type!: string

  @ApiProperty({ description: '抵扣源 ID' })
  sourceId!: string

  @ApiProperty({ description: '名称', example: '满 30 减 5' })
  name!: string

  @ApiProperty({ description: '抵扣金额（元）', example: '5.00' })
  amount!: string
}

/**
 * 出参总览
 *   - itemsAmount    商品合计
 *   - packageFee     打包费合计（来自 SKU.package_fee + product.packaging_fee 兜底；service 层取较高）
 *   - deliveryFee    配送费（按 shop.base_delivery_fee 或 deliveryFeeOverride）
 *   - discountTotal  总抵扣
 *   - finalAmount    最终应付（≥ 0.01）
 *   - items          各 SKU 价格明细
 *   - discounts      抵扣明细
 *   - shopId         冗余便于前端渲染
 *   - cityCode       同上
 */
export class TakeoutPreCheckResultVo {
  @ApiProperty({ description: '店铺 ID' })
  shopId!: string

  @ApiProperty({ description: '店铺所在城市编码' })
  cityCode!: string

  @ApiProperty({ description: '店铺名称（快照）' })
  shopName!: string

  @ApiProperty({ description: '商品合计（元）', example: '50.00' })
  itemsAmount!: string

  @ApiProperty({ description: '打包费合计（元）', example: '2.00' })
  packageFee!: string

  @ApiProperty({ description: '配送费（元）', example: '5.00' })
  deliveryFee!: string

  @ApiProperty({ description: '总抵扣（元）', example: '8.00' })
  discountTotal!: string

  @ApiProperty({ description: '最终应付（元，≥ 0.01）', example: '49.00' })
  finalAmount!: string

  @ApiProperty({ description: '商品项明细', type: [PreCheckItemPriceVo] })
  items!: PreCheckItemPriceVo[]

  @ApiProperty({ description: '抵扣明细', type: [PreCheckDiscountVo] })
  discounts!: PreCheckDiscountVo[]
}

/**
 * Service 内部用：把 DiscountCalc 的 details 直接展开成 PreCheckDiscountVo（避免跨模块依赖装饰器）
 */
export function toPreCheckDiscountVo(detail: DiscountItemDto): PreCheckDiscountVo {
  return {
    type: detail.type,
    sourceId: detail.sourceId,
    name: detail.name,
    amount: detail.amount
  }
}
