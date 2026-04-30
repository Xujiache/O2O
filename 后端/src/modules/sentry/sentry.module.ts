/**
 * @file sentry.module.ts
 * @stage P9/W2.C.1 (Sprint 2)
 * @desc Sentry 全局模块 — 暴露 SentryService 给所有业务模块，并注册全局 SentryInterceptor。
 *
 * @author Agent C (P9 Sprint 2)
 */
import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { SentryService } from './sentry.service'
import { SentryInterceptor } from './sentry.interceptor'

/**
 * Sentry 全局模块
 * 功能：注册 SentryService 为全局可注入服务，并注册 SentryInterceptor 为应用级拦截器
 * 用途：在 AppModule.imports 顶部追加 SentryModule（紧跟 ConfigModule）
 */
@Global()
@Module({
  providers: [SentryService, { provide: APP_INTERCEPTOR, useClass: SentryInterceptor }],
  exports: [SentryService]
})
export class SentryModule {}
