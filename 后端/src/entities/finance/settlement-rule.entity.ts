/**
 * @file settlement-rule.entity.ts
 * @stage P4/T4.31（Sprint 5）
 * @desc TypeORM Entity：D5.5 settlement_rule —— 分账规则（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * scene + target_type + scope_type 组合规则；按 priority 高→低 匹配
 * scope_value：scope_type=1 时为空 / 2 时为 city_code / 3 时为 shop_id
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 分账规则
 */
@Entity({ name: 'settlement_rule' })
@Index('uk_rule_code', ['ruleCode'], { unique: true })
@Index('idx_scene_target_status', ['scene', 'targetType', 'status', 'priority'])
export class SettlementRule extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'rule_code', type: 'varchar', length: 64, comment: '规则编码' })
  ruleCode!: string

  @Column({ name: 'rule_name', type: 'varchar', length: 128, comment: '规则名称' })
  ruleName!: string

  @Column({
    name: 'scene',
    type: 'tinyint',
    unsigned: true,
    comment: '场景：1 外卖 / 2 跑腿'
  })
  scene!: number

  @Column({
    name: 'target_type',
    type: 'tinyint',
    unsigned: true,
    comment: '分账对象：1 商户 / 2 骑手 / 3 平台'
  })
  targetType!: number

  @Column({
    name: 'scope_type',
    type: 'tinyint',
    unsigned: true,
    comment: '生效范围：1 全局 / 2 城市 / 3 单店'
  })
  scopeType!: number

  @Column({
    name: 'scope_value',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '范围值（city_code / shop_id）'
  })
  scopeValue!: string | null

  @Column({
    name: 'rate',
    type: 'decimal',
    precision: 8,
    scale: 4,
    default: 0,
    comment: '比例（0~1）'
  })
  rate!: string

  @Column({
    name: 'fixed_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '固定费（元）'
  })
  fixedFee!: string

  @Column({
    name: 'min_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '最低分账金额'
  })
  minFee!: string | null

  @Column({
    name: 'max_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '最高分账金额'
  })
  maxFee!: string | null

  @Column({ name: 'priority', type: 'int', default: 0, comment: '优先级（大→优先匹配）' })
  priority!: number

  @Column({
    name: 'valid_from',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '生效起始'
  })
  validFrom!: Date | null

  @Column({
    name: 'valid_to',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '失效时间'
  })
  validTo!: Date | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '状态：0 停用 / 1 启用'
  })
  status!: number
}
