/**
 * @file auth.dto.ts
 * @stage P3/T3.4 ~ T3.7
 * @desc 9 个 Auth 接口入参 / 出参 DTO（对齐 DESIGN_P3 §2.1）
 * @author 员工 A
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator'

/* ============================================================
 * 1) 微信小程序登录
 * ============================================================ */

export class WxMpLoginDto {
  @ApiProperty({ description: '小程序 wx.login() 拿到的 code', example: '0a1b2c3d...' })
  @IsString()
  @Length(8, 256)
  code!: string

  @ApiPropertyOptional({ description: '客户端解密包（后续手机号加解密；本期可选）' })
  @IsOptional()
  @IsString()
  encryptedData?: string

  @ApiPropertyOptional({ description: '加解密 iv（与 encryptedData 配套）' })
  @IsOptional()
  @IsString()
  iv?: string
}

export class WxMpLoginUserVo {
  @ApiProperty() id!: string
  @ApiProperty({ nullable: true }) nickname!: string | null
  @ApiProperty({ nullable: true }) avatarUrl!: string | null
  @ApiProperty({ nullable: true, description: '手机号末 4 位（脱敏；首次登录可为 null）' })
  mobileTail4!: string | null
}

export class TokenPairVo {
  @ApiProperty({ description: 'JWT access token' }) accessToken!: string
  @ApiProperty({ description: 'Refresh token（UUID）' }) refreshToken!: string
  @ApiProperty({ description: 'access token 过期秒数（默认 7200）' }) expiresIn!: number
}

export class WxMpLoginResponseVo {
  @ApiProperty({ type: TokenPairVo }) tokens!: TokenPairVo
  @ApiProperty({ type: WxMpLoginUserVo }) user!: WxMpLoginUserVo
}

/* ============================================================
 * 2) 用户绑定手机号
 * ============================================================ */

export class BindMobileDto {
  @ApiProperty({ description: '手机号（11 位）', example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不合法' })
  mobile!: string

  @ApiProperty({ description: '6 位短信验证码', example: '123456' })
  @IsString()
  @Length(4, 8)
  smsCode!: string
}

/* ============================================================
 * 3) 短信验证码发送
 * ============================================================ */

export class SmsSendDto {
  @ApiProperty({ description: '手机号（11 位）', example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不合法' })
  mobile!: string

  @ApiProperty({
    description: '场景：login/bind/register/reset',
    enum: ['login', 'bind', 'register', 'reset'],
    example: 'login'
  })
  @IsEnum(['login', 'bind', 'register', 'reset'])
  scene!: 'login' | 'bind' | 'register' | 'reset'
}

export class SmsSendResponseVo {
  @ApiProperty({ description: '是否发送成功', example: true }) ok!: boolean
  @ApiProperty({ description: '验证码有效期（秒）', example: 300 }) ttl!: number
  @ApiPropertyOptional({ description: '【仅 dev】mock 验证码（生产为 undefined）' })
  mock?: string
}

/* ============================================================
 * 4) 商户登录（密码 / 短信）
 * ============================================================ */

export class MerchantLoginDto {
  @ApiProperty({ description: '联系手机号', example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不合法' })
  mobile!: string

  @ApiProperty({ description: '密码', example: 'Pwd@2026', minLength: 6, maxLength: 64 })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string
}

export class MerchantSmsLoginDto {
  @ApiProperty({ description: '联系手机号' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  mobile!: string

  @ApiProperty({ description: '6 位短信验证码' })
  @IsString()
  @Length(4, 8)
  smsCode!: string
}

export class MerchantStaffVo {
  @ApiProperty() id!: string
  @ApiProperty() username!: string
  @ApiProperty({ nullable: true }) name!: string | null
  @ApiProperty() roleCode!: string
  @ApiProperty({ nullable: true }) mobileTail4!: string | null
}

export class MerchantLoginVo {
  @ApiProperty() id!: string
  @ApiProperty() merchantNo!: string
  @ApiProperty() name!: string
  @ApiProperty({ nullable: true }) shortName!: string | null
  @ApiProperty({ nullable: true }) logoUrl!: string | null
  @ApiProperty() industryCode!: string
  @ApiProperty() mobileTail4!: string
  @ApiProperty({ description: '0 待审 / 1 通过 / 2 驳回 / 3 待补件' }) auditStatus!: number
  @ApiProperty({ description: '0 封禁 / 1 正常 / 2 暂停营业' }) status!: number
  @ApiProperty({ type: MerchantStaffVo, nullable: true }) staff!: MerchantStaffVo | null
}

export class MerchantLoginResponseVo {
  @ApiProperty({ type: TokenPairVo }) tokens!: TokenPairVo
  @ApiProperty({ type: MerchantLoginVo }) merchant!: MerchantLoginVo
}

/* ============================================================
 * 5) 骑手登录（短信）
 * ============================================================ */

export class RiderLoginDto {
  @ApiProperty({ description: '骑手手机号' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  mobile!: string

  @ApiProperty({ description: '6 位短信验证码' })
  @IsString()
  @Length(4, 8)
  smsCode!: string
}

export class RiderLoginVo {
  @ApiProperty() id!: string
  @ApiProperty() riderNo!: string
  @ApiProperty({ nullable: true }) nameTail!: string | null
  @ApiProperty() mobileTail4!: string
  @ApiProperty() level!: number
  @ApiProperty({ description: '0~5.00（DECIMAL 字符串）' }) score!: string
  @ApiProperty() serviceCity!: string
  @ApiProperty({ description: '0 封禁 / 1 正常 / 2 离职' }) status!: number
  @ApiProperty({ description: '0 离线 / 1 在线 / 2 忙碌' }) onlineStatus!: number
}

export class RiderLoginResponseVo {
  @ApiProperty({ type: TokenPairVo }) tokens!: TokenPairVo
  @ApiProperty({ type: RiderLoginVo }) rider!: RiderLoginVo
}

/* ============================================================
 * 6) 管理员登录
 * ============================================================ */

export class AdminLoginDto {
  @ApiProperty({ description: '用户名（admin.username）', example: 'admin' })
  @IsString()
  @Length(2, 64)
  username!: string

  @ApiProperty({ description: '密码', example: 'Pwd@2026' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string

  @ApiPropertyOptional({ description: '图形验证码（本期未强制；P9 启用）' })
  @IsOptional()
  @IsString()
  captcha?: string
}

export class MenuNodeVo {
  @ApiProperty() id!: string
  @ApiProperty() parentId!: string
  @ApiProperty() code!: string
  @ApiProperty() name!: string
  @ApiProperty({ nullable: true }) icon!: string | null
  @ApiProperty() sort!: number
  @ApiProperty({ type: () => [MenuNodeVo] }) children!: MenuNodeVo[]
}

export class AdminLoginVo {
  @ApiProperty() id!: string
  @ApiProperty() username!: string
  @ApiProperty({ nullable: true }) nickname!: string | null
  @ApiProperty({ nullable: true }) avatarUrl!: string | null
  @ApiProperty({ nullable: true }) mobileTail4!: string | null
  @ApiProperty({ nullable: true }) email!: string | null
  @ApiProperty({ description: '是否超管' }) isSuper!: boolean
}

export class AdminLoginResponseVo {
  @ApiProperty({ type: TokenPairVo }) tokens!: TokenPairVo
  @ApiProperty({ type: AdminLoginVo }) admin!: AdminLoginVo
  @ApiProperty({ type: () => [MenuNodeVo], description: '当前管理员可见菜单树' })
  menus!: MenuNodeVo[]
  @ApiProperty({ description: '权限码集合（resource_code）', type: [String] })
  permissions!: string[]
}

/* ============================================================
 * 7) 通用 refresh / logout
 * ============================================================ */

export class RefreshDto {
  @ApiProperty({ description: '雪花 ID 字符串' })
  @IsString()
  uid!: string

  @ApiProperty({ description: '端类型', enum: ['user', 'merchant', 'rider', 'admin'] })
  @IsEnum(['user', 'merchant', 'rider', 'admin'])
  userType!: 'user' | 'merchant' | 'rider' | 'admin'

  @ApiProperty({ description: 'Refresh token（UUID）' })
  @IsString()
  refreshToken!: string
}

export class LogoutResponseVo {
  @ApiProperty({ example: true }) ok!: boolean
}
