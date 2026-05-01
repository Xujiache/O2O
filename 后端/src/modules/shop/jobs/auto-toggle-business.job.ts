/**
 * @file auto-toggle-business.job.ts
 * @stage P9 Sprint 6 / W6.E.4
 * @desc 店铺营业状态按 business_hour 自动开关 cron（每分钟）
 * @author 单 Agent V2.0（Sprint 6 Agent E）
 *
 * 设计：
 *   - cron 表达式 EVERY_MINUTE，时区 Asia/Shanghai
 *   - 仅处理 audit_status=1 已审核 + status=1 未封禁 + business_status≠2 的店铺
 *     （business_status=2 临时歇业由商户主动设置，cron 不抢权）
 *   - 当前时间命中任意一条 isActive=1 的 [open_time, close_time] → 应为 OPEN(1)
 *   - 否则 → 应为 CLOSED(0)
 *   - 仅当 entity.business_status 与目标值不一致时才 UPDATE，避免无意义写库
 *   - 全程 best-effort：DB 异常 / 单店失败仅 log，不抛
 *
 * 与 ShopBusinessHourService.isOpenNow 行为对齐：
 *   - 命中 dayOfWeek=当前北京时间星期 OR 0=每天通用
 *   - 同日区间 [openTime, closeTime] 闭区间
 *   - 营业时段未配置（候选为空）→ 视为 CLOSED（cron 场景下保持谨慎，
 *     不像 isOpenNow 默认全开，因为 isOpenNow 仅用于「展示」）
 */

import { Cron, CronExpression } from '@nestjs/schedule'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Shop, ShopBusinessHour } from '@/entities'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 营业状态：营业中 */
const BUSINESS_STATUS_OPEN = 1
/** 营业状态：打烊 */
const BUSINESS_STATUS_CLOSED = 0
/** 营业状态：临时歇业（cron 不动这种店） */
const BUSINESS_STATUS_TEMP_CLOSED = 2

/** 单次扫描批次（避免单次锁住过多行） */
const SHOP_SCAN_BATCH = 500

/** Cron 单次扫描 + 应用本批的最大耗时（自我保护，超时仅 log） */
const RUN_SOFT_TIMEOUT_MS = 50_000

/* ============================================================================
 * 服务
 * ============================================================================ */

@Injectable()
export class AutoToggleBusinessJob {
  private readonly logger = new Logger(AutoToggleBusinessJob.name)

  constructor(
    @InjectRepository(Shop) private readonly shopRepo: Repository<Shop>,
    @InjectRepository(ShopBusinessHour)
    private readonly hourRepo: Repository<ShopBusinessHour>
  ) {}

  /**
   * Cron 入口：每分钟扫描并按营业时段切换 shop.business_status
   * 注：与 ScheduleModule 配合（已在 DatabaseModule.forRoot 注册）；时区 Asia/Shanghai
   */
  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'shop-auto-toggle-business',
    timeZone: 'Asia/Shanghai'
  })
  async handleCron(): Promise<void> {
    await this.run()
  }

  /**
   * 实际执行入口（暴露便于测试 / 手工触发）
   * 返回值：{ scanned, opened, closed, skipped, failed }
   *
   * 行为：
   *   1) 取候选店铺（audit_status=1, status=1, is_deleted=0, business_status ∈ {0,1}）
   *   2) 一次性查全部候选店铺的营业时段并按 shopId 聚合（防 N+1）
   *   3) 计算每个店铺当前应处状态；与现状不一致才 UPDATE
   *
   * 错误策略：DB 异常 → 仅 log；单店失败 → failed +1，继续后面
   */
  async run(): Promise<{
    scanned: number
    opened: number
    closed: number
    skipped: number
    failed: number
  }> {
    const start = Date.now()

    /* 1) 取候选 */
    let shops: Shop[] = []
    try {
      shops = await this.shopRepo.find({
        where: [
          { auditStatus: 1, status: 1, businessStatus: BUSINESS_STATUS_OPEN, isDeleted: 0 },
          { auditStatus: 1, status: 1, businessStatus: BUSINESS_STATUS_CLOSED, isDeleted: 0 }
        ],
        select: ['id', 'businessStatus'],
        take: SHOP_SCAN_BATCH
      })
    } catch (err) {
      this.logger.error(
        `[auto-toggle-business] 查询 shop 候选失败：${err instanceof Error ? err.message : String(err)}`
      )
      return { scanned: 0, opened: 0, closed: 0, skipped: 0, failed: 0 }
    }

    if (shops.length === 0) {
      return { scanned: 0, opened: 0, closed: 0, skipped: 0, failed: 0 }
    }

    /* 2) 批量加载营业时段 */
    const shopIds = shops.map((s) => s.id)
    const hourMap = await this.loadHoursByShopIds(shopIds)

    /* 3) 计算 + UPDATE */
    const ctx = this.buildClockContext()
    let opened = 0
    let closed = 0
    let skipped = 0
    let failed = 0

    for (const shop of shops) {
      if (Date.now() - start > RUN_SOFT_TIMEOUT_MS) {
        this.logger.warn('[auto-toggle-business] 软超时退出本轮，剩余店铺下一分钟处理')
        break
      }
      /* 临时歇业（business_status=2）已被 where 过滤；这里仅二次保险 */
      if (shop.businessStatus === BUSINESS_STATUS_TEMP_CLOSED) {
        skipped += 1
        continue
      }
      const hours = hourMap.get(shop.id) ?? []
      const target = this.computeTargetStatus(hours, ctx)
      if (target === shop.businessStatus) {
        skipped += 1
        continue
      }
      try {
        await this.shopRepo
          .createQueryBuilder()
          .update(Shop)
          .set({ businessStatus: target, updatedAt: new Date() })
          .where('id = :id AND business_status = :cur', {
            id: shop.id,
            cur: shop.businessStatus
          })
          .execute()
        if (target === BUSINESS_STATUS_OPEN) opened += 1
        else closed += 1
      } catch (err) {
        failed += 1
        this.logger.error(
          `[auto-toggle-business] 更新 shop ${shop.id} 失败：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    this.logger.log(
      `[auto-toggle-business] scanned=${shops.length} opened=${opened} closed=${closed} skipped=${skipped} failed=${failed}`
    )
    return { scanned: shops.length, opened, closed, skipped, failed }
  }

  /**
   * 计算目标 business_status
   *
   * 参数：hours 该店铺所有 isActive=1 营业时段；ctx 当前时间上下文
   * 返回值：1 OPEN / 0 CLOSED
   *
   * 规则：
   *   - 候选 = hours.filter(dayOfWeek === 当前周几 OR dayOfWeek === 0)
   *   - 命中任意 [openTime, closeTime] 闭区间 → OPEN
   *   - 候选为空（未配置）→ CLOSED（cron 谨慎策略；与 isOpenNow 展示态退化为「全天开」不同）
   */
  private computeTargetStatus(
    hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>,
    ctx: { dayOfWeek: number; nowStr: string }
  ): 0 | 1 {
    const candidates = hours.filter((h) => h.dayOfWeek === ctx.dayOfWeek || h.dayOfWeek === 0)
    if (candidates.length === 0) return BUSINESS_STATUS_CLOSED
    const hit = candidates.some(
      (h) =>
        this.normalizeTime(h.openTime) <= ctx.nowStr &&
        ctx.nowStr <= this.normalizeTime(h.closeTime)
    )
    return hit ? BUSINESS_STATUS_OPEN : BUSINESS_STATUS_CLOSED
  }

  /**
   * 构造当前北京时间上下文（dayOfWeek + HH:mm:ss 字符串）
   * 注：与 ShopBusinessHourService.isOpenNow 一致
   */
  private buildClockContext(): { dayOfWeek: number; nowStr: string } {
    const now = new Date()
    const beijing = new Date(now.getTime() + this.tzOffsetMs() + 8 * 60 * 60 * 1000)
    const jsDay = beijing.getUTCDay()
    const dayOfWeek = jsDay === 0 ? 7 : jsDay
    const hh = beijing.getUTCHours().toString().padStart(2, '0')
    const mm = beijing.getUTCMinutes().toString().padStart(2, '0')
    const ss = beijing.getUTCSeconds().toString().padStart(2, '0')
    return { dayOfWeek, nowStr: `${hh}:${mm}:${ss}` }
  }

  /** 规范化 HH:mm → HH:mm:ss */
  private normalizeTime(time: string): string {
    return time.length === 5 ? `${time}:00` : time
  }

  /** 取本机时区相对 UTC 的偏移（毫秒） */
  private tzOffsetMs(): number {
    return new Date().getTimezoneOffset() * 60 * 1000
  }

  /**
   * 批量加载多个 shop 的营业时段，按 shopId 聚合
   * 失败 → 返回空 Map（每个 shop 走 closed 兜底）
   */
  private async loadHoursByShopIds(
    shopIds: string[]
  ): Promise<Map<string, Array<{ dayOfWeek: number; openTime: string; closeTime: string }>>> {
    const map = new Map<string, Array<{ dayOfWeek: number; openTime: string; closeTime: string }>>()
    if (shopIds.length === 0) return map
    try {
      const rows = await this.hourRepo
        .createQueryBuilder('h')
        .select(['h.shopId', 'h.dayOfWeek', 'h.openTime', 'h.closeTime'])
        .where('h.shop_id IN (:...sids)', { sids: shopIds })
        .andWhere('h.is_active = 1')
        .andWhere('h.is_deleted = 0')
        .getMany()
      for (const r of rows) {
        const arr = map.get(r.shopId) ?? []
        arr.push({ dayOfWeek: r.dayOfWeek, openTime: r.openTime, closeTime: r.closeTime })
        map.set(r.shopId, arr)
      }
    } catch (err) {
      this.logger.error(
        `[auto-toggle-business] 查询 shop_business_hour 失败：${err instanceof Error ? err.message : String(err)}`
      )
    }
    return map
  }
}
