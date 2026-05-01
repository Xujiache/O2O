/**
 * @file auth.controller.ts
 * @stage P3/T3.5 ~ T3.7
 * @desc 9 个 Auth HTTP 接口（DESIGN_P3 §2.1）
 *       wx-mp/login / mobile/bind / sms/send /
 *       merchant/login / merchant/sms-login / rider/login / admin/login /
 *       refresh / logout
 * @author 员工 A
 *
 * 路由前缀：/api/v1/auth/*（全局前缀 + Versioning(URI v1) + 本 controller path）
 * 权限：
 *   - 7 个登录类接口（含 sms/send）→ @Public()（不需要 token）
 *   - logout → 需要 token（默认走全局 JwtAuthGuard）
 *   - mobile/bind → 需要 token（绑定的是当前 uid）
 */

import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator'
import { Public } from './decorators/public.decorator'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import {
  AdminLoginDto,
  AdminLoginResponseVo,
  BindMobileDto,
  LogoutResponseVo,
  MerchantLoginDto,
  MerchantLoginResponseVo,
  MerchantSmsLoginDto,
  RefreshDto,
  RiderLoginDto,
  RiderLoginResponseVo,
  SmsSendDto,
  SmsSendResponseVo,
  TokenPairVo,
  WxMpLoginDto,
  WxMpLoginResponseVo
} from './dto/auth.dto'

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 1) 小程序登录：code → openId → 找/建用户 → 返回 access/refresh token
   */
  @Public()
  @Post('wx-mp/login')
  @ApiOperation({ summary: '小程序登录（code → token）' })
  @ApiBody({ type: WxMpLoginDto })
  @ApiResponse({ status: 200, type: WxMpLoginResponseVo, description: '登录成功' })
  @ApiResponse({ status: 200, description: '微信接口异常 / openId 缺失' })
  async wxMpLogin(@Body() dto: WxMpLoginDto): Promise<WxMpLoginResponseVo> {
    return this.authService.wxMpLogin(dto.code)
  }

  /**
   * 2) 用户绑定手机号（需登录态）
   */
  @Post('mobile/bind')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '当前用户绑定手机号（小程序登录后追加绑定）' })
  @ApiBody({ type: BindMobileDto })
  @ApiResponse({ status: 200, description: '绑定成功 { ok: true }' })
  async bindMobile(
    @CurrentUser() user: AuthUser,
    @Body() dto: BindMobileDto
  ): Promise<{ ok: true }> {
    return this.authService.bindMobile(user.uid, dto.mobile, dto.smsCode)
  }

  /**
   * 3) 短信验证码发送（带 60s 频控）
   */
  @Public()
  @Post('sms/send')
  @ApiOperation({ summary: '发送短信验证码（dev 环境会回传 mock code）' })
  @ApiBody({ type: SmsSendDto })
  @ApiResponse({ status: 200, type: SmsSendResponseVo })
  async smsSend(@Body() dto: SmsSendDto): Promise<SmsSendResponseVo> {
    return this.authService.sendSms(dto.mobile, dto.scene)
  }

  /**
   * 4) 商户密码登录（mobile + password；走子账号表）
   */
  @Public()
  @Post('merchant/login')
  @ApiOperation({ summary: '商户子账号密码登录' })
  @ApiBody({ type: MerchantLoginDto })
  @ApiResponse({ status: 200, type: MerchantLoginResponseVo })
  async merchantLogin(@Body() dto: MerchantLoginDto): Promise<MerchantLoginResponseVo> {
    return this.authService.merchantLogin(dto.mobile, dto.password)
  }

  /**
   * 5) 商户短信登录（mobile + smsCode；走主账号表）
   */
  @Public()
  @Post('merchant/sms-login')
  @ApiOperation({ summary: '商户主账号短信登录' })
  @ApiBody({ type: MerchantSmsLoginDto })
  @ApiResponse({ status: 200, type: MerchantLoginResponseVo })
  async merchantSmsLogin(@Body() dto: MerchantSmsLoginDto): Promise<MerchantLoginResponseVo> {
    return this.authService.merchantSmsLogin(dto.mobile, dto.smsCode)
  }

  /**
   * 6) 骑手短信登录（rider 表无 password 列，强制 SMS）
   */
  @Public()
  @Post('rider/login')
  @ApiOperation({ summary: '骑手短信登录' })
  @ApiBody({ type: RiderLoginDto })
  @ApiResponse({ status: 200, type: RiderLoginResponseVo })
  async riderLogin(@Body() dto: RiderLoginDto): Promise<RiderLoginResponseVo> {
    return this.authService.riderLogin(dto.mobile, dto.smsCode)
  }

  /**
   * 7) 管理员账密登录（返回菜单 + 权限码）
   */
  @Public()
  @Post('admin/login')
  @ApiOperation({ summary: '管理员账密登录（返回菜单树 + 权限码集合）' })
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({ status: 200, type: AdminLoginResponseVo })
  async adminLogin(@Body() dto: AdminLoginDto): Promise<AdminLoginResponseVo> {
    return this.authService.adminLogin(dto.username, dto.password, dto.captcha, dto.passwordCipher)
  }

  /**
   * 8) 刷新 token
   */
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '刷新 access token（refresh token 滑动续期）' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 200, type: TokenPairVo })
  async refresh(@Body() dto: RefreshDto): Promise<TokenPairVo> {
    return this.authService.refreshTokenPair(dto.uid, dto.userType, dto.refreshToken)
  }

  /**
   * 9) 登出（INCR token ver 让所有历史 token 立即失效）
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '登出（吊销当前及所有历史 token）' })
  @ApiResponse({ status: 200, type: LogoutResponseVo })
  async logout(@CurrentUser() user: AuthUser): Promise<LogoutResponseVo> {
    return this.authService.logout(user.uid, user.userType)
  }
}
