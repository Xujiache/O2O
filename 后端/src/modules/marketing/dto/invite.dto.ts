/**
 * @file invite.dto.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 邀请关系 DTO：邀请码绑定 / 战绩列表 / 邀请统计 / 邀请页占位 inviter 信息
 * @author 单 Agent V2.0（Agent C）
 *
 * 关键约束（与 07_marketing.sql / 任务 §7.4 一致）：
 *   - reward_status：0 未完成 / 1 已完成（被邀请人首单完成） / 2 已发放
 *   - inviteCode 本期统一格式 `INV{userId}`（10~32 位）；inviter_id 由 service 反解
 *   - 一名用户只能被一名用户邀请（uk_invitee）；不可自邀
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator'
import { PageQueryDto } from '@/common'

/**
 * 绑定邀请人入参（用户端）
 * 用途：POST /me/invitations/bind
 *
 * 校验：
 *   - 当前登录人 uid 即被邀请人 invitee_id（service 直接取 @CurrentUser，DTO 不需要传 inviteeId）
 *   - inviteCode 本期格式 `INV{userId}`（service 反解 inviter_id）
 *   - 不可自邀（service 校验 inviterId !== uid）
 */
export class BindInviterDto {
  @ApiProperty({ description: '邀请码（格式 INV{userId}）', example: 'INV180000000000000001' })
  @IsString()
  @Length(4, 32)
  @Matches(/^INV\d{1,30}$/, { message: 'inviteCode 必须为 INV{userId} 格式' })
  inviteCode!: string

  @ApiPropertyOptional({
    description: '邀请渠道：wechat_share / poster / sms / scan',
    example: 'wechat_share'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channel?: string
}

/**
 * 邀请记录查询入参（用户端）
 * 用途：GET /me/invitations
 */
export class InviteRecordQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: '奖励状态筛选：0 未完成 / 1 已完成 / 2 已发放'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  rewardStatus?: number
}

/**
 * 邀请记录视图
 * 用途：GET /me/invitations 列表元素
 */
export class InviteRecordVo {
  @ApiProperty() id!: string
  @ApiProperty({ description: '邀请人 ID' }) inviterId!: string
  @ApiProperty({ description: '被邀请人 ID' }) inviteeId!: string
  @ApiProperty({ description: '邀请码' }) inviteCode!: string
  @ApiProperty({ description: '邀请渠道', nullable: true }) channel!: string | null
  @ApiProperty({ description: '奖励状态：0 未完成 / 1 已完成 / 2 已发放' }) rewardStatus!: number
  @ApiProperty({ description: '奖励发放时间', nullable: true }) rewardAt!: Date | null
  @ApiProperty({ description: '奖励说明', nullable: true }) rewardRemark!: string | null
  @ApiProperty({ description: '绑定时间' }) createdAt!: Date
}

/**
 * 邀请统计视图
 * 用途：GET /me/invitations/stat
 */
export class InviteStatVo {
  @ApiProperty({ description: '总邀请数' })
  totalInvited!: number

  @ApiProperty({ description: '已完成数（被邀请人首单完成）' })
  completedCount!: number

  @ApiProperty({ description: '已发放奖励数' })
  rewardedCount!: number

  @ApiProperty({ description: '累计奖励积分（按 user_point_flow 聚合）' })
  totalRewardPoint!: number
}

/**
 * 邀请页 inviter 占位信息（公开接口）
 * 用途：GET /invite/:inviteCode（无登录场景，返回 inviter 昵称/头像引导注册）
 *
 * 本期方案：service 通过 inviteCode 解码取 inviterId，user 表暂未建昵称/头像反查
 * 接口（user.service 由员工 B 维护，T3.9 已落地但未对外暴露 byId getter），故本期返回
 * 占位 inviter info：inviterId + masked 占位昵称；后续接入 user.service 后替换。
 */
export class InvitePageVo {
  @ApiProperty({ description: '邀请码（透传，便于前端绑定）' })
  inviteCode!: string

  @ApiProperty({ description: '邀请人 ID（雪花字符串）' })
  inviterId!: string

  @ApiProperty({ description: '邀请人昵称（占位：本期返回 mask 串）' })
  inviterNickname!: string

  @ApiProperty({ description: '邀请人头像 URL', nullable: true })
  inviterAvatar!: string | null

  @ApiProperty({ description: '邀请奖励文案（前端渲染）' })
  rewardSlogan!: string
}
