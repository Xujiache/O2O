/**
 * @file public.decorator.ts
 * @stage P3
 * @desc `@Public()` 标记接口为公开，全局 JwtAuthGuard 跳过校验
 * @stub-by 员工 B（员工 A T3.4 接管 JwtAuthGuard 时直接复用本 metadata key）
 */
import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/**
 * `@Public()` 装饰器
 * 用途：登录接口、健康检查、Swagger 文档等无需鉴权的接口
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true)
