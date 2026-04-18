/**
 * @file role.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.10 role —— 角色定义
 *       （对齐 01_account.sql 第 10 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 角色定义
 * 用途：对应 PRD §3.4.9.1 角色创建；seed 含 super_admin/operation/finance/cs/risk_control 5 个
 */
@Entity({ name: 'role' })
@Index('uk_role_code', ['roleCode'], { unique: true })
export class Role extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({ name: 'role_code', type: 'varchar', length: 64, comment: '角色编码（英文）' })
  roleCode!: string

  @Column({ name: 'role_name', type: 'varchar', length: 64, comment: '角色名称（中文展示）' })
  roleName!: string

  @Column({
    name: 'description',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '角色描述'
  })
  description!: string | null

  @Column({
    name: 'data_scope',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '数据范围：1 全部 / 2 本部门 / 3 本人 / 4 自定义'
  })
  dataScope!: number

  @Column({ name: 'sort', type: 'int', default: 0, comment: '排序权重（小→前）' })
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
