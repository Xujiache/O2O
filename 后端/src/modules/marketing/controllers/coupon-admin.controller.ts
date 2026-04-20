/**
 * @file coupon-admin.controller.ts
 * @stage P4/T4.9 + T4.10（Sprint 2）
 * @desc 管理端优惠券接口：平台券模板 CRUD（issuerType=1）+ 批量发放
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/admin/coupons（main.ts setGlobalPrefix）
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 * 操作日志：create / update / delete / issue 必须 OperationLogService.write
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { CouponVo, CreateCouponDto, QueryCouponDto, UpdateCouponDto } from '../dto/coupon.dto'
import { IssueCouponDto, IssueResultVo } from '../dto/user-coupon.dto'
import { CouponService } from '../services/coupon.service'
import { UserCouponService } from '../services/user-coupon.service'

@ApiTags('营销 - 优惠券（管理端）')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('marketing:coupon')
@UserTypes('admin')
@Controller('admin/coupons')
export class CouponAdminController {
  constructor(
    private readonly couponService: CouponService,
    private readonly userCouponService: UserCouponService
  ) {}

  /**
   * 新建平台券（issuerType=1 / issuerId=null）
   */
  @Post()
  @ApiOperation({
    summary: '新建平台券',
    description: 'issuerType 固定为 1（平台），issuerId 固定为 null；写 OperationLog'
  })
  @ApiSwaggerResponse({ status: 200, type: CouponVo })
  create(@CurrentUser('uid') opAdminId: string, @Body() dto: CreateCouponDto): Promise<CouponVo> {
    return this.couponService.adminCreate(opAdminId, dto)
  }

  /**
   * 全量分页（按 issuerType / issuerId / status / coupon_type / scene / name 筛选）
   */
  @Get()
  @ApiOperation({
    summary: '券模板全量分页（按 issuerType/issuerId/status/coupon_type/scene 筛选）'
  })
  @ApiSwaggerResponse({ status: 200 })
  list(@Query() query: QueryCouponDto): Promise<PageResult<CouponVo>> {
    return this.couponService.adminList(query)
  }

  /**
   * 详情
   */
  @Get(':id')
  @ApiOperation({ summary: '券模板详情' })
  @ApiParam({ name: 'id', description: '券模板主键（雪花字符串）' })
  @ApiSwaggerResponse({ status: 200, type: CouponVo })
  detail(@Param('id') id: string): Promise<CouponVo> {
    return this.couponService.adminDetail(id)
  }

  /**
   * 编辑（同商户端规则；写 OperationLog）
   */
  @Put(':id')
  @ApiOperation({
    summary: '编辑券模板',
    description: '已发出的券仅允许改 name / description / imageUrl / status；写 OperationLog'
  })
  @ApiParam({ name: 'id', description: '券模板主键' })
  @ApiSwaggerResponse({ status: 200, type: CouponVo })
  update(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: UpdateCouponDto
  ): Promise<CouponVo> {
    return this.couponService.adminUpdate(id, opAdminId, dto)
  }

  /**
   * 软删（同商户端规则：必须先下架 + 未发出；写 OperationLog）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '软删除券模板',
    description: '前置：status=2 已下架 + receivedQty=0；写 OperationLog'
  })
  @ApiParam({ name: 'id', description: '券模板主键' })
  @ApiSwaggerResponse({ status: 200 })
  async remove(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string
  ): Promise<{ deleted: boolean }> {
    await this.couponService.adminDelete(id, opAdminId)
    return { deleted: true }
  }

  /**
   * 批量发放（按用户 ID 列表；写 user_coupon 批量 + 写 OperationLog）
   *
   * 并发安全：service 层在事务内 SELECT FOR UPDATE coupon → 校验余量与 per_user_limit
   *           → 批量 INSERT user_coupon → UPDATE coupon.received_qty
   */
  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '批量发放优惠券给用户列表',
    description:
      '入参 userIds + source（2 活动赠 / 3 邀请奖 / 4 客服补偿）；返回实发数 / 跳过用户列表'
  })
  @ApiParam({ name: 'id', description: '券模板主键' })
  @ApiSwaggerResponse({ status: 200, type: IssueResultVo })
  issue(
    @Param('id') couponId: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: IssueCouponDto
  ): Promise<IssueResultVo> {
    return this.userCouponService.adminIssue(couponId, dto.userIds, dto.source, opAdminId)
  }
}
