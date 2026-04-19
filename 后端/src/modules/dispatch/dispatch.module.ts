/**
 * @file dispatch.module.ts
 * @stage P4/T4.36~T4.43（Sprint 6）
 * @desc 派单调度模块装配（CRUD + 候选 + 评分 + 派单 Worker + 抢单 Lua + 顺路 + 转单 + 看板）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * Controllers (3)：
 *   - RiderDispatchController     /api/v1/rider/...     抢单池 / 抢单 / 接受 / 拒绝 / 偏好
 *   - MerchantDispatchController  /api/v1/merchant/...  配送轨迹摘要
 *   - AdminDispatchController     /api/v1/admin/...     看板 / 派单记录 / 强制指派 / 转单审核
 *
 * Providers (8)：
 *   - DispatchService           主入口（CRUD + 系统派单 worker + accept/reject/manual）
 *   - CandidateService          候选筛选（GEO + 偏好 + 运力 + 黑名单 + 活跃订单维护）
 *   - ScoringService            评分（多因素加权 + sys_config 权重）
 *   - RouteMatchService         顺路单匹配（夹角 / 距离增量）
 *   - GrabService               抢单 Lua + 抢单池维护
 *   - TransferService           转单申请 + 审核
 *   - DashboardService          运力看板
 *   - PreferenceService         骑手偏好 CRUD
 *
 * Processor (1)：
 *   - DispatchRetryProcessor    BullMQ 'dispatch-retry' check-timeout 任务消费
 *
 * Imports：
 *   - HealthModule       REDIS_CLIENT
 *   - UserModule         BlacklistService / OperationLogService
 *   - MapModule          RiderLocationService / MapService / haversine
 *   - MessageModule      MessageService（推送 RIDER_DISPATCH 模板）
 *   - BullModule.registerQueue({ name: 'dispatch-retry' })  延迟 15s 检查
 *   - TypeOrmModule.forFeature(D6 7 实体)
 *
 * Exports：
 *   - DispatchService / GrabService / TransferService / CandidateService
 *     供 Sprint 8 Orchestration / OrderModule（事件订阅触发派单）注入使用
 */

import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  AbnormalReport,
  DeliveryTrackSummary,
  DispatchRecord,
  Rider,
  RiderAttendance,
  RiderPreference,
  RiderReward,
  TransferRecord
} from '@/entities'
import { HealthModule } from '@/health/health.module'
import { MapModule } from '@/modules/map/map.module'
import { MessageModule } from '@/modules/message/message.module'
import { UserModule } from '@/modules/user/user.module'
import { AdminDispatchController } from './controllers/admin-dispatch.controller'
import { MerchantDispatchController } from './controllers/merchant-dispatch.controller'
import { RiderDispatchController } from './controllers/rider-dispatch.controller'
import { DispatchRetryProcessor } from './processors/dispatch-retry.processor'
import { CandidateService } from './services/candidate.service'
import { DashboardService } from './services/dashboard.service'
import { DispatchService, DISPATCH_RETRY_QUEUE } from './services/dispatch.service'
import { GrabService } from './services/grab.service'
import { PreferenceService } from './services/preference.service'
import { RouteMatchService } from './services/route-match.service'
import { ScoringService } from './services/scoring.service'
import { TransferService } from './services/transfer.service'

@Module({
  imports: [
    HealthModule,
    MapModule,
    MessageModule,
    UserModule,
    BullModule.registerQueue({ name: DISPATCH_RETRY_QUEUE }),
    TypeOrmModule.forFeature([
      DispatchRecord,
      TransferRecord,
      AbnormalReport,
      RiderPreference,
      DeliveryTrackSummary,
      RiderAttendance,
      RiderReward,
      Rider
    ])
  ],
  controllers: [RiderDispatchController, MerchantDispatchController, AdminDispatchController],
  providers: [
    CandidateService,
    ScoringService,
    RouteMatchService,
    GrabService,
    DispatchService,
    TransferService,
    DashboardService,
    PreferenceService,
    DispatchRetryProcessor
  ],
  exports: [
    DispatchService,
    GrabService,
    TransferService,
    CandidateService,
    DashboardService,
    PreferenceService
  ]
})
export class DispatchModule {}
