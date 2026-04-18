/**
 * @file base.entity.ts
 * @stage P3/T3.3
 * @desc 全平台 Entity 基类，承载 5 标配字段（tenant_id / is_deleted /
 *       created_at / updated_at / deleted_at），与 P2 SQL 一一对齐
 * @author 员工 A
 *
 * 注意：本类不携带 @Entity()、不参与表创建；仅作为 abstract class 被
 *       具体实体 extends；@PrimaryColumn id 由各实体自身声明（雪花 ID 字符串）。
 */

import { Column, CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from 'typeorm'

/**
 * Entity 基类
 * 用途：14 个账号域 Entity（user / merchant / rider / admin 等）extends BaseEntity
 *      共享租户列与软删 + 时间三件套
 */
export abstract class BaseEntity {
  @Column({
    name: 'tenant_id',
    type: 'int',
    unsigned: true,
    default: 1,
    comment: '租户 ID（多租户预留，默认 1）'
  })
  tenantId!: number

  @Column({
    name: 'is_deleted',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '软删标记：0 正常 / 1 已删'
  })
  isDeleted!: number

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
    comment: '创建时间'
  })
  createdAt!: Date

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    precision: 3,
    comment: '更新时间'
  })
  updatedAt!: Date

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '删除时间（软删）'
  })
  deletedAt!: Date | null
}
