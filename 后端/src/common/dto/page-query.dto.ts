/**
 * @file page-query.dto.ts
 * @stage P3/T3.1
 * @desc 通用分页查询入参基类（含 Swagger + class-validator）
 * @author 员工 A
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * 通用分页入参
 * 用途：业务 ListDto extends PageQueryDto 即可复用 page/pageSize 字段
 */
export class PageQueryDto {
  @ApiPropertyOptional({ description: '页码（从 1 开始）', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1, { message: 'page 不能小于 1' })
  page?: number = 1

  @ApiPropertyOptional({
    description: '每页条数（最大 100）',
    default: 20,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1, { message: 'pageSize 不能小于 1' })
  @Max(100, { message: 'pageSize 不能超过 100' })
  pageSize?: number = 20

  /**
   * 计算 SQL OFFSET（page-1）*pageSize
   * 参数：无
   * 返回值：偏移量（整数）
   * 用途：Repository.find({ skip: dto.skip(), take: dto.take() })
   */
  skip(): number {
    return ((this.page ?? 1) - 1) * (this.pageSize ?? 20)
  }

  /**
   * 计算 SQL LIMIT
   * 参数：无
   * 返回值：每页条数（整数）
   */
  take(): number {
    return this.pageSize ?? 20
  }
}
