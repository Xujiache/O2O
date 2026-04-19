/**
 * @file recon-report.dto.ts
 * @stage P4/T4.35（Sprint 5）
 * @desc 对账差异报表 DTO（管理端 GET /admin/reconciliation-report）
 * @author 单 Agent V2.0
 *
 * 输入：billDate (yyyyMMdd 或 yyyy-MM-dd)
 * 输出：Excel 文件 buffer + 行数 + filename
 *
 * 注：FileService 当前只接受 Express.Multer.File 上传；本期不写 OSS，
 *     直接由 controller res.attachment + res.send(buffer) 完成下载。
 */

import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches } from 'class-validator'

/* ============================================================================
 * 一、ReportQueryDto —— 报表查询入参
 * ============================================================================ */

/**
 * 对账差异报表查询入参（管理端 GET /admin/reconciliation-report）
 */
export class ReportQueryDto {
  @ApiProperty({
    description: '账单日（yyyyMMdd 或 yyyy-MM-dd）',
    example: '20260418'
  })
  @IsString()
  @Matches(/^(\d{8}|\d{4}-\d{2}-\d{2})$/, {
    message: 'billDate 必须为 yyyyMMdd 或 yyyy-MM-dd'
  })
  billDate!: string
}

/* ============================================================================
 * 二、ReportRowVo —— 单行（管理端预览/调试时返回，下载走 Excel）
 * ============================================================================ */

/**
 * 报表单行（仅供 service.preview 内部 / API 预览返回使用）
 */
export class ReportRowVo {
  @ApiProperty({ description: '渠道（wxpay / alipay / ...）' })
  channel!: string

  @ApiProperty({ description: '账单日（yyyy-MM-dd）' })
  billDate!: string

  @ApiProperty({ description: '平台订单数' })
  totalOrders!: number

  @ApiProperty({ description: '平台订单金额（元）' })
  totalAmount!: string

  @ApiProperty({ description: '渠道手续费合计' })
  totalFee!: string

  @ApiProperty({ description: '渠道侧订单数' })
  channelOrders!: number

  @ApiProperty({ description: '渠道侧金额' })
  channelAmount!: string

  @ApiProperty({ description: '差异笔数' })
  diffCount!: number

  @ApiProperty({ description: '差异金额' })
  diffAmount!: string

  @ApiProperty({ description: '状态：0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理' })
  status!: number
}

/* ============================================================================
 * 三、ReportVo —— 服务层返回封装（供 controller 适配为 Excel 下载或 JSON 预览）
 * ============================================================================ */

/**
 * 报表服务层返回值
 *
 * 字段：
 *   - buffer    Excel 文件二进制 Buffer
 *   - filename  建议下载文件名（带 .xlsx）
 *   - rowCount  实际数据行数（不含表头）
 *   - billDate  归一化后的 yyyy-MM-dd
 *
 * 用途：admin-finance.controller 内 res.attachment + res.send(buffer)
 */
export interface ReportVo {
  buffer: Buffer
  filename: string
  rowCount: number
  billDate: string
}
