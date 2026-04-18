/**
 * @file admin-role.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.12 admin_role —— 管理员↔角色 关联
 *       （对齐 01_account.sql 第 12 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 管理员↔角色 关联（同一管理员同一角色仅一条）
 */
@Entity({ name: 'admin_role' })
@Index('uk_admin_role', ['adminId', 'roleId'], { unique: true })
@Index('idx_role_id', ['roleId'])
export class AdminRole extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({ name: 'admin_id', type: 'bigint', unsigned: true, comment: '管理员 ID' })
  adminId!: string

  @Column({ name: 'role_id', type: 'bigint', unsigned: true, comment: '角色 ID' })
  roleId!: string
}
