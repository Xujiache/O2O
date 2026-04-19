/**
 * @file rider-finance.controller.ts
 * @stage P4/T4.30 + T4.33（Sprint 5）
 * @desc 骑手端财务接口：概览 / 流水（含奖励/罚款）/ 提现
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/rider/...
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('rider')
 *      所有接口取 currentUser.uid 作为 rider.id
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { CurrentUser, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import { type AccountVo, type FlowQueryDto, type FlowVo } from '../dto/account.dto'
import { type CreateWithdrawDto, type QueryWithdrawDto, type WithdrawVo } from '../dto/withdraw.dto'
import { AccountService } from '../services/account.service'
import { WithdrawService } from '../services/withdraw.service'
import { AccountOwnerTypeEnum, WithdrawOwnerTypeEnum } from '../types/finance.types'

@ApiTags('财务 - 骑手端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('rider')
@Controller('rider')
export class RiderFinanceController {
  constructor(
    private readonly accountService: AccountService,
    private readonly withdrawService: WithdrawService
  ) {}

  /**
   * 骑手账户概览（含奖励/罚款汇总；细分维度由前端按 biz_type=6/7 流水筛）
   */
  @Get('finance/overview')
  @ApiOperation({ summary: '骑手账户概览（可用余额 / 冻结 / 累计收支）' })
  @ApiSwaggerResponse({ status: 200 })
  async overview(@CurrentUser('uid') riderId: string): Promise<AccountVo> {
    const account = await this.accountService.getOrCreateAccount(
      AccountOwnerTypeEnum.RIDER,
      riderId
    )
    return this.accountService.toVo(account)
  }

  /**
   * 骑手账户流水（按 biz_type 筛：6 奖励 / 7 罚款 / 3 分账 / 4 提现 等）
   */
  @Get('finance/flows')
  @ApiOperation({
    summary: '骑手账户流水分页',
    description: 'biz_type 6=奖励 / 7=罚款 / 3=分账 / 4=提现 / 8=调账'
  })
  @ApiSwaggerResponse({ status: 200 })
  flows(
    @CurrentUser('uid') riderId: string,
    @Query() query: FlowQueryDto
  ): Promise<PageResult<FlowVo>> {
    return this.accountService.listFlowsByOwner(AccountOwnerTypeEnum.RIDER, riderId, query)
  }

  /**
   * 骑手提现申请
   */
  @Post('withdrawals')
  @ApiOperation({ summary: '骑手提现申请（同商户：明文银行卡 + 持卡人）' })
  @ApiSwaggerResponse({ status: 200 })
  applyWithdraw(
    @CurrentUser('uid') riderId: string,
    @Body() dto: CreateWithdrawDto
  ): Promise<WithdrawVo> {
    return this.withdrawService.apply(WithdrawOwnerTypeEnum.RIDER, riderId, dto)
  }

  /**
   * 骑手提现列表
   */
  @Get('withdrawals')
  @ApiOperation({ summary: '我的提现列表' })
  @ApiSwaggerResponse({ status: 200 })
  listWithdraws(
    @CurrentUser('uid') riderId: string,
    @Query() query: QueryWithdrawDto
  ): Promise<PageResult<WithdrawVo>> {
    return this.withdrawService.listMine(WithdrawOwnerTypeEnum.RIDER, riderId, query)
  }
}
