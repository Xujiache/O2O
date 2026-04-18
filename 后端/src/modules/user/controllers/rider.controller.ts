/**
 * @file rider.controller.ts
 * @stage P3 / T3.11
 * @desc 骑手端 + 资质 + 保证金接口
 *       骑手端：POST /riders（注册公开）、GET/PUT /riders/me、资质 CRUD、保证金 CRUD
 *       审核动作在 admin.controller
 * @author 员工 B
 */
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { PageResult } from '../../../common'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { Public } from '../../auth/decorators/public.decorator'
import { UserTypes } from '../../auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '../../auth/guards/user-type.guard'
import {
  CreateRiderDto,
  RiderDepositOpDto,
  RiderDepositVo,
  RiderDetailVo,
  UpdateRiderDto
} from '../dto/rider.dto'
import {
  QualificationVo,
  SubmitQualificationBatchDto,
  SubmitQualificationDto
} from '../dto/merchant.dto'
import { QualificationService } from '../services/qualification.service'
import { RiderService } from '../services/rider.service'

@ApiTags('用户中心 - 骑手')
@ApiBearerAuth()
@Controller('riders')
export class RiderController {
  constructor(
    private readonly riderService: RiderService,
    private readonly qualificationService: QualificationService
  ) {}

  /**
   * 骑手注册申请（公开）
   */
  @Public()
  @Post()
  @ApiOperation({ summary: '骑手注册申请（公开；审核通过后由 Auth 模块开通登录）' })
  @ApiSwaggerResponse({ status: 200, type: RiderDetailVo })
  apply(@Body() dto: CreateRiderDto): Promise<RiderDetailVo> {
    return this.riderService.create(dto)
  }

  /**
   * 骑手取自身详情
   */
  @Get('me')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider')
  @ApiOperation({ summary: '骑手取自身详情' })
  @ApiSwaggerResponse({ status: 200, type: RiderDetailVo })
  detailMe(@CurrentUser('uid') riderId: string): Promise<RiderDetailVo> {
    return this.riderService.detail(riderId)
  }

  /**
   * 骑手详情（也允许管理员查看）
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider', 'admin')
  @ApiOperation({ summary: '取骑手详情' })
  @ApiSwaggerResponse({ status: 200, type: RiderDetailVo })
  detail(@Param('id') id: string): Promise<RiderDetailVo> {
    return this.riderService.detail(id)
  }

  /**
   * 骑手更新自己的资料
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider')
  @ApiOperation({ summary: '骑手更新资料（含银行卡 enc）' })
  @ApiSwaggerResponse({ status: 200, type: RiderDetailVo })
  update(@Param('id') id: string, @Body() dto: UpdateRiderDto): Promise<RiderDetailVo> {
    return this.riderService.update(id, dto)
  }

  /* ========== 资质 ========== */

  /**
   * 骑手提交单条资质
   */
  @Post(':id/qualifications')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider')
  @ApiOperation({ summary: '骑手提交单条资质' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo })
  submitQual(
    @Param('id') id: string,
    @Body() dto: SubmitQualificationDto
  ): Promise<QualificationVo> {
    return this.qualificationService.riderSubmit(id, dto)
  }

  /**
   * 骑手批量提交资质
   */
  @Post(':id/qualifications/batch')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider')
  @ApiOperation({ summary: '骑手批量提交资质' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo, isArray: true })
  submitQualBatch(
    @Param('id') id: string,
    @Body() dto: SubmitQualificationBatchDto
  ): Promise<QualificationVo[]> {
    return this.qualificationService.riderSubmitBatch(id, dto)
  }

  /**
   * 列出骑手全部资质
   */
  @Get(':id/qualifications')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider', 'admin')
  @ApiOperation({ summary: '列出骑手全部资质' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo, isArray: true })
  listQual(@Param('id') id: string): Promise<QualificationVo[]> {
    return this.qualificationService.riderListByRider(id)
  }

  /* ========== 保证金 ========== */

  /**
   * 骑手保证金操作（缴纳由骑手触发；扣除/退还由管理后台触发）
   * 参数：id 骑手 ID；dto；当前登录用户（admin 时记录 op_admin_id）
   */
  @Post(':id/deposit')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider', 'admin')
  @ApiOperation({ summary: '保证金操作（缴纳/补缴/扣除/退还）' })
  @ApiSwaggerResponse({ status: 200, type: RiderDepositVo })
  depositOp(
    @Param('id') id: string,
    @Body() dto: RiderDepositOpDto,
    @CurrentUser() user: { uid: string; userType: string }
  ): Promise<RiderDepositVo> {
    const opAdminId = user?.userType === 'admin' ? user.uid : null
    return this.riderService.depositOperate(id, dto, opAdminId)
  }

  /**
   * 列出骑手保证金明细（分页）
   */
  @Get(':id/deposit')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider', 'admin')
  @ApiOperation({ summary: '列出骑手保证金明细（分页）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  @ApiSwaggerResponse({ status: 200 })
  depositList(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number
  ): Promise<PageResult<RiderDepositVo>> {
    return this.riderService.depositList(id, page, pageSize)
  }

  /**
   * 取骑手当前保证金余额
   */
  @Get(':id/deposit/balance')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('rider', 'admin')
  @ApiOperation({ summary: '取骑手当前保证金余额' })
  @ApiSwaggerResponse({ status: 200 })
  depositBalance(@Param('id') id: string): Promise<{ balance: string }> {
    return this.riderService.getBalance(id)
  }
}
