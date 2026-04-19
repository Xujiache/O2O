/**
 * @file order-pre-check.service.ts
 * @stage P4/T4.16（Sprint 3）
 * @desc 外卖下单前校验：店铺营业 + 配送范围 + 商品在售 + SKU 库存 + 起送价 + 优惠计算
 * @author 单 Agent V2.0
 *
 * 设计依据：
 *   - DESIGN_P4 §二 / 用户任务书 §7.2
 *   - 错误码：10101 配送外 / 10102 起送价 / 10200 库存不足 / 10201 商品下架 / 10202 店铺打烊
 *
 * 实现思路：
 *   1. shopService.findActiveById + 校验 status=1 / business_status=1 / audit_status=1
 *   2. 累计 productIds + skuIds，批量加载 product / sku 数据
 *   3. mapService.withinArea(shopId, lng, lat) → within=false 抛 10101
 *   4. 遍历 items：
 *      - product 必须存在 + 属于本店铺 + status=1 + audit_status=1，否则 10201
 *      - sku 必须存在 + status=1 + product_id === product.id
 *      - inventoryService.preloadStock(skuId)（保证 Redis 有值）→ 与 qty 比对，不足 10200
 *      - 累加 itemsAmount += sku.price * qty（BigNumber）
 *      - 累加 packageFee += max(sku.package_fee, product.packaging_fee) * qty
 *   5. 起送价：itemsAmount < shop.min_order_amount → 10102
 *   6. 配送费：dto.deliveryFeeOverride > 0 ? 它 : within.deliveryFee ?? shop.base_delivery_fee
 *   7. discountCalcService.calc({...}) → 拿 finalAmount / details
 *   8. 组装 PreCheckResultVo（itemsAmount/packageFee/deliveryFee/discountTotal/finalAmount/items/discounts）
 *
 * 注意：
 *   - 价格全程 BigNumber，2 位小数
 *   - SKU package_fee = '0.00' 时回退 product.packaging_fee
 *   - 同一商品多 SKU 的累计 packageFee 已折叠到 SKU 行（避免双计）
 */

import { Injectable } from '@nestjs/common'
import BigNumber from 'bignumber.js'
import { BizErrorCode, BusinessException } from '@/common'
import { type DiscountCalcContextDto } from '@/modules/marketing/dto/discount-calc.dto'
import { DiscountCalcService } from '@/modules/marketing/services/discount-calc.service'
import { MapService } from '@/modules/map/map.service'
import { InventoryService } from '@/modules/product/inventory.service'
import { ProductService } from '@/modules/product/services/product.service'
import { ProductSkuService } from '@/modules/product/services/product-sku.service'
import { ShopService } from '@/modules/shop/services/shop.service'
import {
  type PreCheckItemPriceVo,
  type TakeoutPreCheckDto,
  type TakeoutPreCheckResultVo,
  toPreCheckDiscountVo
} from '../dto/order-pre-check.dto'
import { OrderTypeEnum } from '../types/order.types'

/* ============================================================================
 * 内部类型
 * ============================================================================ */

/** 校验后回传给 takeout.service 用作下单的中间结果（避免下单环节再次反查） */
export interface PreCheckSuccessContext {
  /** 价格 + 抵扣明细（同时也作为接口返回 VO 内容来源） */
  preview: TakeoutPreCheckResultVo
  /** items 行细节（service 写明细表用） */
  itemRows: PreCheckItemRow[]
  /** SKU 扣减项（service 调 inventoryService.deduct 用） */
  stockItems: Array<{ skuId: string; qty: number }>
  /** DiscountCalc 命中的 user_coupon ids（service 调 userCoupon.freeze 用） */
  freezeUserCouponIds: string[]
  /** 单笔 coupon_amount（DECIMAL 字符串） */
  couponAmount: string
  /** 单笔 promotion 抵扣 + 任意非券抵扣 */
  promotionAmount: string
  /** 商铺基础信息（写入 shop_snapshot） */
  shopMeta: {
    shopId: string
    merchantId: string
    name: string
    address: string
    lng: number
    lat: number
    cityCode: string
    districtCode: string
    phoneTail4: string
  }
}

/** 明细行（service 写 order_takeout_item 用） */
export interface PreCheckItemRow {
  productId: string
  skuId: string
  productName: string
  skuSpec: string | null
  imageUrl: string | null
  unitPrice: string
  qty: number
  packageFee: string
  totalPrice: string
}

@Injectable()
export class OrderPreCheckService {
  constructor(
    private readonly shopService: ShopService,
    private readonly mapService: MapService,
    private readonly productService: ProductService,
    private readonly productSkuService: ProductSkuService,
    private readonly inventoryService: InventoryService,
    private readonly discountCalcService: DiscountCalcService
  ) {}

  /**
   * 公共 API：外卖下单前校验
   * 参数：dto / userId
   * 返回值：PreCheckSuccessContext（含面向前端的 preview）
   *
   * 业务异常：见文件头错误码列表
   */
  async preCheckTakeout(dto: TakeoutPreCheckDto, userId: string): Promise<PreCheckSuccessContext> {
    if (!dto.items || dto.items.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'items 不能为空')
    }

    /* 1) 店铺存在 + 营业 + 审核 */
    const shop = await this.shopService.findActiveById(dto.shopId)
    if (shop.status !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '店铺已封禁')
    }
    if (shop.auditStatus !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_SHOP_CLOSED, '店铺尚未通过审核')
    }
    if (shop.businessStatus !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_SHOP_CLOSED, '店铺当前未营业')
    }

    /* 2) 配送范围校验 */
    const within = await this.mapService.withinArea({
      shopId: shop.id,
      lng: dto.address.lng,
      lat: dto.address.lat
    })
    if (!within.within) {
      throw new BusinessException(
        BizErrorCode.BIZ_DELIVERY_OUT_OF_RANGE,
        '收货地址不在店铺配送范围内'
      )
    }

    /* 3) 加载 SKU + product 详情，校验在售 + 库存 + 同店 */
    const skuIds = dto.items.map((it) => it.skuId)
    const skuMap = await this.productSkuService.findManyByIds(skuIds)
    if (skuMap.size !== new Set(skuIds).size) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '存在不存在或已删除的 SKU')
    }

    /* 商品按 productId 去重批量加载（用 publicDetail 即可；其内部缓存 5min） */
    const productIds = Array.from(new Set(dto.items.map((it) => it.productId)))
    const productMap = new Map<string, Awaited<ReturnType<ProductService['publicDetail']>>>()
    for (const pid of productIds) {
      const p = await this.productService.publicDetail(pid)
      productMap.set(pid, p)
    }

    /* 累计金额 */
    let itemsAmount = new BigNumber(0)
    let packageFeeTotal = new BigNumber(0)
    const itemRows: PreCheckItemRow[] = []
    const stockItems: Array<{ skuId: string; qty: number }> = []
    const itemPriceVos: PreCheckItemPriceVo[] = []

    for (const it of dto.items) {
      const sku = skuMap.get(it.skuId)
      if (!sku) {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, `SKU ${it.skuId} 不存在`)
      }
      const product = productMap.get(it.productId)
      if (!product) {
        throw new BusinessException(
          BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
          `商品 ${it.productId} 不存在`
        )
      }
      if (product.shopId !== dto.shopId) {
        throw new BusinessException(
          BizErrorCode.BIZ_PRODUCT_OFFLINE,
          `商品 ${product.id} 不属于店铺 ${dto.shopId}`
        )
      }
      if (product.status !== 1 || product.auditStatus !== 1) {
        throw new BusinessException(BizErrorCode.BIZ_PRODUCT_OFFLINE, `商品 ${product.name} 已下架`)
      }
      if (sku.productId !== product.id) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `SKU ${sku.id} 不属于商品 ${product.id}`
        )
      }
      if (sku.status !== 1) {
        throw new BusinessException(
          BizErrorCode.BIZ_PRODUCT_OFFLINE,
          `SKU ${sku.skuCode ?? sku.id} 已下架`
        )
      }
      if (product.minOrderQty && it.qty < product.minOrderQty) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `商品 ${product.name} 最少 ${product.minOrderQty} 份`
        )
      }
      if (product.limitPerOrder && product.limitPerOrder > 0 && it.qty > product.limitPerOrder) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `商品 ${product.name} 单笔限购 ${product.limitPerOrder} 份`
        )
      }

      /* 库存：preloadStock 是 NX 写入，等价于"读"且自动初始化 */
      const stockNow = await this.inventoryService.preloadStock(sku.id)
      if (stockNow !== -1 && stockNow < it.qty) {
        throw new BusinessException(
          BizErrorCode.BIZ_STOCK_INSUFFICIENT,
          `商品 ${product.name} 库存不足，剩余 ${stockNow}`
        )
      }
      stockItems.push({ skuId: sku.id, qty: it.qty })

      /* 金额 */
      const unitPrice = new BigNumber(sku.price)
      const lineAmount = unitPrice.multipliedBy(it.qty)
      itemsAmount = itemsAmount.plus(lineAmount)

      const skuPackageFee = new BigNumber(sku.packagingFee || '0')
      const productPackageFee = new BigNumber(product.packagingFee || '0')
      const linePackageFee = (skuPackageFee.gt(0) ? skuPackageFee : productPackageFee).multipliedBy(
        it.qty
      )
      packageFeeTotal = packageFeeTotal.plus(linePackageFee)

      const linePackageFeeStr = this.formatAmount(linePackageFee)
      const lineAmountStr = this.formatAmount(lineAmount)
      itemRows.push({
        productId: product.id,
        skuId: sku.id,
        productName: product.name,
        skuSpec: sku.specName ?? null,
        imageUrl: product.mainImageUrl ?? null,
        unitPrice: this.formatAmount(unitPrice),
        qty: it.qty,
        packageFee: linePackageFeeStr,
        totalPrice: lineAmountStr
      })
      itemPriceVos.push({
        productId: product.id,
        skuId: sku.id,
        productName: product.name,
        skuSpec: sku.specName ?? null,
        unitPrice: this.formatAmount(unitPrice),
        qty: it.qty,
        totalPrice: lineAmountStr,
        packageFee: linePackageFeeStr,
        imageUrl: product.mainImageUrl ?? null
      })
    }

    /* 4) 起送价 */
    const minOrder = new BigNumber(shop.minOrderAmount || '0')
    if (itemsAmount.lt(minOrder)) {
      throw new BusinessException(
        BizErrorCode.BIZ_BELOW_MIN_ORDER_AMOUNT,
        `订单未达起送价 ¥${minOrder.toFixed(2)}`
      )
    }

    /* 5) 配送费：override 优先；其次配送范围内 deliveryFee；最后店铺基础配送费 */
    let deliveryFee: BigNumber
    if (dto.deliveryFeeOverride !== undefined && dto.deliveryFeeOverride !== null) {
      deliveryFee = new BigNumber(dto.deliveryFeeOverride)
    } else if (within.deliveryFee !== undefined && within.deliveryFee !== null) {
      deliveryFee = new BigNumber(within.deliveryFee)
    } else {
      deliveryFee = new BigNumber(shop.baseDeliveryFee || '0')
    }
    if (!deliveryFee.isFinite() || deliveryFee.lt(0)) deliveryFee = new BigNumber(0)

    /* 6) 优惠计算：DiscountCalc */
    const calcCtx: DiscountCalcContextDto = {
      userId,
      orderType: OrderTypeEnum.TAKEOUT,
      shopId: dto.shopId,
      itemsAmount: this.formatAmount(itemsAmount),
      deliveryFee: this.formatAmount(deliveryFee),
      packageFee: this.formatAmount(packageFeeTotal),
      productIds,
      userCouponIds: dto.userCouponIds,
      promotionIds: dto.promotionIds,
      isNewUser: false /* 首单识别由 Sprint 8 完整接入 */
    }
    const calcResult = await this.discountCalcService.calc(calcCtx)

    /* 7) 组装 preview */
    const preview: TakeoutPreCheckResultVo = {
      shopId: shop.id,
      cityCode: shop.cityCode,
      shopName: shop.name,
      itemsAmount: calcResult.itemsAmount,
      packageFee: calcResult.packageFee,
      deliveryFee: calcResult.deliveryFee,
      discountTotal: calcResult.discountTotal,
      finalAmount: calcResult.finalAmount,
      items: itemPriceVos,
      discounts: calcResult.details.map(toPreCheckDiscountVo)
    }

    /* 8) 拆分券抵扣 / 活动抵扣（写订单 coupon_amount / discount_amount 用） */
    let couponAmount = new BigNumber(0)
    let promotionAmount = new BigNumber(0)
    const freezeUserCouponIds: string[] = []
    for (const d of calcResult.details) {
      const amt = new BigNumber(d.amount)
      if (d.type === 'coupon') {
        couponAmount = couponAmount.plus(amt)
        freezeUserCouponIds.push(d.sourceId)
      } else {
        promotionAmount = promotionAmount.plus(amt)
      }
    }

    return {
      preview,
      itemRows,
      stockItems,
      freezeUserCouponIds,
      couponAmount: this.formatAmount(couponAmount),
      promotionAmount: this.formatAmount(promotionAmount),
      shopMeta: {
        shopId: shop.id,
        merchantId: shop.merchantId,
        name: shop.name,
        address: shop.address,
        lng: shop.lng,
        lat: shop.lat,
        cityCode: shop.cityCode,
        districtCode: shop.districtCode,
        phoneTail4: shop.contactMobileTail4
      }
    }
  }

  /**
   * BigNumber → DECIMAL(8/12,2) 字符串
   */
  private formatAmount(n: BigNumber): string {
    return n.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2)
  }
}
