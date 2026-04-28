import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { makePageResult } from '@/common'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { Arbitration, Complaint, Ticket } from '@/entities'
import { SnowflakeId } from '@/utils'

class ListQueryDto {
  page?: number
  pageSize?: number
  keyword?: string
}

interface RiskRuleRow {
  id: string
  name: string
  category: string
  enabled: boolean
  threshold: Record<string, unknown>
  action: string
  createdAt: string
}

const riskRuleStore: RiskRuleRow[] = [
  {
    id: '9001',
    name: '高频取消预警',
    category: 'order',
    enabled: true,
    threshold: { cancelCount: 5, hours: 24 },
    action: '预警并限制优惠',
    createdAt: new Date().toISOString()
  },
  {
    id: '9002',
    name: '异常补贴命中',
    category: 'marketing',
    enabled: true,
    threshold: { amount: 200, days: 3 },
    action: '进入人工复核',
    createdAt: new Date().toISOString()
  }
]

@ApiTags('管理后台 - 风控')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('risk:manage')
@UserTypes('admin')
@Controller('admin/risk')
export class AdminRiskController {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(Arbitration)
    private readonly arbitrationRepo: Repository<Arbitration>,
    @InjectRepository(Complaint)
    private readonly complaintRepo: Repository<Complaint>
  ) {}

  @Get('rule/list')
  @ApiOperation({ summary: '风控规则列表' })
  async ruleList(@Query() query: ListQueryDto) {
    const rows = this.filterByKeyword(
      riskRuleStore,
      query.keyword,
      (item) => `${item.name} ${item.category}`
    )
    return this.pageFromArray(rows, query)
  }

  @Post('rule')
  @ApiOperation({ summary: '创建风控规则' })
  async ruleSave(@Body() dto: Partial<RiskRuleRow>) {
    const row: RiskRuleRow = {
      id: SnowflakeId.next(),
      name: dto.name ?? '',
      category: dto.category ?? '',
      enabled: dto.enabled ?? true,
      threshold: dto.threshold ?? {},
      action: dto.action ?? '',
      createdAt: new Date().toISOString()
    }
    riskRuleStore.unshift(row)
    return { id: row.id }
  }

  @Put('rule/:id')
  @ApiOperation({ summary: '更新风控规则' })
  async ruleUpdate(@Param('id') id: string, @Body() dto: Partial<RiskRuleRow>) {
    const row = riskRuleStore.find((item) => item.id === id)
    if (row) Object.assign(row, dto)
    return { ok: true }
  }

  @Post('rule/:id/toggle')
  @ApiOperation({ summary: '切换风控规则启停' })
  async ruleToggle(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    const row = riskRuleStore.find((item) => item.id === id)
    if (row) row.enabled = body.enabled
    return { ok: true }
  }

  @Get('risk-order/list')
  @ApiOperation({ summary: '风险订单列表' })
  async riskOrderList(@Query() query: ListQueryDto) {
    const rows = (
      await this.complaintRepo.find({
        where: { isDeleted: 0 },
        order: { createdAt: 'DESC' },
        take: 200
      })
    ).map((item) => ({
      orderNo: item.orderNo ?? '',
      reason: item.content,
      level: item.severity === 3 ? 2 : item.severity === 2 ? 1 : 0,
      hitRules: [item.category],
      reviewedBy: item.handleAdminId ?? '',
      reviewedAt: item.handleAt?.toISOString(),
      status: item.status >= 2 ? 'pass' : 'pending'
    }))
    const filtered = this.filterByKeyword(
      rows,
      query.keyword,
      (item) => `${item.orderNo} ${item.reason}`
    )
    return this.pageFromArray(filtered, query)
  }

  @Post('risk-order/:orderNo/review')
  @ApiOperation({ summary: '风险订单审核' })
  async riskOrderReview(
    @Param('orderNo') orderNo: string,
    @Body() body: { action: 'pass' | 'block'; remark?: string }
  ) {
    return { ok: true, orderNo, action: body.action }
  }

  @Get('cheat/list')
  @ApiOperation({ summary: '刷单/套现识别列表' })
  async cheatList(@Query() query: ListQueryDto) {
    const rows = (
      await this.arbitrationRepo.find({
        where: { isDeleted: 0 },
        order: { createdAt: 'DESC' },
        take: 200
      })
    ).map((item) => ({
      id: item.id,
      targetType:
        item.respondentType === 2 ? 'merchant' : item.respondentType === 3 ? 'rider' : 'user',
      targetId: item.respondentId,
      targetName: item.arbitrationNo,
      category: item.sourceType === 2 ? 'cashing' : 'brushing',
      score: item.decisionAmount ? Number(item.decisionAmount) : 0,
      evidence: { orderNo: item.orderNo },
      status: item.status === 2 ? 'reviewed' : 'detected',
      createdAt: item.createdAt.toISOString()
    }))
    const filtered = this.filterByKeyword(
      rows,
      query.keyword,
      (item) => `${item.targetName} ${item.category}`
    )
    return this.pageFromArray(filtered, query)
  }

  @Post('cheat/:id/punish')
  @ApiOperation({ summary: '处罚风控对象' })
  async cheatPunish(@Param('id') id: string, @Body() body: { action: string; remark?: string }) {
    return { ok: true, id, action: body.action }
  }

  @Get('record/list')
  @ApiOperation({ summary: '风控处理记录' })
  async recordList(@Query() query: ListQueryDto) {
    const rows = await this.cheatList(query)
    return rows
  }

  private pageFromArray<T>(rows: T[], query: ListQueryDto) {
    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 20
    const start = (page - 1) * pageSize
    const slice = rows.slice(start, start + pageSize)
    const pageResult = makePageResult(slice, rows.length, page, pageSize)
    return {
      records: pageResult.list,
      total: pageResult.meta.total,
      page: pageResult.meta.page,
      pageSize: pageResult.meta.pageSize
    }
  }

  private filterByKeyword<T>(
    rows: T[],
    keyword: string | undefined,
    pickText: (item: T) => string
  ) {
    if (!keyword) return rows
    return rows.filter((item) => pickText(item).includes(keyword))
  }
}
