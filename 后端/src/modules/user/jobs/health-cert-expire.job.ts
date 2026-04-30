/**
 * @file health-cert-expire.job.ts
 * @stage P9 Sprint 2 / W2.B.3（P9-P1-12）
 * @desc 骑手健康证到期 15 天前提醒（每日 09:00 cron）
 * @author 单 Agent V2.0（Sprint 2 Agent B）
 *
 * 来源：P7-P1-07 — 健康证到期提醒
 *
 * 设计：
 *   - cron 表达式 '0 0 9 * * *'（每日 09:00）+ Asia/Shanghai
 *   - 扫描 rider_qualification：qualType=2（健康证）+ validTo 在 [now, now+15d] 区间
 *     + auditStatus=1（已通过）+ rider.status=1（正常）
 *   - 调 MessageService.send 走 INBOX + JPUSH（通过 SYSTEM_NOTICE 模板）
 *   - 单条失败仅 log，不影响其他骑手
 *   - 全程 best-effort：DB 异常 / Redis 异常都仅 log，不抛
 *
 * 与 sys_config 的潜在交互（V2 优化）：
 *   - 提醒提前天数（15）可改为 sys_config.rider_health_cert_warn_days
 *   - 通知通道（INBOX + JPUSH）可改为可配；本期硬编码
 */

import { Cron } from '@nestjs/schedule'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, Repository } from 'typeorm'
import { Rider, RiderQualification } from '@/entities'
import { MessageService } from '@/modules/message/message.service'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 健康证 qual_type 值（rider_qualification.qual_type=2） */
const HEALTH_CERT_QUAL_TYPE = 2

/** 提醒提前天数（V2 可改 sys_config） */
const WARN_DAYS_BEFORE = 15

/** 单次扫描批次最大数量（防止大批量推送阻塞） */
const SCAN_LIMIT = 500

/** 模板 code（复用 SYSTEM_NOTICE：通用系统通知） */
const TEMPLATE_CODE = 'SYSTEM_NOTICE'

/** 1 天毫秒数 */
const ONE_DAY_MS = 24 * 3600 * 1000

/* ============================================================================
 * 服务
 * ============================================================================ */

@Injectable()
export class HealthCertExpireJob {
  private readonly logger = new Logger(HealthCertExpireJob.name)

  constructor(
    @InjectRepository(RiderQualification)
    private readonly qualRepo: Repository<RiderQualification>,
    @InjectRepository(Rider)
    private readonly riderRepo: Repository<Rider>,
    private readonly messageService: MessageService
  ) {}

  /**
   * Cron 入口：每日 09:00（北京时间）扫描健康证 15 天内到期的骑手并发提醒
   */
  @Cron('0 0 9 * * *', {
    name: 'rider-health-cert-expire-warn',
    timeZone: 'Asia/Shanghai'
  })
  async handleCron(): Promise<void> {
    await this.run()
  }

  /**
   * 实际执行入口（暴露便于测试 / 手工触发）
   * 返回值：{ scanned, notified, failed }
   * 行为：
   *   1) 查询 rider_qualification：qualType=2 + validTo ∈ [now, now+15d] + auditStatus=1
   *   2) 批量查 rider 主表（status=1 正常）
   *   3) 逐个 send 推送；失败仅 log
   */
  async run(): Promise<{ scanned: number; notified: number; failed: number }> {
    const now = new Date()
    const fifteenDaysLater = new Date(now.getTime() + WARN_DAYS_BEFORE * ONE_DAY_MS)

    /* 1) 扫描 rider_qualification */
    let quals: RiderQualification[] = []
    try {
      quals = await this.qualRepo.find({
        where: {
          qualType: HEALTH_CERT_QUAL_TYPE,
          validTo: Between(now, fifteenDaysLater),
          auditStatus: 1,
          isDeleted: 0
        },
        take: SCAN_LIMIT
      })
    } catch (err) {
      this.logger.error(
        `[health-cert-expire] 查询 rider_qualification 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return { scanned: 0, notified: 0, failed: 0 }
    }

    if (quals.length === 0) {
      this.logger.log('[health-cert-expire] 无即将到期的健康证记录')
      return { scanned: 0, notified: 0, failed: 0 }
    }

    /* 2) 批量取骑手主表过滤状态正常 */
    const riderIds = Array.from(new Set(quals.map((q) => q.riderId)))
    let riders: Rider[] = []
    try {
      riders = await this.riderRepo.find({
        where: riderIds.map((id) => ({ id, status: 1, isDeleted: 0 }))
      })
    } catch (err) {
      this.logger.error(
        `[health-cert-expire] 查询 rider 主表失败：${err instanceof Error ? err.message : String(err)}`
      )
      return { scanned: quals.length, notified: 0, failed: 0 }
    }
    const riderMap = new Map(riders.map((r) => [r.id, r]))

    /* 3) 逐个发送 */
    let notified = 0
    let failed = 0
    for (const q of quals) {
      const rider = riderMap.get(q.riderId)
      if (!rider) {
        /* 骑手已离职 / 封禁 / 软删；跳过 */
        continue
      }
      const validToStr = q.validTo ? q.validTo.toISOString().slice(0, 10) : '未知'
      const daysLeft = q.validTo
        ? Math.max(0, Math.ceil((q.validTo.getTime() - now.getTime()) / ONE_DAY_MS))
        : 0
      try {
        await this.messageService.send({
          code: TEMPLATE_CODE,
          targetType: 3 /* RIDER */,
          targetId: rider.id,
          vars: {
            title: '健康证即将到期',
            content: `您的健康证将于 ${validToStr} 到期（剩余 ${daysLeft} 天），请尽快办理续期，否则将影响接单`
          },
          category: 2,
          relatedType: 3,
          relatedNo: q.id
        })
        notified += 1
      } catch (err) {
        failed += 1
        this.logger.error(
          `[health-cert-expire] 通知骑手 ${rider.id} 失败：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    this.logger.log(
      `[health-cert-expire] 扫描完成：scanned=${quals.length} notified=${notified} failed=${failed}`
    )
    return { scanned: quals.length, notified, failed }
  }
}
