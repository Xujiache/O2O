/**
 * @file group-buy-saga.service.ts
 * @stage P9 Sprint 3 / W3.D.2
 * @desc 拼单成团 → 多单合并 saga：订阅 GroupBuyAchieved 事件，调用 OrderService.mergeForGroup
 * @author Sprint3-Agent D
 *
 * Saga 步骤：
 *   1. ValidateGroup    校验事件 payload（leaderOrderNo + memberOrderNos 非空）
 *   2. MergeOrders      调用 OrderService.mergeForGroup（事务由 service 内管理）
 *   3. TriggerDispatch  触发派单（best-effort；service 内通常已 emit DispatchTrigger 事件）
 *
 * 设计：
 *   - 注册在 MarketingModule providers，不动 OrchestrationModule
 *   - OrderService / SagaRunnerService 通过 ModuleRef.get(strict:false) 跨模块拉取，
 *     避免引入 OrderModule import 造成循环依赖（OrderModule 已 import MarketingModule）
 *   - SagaRunnerService 缺失（mock / 单测）时退化为顺序直跑 + try/catch
 *
 * 行为：
 *   - 整体 best-effort：failedStep 记录在返回值；不向上抛异常
 *   - merge 内部事务回滚 → MergeOrders 抛错 → saga compensate 阶段仅 log（service 已 rollback）
 */

import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import type { GroupBuyAchievedEvent } from '@/modules/marketing/services/group-buy.service'
import { OrderService } from '@/modules/order/services/order.service'
import { DispatchService } from '@/modules/dispatch/services/dispatch.service'
import {
  EventSourceEnum,
  type EventEnvelope,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'
import { SagaRunnerService } from './saga-runner.service'

/**
 * Saga 内部状态
 *
 * 字段：
 *   - mergedOrderNo  合并后的主单号（leaderOrderNo）；MergeOrders 成功后写入
 *   - dispatchTriggered 是否触发派单
 */
interface GroupBuySagaState {
  mergedOrderNo: string
  dispatchTriggered: boolean
}

/**
 * OrderService 跨模块依赖契约（仅声明 saga 用到的方法）
 * 用途：避免 import OrderService 造成 OrderModule ↔ MarketingModule 循环
 */
interface OrderServiceContract {
  mergeForGroup(orderNos: string[], leaderOrderNo: string): Promise<{ mergedOrderNo: string }>
}

/**
 * DispatchService 跨模块依赖契约（仅 saga 用到的方法子集）
 */
interface DispatchServiceContract {
  dispatchOrder(orderNo: string, orderType: number, attempt: number): Promise<void>
}

@Injectable()
export class GroupBuySagaService {
  private readonly logger = new Logger(GroupBuySagaService.name)

  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * 处理成团事件（被 GroupBuyService 在成团时刻调用）
   *
   * 参数：event GroupBuyAchievedEvent
   * 返回值：SagaRunResult（best-effort，不抛）
   */
  async handleGroupBuyAchieved(event: GroupBuyAchievedEvent): Promise<SagaRunResult> {
    const envelope: EventEnvelope<GroupBuyAchievedEvent> = {
      source: EventSourceEnum.MANUAL,
      eventName: 'GroupBuyAchieved',
      body: event,
      receivedAt: Date.now(),
      traceId: ''
    }

    const orderService = this.lookupOrderService()
    const dispatchService = this.lookupDispatchService()

    const steps: SagaStep<SagaContext<GroupBuySagaState>>[] = [
      {
        name: 'ValidateGroup',
        run: async (ctx) => {
          const allNos = [event.leaderOrderNo, ...event.memberOrderNos].filter(
            (s) => typeof s === 'string' && s.length > 0
          )
          if (allNos.length < 2) {
            throw new Error(
              `GroupBuyAchieved invalid: leader=${event.leaderOrderNo} members=${event.memberOrderNos.length}`
            )
          }
          ctx.state.mergedOrderNo = ''
          ctx.state.dispatchTriggered = false
        }
      },
      {
        name: 'MergeOrders',
        run: async (ctx) => {
          if (!orderService) {
            this.logger.warn(
              `[GROUP-BUY-SAGA] OrderService 未就绪，跳过 merge group=${event.groupId}`
            )
            return
          }
          const allNos = [event.leaderOrderNo, ...event.memberOrderNos]
          const r = await orderService.mergeForGroup(allNos, event.leaderOrderNo)
          ctx.state.mergedOrderNo = r.mergedOrderNo
        },
        compensate: async () => {
          /* OrderService.mergeForGroup 内部事务已 rollback；这里仅 log 标记 */
          this.logger.warn(
            `[GROUP-BUY-SAGA] MergeOrders 失败补偿：依赖 service 事务回滚 group=${event.groupId}`
          )
        }
      },
      {
        name: 'TriggerDispatch',
        run: async (ctx) => {
          if (!ctx.state.mergedOrderNo) return
          if (!dispatchService) {
            this.logger.debug(
              `[GROUP-BUY-SAGA] DispatchService 未就绪，跳过派单 order=${ctx.state.mergedOrderNo}`
            )
            return
          }
          try {
            /* orderType 1=外卖；attempt=0 */
            await dispatchService.dispatchOrder(ctx.state.mergedOrderNo, 1, 0)
            ctx.state.dispatchTriggered = true
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            this.logger.warn(
              `[GROUP-BUY-SAGA] dispatch 失败 order=${ctx.state.mergedOrderNo}：${msg}（不阻断 saga）`
            )
          }
        }
      }
    ]

    const runner = this.lookupSagaRunner()
    if (runner) {
      return runner.execute<GroupBuySagaState>('GroupBuyMergeSaga', envelope, steps, {
        mergedOrderNo: '',
        dispatchTriggered: false
      })
    }

    /* runner 缺失：退化为顺序直跑 + try/catch（不写 DLQ / saga_state） */
    return this.runStepsInline(envelope, steps)
  }

  /**
   * SagaRunner 缺失时的顺序执行兜底（不写 DLQ）
   */
  private async runStepsInline(
    envelope: EventEnvelope<GroupBuyAchievedEvent>,
    steps: SagaStep<SagaContext<GroupBuySagaState>>[]
  ): Promise<SagaRunResult> {
    const ctx: SagaContext<GroupBuySagaState> = {
      sagaId: `inline-${envelope.receivedAt}`,
      sagaName: 'GroupBuyMergeSaga',
      envelope,
      state: { mergedOrderNo: '', dispatchTriggered: false }
    }
    const executedSteps: string[] = []
    for (const step of steps) {
      try {
        await step.run(ctx)
        executedSteps.push(step.name)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.error(`[GROUP-BUY-SAGA/INLINE] step=${step.name} 失败：${message}`)
        return {
          sagaId: ctx.sagaId,
          sagaName: ctx.sagaName,
          executedSteps,
          failedStep: step.name,
          error: message,
          compensated: 0
        }
      }
    }
    return {
      sagaId: ctx.sagaId,
      sagaName: ctx.sagaName,
      executedSteps,
      failedStep: null,
      error: null,
      compensated: 0
    }
  }

  /**
   * 跨模块取 OrderService（OrderModule import MarketingModule，反向不可 import；
   *   故用 ModuleRef.get(strict:false) 在运行时跨模块解析）
   * 返回值：OrderServiceContract 或 null
   */
  private lookupOrderService(): OrderServiceContract | null {
    try {
      const svc = this.moduleRef.get<OrderService>(OrderService, { strict: false })
      if (svc && typeof (svc as unknown as OrderServiceContract).mergeForGroup === 'function') {
        return svc as unknown as OrderServiceContract
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * 跨模块取 DispatchService
   */
  private lookupDispatchService(): DispatchServiceContract | null {
    try {
      const svc = this.moduleRef.get<DispatchService>(DispatchService, { strict: false })
      if (svc && typeof (svc as unknown as DispatchServiceContract).dispatchOrder === 'function') {
        return svc as unknown as DispatchServiceContract
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * 跨模块取 SagaRunnerService（OrchestrationModule 内）
   */
  private lookupSagaRunner(): SagaRunnerService | null {
    try {
      const runner = this.moduleRef.get(SagaRunnerService, { strict: false })
      return runner ?? null
    } catch {
      return null
    }
  }
}
