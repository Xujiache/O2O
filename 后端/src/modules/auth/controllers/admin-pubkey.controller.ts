/**
 * @file admin-pubkey.controller.ts
 * @stage P9 / W5.C.1 (Sprint 5) — 管理后台 RSA 公钥下发
 * @desc 单接口：GET /api/v1/admin/pubkey
 *         返回 { pubkey: pem, ttl: 86400 }
 *         前端登录页缓存到 sessionStorage（TTL 同 server）后用于 RSA-OAEP/SHA-256
 *         加密 password 字段。
 *
 * 安全 / 设计：
 *   - 公钥本身不敏感（仅用于客户端单向加密），@Public() 跳过 JwtAuthGuard
 *   - TTL 暴露给前端，便于客户端做被动失效（避免后端 rotate 后老 key 还在用）
 *   - 不记录访问日志噪声（高频）；rate-limit 由全局 ThrottlerGuard 兜底
 *
 * @author Agent C (P9 Sprint 5)
 */

import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '../decorators/public.decorator'
import { RsaKeyService } from '../services/rsa-key.service'

/** 出参 VO */
export class AdminPubkeyVo {
  /** spki 格式 PEM 公钥（含 BEGIN/END 头） */
  pubkey!: string
  /** 服务端 TTL 秒（前端缓存用） */
  ttl!: number
}

@ApiTags('AdminAuth')
@Controller({ path: 'admin/pubkey', version: '1' })
export class AdminPubkeyController {
  constructor(private readonly rsaKeyService: RsaKeyService) {}

  /**
   * GET /api/v1/admin/pubkey
   * 用途：管理后台登录页前端拉取 RSA 公钥
   */
  @Public()
  @Get()
  @ApiOperation({ summary: '获取管理后台登录用 RSA 公钥（PEM）' })
  @ApiResponse({ status: 200, type: AdminPubkeyVo })
  async getPubkey(): Promise<AdminPubkeyVo> {
    const pubkey = await this.rsaKeyService.getPublicKeyPem()
    return { pubkey, ttl: 24 * 3600 }
  }
}
