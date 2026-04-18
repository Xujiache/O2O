/**
 * @file permission.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.11 permission —— 权限点（菜单/按钮/接口三层）
 *       （对齐 01_account.sql 第 11 张表 + 03_rbac.sql seed 92 条）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 权限点（树形：parent_id=0 为根）
 * 用途：对应 PRD §3.4.9.1 权限分配
 */
@Entity({ name: 'permission' })
@Index('uk_resource_code', ['resourceCode', 'resourceType'], { unique: true })
@Index('idx_parent_type', ['parentId', 'resourceType'])
export class Permission extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({
    name: 'parent_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    comment: '父节点 ID（树形；0=根）'
  })
  parentId!: string

  @Column({
    name: 'resource_type',
    type: 'tinyint',
    unsigned: true,
    comment: '资源类型：1 菜单 / 2 按钮 / 3 接口'
  })
  resourceType!: number

  @Column({
    name: 'resource_code',
    type: 'varchar',
    length: 64,
    comment: '资源编码（菜单 path / 按钮 perm 串 / 接口 method:path）'
  })
  resourceCode!: string

  @Column({ name: 'resource_name', type: 'varchar', length: 64, comment: '资源名称（中文展示）' })
  resourceName!: string

  @Column({
    name: 'action',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '动作（list/detail/create/update/delete/export 等）'
  })
  action!: string | null

  @Column({
    name: 'icon',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '图标（菜单专用）'
  })
  icon!: string | null

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序' })
  sort!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 禁用 / 1 启用'
  })
  status!: number
}
