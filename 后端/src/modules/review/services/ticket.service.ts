/**
 * @file ticket.service.ts
 * @stage P4/T4.46（Sprint 7）
 * @desc 客服工单服务：用户/商户/骑手提交求助 + admin 分派 / 回复 / 关闭
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 数据：MySQL `ticket`
 *
 * 业务规则：
 *   - 提交：ticket_no = generateBizNo('T')；status=0 待受理
 *   - 分派 assign：assigneeAdminId 必填；status PENDING → PROCESSING
 *   - 回复 reply：写 last_reply_at + last_reply_by_type=2 客服；status PENDING → PROCESSING
 *   - 关闭 close：closed_at + close_reason；status → CLOSED；不允许重复关
 *
 * 越权校验：
 *   - 提交方查我的工单：where submitter_type / submitter_id 必须等于当前 uid
 *   - 管理端：可任意筛选 + 操作
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type FindOptionsWhere } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Ticket } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId, generateBizNo } from '@/utils'
import {
  type AssignTicketDto,
  type CloseTicketDto,
  type CreateTicketDto,
  type QueryTicketDto,
  type ReplyTicketDto,
  type TicketVo
} from '../dto/ticket.dto'
import { TicketReplyByTypeEnum, TicketStatusEnum } from '../types/review.types'

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name)

  constructor(
    @InjectRepository(Ticket) private readonly ticketRepo: Repository<Ticket>,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ==========================================================================
   * 一、提交工单（用户/商户/骑手 共用）
   * ========================================================================== */

  /**
   * 提交工单
   * 参数：submitterType / submitterId / dto
   * 返回值：TicketVo
   */
  async submit(
    submitterType: number,
    submitterId: string,
    dto: CreateTicketDto
  ): Promise<TicketVo> {
    if (Boolean(dto.relatedOrderNo) !== Boolean(dto.relatedType)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'relatedOrderNo 与 relatedType 必须同时存在或同时缺省'
      )
    }
    const now = new Date()
    const entity = this.ticketRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      ticketNo: generateBizNo('T'),
      submitterType,
      submitterId,
      category: dto.category,
      priority: dto.priority ?? 1,
      title: dto.title,
      content: dto.content,
      attachUrls: dto.attachUrls ?? null,
      relatedOrderNo: dto.relatedOrderNo ?? null,
      relatedType: dto.relatedType ?? null,
      status: TicketStatusEnum.PENDING,
      assigneeAdminId: null,
      lastReplyAt: null,
      lastReplyByType: null,
      closedAt: null,
      closeReason: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.ticketRepo.save(entity)
    this.logger.log(
      `提交方 type=${submitterType}#${submitterId} 提交工单 ${saved.ticketNo}（${dto.category}/${dto.title}）`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 二、列表查询
   * ========================================================================== */

  /**
   * 提交方查我的工单
   * 参数：submitterType / submitterId / query
   * 返回值：PageResult<TicketVo>
   */
  async listBySubmitter(
    submitterType: number,
    submitterId: string,
    query: QueryTicketDto
  ): Promise<PageResult<TicketVo>> {
    const where: FindOptionsWhere<Ticket> = {
      isDeleted: 0,
      submitterType,
      submitterId
    }
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /**
   * 管理端：工单工作台
   * 参数：query
   * 返回值：PageResult<TicketVo>
   */
  async listForAdmin(query: QueryTicketDto): Promise<PageResult<TicketVo>> {
    const where: FindOptionsWhere<Ticket> = { isDeleted: 0 }
    if (query.submitterType !== undefined) where.submitterType = query.submitterType
    if (query.submitterId) where.submitterId = query.submitterId
    if (query.assigneeAdminId) where.assigneeAdminId = query.assigneeAdminId
    this.applyCommonWhere(where, query)
    return this.queryWith(where, query)
  }

  /* ==========================================================================
   * 三、管理端 分派 / 回复 / 关闭
   * ========================================================================== */

  /**
   * 管理端：分派工单
   * 参数：ticketId / opAdminId / dto
   * 返回值：TicketVo
   * 错误：10010 / 10013 已关闭
   */
  async assign(ticketId: string, opAdminId: string, dto: AssignTicketDto): Promise<TicketVo> {
    const t = await this.requireById(ticketId)
    this.assertNotClosed(t.status)
    t.assigneeAdminId = dto.assigneeAdminId
    if (dto.priority !== undefined) t.priority = dto.priority
    if (t.status === TicketStatusEnum.PENDING) {
      t.status = TicketStatusEnum.PROCESSING
    }
    t.updatedAt = new Date()
    const saved = await this.ticketRepo.save(t)
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'ticket-assign',
      resourceType: 'ticket',
      resourceId: ticketId,
      description: `分派工单 ${t.ticketNo} → admin#${dto.assigneeAdminId}`
    })
    return this.toVo(saved)
  }

  /**
   * 管理端：回复工单（last_reply_by_type=2 客服）
   * 参数：ticketId / opAdminId / dto
   * 返回值：TicketVo
   *
   * 注：本期不写专门的 ticket_reply 表（设计未声明），仅更新主表元数据；
   *      未来如需多轮回复可拆 ticket_message 子表（后续 Sprint 决策）。
   */
  async reply(ticketId: string, opAdminId: string, dto: ReplyTicketDto): Promise<TicketVo> {
    const t = await this.requireById(ticketId)
    this.assertNotClosed(t.status)
    const now = new Date()
    if (!t.assigneeAdminId) t.assigneeAdminId = opAdminId
    if (t.status === TicketStatusEnum.PENDING) t.status = TicketStatusEnum.PROCESSING
    t.lastReplyAt = now
    t.lastReplyByType = TicketReplyByTypeEnum.CS
    t.updatedAt = now
    const saved = await this.ticketRepo.save(t)
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'ticket-reply',
      resourceType: 'ticket',
      resourceId: ticketId,
      description: `客服回复工单 ${t.ticketNo}：${dto.content.slice(0, 100)}${dto.attachUrls && dto.attachUrls.length > 0 ? `（附件 ${dto.attachUrls.length} 张）` : ''}`
    })
    return this.toVo(saved)
  }

  /**
   * 管理端：关闭工单
   * 参数：ticketId / opAdminId / dto
   * 返回值：TicketVo
   * 错误：10010 / 10013 已关闭
   */
  async close(ticketId: string, opAdminId: string, dto: CloseTicketDto): Promise<TicketVo> {
    const t = await this.requireById(ticketId)
    this.assertNotClosed(t.status)
    const now = new Date()
    t.status = TicketStatusEnum.CLOSED
    t.closedAt = now
    t.closeReason = dto.closeReason
    t.updatedAt = now
    const saved = await this.ticketRepo.save(t)
    await this.operationLogService.write({
      opAdminId,
      module: 'review',
      action: 'ticket-close',
      resourceType: 'ticket',
      resourceId: ticketId,
      description: `关闭工单 ${t.ticketNo}：${dto.closeReason}`
    })
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 四、内部
   * ========================================================================== */

  /**
   * 取一条 ticket，不存在抛 10010
   */
  async requireById(ticketId: string): Promise<Ticket> {
    const t = await this.ticketRepo.findOne({ where: { id: ticketId, isDeleted: 0 } })
    if (!t) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        '工单不存在',
        HttpStatus.NOT_FOUND
      )
    }
    return t
  }

  /**
   * Entity → VO
   */
  toVo(t: Ticket): TicketVo {
    return {
      id: t.id,
      ticketNo: t.ticketNo,
      submitterType: t.submitterType,
      submitterId: t.submitterId,
      category: t.category,
      priority: t.priority,
      title: t.title,
      content: t.content,
      attachUrls: t.attachUrls,
      relatedOrderNo: t.relatedOrderNo,
      relatedType: t.relatedType,
      status: t.status,
      assigneeAdminId: t.assigneeAdminId,
      lastReplyAt: t.lastReplyAt,
      lastReplyByType: t.lastReplyByType,
      closedAt: t.closedAt,
      closeReason: t.closeReason,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }
  }

  /**
   * 校验工单未关闭
   */
  private assertNotClosed(status: number): void {
    if (status === TicketStatusEnum.CLOSED) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '工单已关闭，不允许操作')
    }
  }

  /**
   * 通用 where：status / category / priority / relatedOrderNo
   */
  private applyCommonWhere(where: FindOptionsWhere<Ticket>, query: QueryTicketDto): void {
    if (query.status !== undefined) where.status = query.status
    if (query.category) where.category = query.category
    if (query.priority !== undefined) where.priority = query.priority
    if (query.relatedOrderNo) where.relatedOrderNo = query.relatedOrderNo
  }

  /**
   * 通用列表
   */
  private async queryWith(
    where: FindOptionsWhere<Ticket>,
    query: QueryTicketDto
  ): Promise<PageResult<TicketVo>> {
    const [rows, total] = await this.ticketRepo.findAndCount({
      where,
      order: { priority: 'DESC', createdAt: 'DESC' },
      skip: query.skip(),
      take: query.take()
    })
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }
}
