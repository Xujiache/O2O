/**
 * @file errand-pricing.service.ts
 * @stage P4/T4.19（Sprint 3）
 * @desc 跑腿价格预估服务：从 sys_config 读规则 → BigNumber 计算 → 返回明细
 * @author 单 Agent V2.0（Subagent 2 - Order Errand + Rider Actions）
 *
 * 价格公式（CONSENSUS_P4 §2.7）：
 *   serviceFeeRaw =
 *       baseFee
 *     + max(0, distanceM - baseDistanceM) / 1000 * perKmFee
 *     + 超重附加（max(0, weightG - freeWeightG) / 1000 * weightExtraPerKg）
 *     + 夜间加价（serviceFeeRaw * nightSurchargeRate，如开关命中）
 *     + 恶劣天气加价（serviceFeeRaw * weatherSurchargeRate，如运营开关 true）
 *     + queueFee（service_type=4 时 = ceil(queueDurationMin / 60) * queueRatePerHour）
 *
 *   serviceFee = serviceFeeRaw * serviceTypeMultiplier[serviceType]
 *
 *   insuranceFee = withInsurance ? itemValue * insuranceRate : 0
 *
 *   estimatedTotal = serviceFee + insuranceFee + estimatedGoods（service_type=3 时 = buyBudget）
 *
 * 注：夜间 / 天气两项都基于"已加里程/超重后的小计"再乘比例，与公式保持一致；
 *     最终乘 serviceTypeMultiplier 是对整个服务费的整体定价系数。
 *
 * 配置读取：
 *   - sys_config WHERE config_group='dispatch.pricing' AND config_key='{cityCode}'
 *   - value_type='json'，config_value 为 JSON 串
 *   - 未配置 → 用 DEFAULT_PRICING + logger.warn（mock 模式）
 *
 * 缓存：
 *   - dispatch:pricing:{cityCode} TTL 5min（避免高频下单 fallback 全部打 DB）
 *   - 配置变更后由运营端清除（本期不实现失效推送）
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import type Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { haversineDistanceM } from '@/modules/map/geo.util'
import {
  type EstimateErrandPriceDto,
  type EstimatePriceDetailVo,
  type EstimateResultVo,
  ERRAND_SERVICE_TYPES,
  type ErrandServiceType
} from '../dto/errand.dto'

/* ============================================================================
 * 配置 schema + 默认值
 * ============================================================================ */

/**
 * 跑腿价格规则（与 sys_config dispatch.pricing.{cityCode} JSON 字段一一对应）
 *
 * 所有金额 / 比例字段一律 string，以保证 BigNumber 精度（避免 JSON parse 时 number 误差）
 */
export interface ErrandPricingConfig {
  /** 起步价（元，字符串），含 baseDistanceM 内 */
  baseFee: string
  /** 起步距离（米） */
  baseDistanceM: number
  /** 超出起步距离后每公里费（元，字符串） */
  perKmFee: string
  /** 免重量阈值（克）；超出按 perKg 加价 */
  freeWeightG: number
  /** 每超重 1kg 加价（元，字符串） */
  weightExtraPerKg: string
  /** 夜间加价比例（如 "0.20" 表示 20%） */
  nightSurchargeRate: string
  /** 夜间起始小时（24 小时制；如 22 表示 22:00 起） */
  nightStartHour: number
  /** 夜间结束小时（如 6 表示到 06:00 止；不含 6） */
  nightEndHour: number
  /** 恶劣天气加价比例 */
  weatherSurchargeRate: string
  /** 恶劣天气开关（true 才计加价） */
  weatherSwitch: boolean
  /** 保价费率（如 "0.005" 表示 0.5%；按 itemValue 计算） */
  insuranceRate: string
  /** 服务类型乘数（key='1'~'4'） */
  serviceTypeMultiplier: Record<string, string>
  /** 帮排队每小时费率（元，字符串） */
  queueRatePerHour: string
}

/**
 * 默认规则（mock / 缺配置时使用）
 */
export const DEFAULT_PRICING: ErrandPricingConfig = {
  baseFee: '8.00',
  baseDistanceM: 3000,
  perKmFee: '2.00',
  freeWeightG: 5000,
  weightExtraPerKg: '1.00',
  nightSurchargeRate: '0.20',
  nightStartHour: 22,
  nightEndHour: 6,
  weatherSurchargeRate: '0.30',
  weatherSwitch: false,
  insuranceRate: '0.005',
  serviceTypeMultiplier: { '1': '1.00', '2': '1.10', '3': '1.20', '4': '1.50' },
  queueRatePerHour: '20.00'
}

/* ============================================================================
 * Redis 缓存 key
 * ============================================================================ */

const PRICING_CACHE_KEY = (cityCode: string): string => `dispatch:pricing:${cityCode}`
const PRICING_CACHE_TTL_SECONDS = 5 * 60

/* ============================================================================
 * Service
 * ============================================================================ */

/**
 * sys_config 单行结构（局部类型，避免引入未落地的 SysConfig entity）
 */
interface SysConfigRow {
  config_value: string | null
  value_type: string
}

@Injectable()
export class ErrandPricingService {
  private readonly logger = new Logger(ErrandPricingService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /* ==========================================================================
   * 公共 API
   * ========================================================================== */

  /**
   * 入口：跑腿价格预估
   * 参数：dto EstimateErrandPriceDto
   * 返回值：EstimateResultVo
   * 用途：POST /user/order/errand/price + Order 模块下单时复用
   */
  async estimate(dto: EstimateErrandPriceDto): Promise<EstimateResultVo> {
    this.assertServiceType(dto.serviceType)
    if (dto.serviceType === 4) {
      if (!dto.queueDurationMin || dto.queueDurationMin <= 0) {
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          '帮排队（serviceType=4）必须传 queueDurationMin'
        )
      }
    }

    const config = await this.loadPricing(dto.cityCode)
    const distanceM = Math.round(
      haversineDistanceM(dto.pickupLng, dto.pickupLat, dto.deliveryLng, dto.deliveryLat)
    )
    return this.compute(dto, config, distanceM)
  }

  /**
   * 内部入口（复用，不重复加载 config / 距离已知场景）
   * 参数：dto / config / distanceM
   * 返回值：EstimateResultVo
   * 用途：order-errand.service 下单内部调用，避免重复读 Redis / sys_config
   */
  computeWith(
    dto: EstimateErrandPriceDto,
    config: ErrandPricingConfig,
    distanceM: number
  ): EstimateResultVo {
    return this.compute(dto, config, distanceM)
  }

  /**
   * 加载某城市的定价规则（带 5min 缓存 + DB fallback + DEFAULT 兜底）
   */
  async loadPricing(cityCode: string): Promise<ErrandPricingConfig> {
    if (!cityCode) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'cityCode 不能为空')
    }
    const cached = await this.safeGetCache(cityCode)
    if (cached) return cached

    let cfg: ErrandPricingConfig | null = null
    try {
      const rows = await this.dataSource.query<SysConfigRow[]>(
        `SELECT config_value, value_type
         FROM sys_config
         WHERE config_group = 'dispatch.pricing'
           AND config_key = ?
           AND is_deleted = 0
         LIMIT 1`,
        [cityCode]
      )
      const first = rows[0]
      if (first?.config_value) {
        cfg = this.parseConfig(first.config_value)
      }
    } catch (err) {
      /* sys_config 表本期可能未在 entities 注册；直接 raw query 失败时降级到默认值 */
      this.logger.warn(
        `[errand-pricing] sys_config 读取失败 cityCode=${cityCode}：${(err as Error).message}（降级用 DEFAULT_PRICING）`
      )
    }
    if (!cfg) {
      this.logger.warn(
        `[errand-pricing] cityCode=${cityCode} 未配置 dispatch.pricing，使用 DEFAULT_PRICING（mock）`
      )
      cfg = DEFAULT_PRICING
    }
    await this.safeSetCache(cityCode, cfg)
    return cfg
  }

  /* ==========================================================================
   * 计算引擎
   * ========================================================================== */

  /**
   * 主计算（BigNumber 全程，最终 toFixed(2) ROUND_HALF_UP）
   */
  private compute(
    dto: EstimateErrandPriceDto,
    config: ErrandPricingConfig,
    distanceM: number
  ): EstimateResultVo {
    const details: EstimatePriceDetailVo[] = []

    /* 1) 起步价 */
    const baseFee = new BigNumber(config.baseFee)
    details.push({
      type: 'base',
      label: '起步价',
      amount: this.fmt(baseFee),
      detail: `含 ${config.baseDistanceM}m 内`
    })

    /* 2) 里程费 */
    const distanceFee = this.computeDistanceFee(distanceM, config)
    details.push({
      type: 'distance',
      label: '里程费',
      amount: this.fmt(distanceFee),
      detail: `${(distanceM / 1000).toFixed(2)}km${
        distanceM > config.baseDistanceM ? `（超出 ${config.baseDistanceM}m）` : '（含起步）'
      }`
    })

    /* 3) 超重费 */
    const weightFee = this.computeWeightFee(dto.itemWeightG, config)
    details.push({
      type: 'weight',
      label: '超重费',
      amount: this.fmt(weightFee),
      detail:
        dto.itemWeightG && dto.itemWeightG > config.freeWeightG
          ? `超出 ${config.freeWeightG}g 免重`
          : '未超重'
    })

    /* 4) 夜间加价（基于 base + distance + weight 小计） */
    const subtotal1 = baseFee.plus(distanceFee).plus(weightFee)
    const isNight = this.isNightSlot(
      this.parseExpectedAt(dto.expectedPickupAt),
      config.nightStartHour,
      config.nightEndHour
    )
    const nightSurcharge = isNight
      ? subtotal1.multipliedBy(new BigNumber(config.nightSurchargeRate))
      : new BigNumber(0)
    details.push({
      type: 'night',
      label: '夜间加价',
      amount: this.fmt(nightSurcharge),
      detail: isNight
        ? `命中夜间时段 [${config.nightStartHour}:00-${config.nightEndHour}:00) 加 ${this.pct(
            config.nightSurchargeRate
          )}`
        : '非夜间'
    })

    /* 5) 恶劣天气加价 */
    const weatherSurcharge = config.weatherSwitch
      ? subtotal1.multipliedBy(new BigNumber(config.weatherSurchargeRate))
      : new BigNumber(0)
    details.push({
      type: 'weather',
      label: '恶劣天气加价',
      amount: this.fmt(weatherSurcharge),
      detail: config.weatherSwitch
        ? `运营开启 加 ${this.pct(config.weatherSurchargeRate)}`
        : '未启用'
    })

    /* 6) 帮排队费 */
    const queueFee = this.computeQueueFee(dto, config)
    details.push({
      type: 'queue',
      label: '排队服务费',
      amount: this.fmt(queueFee),
      detail:
        dto.serviceType === 4 && dto.queueDurationMin
          ? `${dto.queueDurationMin}min 折算 ${Math.ceil(dto.queueDurationMin / 60)}h`
          : '不适用'
    })

    /* 7) 服务费小计（未乘服务类型系数） */
    const serviceFeeRaw = subtotal1.plus(nightSurcharge).plus(weatherSurcharge).plus(queueFee)

    /* 8) 服务类型乘数 */
    const multiplierStr = config.serviceTypeMultiplier[String(dto.serviceType)] ?? '1.00'
    const multiplier = new BigNumber(multiplierStr)
    const serviceFee = serviceFeeRaw.multipliedBy(multiplier)

    /* 9) 保价费 */
    const insuranceFee = this.computeInsuranceFee(dto, config)
    details.push({
      type: 'insurance',
      label: '保价费',
      amount: this.fmt(insuranceFee),
      detail:
        dto.withInsurance && dto.itemValue
          ? `按 ${this.pct(config.insuranceRate)} × ${dto.itemValue} 元`
          : '未启用保价'
    })

    /* 10) 帮买预算 */
    const estimatedGoods = this.computeEstimatedGoods(dto)
    if (dto.serviceType === 3) {
      details.push({
        type: 'goods',
        label: '帮买预算',
        amount: this.fmt(estimatedGoods),
        detail: '骑手现场垫付，到达后结算'
      })
    }

    const estimatedTotal = serviceFee.plus(insuranceFee).plus(estimatedGoods)

    return {
      serviceType: dto.serviceType,
      cityCode: dto.cityCode,
      distanceM,
      baseFee: this.fmt(baseFee),
      distanceFee: this.fmt(distanceFee),
      weightFee: this.fmt(weightFee),
      nightSurcharge: this.fmt(nightSurcharge),
      weatherSurcharge: this.fmt(weatherSurcharge),
      insuranceFee: this.fmt(insuranceFee),
      queueFee: this.fmt(queueFee),
      serviceFeeRaw: this.fmt(serviceFeeRaw),
      serviceTypeMultiplier: multiplierStr,
      serviceFee: this.fmt(serviceFee),
      estimatedGoods: this.fmt(estimatedGoods),
      estimatedTotal: this.fmt(estimatedTotal),
      details
    }
  }

  /**
   * 里程费 = max(0, distanceM - baseDistanceM) / 1000 * perKmFee
   */
  private computeDistanceFee(distanceM: number, config: ErrandPricingConfig): BigNumber {
    if (distanceM <= config.baseDistanceM) return new BigNumber(0)
    const overKm = new BigNumber(distanceM - config.baseDistanceM).dividedBy(1000)
    return overKm.multipliedBy(new BigNumber(config.perKmFee))
  }

  /**
   * 超重费 = max(0, weightG - freeWeightG) / 1000 * weightExtraPerKg
   * 注：不足 1kg 按比例（如 200g 超重按 0.2 倍计；与外卖端一致用 BigNumber 真实值，不向上取整）
   */
  private computeWeightFee(weightG: number | undefined, config: ErrandPricingConfig): BigNumber {
    if (!weightG || weightG <= config.freeWeightG) return new BigNumber(0)
    const overKg = new BigNumber(weightG - config.freeWeightG).dividedBy(1000)
    return overKg.multipliedBy(new BigNumber(config.weightExtraPerKg))
  }

  /**
   * 是否夜间时段（小时数 [start, 24) ∪ [0, end)；如 [22, 24) ∪ [0, 6)）
   * 入参 nullable：缺失时按"非夜间"处理
   */
  private isNightSlot(date: Date | null, startHour: number, endHour: number): boolean {
    if (!date) return false
    /* 取北京时间小时（与 OrderShardingHelper 同一时区基准） */
    const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
    const h = beijing.getUTCHours()
    if (startHour <= endHour) {
      /* 同日时段，如 [10, 14) */
      return h >= startHour && h < endHour
    }
    /* 跨日时段，如 [22, 24) ∪ [0, 6) */
    return h >= startHour || h < endHour
  }

  /**
   * 排队费（service_type=4）：向上取整小时 * queueRatePerHour
   * 不足 1 小时按 1 小时计；最长 8 小时 = queueRatePerHour * 8
   */
  private computeQueueFee(dto: EstimateErrandPriceDto, config: ErrandPricingConfig): BigNumber {
    if (dto.serviceType !== 4) return new BigNumber(0)
    const minutes = dto.queueDurationMin ?? 0
    if (minutes <= 0) return new BigNumber(0)
    const hours = Math.min(8, Math.ceil(minutes / 60))
    return new BigNumber(config.queueRatePerHour).multipliedBy(hours)
  }

  /**
   * 保价费 = withInsurance 开启时 itemValue * insuranceRate；否则 0
   * itemValue 缺失或非法时返回 0
   */
  private computeInsuranceFee(dto: EstimateErrandPriceDto, config: ErrandPricingConfig): BigNumber {
    if (!dto.withInsurance || !dto.itemValue) return new BigNumber(0)
    const value = new BigNumber(dto.itemValue)
    if (!value.isFinite() || value.lte(0)) return new BigNumber(0)
    return value.multipliedBy(new BigNumber(config.insuranceRate))
  }

  /**
   * 预估货款（service_type=3 帮买）：取 buyBudget；其余为 0
   */
  private computeEstimatedGoods(dto: EstimateErrandPriceDto): BigNumber {
    if (dto.serviceType !== 3 || !dto.buyBudget) return new BigNumber(0)
    const v = new BigNumber(dto.buyBudget)
    if (!v.isFinite() || v.lt(0)) return new BigNumber(0)
    return v
  }

  /* ==========================================================================
   * 辅助
   * ========================================================================== */

  /**
   * 校验 serviceType 取值
   */
  private assertServiceType(value: number): asserts value is ErrandServiceType {
    if (!(ERRAND_SERVICE_TYPES as unknown as number[]).includes(value)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `serviceType 必须为 ${ERRAND_SERVICE_TYPES.join(' / ')}（当前 ${value}）`
      )
    }
  }

  /**
   * 解析期望取件时间字符串 → Date
   */
  private parseExpectedAt(value: string | undefined): Date | null {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d
  }

  /**
   * 解析 sys_config JSON 配置 → ErrandPricingConfig
   * JSON 解析失败 / 字段缺失 → 抛 SYSTEM_CONFIG_MISSING 50006
   */
  private parseConfig(jsonStr: string): ErrandPricingConfig {
    let raw: unknown
    try {
      raw = JSON.parse(jsonStr)
    } catch (err) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_CONFIG_MISSING,
        `dispatch.pricing 配置 JSON 解析失败：${(err as Error).message}`
      )
    }
    if (!raw || typeof raw !== 'object') {
      throw new BusinessException(
        BizErrorCode.SYSTEM_CONFIG_MISSING,
        'dispatch.pricing 配置必须为 JSON 对象'
      )
    }
    const obj = raw as Partial<ErrandPricingConfig>
    /* 必填字段全部 fallback 到 DEFAULT_PRICING（任意缺失时直接 merge），保证返回完整规则 */
    return {
      baseFee: obj.baseFee ?? DEFAULT_PRICING.baseFee,
      baseDistanceM: obj.baseDistanceM ?? DEFAULT_PRICING.baseDistanceM,
      perKmFee: obj.perKmFee ?? DEFAULT_PRICING.perKmFee,
      freeWeightG: obj.freeWeightG ?? DEFAULT_PRICING.freeWeightG,
      weightExtraPerKg: obj.weightExtraPerKg ?? DEFAULT_PRICING.weightExtraPerKg,
      nightSurchargeRate: obj.nightSurchargeRate ?? DEFAULT_PRICING.nightSurchargeRate,
      nightStartHour: obj.nightStartHour ?? DEFAULT_PRICING.nightStartHour,
      nightEndHour: obj.nightEndHour ?? DEFAULT_PRICING.nightEndHour,
      weatherSurchargeRate: obj.weatherSurchargeRate ?? DEFAULT_PRICING.weatherSurchargeRate,
      weatherSwitch: obj.weatherSwitch ?? DEFAULT_PRICING.weatherSwitch,
      insuranceRate: obj.insuranceRate ?? DEFAULT_PRICING.insuranceRate,
      serviceTypeMultiplier: obj.serviceTypeMultiplier ?? DEFAULT_PRICING.serviceTypeMultiplier,
      queueRatePerHour: obj.queueRatePerHour ?? DEFAULT_PRICING.queueRatePerHour
    }
  }

  /**
   * BigNumber → 元，2 位小数字符串
   */
  private fmt(n: BigNumber): string {
    return n.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2)
  }

  /**
   * 比例字符串 → 百分比展示
   */
  private pct(rate: string): string {
    const v = new BigNumber(rate).multipliedBy(100)
    return `${v.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2)}%`
  }

  /**
   * 安全读缓存
   */
  private async safeGetCache(cityCode: string): Promise<ErrandPricingConfig | null> {
    try {
      const raw = await this.redis.get(PRICING_CACHE_KEY(cityCode))
      if (!raw) return null
      return JSON.parse(raw) as ErrandPricingConfig
    } catch (err) {
      this.logger.warn(
        `[errand-pricing] Redis GET 失败 cityCode=${cityCode}：${(err as Error).message}`
      )
      return null
    }
  }

  /**
   * 安全写缓存
   */
  private async safeSetCache(cityCode: string, value: ErrandPricingConfig): Promise<void> {
    try {
      await this.redis.set(
        PRICING_CACHE_KEY(cityCode),
        JSON.stringify(value),
        'EX',
        PRICING_CACHE_TTL_SECONDS
      )
    } catch (err) {
      this.logger.warn(
        `[errand-pricing] Redis SET 失败 cityCode=${cityCode}：${(err as Error).message}`
      )
    }
  }
}
