/**
 * @file push-token.entity.ts
 * @stage P9 Sprint 5 / W5.E.3
 * @desc TypeORM Entity：push_token —— 三端推送 token 注册（对齐 16_push_token.sql）
 * @author Agent E (P9 Sprint 5)
 *
 * 用途：
 *   1) 用户端 / 商户端 / 骑手端登录后调 POST /api/v1/push/register 落库
 *   2) NotificationService 推送时按 user_id + user_type 取活跃 registration_id 投递极光
 *   3) 心跳更新 last_active_at；30 天不活跃软删（is_deleted=2）
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * user_type 取值
 */
export const PushTokenUserTypeEnum = {
  USER: 1,
  MERCHANT: 2,
  RIDER: 3
} as const

/** user_type 字面量联合 */
export type PushTokenUserType = (typeof PushTokenUserTypeEnum)[keyof typeof PushTokenUserTypeEnum]

/**
 * platform 取值
 */
export type PushTokenPlatform = 'ios' | 'android' | 'mp'

/**
 * is_deleted 取值
 */
export const PushTokenDeletedEnum = {
  ACTIVE: 0,
  UNREGISTERED: 1,
  CLEANED_INACTIVE: 2
} as const

@Entity({ name: 'push_token' })
@Index('idx_registration', ['registrationId'])
@Index('idx_last_active', ['lastActiveAt'])
export class PushToken {
  @PrimaryColumn({
    name: 'id',
    type: 'bigint',
    comment: '主键（雪花字符串数值）'
  })
  id!: string

  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 64,
    comment: '用户/商户/骑手 ID'
  })
  userId!: string

  @Column({
    name: 'user_type',
    type: 'tinyint',
    comment: '1 user / 2 merchant / 3 rider'
  })
  userType!: number

  @Column({
    name: 'platform',
    type: 'varchar',
    length: 16,
    comment: 'ios | android | mp'
  })
  platform!: string

  @Column({
    name: 'registration_id',
    type: 'varchar',
    length: 128,
    comment: '极光 registrationId / 小程序 openId 衍生 token'
  })
  registrationId!: string

  @Column({
    name: 'device_id',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '设备唯一标识'
  })
  deviceId!: string | null

  @Column({
    name: 'app_version',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '客户端版本号'
  })
  appVersion!: string | null

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '创建时间'
  })
  createdAt!: Date

  @Column({
    name: 'last_active_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '最近活跃时间（心跳更新）'
  })
  lastActiveAt!: Date

  @Column({
    name: 'is_deleted',
    type: 'tinyint',
    default: 0,
    comment: '0 有效 / 1 已注销 / 2 不活跃清理'
  })
  isDeleted!: number
}
