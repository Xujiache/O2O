/**
 * @file wx-mp.strategy.ts
 * @stage P3/T3.5
 * @desc 微信小程序登录策略包装：把 jscode2session 调用封装为 PassportStrategy，
 *       便于未来 controller 直接 `@UseGuards(AuthGuard('wx-mp'))` 风格切换；
 *       本期主流程通过 AuthService.wxMpLogin() 直接调用，不强依赖本 strategy。
 * @author 员工 A
 *
 * 实现备注：
 *   - passport-custom 的 Strategy 接口足够轻量，但 P1 未装 passport-custom；
 *     为零新增依赖，本类做成轻量 Strategy（NOT 注册 passport global），
 *     仅暴露 validate() 给 AuthService 复用 / 单元测试 mock；
 *   - DESIGN §一 要求 strategies/wx-mp.strategy.ts 文件存在，本文件即为承载。
 */

import { Injectable } from '@nestjs/common'
import { AuthService } from '../auth.service'

/**
 * 微信小程序登录入参
 */
export interface WxMpLoginInput {
  code: string
  /** 可选：客户端解密后的 encryptedData / iv（PRD 提到，但本期不强校验） */
  encryptedData?: string
  iv?: string
}

@Injectable()
export class WxMpStrategy {
  constructor(private readonly authService: AuthService) {}

  /**
   * 校验入参 → 调 AuthService.wxMpLogin
   * 参数：input
   * 返回值：与 AuthService.wxMpLogin 同
   * 用途：Controller 单元测试可注入 WxMpStrategy 而非 AuthService
   */
  async validate(input: WxMpLoginInput): Promise<Awaited<ReturnType<AuthService['wxMpLogin']>>> {
    return this.authService.wxMpLogin(input.code)
  }
}
