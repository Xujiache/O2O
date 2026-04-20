/**
 * @file sys-config.module.ts
 * @stage R1/T-R1-10
 * @desc 系统运行时配置模块（sys_config 表 + Redis 缓存层）
 *
 * @Global() 标记：全局可注入 SysConfigService
 */
import { Global, Module } from '@nestjs/common'
import { SysConfigService } from './sys-config.service'

@Global()
@Module({
  providers: [SysConfigService],
  exports: [SysConfigService]
})
export class SysConfigModule {}
