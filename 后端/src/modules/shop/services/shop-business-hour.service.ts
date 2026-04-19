/**
 * @file shop-business-hour.service.ts
 * @stage P4/T4.1（Sprint 1）
 * @desc 店铺营业时段服务：批量设置（先删后插事务）+ 查询 + isOpenNow 实时判断
 * @author 单 Agent V2.0
 *
 * 数据：MySQL `shop_business_hour`
 * 跨天处理：调用方需自行将 02:00 收摊拆为 当日 09:00-23:59:59 + 次日 00:00:00-02:00 两条
 * isOpenNow：基于当前北京时区（与 DatabaseModule timezone +08:00 对齐）
 *           结合 shop.business_status 联合判断，调用方传入 businessStatus
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import { ShopBusinessHour } from '@/entities'
import { SnowflakeId } from '@/utils'
import {
  type BusinessHourItemDto,
  type BusinessHourVo,
  type SetBusinessHoursDto
} from '../dto/business-hour.dto'

@Injectable()
export class ShopBusinessHourService {
  private readonly logger = new Logger(ShopBusinessHourService.name)

  constructor(
    @InjectRepository(ShopBusinessHour)
    private readonly hourRepo: Repository<ShopBusinessHour>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * 批量设置营业时段（先删后插事务）
   * 参数：shopId / dto
   * 返回值：写入后的 BusinessHourVo[]
   * 用途：PUT /api/v1/merchant/shop/:id/business-hours
   *
   * 设计：
   *   1. 校验时段（不允许 closeTime <= openTime；day_of_week=0 时不允许其他 day 同时存在以避免歧义）
   *   2. 事务内：软删该 shop 既有营业时段（is_deleted=1）→ 插入 dto.list
   *   3. 返回插入后的实体列表
   */
  async setForShop(shopId: string, dto: SetBusinessHoursDto): Promise<BusinessHourVo[]> {
    this.assertItems(dto.list)

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ShopBusinessHour)
      /* 软删既有 */
      await repo
        .createQueryBuilder()
        .update(ShopBusinessHour)
        .set({ isDeleted: 1, deletedAt: new Date() })
        .where('shop_id = :sid AND is_deleted = 0', { sid: shopId })
        .execute()

      if (dto.list.length === 0) {
        this.logger.log(`shop ${shopId} 营业时段已清空`)
        return []
      }

      /* 插入新 */
      const now = new Date()
      const entities = dto.list.map((it) =>
        repo.create({
          id: SnowflakeId.next(),
          tenantId: 1,
          shopId,
          dayOfWeek: it.dayOfWeek,
          openTime: this.normalizeTime(it.openTime),
          closeTime: this.normalizeTime(it.closeTime),
          isActive: it.isActive ?? 1,
          isDeleted: 0,
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        })
      )
      const saved = await repo.save(entities)
      this.logger.log(`shop ${shopId} 营业时段已重置为 ${saved.length} 条`)
      return saved.map((e) => this.toVo(e))
    })
  }

  /**
   * 查询某店铺全部营业时段（按 day_of_week ASC, open_time ASC）
   * 参数：shopId
   * 返回值：BusinessHourVo[]
   * 用途：GET /api/v1/merchant/shop/:id/business-hours
   */
  async listByShop(shopId: string): Promise<BusinessHourVo[]> {
    const rows = await this.hourRepo.find({
      where: { shopId, isDeleted: 0 },
      order: { dayOfWeek: 'ASC', openTime: 'ASC' }
    })
    return rows.map((r) => this.toVo(r))
  }

  /**
   * 批量查询多店铺营业时段（用户端列表使用，O(1) 一次性聚合，避免 N+1）
   * 参数：shopIds 店铺 ID 数组
   * 返回值：Map<shopId, BusinessHourVo[]>
   */
  async listByShops(shopIds: string[]): Promise<Map<string, BusinessHourVo[]>> {
    const map = new Map<string, BusinessHourVo[]>()
    if (shopIds.length === 0) return map
    const rows = await this.hourRepo.find({
      where: { shopId: In(shopIds), isDeleted: 0, isActive: 1 },
      order: { dayOfWeek: 'ASC', openTime: 'ASC' }
    })
    for (const r of rows) {
      if (!map.has(r.shopId)) map.set(r.shopId, [])
      map.get(r.shopId)!.push(this.toVo(r))
    }
    return map
  }

  /**
   * 当前是否营业（结合 business_status 与营业时段）
   * 参数：businessStatus 店铺 business_status；hours 该店铺当前生效的营业时段集
   * 返回值：true / false
   *
   * 规则：
   *   - business_status = 0 打烊 / 2 临时歇业 → false
   *   - business_status = 1 时再看 hours：取当前北京时间星期几 + HH:mm:ss，匹配 day_of_week=该日 OR day_of_week=0
   *     的至少 1 条 isActive=1 区间 [openTime, closeTime]，命中即营业；hours 为空时退化为「全天营业」(返回 true)
   *
   * 注：跨日营业由调用方在录入时拆为两条；本方法只判 [open, close] 同日区间
   */
  isOpenNow(businessStatus: number, hours: BusinessHourVo[]): boolean {
    if (businessStatus !== 1) return false
    /* 跨实例运行环境时区可能不一致，统一以服务端 +08:00 计算 */
    const now = new Date()
    const beijing = new Date(now.getTime() + this.tzOffsetMs() + 8 * 60 * 60 * 1000)
    /* JS getDay: 0=Sunday ... 6=Saturday；规范化为 1=Monday ... 7=Sunday */
    const jsDay = beijing.getUTCDay()
    const dayOfWeek = jsDay === 0 ? 7 : jsDay
    const hh = beijing.getUTCHours().toString().padStart(2, '0')
    const mm = beijing.getUTCMinutes().toString().padStart(2, '0')
    const ss = beijing.getUTCSeconds().toString().padStart(2, '0')
    const nowStr = `${hh}:${mm}:${ss}`

    const candidates = hours.filter(
      (h) => h.isActive === 1 && (h.dayOfWeek === dayOfWeek || h.dayOfWeek === 0)
    )
    if (candidates.length === 0) {
      /* 营业时段未配置（或未启用）→ 退化为全天营业，避免新店上架后默认打烊 */
      return hours.length === 0
    }
    return candidates.some(
      (h) => this.normalizeTime(h.openTime) <= nowStr && nowStr <= this.normalizeTime(h.closeTime)
    )
  }

  /**
   * 自检入参合法性
   * 抛 Error 由 Controller 层 ValidationPipe 捕获；service 层用 Error 表达数据非法
   */
  private assertItems(items: BusinessHourItemDto[]): void {
    const allDayCount = items.filter((i) => i.dayOfWeek === 0).length
    const otherCount = items.filter((i) => i.dayOfWeek !== 0).length
    if (allDayCount > 0 && otherCount > 0) {
      throw new Error('day_of_week=0（每天通用）与具体星期不可同时设置')
    }
    for (const it of items) {
      const o = this.normalizeTime(it.openTime)
      const c = this.normalizeTime(it.closeTime)
      if (c <= o) {
        throw new Error(`closeTime 必须晚于 openTime（${it.openTime} → ${it.closeTime}）`)
      }
    }
  }

  /**
   * 把 HH:mm 或 HH:mm:ss 统一规范为 HH:mm:ss
   */
  private normalizeTime(time: string): string {
    return time.length === 5 ? `${time}:00` : time
  }

  /**
   * 取本机时区相对 UTC 的偏移（毫秒）
   * 用途：把 new Date().getTime() 转换为「视为 UTC + 8h」的北京时间
   *      （DatabaseModule 已设 timezone +08:00；前端入参/出参也按北京时区呈现）
   */
  private tzOffsetMs(): number {
    return new Date().getTimezoneOffset() * 60 * 1000
  }

  private toVo(e: ShopBusinessHour): BusinessHourVo {
    return {
      id: e.id,
      shopId: e.shopId,
      dayOfWeek: e.dayOfWeek,
      openTime: this.normalizeTime(e.openTime),
      closeTime: this.normalizeTime(e.closeTime),
      isActive: e.isActive
    }
  }
}
