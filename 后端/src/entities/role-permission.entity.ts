/**
 * @file role-permission.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.13 role_permission —— 角色↔权限 关联
 *       （对齐 01_account.sql 第 13 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 角色↔权限 关联（同一角色同一权限仅一条）
 * 用途：超管 admin.is_super=1 时绕过本表；其他角色严格按本表授权
 */
@Entity({ name: 'role_permission' })
@Index('uk_role_permission', ['roleId', 'permissionId'], { unique: true })
@Index('idx_permission_id', ['permissionId'])
export class RolePermission extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({ name: 'role_id', type: 'bigint', unsigned: true, comment: '角色 ID' })
  roleId!: string

  @Column({ name: 'permission_id', type: 'bigint', unsigned: true, comment: '权限 ID' })
  permissionId!: string
}
