/**
 * @file user.controller.ts
 * @stage P3 / T3.9
 * @desc 用户中心 C 端接口：GET/PUT /me、POST /me/realname
 * @author 员工 B
 *
 * 鉴权：JwtAuthGuard + UserTypeGuard('user')
 */
import { Body, Controller, Get, Put, Post, UseGuards } from '@nestjs/common'
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
import { SubmitRealnameDto, UpdateMyProfileDto, UserDetailVo } from '../dto/user.dto'
import { UserService } from '../services/user.service'

@ApiTags('用户中心 - 个人信息')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 取当前用户个人信息
   * 参数：当前登录用户 ID（JWT）
   * 返回值：UserDetailVo
   */
  @Get()
  @ApiOperation({ summary: '获取当前用户个人信息（脱敏）' })
  @ApiSwaggerResponse({ status: 200, type: UserDetailVo })
  getProfile(@CurrentUser('uid') userId: string): Promise<UserDetailVo> {
    return this.userService.getMyProfile(userId)
  }

  /**
   * 更新当前用户资料
   * 参数：dto 局部更新字段
   * 返回值：UserDetailVo
   */
  @Put()
  @ApiOperation({ summary: '更新当前用户资料（昵称/头像/性别/生日）' })
  @ApiSwaggerResponse({ status: 200, type: UserDetailVo })
  updateProfile(
    @CurrentUser('uid') userId: string,
    @Body() dto: UpdateMyProfileDto
  ): Promise<UserDetailVo> {
    return this.userService.updateMyProfile(userId, dto)
  }

  /**
   * 提交实名认证
   * 参数：dto 真实姓名 + 身份证号
   * 返回值：UserDetailVo（is_realname=1）
   */
  @Post('realname')
  @ApiOperation({ summary: '提交实名认证（三方核身后写 enc/hash）' })
  @ApiSwaggerResponse({ status: 200, type: UserDetailVo })
  submitRealname(
    @CurrentUser('uid') userId: string,
    @Body() dto: SubmitRealnameDto
  ): Promise<UserDetailVo> {
    return this.userService.submitRealname(userId, dto)
  }
}
