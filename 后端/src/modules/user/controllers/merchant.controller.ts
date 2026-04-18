/**
 * @file merchant.controller.ts
 * @stage P3 / T3.10
 * @desc 商户端 + 资质提交接口
 *       商户端：POST /merchants（入驻）/ GET, PUT /merchants/:id / 资质 CRUD
 *       管理后台审核：在 admin.controller 内（POST /admin/merchants/:id/audit）
 * @author 员工 B
 */
import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { Public } from '../../auth/decorators/public.decorator'
import { UserTypes } from '../../auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '../../auth/guards/user-type.guard'
import {
  CreateMerchantDto,
  MerchantDetailVo,
  QualificationVo,
  SubmitQualificationBatchDto,
  SubmitQualificationDto,
  UpdateMerchantDto
} from '../dto/merchant.dto'
import { MerchantService } from '../services/merchant.service'
import { QualificationService } from '../services/qualification.service'

@ApiTags('用户中心 - 商户')
@ApiBearerAuth()
@Controller('merchants')
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly qualificationService: QualificationService
  ) {}

  /**
   * 商户入驻申请（公开，由 A 的 Auth 模块在审核通过后开通登录账号）
   * 参数：dto
   * 返回值：MerchantDetailVo（audit_status=0）
   */
  @Public()
  @Post()
  @ApiOperation({ summary: '商户入驻申请（写 audit_status=0）' })
  @ApiSwaggerResponse({ status: 200, type: MerchantDetailVo })
  apply(@Body() dto: CreateMerchantDto): Promise<MerchantDetailVo> {
    return this.merchantService.create(dto)
  }

  /**
   * 商户取自身详情
   * 参数：merchantId（来自 JWT）
   * 返回值：MerchantDetailVo
   */
  @Get('me')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant')
  @ApiOperation({ summary: '商户取自身详情' })
  @ApiSwaggerResponse({ status: 200, type: MerchantDetailVo })
  detailMe(@CurrentUser('uid') merchantId: string): Promise<MerchantDetailVo> {
    return this.merchantService.detail(merchantId)
  }

  /**
   * 商户取详情（用户端公开查看店铺归属信息时也走此口；本期默认要求 merchant 登录）
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant', 'admin')
  @ApiOperation({ summary: '取商户详情' })
  @ApiSwaggerResponse({ status: 200, type: MerchantDetailVo })
  detail(@Param('id') id: string): Promise<MerchantDetailVo> {
    return this.merchantService.detail(id)
  }

  /**
   * 商户更新资料
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant')
  @ApiOperation({ summary: '商户更新资料' })
  @ApiSwaggerResponse({ status: 200, type: MerchantDetailVo })
  update(@Param('id') id: string, @Body() dto: UpdateMerchantDto): Promise<MerchantDetailVo> {
    return this.merchantService.update(id, dto)
  }

  /* ========== 资质 CRUD ========== */

  /**
   * 商户提交单条资质
   */
  @Post(':id/qualifications')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant')
  @ApiOperation({ summary: '商户提交单条资质（写 audit_status=0）' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo })
  submitQual(
    @Param('id') id: string,
    @Body() dto: SubmitQualificationDto
  ): Promise<QualificationVo> {
    return this.qualificationService.merchantSubmit(id, dto)
  }

  /**
   * 商户批量提交资质
   */
  @Post(':id/qualifications/batch')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant')
  @ApiOperation({ summary: '商户批量提交资质' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo, isArray: true })
  submitQualBatch(
    @Param('id') id: string,
    @Body() dto: SubmitQualificationBatchDto
  ): Promise<QualificationVo[]> {
    return this.qualificationService.merchantSubmitBatch(id, dto)
  }

  /**
   * 列出商户全部资质
   */
  @Get(':id/qualifications')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('merchant', 'admin')
  @ApiOperation({ summary: '列出商户全部资质' })
  @ApiSwaggerResponse({ status: 200, type: QualificationVo, isArray: true })
  listQual(@Param('id') id: string): Promise<QualificationVo[]> {
    return this.qualificationService.merchantListByMerchant(id)
  }
}
