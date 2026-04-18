/**
 * @file entities/index.ts
 * @stage P3/T3.3
 * @desc D1 账号域 14 + D10 系统域共享 Entity 桶形（barrel）出口
 * @author 员工 A（D1 14 个）+ 员工 C（D10 file_meta）+ 组长协调（聚合）
 *
 * D1 账号域 14 张表（顺序对齐 P2 01_account.sql）：
 *   1) user / 2) user_address / 3) merchant / 4) merchant_qualification /
 *   5) merchant_staff / 6) rider / 7) rider_qualification / 8) rider_deposit /
 *   9) admin / 10) role / 11) permission / 12) admin_role /
 *   13) role_permission / 14) blacklist
 *
 * D10 系统域共享：
 *   file_meta（员工 C 的 file 模块依赖；其他系统表后续阶段补齐）
 */

export { BaseEntity } from './base.entity'

// ===== D1 账号域 14 个 =====
export { User } from './user.entity'
export { UserAddress } from './user-address.entity'
export { Merchant } from './merchant.entity'
export { MerchantQualification } from './merchant-qualification.entity'
export { MerchantStaff } from './merchant-staff.entity'
export { Rider } from './rider.entity'
export { RiderQualification } from './rider-qualification.entity'
export { RiderDeposit } from './rider-deposit.entity'
export { Admin } from './admin.entity'
export { Role } from './role.entity'
export { Permission } from './permission.entity'
export { AdminRole } from './admin-role.entity'
export { RolePermission } from './role-permission.entity'
export { Blacklist } from './blacklist.entity'

// ===== D10 系统域共享 =====
export { FileMeta } from './system/file-meta.entity'
// 员工 B 增量：操作日志（admin/blacklist 服务依赖）
export { OperationLog } from './system/operation-log.entity'

// ===== D9 消息域 4 张表（员工 B / T3.13 增量） =====
export { MessageTemplate } from './message/message-template.entity'
export { MessageInbox } from './message/message-inbox.entity'
export { PushRecord } from './message/push-record.entity'
export { Notice } from './message/notice.entity'

import { User } from './user.entity'
import { UserAddress } from './user-address.entity'
import { Merchant } from './merchant.entity'
import { MerchantQualification } from './merchant-qualification.entity'
import { MerchantStaff } from './merchant-staff.entity'
import { Rider } from './rider.entity'
import { RiderQualification } from './rider-qualification.entity'
import { RiderDeposit } from './rider-deposit.entity'
import { Admin } from './admin.entity'
import { Role } from './role.entity'
import { Permission } from './permission.entity'
import { AdminRole } from './admin-role.entity'
import { RolePermission } from './role-permission.entity'
import { Blacklist } from './blacklist.entity'
import { FileMeta } from './system/file-meta.entity'
import { OperationLog } from './system/operation-log.entity'
import { MessageTemplate } from './message/message-template.entity'
import { MessageInbox } from './message/message-inbox.entity'
import { PushRecord } from './message/push-record.entity'
import { Notice } from './message/notice.entity'

/**
 * D1 账号域 14 实体清单（数组形式）
 * 用途：DatabaseModule 注册 entities 全集；TypeOrmModule.forFeature 子模块按需选择
 */
export const D1_ENTITIES = [
  User,
  UserAddress,
  Merchant,
  MerchantQualification,
  MerchantStaff,
  Rider,
  RiderQualification,
  RiderDeposit,
  Admin,
  Role,
  Permission,
  AdminRole,
  RolePermission,
  Blacklist
] as const

/**
 * D10 系统域已落地实体清单
 * 用途：DatabaseModule 在 entities 中追加 ...D10_SYSTEM_ENTITIES
 */
export const D10_SYSTEM_ENTITIES = [FileMeta, OperationLog] as const

/**
 * D9 消息域 4 实体（员工 B / T3.13 增量）
 * 用途：DatabaseModule 注册；MessageModule TypeOrmModule.forFeature 依赖
 */
export const D9_MESSAGE_ENTITIES = [MessageTemplate, MessageInbox, PushRecord, Notice] as const

/** 全部已落地实体（DatabaseModule 一次注册） */
export const ALL_ENTITIES = [
  ...D1_ENTITIES,
  ...D10_SYSTEM_ENTITIES,
  ...D9_MESSAGE_ENTITIES
] as const
