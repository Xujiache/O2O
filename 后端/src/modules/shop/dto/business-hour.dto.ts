/**
 * @file business-hour.dto.ts
 * @stage P4/T4.1（Sprint 1）
 * @desc 营业时段 DTO：批量设置（先删后插）+ 单条 + 视图
 * @author 单 Agent V2.0
 */

import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateNested
} from 'class-validator'

/**
 * 单条营业时段
 *
 * 字段：
 *   dayOfWeek 0~7（0=每天通用；1=周一 ... 7=周日）
 *   openTime  / closeTime  HH:mm 或 HH:mm:ss（数据库列为 TIME，先序列化为字符串）
 *   isActive  0 临时禁用 / 1 启用（默认 1）
 *
 * 注：跨天营业（02:00 收摊）由调用方拆为 当日 09:00-23:59:59 + 次日 00:00:00-02:00 两条
 */
export class BusinessHourItemDto {
  @ApiProperty({
    description: '周几：0 每天通用 / 1=周一 ... 7=周日',
    enum: [0, 1, 2, 3, 4, 5, 6, 7],
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5, 6, 7])
  dayOfWeek!: number

  @ApiProperty({ description: '开门时间 HH:mm 或 HH:mm:ss', example: '09:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'openTime 必须为 HH:mm 或 HH:mm:ss'
  })
  openTime!: string

  @ApiProperty({
    description: '关门时间 HH:mm 或 HH:mm:ss（同日；跨日请拆为两条）',
    example: '22:00'
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'closeTime 必须为 HH:mm 或 HH:mm:ss'
  })
  closeTime!: string

  @ApiProperty({ description: '是否生效：0 临时禁用 / 1 启用', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isActive?: number = 1
}

/**
 * 批量设置营业时段入参（先删后插事务）
 * 用途：PUT /api/v1/merchant/shop/:id/business-hours
 *
 * 注：list 为空数组等价于「清空营业时段」（合理诉求：店铺暂时停业）
 */
export class SetBusinessHoursDto {
  @ApiProperty({
    description: '营业时段列表（先删后插事务）',
    type: BusinessHourItemDto,
    isArray: true
  })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BusinessHourItemDto)
  list!: BusinessHourItemDto[]
}

/**
 * 营业时段视图
 * 用途：GET /api/v1/merchant/shop/:id/business-hours
 */
export class BusinessHourVo {
  @ApiProperty({ description: '主键' }) id!: string
  @ApiProperty({ description: '所属店铺 ID' }) shopId!: string
  @ApiProperty({ description: '周几：0 每天通用 / 1=周一 ... 7=周日' }) dayOfWeek!: number
  @ApiProperty({ description: '开门时间', example: '09:00:00' }) openTime!: string
  @ApiProperty({ description: '关门时间', example: '22:00:00' }) closeTime!: string
  @ApiProperty({ description: '是否生效：0 临时禁用 / 1 启用' }) isActive!: number
}
