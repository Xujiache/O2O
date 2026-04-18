import { Module } from '@nestjs/common'

/**
 * 认证授权模块（占位）
 * 功能：对齐 PRD §3.5.1 统一认证授权服务，提供多端用户认证、OAuth2.0、token 管理、接口鉴权
 * 参数：无
 * 返回值：AuthModule
 * 用途：P3 阶段扩展具体 Controller/Service/Guard/Strategy；P1 仅注册空模块
 */
@Module({})
export class AuthModule {}
