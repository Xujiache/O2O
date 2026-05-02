/**
 * @file merchant-staff.controller.ts
 * @desc 商户端子账号接口：CRUD + 重置密码
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { PageResult } from '../../../common'
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator'
import { UserTypes } from '../../auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '../../auth/guards/user-type.guard'
import {
  CreateMerchantStaffDto,
  MerchantStaffVo,
  QueryMerchantStaffDto,
  ResetMerchantStaffPasswordDto,
  UpdateMerchantStaffDto
} from '../dto/merchant-staff.dto'
import { MerchantStaffService } from '../services/merchant-staff.service'

@ApiTags('商户端 - 子账号')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller('merchant/staff')
export class MerchantStaffController {
  constructor(private readonly merchantStaffService: MerchantStaffService) {}

  /** 子账号分页列表 */
  @Get()
  @ApiOperation({
    summary: '商户端 - 子账号分页列表（当前 schema 下默认返回当前商户全部店铺绑定）'
  })
  @ApiSwaggerResponse({ status: 200 })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryMerchantStaffDto
  ): Promise<PageResult<MerchantStaffVo>> {
    return this.merchantStaffService.listForMerchant(resolveMerchantId(user), query)
  }

  /** 子账号详情 */
  @Get(':id')
  @ApiOperation({ summary: '商户端 - 子账号详情' })
  @ApiSwaggerResponse({ status: 200, type: MerchantStaffVo })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<MerchantStaffVo> {
    return this.merchantStaffService.detailForMerchant(resolveMerchantId(user), id)
  }

  /** 创建子账号 */
  @Post()
  @ApiOperation({
    summary:
      '商户端 - 创建子账号（接收 shopIds 仅做兼容校验，不做持久化；响应返回当前商户全部店铺）'
  })
  @ApiSwaggerResponse({ status: 200, type: MerchantStaffVo })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMerchantStaffDto
  ): Promise<MerchantStaffVo> {
    return this.merchantStaffService.createForMerchant(resolveMerchantId(user), dto)
  }

  /** 更新子账号 */
  @Put(':id')
  @ApiOperation({
    summary:
      '商户端 - 更新子账号（shopIds 仅兼容校验；password 传空串时自动忽略，兼容现有前端编辑页）'
  })
  @ApiSwaggerResponse({ status: 200, type: MerchantStaffVo })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMerchantStaffDto
  ): Promise<MerchantStaffVo> {
    return this.merchantStaffService.updateForMerchant(resolveMerchantId(user), id, dto)
  }

  /** 删除子账号 */
  @Delete(':id')
  @ApiOperation({ summary: '商户端 - 删除子账号（软删并作废已有 token）' })
  @ApiSwaggerResponse({ status: 200 })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.merchantStaffService.removeForMerchant(resolveMerchantId(user), id)
  }

  /** 重置密码 */
  @Post(':id/password/reset')
  @ApiOperation({ summary: '商户端 - 重置子账号密码（成功后作废已有 token）' })
  @ApiSwaggerResponse({ status: 200 })
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetMerchantStaffPasswordDto
  ): Promise<{ ok: true }> {
    return this.merchantStaffService.resetPasswordForMerchant(resolveMerchantId(user), id, dto)
  }
}

function resolveMerchantId(user: AuthUser): string {
  return user.merchantId ?? user.uid
}
