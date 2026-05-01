/**
 * @file realtime.module.ts
 * @stage P9/Sprint 6 (W6.B.1)
 * @desc 实时推送模块（NestJS WebSocket Gateway）
 * @author Agent B (P9 Sprint 6)
 *
 * imports：
 *   - JwtModule（HS512 + JWT_SECRET，与 auth.module 配置一致）
 *
 * providers：
 *   - RealtimeGateway（连接钩子 + 订阅事件）
 *   - RealtimeService（业务模块注入推送方法）
 *   - WsJwtGuard（独立 WS JWT 守卫）
 *
 * exports：
 *   - RealtimeService（让 order/dispatch/payment 等模块注入并 push）
 *
 * NestJS WebSocket 文档：https://docs.nestjs.com/websockets/gateways
 */

import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { WsJwtGuard } from './guards/ws-jwt.guard'
import { RealtimeGateway } from './realtime.gateway'
import { RealtimeService } from './realtime.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          algorithm: 'HS512',
          expiresIn: config.get<number>('jwt.expiresIn') ?? 7200
        }
      })
    })
  ],
  providers: [RealtimeGateway, RealtimeService, WsJwtGuard],
  exports: [RealtimeService]
})
export class RealtimeModule {}
