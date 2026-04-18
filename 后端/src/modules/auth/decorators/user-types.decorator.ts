/**
 * @file user-types.decorator.ts
 * @stage P3
 * @desc `@UserTypes('user'|'merchant'|'rider'|'admin')` 限定接口可访问的端类型
 * @stub-by 员工 B（员工 A T3.4 实现 UserTypeGuard 时直接复用 metadata key）
 */
import { SetMetadata } from '@nestjs/common'

export const USER_TYPES_KEY = 'userTypes'

/** 端类型枚举字面量 */
export type UserType = 'user' | 'merchant' | 'rider' | 'admin'

/**
 * `@UserTypes(...types)` 装饰器
 * 参数：types 1~N 个端类型字面量
 * 返回值：装饰器
 * 用途：与 UserTypeGuard 配合，校验 JWT 中 `userType` 是否在白名单内
 */
export const UserTypes = (...types: UserType[]): MethodDecorator & ClassDecorator =>
  SetMetadata(USER_TYPES_KEY, types)
