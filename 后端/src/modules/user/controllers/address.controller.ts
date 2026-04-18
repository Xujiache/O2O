/**
 * @file address.controller.ts
 * @stage P3 / T3.9
 * @desc 用户收货地址 CRUD：GET/POST/PUT/DELETE /me/addresses；PUT /:id/default
 * @author 员工 B
 *
 * 鉴权：JwtAuthGuard + UserTypeGuard('user')
 */
import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { UserTypes } from '../../auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '../../auth/guards/user-type.guard'
import { AddressVo, CreateAddressDto, UpdateAddressDto } from '../dto/address.dto'
import { AddressService } from '../services/address.service'

@ApiTags('用户中心 - 收货地址')
@ApiBearerAuth()
@Controller('me/addresses')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  /**
   * 列出当前用户全部地址
   * 返回值：AddressVo[]
   */
  @Get()
  @ApiOperation({ summary: '获取当前用户全部收货地址' })
  @ApiSwaggerResponse({ status: 200, type: AddressVo, isArray: true })
  list(@CurrentUser('uid') userId: string): Promise<AddressVo[]> {
    return this.addressService.list(userId)
  }

  /**
   * 取单条地址详情
   * 参数：id 地址 ID
   * 返回值：AddressVo
   */
  @Get(':id')
  @ApiOperation({ summary: '获取单条地址详情' })
  @ApiSwaggerResponse({ status: 200, type: AddressVo })
  detail(@CurrentUser('uid') userId: string, @Param('id') id: string): Promise<AddressVo> {
    return this.addressService.detail(userId, id)
  }

  /**
   * 新增地址
   * 参数：dto
   * 返回值：AddressVo
   */
  @Post()
  @ApiOperation({ summary: '新增收货地址（手机号自动 enc/hash/tail4）' })
  @ApiSwaggerResponse({ status: 200, type: AddressVo })
  create(@CurrentUser('uid') userId: string, @Body() dto: CreateAddressDto): Promise<AddressVo> {
    return this.addressService.create(userId, dto)
  }

  /**
   * 更新地址
   * 参数：id / dto
   * 返回值：AddressVo
   */
  @Put(':id')
  @ApiOperation({ summary: '更新地址（任意字段可选）' })
  @ApiSwaggerResponse({ status: 200, type: AddressVo })
  update(
    @CurrentUser('uid') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto
  ): Promise<AddressVo> {
    return this.addressService.update(userId, id, dto)
  }

  /**
   * 软删地址
   * 参数：id
   * 返回值：{ ok: true }
   */
  @Delete(':id')
  @ApiOperation({ summary: '软删地址；若被删的是默认，自动选最近一条置为默认' })
  remove(@CurrentUser('uid') userId: string, @Param('id') id: string): Promise<{ ok: true }> {
    return this.addressService.remove(userId, id)
  }

  /**
   * 切换默认地址
   * 参数：id
   * 返回值：AddressVo
   */
  @Put(':id/default')
  @ApiOperation({ summary: '切换默认地址（同用户最多 1 条 is_default=1）' })
  @ApiSwaggerResponse({ status: 200, type: AddressVo })
  setDefault(@CurrentUser('uid') userId: string, @Param('id') id: string): Promise<AddressVo> {
    return this.addressService.setDefault(userId, id)
  }
}
