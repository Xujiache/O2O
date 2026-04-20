/**
 * @file product-admin.controller.ts
 * @stage P4/T4.5 + T4.7（Sprint 1）
 * @desc 管理端商品接口
 * @author 单 Agent V2.0
 *
 * 路由：
 *   - GET  /admin/products                  全量分页（按 shopId/auditStatus/keyword）
 *   - POST /admin/products/:id/force-off    强制下架（写 OperationLog + status=0 + audit_remark）
 *
 * 鉴权：类级 @UseGuards(JwtAuthGuard, UserTypeGuard) + @UserTypes('admin')
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { PageResult } from '@/common'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AdminQueryProductDto, ForceOffDto, ProductVo } from '../dto/product.dto'
import { ProductService } from '../services/product.service'

@ApiTags('管理后台 - 商品')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('product:manage')
@UserTypes('admin')
export class AdminProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * 管理端：全量分页（按 shopId/auditStatus/keyword）
   */
  @Get()
  @ApiOperation({ summary: '管理后台 - 商品全量分页（按 shopId/auditStatus/status/keyword）' })
  @ApiSwaggerResponse({ status: 200 })
  list(@Query() query: AdminQueryProductDto): Promise<PageResult<ProductVo>> {
    return this.productService.adminList(query)
  }

  /**
   * 管理端：强制下架（status=0 + audit_remark + 写 OperationLog）
   */
  @Post(':id/force-off')
  @ApiOperation({
    summary: '管理后台 - 强制下架商品（status=0 + audit_remark；写 OperationLog）'
  })
  @ApiSwaggerResponse({ status: 200, type: ProductVo })
  forceOff(
    @Param('id') id: string,
    @Body() dto: ForceOffDto,
    @CurrentUser('uid') opAdminId: string
  ): Promise<ProductVo> {
    return this.productService.adminForceOff(id, dto, opAdminId)
  }
}
