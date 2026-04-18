/**
 * @file inbox.controller.ts
 * @stage P3-REVIEW-01 R1 / I-04
 * @desc 站内信 4 接口（被 ACCEPTANCE V3.16 验收：写库 + 未读数 + mark-read 可用）
 * @author 员工 A（R1 修复）
 *
 * 接口清单（路由前缀 /api/v1/me/messages）：
 *   GET  /                  收件箱列表（按 created_at DESC，未读优先）
 *   GET  /unread-count      未读数
 *   PUT  /:id/read          标已读（含越权校验，仅本人可读）
 *   PUT  /read-all          全部标已读
 *
 * 鉴权：
 *   - 类级 @UseGuards(JwtAuthGuard)：必须登录
 *   - receiverType 由 currentUser.userType 自动推导（user→1 / merchant→2 / rider→3 / admin→4）
 *
 * Swagger 分组：
 *   @ApiTags('消息 / Message')；与 main.ts 中 /docs/user 关键字 '消息' 匹配，自动落入用户端文档
 */

import { Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator'
import { PageResult } from '../../common'
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { MessageInbox } from '../../entities'
import { MessageService } from './message.service'

/**
 * 列表入参（限制 pageSize ≤ 100）
 */
export class ListInboxQuery {
  @ApiPropertyOptional({ description: '页码（从 1 开始）', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1, { message: 'page 不能小于 1' })
  page?: number = 1

  @ApiPropertyOptional({ description: '每页条数（最大 100）', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1, { message: 'pageSize 不能小于 1' })
  @Max(100, { message: 'pageSize 不能超过 100' })
  pageSize?: number = 10

  @ApiPropertyOptional({
    description: '是否仅未读（true / false / 1 / 0；默认 false）',
    default: false
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'onlyUnread 必须 boolean' })
  onlyUnread?: boolean = false
}

/**
 * PUT /:id/read 路径参数（R2/I-10 增）
 *
 * 校验：必须是 1~32 位纯数字字符串（雪花 ID 字符串形式，最大 19 位 + 容错）
 */
export class MarkReadParamDto {
  @ApiProperty({ description: '消息 ID（雪花 ID 字符串）', example: '8000000000000000001' })
  @IsString()
  @Length(1, 32)
  @Matches(/^\d{1,32}$/, { message: 'id 必须是数字字符串' })
  id!: string
}

/**
 * 站内信 Controller
 */
@ApiTags('消息 / Message')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me/messages', version: '1' })
export class InboxController {
  constructor(private readonly messageService: MessageService) {}

  /**
   * GET /api/v1/me/messages
   * 收件箱列表（未读优先 + 时间倒序）
   * 参数：query ListInboxQuery；user 当前登录态
   * 返回值：PageResult<MessageInbox>
   */
  @Get()
  @ApiOperation({
    summary: '当前用户/商户/骑手 站内信收件箱列表',
    description:
      '按 receiverType（由 userType 自动推导）+ receiverId（=uid）筛选；\n' +
      '排序：is_read ASC（未读优先）→ created_at DESC；\n' +
      '可选 onlyUnread=true 仅查未读'
  })
  @ApiResponse({ status: 200, description: '查询成功（统一响应包裹 list+meta）' })
  async list(
    @Query() query: ListInboxQuery,
    @CurrentUser() user: AuthUser
  ): Promise<PageResult<MessageInbox>> {
    const receiverType = MessageService.userTypeToReceiver(user.userType)
    return this.messageService.listInbox(receiverType, user.uid, {
      page: query.page,
      pageSize: query.pageSize,
      onlyUnread: query.onlyUnread === true
    })
  }

  /**
   * GET /api/v1/me/messages/unread-count
   * 未读数
   * 参数：user 当前登录态
   * 返回值：{ count: number }
   */
  @Get('unread-count')
  @ApiOperation({
    summary: '当前用户/商户/骑手 未读站内信数',
    description: '常驻 badge 用；建议前端 30s 轮询或登录后调用一次'
  })
  @ApiResponse({ status: 200, description: '查询成功' })
  async unreadCount(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    const receiverType = MessageService.userTypeToReceiver(user.userType)
    const count = await this.messageService.unreadCount(receiverType, user.uid)
    return { count }
  }

  /**
   * PUT /api/v1/me/messages/:id/read
   * 标已读（含越权校验，仅本人可读）
   * 参数：id 站内信主键；user 当前登录态
   * 返回值：MessageInbox（已读后的实体）
   * 错误：站内信不存在 → 10010；越权 → 20003
   */
  @Put(':id/read')
  @ApiOperation({
    summary: '将一条站内信标记为已读',
    description:
      '越权校验：必须 receiverType 与 userType 匹配 + receiverId 与 uid 一致；\n' +
      '幂等：已读再次调用不报错；返回最新实体'
  })
  @ApiParam({ name: 'id', description: '站内信主键（雪花 ID）' })
  @ApiResponse({ status: 200, description: '标记成功' })
  @ApiResponse({ status: 200, description: '权限不足 / 不存在（业务码 20003 / 10010）' })
  async markRead(
    @Param() params: MarkReadParamDto,
    @CurrentUser() user: AuthUser
  ): Promise<MessageInbox> {
    return this.messageService.markRead(params.id, { uid: user.uid, userType: user.userType })
  }

  /**
   * PUT /api/v1/me/messages/read-all
   * 全部标已读
   * 参数：user 当前登录态
   * 返回值：{ updated: number }
   */
  @Put('read-all')
  @ApiOperation({
    summary: '将当前用户/商户/骑手 所有未读消息全部标已读',
    description: '影响行数 = 之前未读条数；幂等'
  })
  @ApiResponse({ status: 200, description: '操作成功' })
  async markAllRead(@CurrentUser() user: AuthUser): Promise<{ updated: number }> {
    const receiverType = MessageService.userTypeToReceiver(user.userType)
    return this.messageService.markAllRead(receiverType, user.uid)
  }
}
