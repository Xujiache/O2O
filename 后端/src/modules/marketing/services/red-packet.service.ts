/**
 * @file red-packet.service.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 红包池服务：CRUD（管理端）+ 原子领取（grab Lua + DB CAS 兜底，V4.11 不超发）
 *       + 拼手气二倍均值法分配 + 退款（撤销）
 * @author 单 Agent V2.0（Agent C）
 *
 * 数据来源：MySQL `red_packet` + Redis Hash/Set 元数据
 *
 * Redis Key 规范：
 *   redpacket:meta:{packetId}    Hash    含 totalQty / receivedQty / receivedAmount /
 *                                            totalAmount / packetType / minAmount / maxAmount
 *   redpacket:users:{packetId}   Set     已领过的 userId 集合
 *   redpacket:user:{userId}      Set     该用户领过的 packetId 集合（用于"我的红包"列表）
 *   redpacket:grab:{packetId}:{userId} String JSON {amount, grabbedAt} 单笔领取详情
 *
 * 不超发设计（V4.11）：
 *   1) Redis Lua 原子"判重 + 计数预占"（red_packet_grab.lua）
 *   2) Service 层 BigNumber 二倍均值法计算金额，HINCRBYFLOAT 写回 Redis
 *   3) DB CAS 兜底 UPDATE ... WHERE received_qty < total_qty
 *   4) 任一步失败 → 反向回滚 Redis（SREM users + HINCRBY -1 + HINCRBYFLOAT -amount + DEL grab key）
 *
 * 已知遗留：
 *   - 红包账户流水（account_flow）待 Sprint 4 Finance Account 模块接入；本期红包"入账"
 *     通过 `redpacket:user:{userId}` Set + `redpacket:grab:*` 详情记录，
 *     不写 user_point_flow（避免与积分混淆，"point"字段是积分而非货币 cents）。
 *   - 撤销（cancel）红包退款仅做"DB status=4 + 写 OperationLog + Redis 标记停止"，
 *     真实退款回平台账户由 Sprint 4 Finance 接入。
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { readFileSync } from 'fs'
import type Redis from 'ioredis'
import { join } from 'path'
import { Brackets, DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '@/common'
import { RedPacket } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId, generateBizNo } from '@/utils'
import {
  CreateRedPacketDto,
  GrabRedPacketResultDto,
  MyRedPacketItemVo,
  QueryRedPacketDto,
  RedPacketVo
} from '../dto/red-packet.dto'

/* =====================================================================
 * Lua 返回码约定（与 src/redis/lua/red_packet_grab.lua 保持一致）
 * ===================================================================== */
/** Hash meta 未初始化（service 应 preloadMeta 后重试） */
const LUA_META_NOT_INIT = -3
/** 用户已领过 */
const LUA_ALREADY_GRABBED = -2
/** 已发完 */
const LUA_SOLD_OUT = -1

/* =====================================================================
 * Redis Key 模板
 * ===================================================================== */
const META_KEY = (packetId: string): string => `redpacket:meta:${packetId}`
const USERS_KEY = (packetId: string): string => `redpacket:users:${packetId}`
const USER_PACKETS_KEY = (userId: string): string => `redpacket:user:${userId}`
const GRAB_DETAIL_KEY = (packetId: string, userId: string): string =>
  `redpacket:grab:${packetId}:${userId}`

/** packet_type：1 普通（等额） */
const PACKET_TYPE_FIXED = 1
/** packet_type：2 拼手气 */
const PACKET_TYPE_LUCKY = 2
/** packet_type：3 现金红包（按等额发，业务等同于普通） */
const PACKET_TYPE_CASH = 3

/** 红包状态 */
const STATUS_DRAFT = 0
const STATUS_ONGOING = 1
const STATUS_FINISHED = 2
const STATUS_EXPIRED = 3
const STATUS_CANCELLED = 4

/** 拼手气默认下限：0.01 元 */
const DEFAULT_MIN_AMOUNT = '0.01'

/** Lua 返回值：[code, totalQty, receivedAmountBefore]，全部按 string 接收 */
type LuaGrabReply = [string, string, string]

/**
 * 受影响行数（mysql2 / pg 通用 OkPacket 子集）
 */
interface UpdateResultPacket {
  affectedRows?: number
}

/**
 * Redis 内存的领取详情（与 GRAB_DETAIL_KEY String JSON 对齐）
 */
interface GrabDetailPayload {
  amount: string
  grabbedAt: number
  packetName: string
}

@Injectable()
export class RedPacketService {
  private readonly logger = new Logger(RedPacketService.name)

  /** Lua: 抢红包脚本原文（构造时一次性同步加载） */
  private readonly grabScript: string

  constructor(
    @InjectRepository(RedPacket) private readonly packetRepo: Repository<RedPacket>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource,
    private readonly operationLogService: OperationLogService
  ) {
    /**
     * Lua 路径解析与 InventoryService 一致：__dirname 在 src 下为
     * src/modules/marketing/services，上溯三级到 src/redis/lua；
     * 编译后 dist/modules/marketing/services 同样上溯三级到 dist/redis/lua
     * （nest-cli.json assets 已配置 redis/lua/*.lua 自动复制）。
     */
    const luaDir = join(__dirname, '..', '..', '..', 'redis', 'lua')
    this.grabScript = readFileSync(join(luaDir, 'red_packet_grab.lua'), 'utf-8')
  }

  /* ============================================================
   *                    管理端：CRUD + 撤销
   * ============================================================ */

  /**
   * 管理端：新建红包池（自动初始化 Redis Hash + Set 数据结构）
   * 参数：dto / opAdminId
   * 返回值：RedPacketVo
   * 用途：POST /admin/red-packets
   */
  async create(dto: CreateRedPacketDto, opAdminId: string): Promise<RedPacketVo> {
    this.assertCreateInput(dto)
    const packetCode = generateBizNo('P')
    const totalAmount = new BigNumber(dto.totalAmount).decimalPlaces(2, BigNumber.ROUND_DOWN)
    const minAmount = dto.minAmount
      ? new BigNumber(dto.minAmount).decimalPlaces(2, BigNumber.ROUND_DOWN).toFixed(2)
      : null
    const maxAmount = dto.maxAmount
      ? new BigNumber(dto.maxAmount).decimalPlaces(2, BigNumber.ROUND_DOWN).toFixed(2)
      : null

    const validFrom = new Date(dto.validFrom)
    const validTo = new Date(dto.validTo)

    const entity = this.packetRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      packetCode,
      name: dto.name,
      packetType: dto.packetType,
      issuerType: dto.issuerType ?? 1,
      issuerId: dto.issuerId ?? null,
      totalAmount: totalAmount.toFixed(2),
      totalQty: dto.totalQty,
      receivedQty: 0,
      receivedAmount: '0.00',
      minAmount,
      maxAmount,
      targetUserIds: dto.targetUserIds && dto.targetUserIds.length > 0 ? dto.targetUserIds : null,
      validFrom,
      validTo,
      wishing: dto.wishing ?? null,
      imageUrl: dto.imageUrl ?? null,
      status: this.computeInitialStatus(validFrom, validTo),
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.packetRepo.save(entity)

    await this.initRedisMeta(entity)

    await this.operationLogService.write({
      opAdminId,
      module: 'marketing',
      action: 'red_packet_create',
      resourceType: 'red_packet',
      resourceId: entity.id,
      description: `新建红包 ${entity.name}（${entity.packetCode}），总额 ${entity.totalAmount} / ${entity.totalQty} 份`
    })
    this.logger.log(
      `[REDPKT] create id=${entity.id} code=${entity.packetCode} qty=${entity.totalQty} amount=${entity.totalAmount}`
    )
    return this.toVo(entity)
  }

  /**
   * 管理端：全量分页（按 packet_type / status / issuer / keyword 筛）
   * 参数：query
   * 返回值：PageResult<RedPacketVo>
   * 用途：GET /admin/red-packets
   */
  async adminList(query: QueryRedPacketDto): Promise<PageResult<RedPacketVo>> {
    const qb = this.packetRepo.createQueryBuilder('r').where('r.is_deleted = 0')
    if (query.packetType !== undefined) qb.andWhere('r.packet_type = :pt', { pt: query.packetType })
    if (query.status !== undefined) qb.andWhere('r.status = :st', { st: query.status })
    if (query.issuerType !== undefined) qb.andWhere('r.issuer_type = :it', { it: query.issuerType })
    if (query.issuerId) qb.andWhere('r.issuer_id = :iid', { iid: query.issuerId })
    if (query.keyword) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('r.name LIKE :kw', { kw: `%${query.keyword}%` }).orWhere('r.packet_code = :pc', {
            pc: query.keyword
          })
        })
      )
    }
    qb.orderBy('r.created_at', 'DESC').skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 管理端：详情
   * 参数：id
   * 返回值：RedPacketVo
   * 用途：GET /admin/red-packets/:id
   */
  async adminDetail(id: string): Promise<RedPacketVo> {
    const e = await this.findActive(id)
    return this.toVo(e)
  }

  /**
   * 管理端：撤销（status=4）+ 写 OperationLog；剩余金额"标记退款"由 Sprint 4 Finance 接入
   * 参数：id / opAdminId / reason
   * 返回值：RedPacketVo
   * 用途：PUT /admin/red-packets/:id/cancel
   */
  async adminCancel(id: string, opAdminId: string, reason: string): Promise<RedPacketVo> {
    const e = await this.findActive(id)
    if (e.status === STATUS_CANCELLED) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '红包已撤销')
    }
    if (e.status === STATUS_FINISHED) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '红包已发完，无可撤销金额')
    }

    const remainingQty = e.totalQty - e.receivedQty
    const remainingAmount = new BigNumber(e.totalAmount).minus(new BigNumber(e.receivedAmount))
    e.status = STATUS_CANCELLED
    await this.packetRepo.save(e)

    /* Redis 标记停止（删除 meta，使后续 grab 直接 META_NOT_INIT；service 兜底校验 status） */
    try {
      await this.redis.del(META_KEY(id))
    } catch (err) {
      this.logger.warn(`[REDPKT] DEL meta 失败 id=${id} err=${(err as Error).message}`)
    }

    await this.operationLogService.write({
      opAdminId,
      module: 'marketing',
      action: 'red_packet_cancel',
      resourceType: 'red_packet',
      resourceId: id,
      description: `撤销红包 ${e.name}，剩余 ${remainingQty} 份 / ${remainingAmount.toFixed(2)} 元（${reason}）`
    })
    this.logger.log(
      `[REDPKT] cancel id=${id} remain qty=${remainingQty} amount=${remainingAmount.toFixed(2)}`
    )
    return this.toVo(e)
  }

  /* ============================================================
   *                    用户端：active 列表 / grab / 我的列表
   * ============================================================ */

  /**
   * 用户端（Public）：当前进行中红包列表
   * 行为：status=1 + 时段内 + （targetUserIds 为空 或 包含 currentUserId）
   *
   * 参数：currentUserId 可选（未登录时返回所有"未指定用户"的红包）
   * 返回值：RedPacketVo[]
   * 用途：GET /red-packets/active
   */
  async listActive(currentUserId?: string): Promise<RedPacketVo[]> {
    const now = new Date()
    const qb = this.packetRepo
      .createQueryBuilder('r')
      .where('r.is_deleted = 0 AND r.status = :st', { st: STATUS_ONGOING })
      .andWhere('r.valid_from <= :now AND r.valid_to >= :now', { now })
      .orderBy('r.created_at', 'DESC')
      .limit(50)
    const rows = await qb.getMany()
    const filtered = rows.filter((r) => {
      if (!r.targetUserIds || r.targetUserIds.length === 0) return true
      if (!currentUserId) return false
      return r.targetUserIds.includes(currentUserId)
    })
    return filtered.map((r) => this.toVo(r))
  }

  /**
   * 用户端：领取红包（核心：Lua 原子 + DB CAS 兜底，V4.11 不超发）
   *
   * 参数：userId / packetId
   * 返回值：GrabRedPacketResultDto
   *
   * 流程：
   *   1) DB 校验：is_deleted / status / valid_from~valid_to / target_user_ids
   *   2) Redis Lua 原子（判重 + 判余 + 计数预占）；返回 -3 时 preloadMeta 重试一次
   *   3) BigNumber 计算 thisAmount（普通 / 拼手气 / 现金）
   *   4) HINCRBYFLOAT 累加 receivedAmount；写 grab detail + user packet set
   *   5) DB CAS：UPDATE red_packet SET received_qty=received_qty+1, received_amount=received_amount+?
   *              status=CASE WHEN received_qty+1>=total_qty THEN 2 ELSE status END
   *              WHERE id=? AND received_qty<total_qty
   *   6) DB 受影响=0 → 反向回滚 Redis（SREM + HINCRBY -1 + HINCRBYFLOAT -amount + DEL detail/userSet）
   */
  async grab(userId: string, packetId: string): Promise<GrabRedPacketResultDto> {
    const packet = await this.findActive(packetId)
    this.assertGrabAllowed(packet, userId)

    /* Step 1: Lua 原子（含 META_NOT_INIT 自动 preloadMeta 重试一次） */
    let reply = await this.evalGrab(packetId, userId)
    let codeNum = Number(reply[0])
    if (codeNum === LUA_META_NOT_INIT) {
      await this.initRedisMeta(packet)
      reply = await this.evalGrab(packetId, userId)
      codeNum = Number(reply[0])
    }
    if (codeNum === LUA_META_NOT_INIT) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_REDIS_ERROR,
        '红包 meta 初始化失败，请稍后再试'
      )
    }
    if (codeNum === LUA_ALREADY_GRABBED) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '您已领取过该红包')
    }
    if (codeNum === LUA_SOLD_OUT) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '红包已被领完')
    }

    const newQty = codeNum
    const totalQty = Number(reply[1])
    const receivedAmountBefore = new BigNumber(reply[2])

    /* Step 2: BigNumber 计算 thisAmount */
    let thisAmount: BigNumber
    try {
      thisAmount = this.computeAmount(packet, newQty, totalQty, receivedAmountBefore)
    } catch (err) {
      await this.rollbackRedis(packetId, userId, new BigNumber(0))
      throw err
    }
    const thisAmountStr = thisAmount.toFixed(2)

    /* Step 3: HINCRBYFLOAT receivedAmount + 写 grab detail + user packet set */
    const grabbedAt = Date.now()
    try {
      await this.redis.hincrbyfloat(META_KEY(packetId), 'receivedAmount', thisAmountStr)
      const detail: GrabDetailPayload = {
        amount: thisAmountStr,
        grabbedAt,
        packetName: packet.name
      }
      await this.redis.set(GRAB_DETAIL_KEY(packetId, userId), JSON.stringify(detail))
      await this.redis.sadd(USER_PACKETS_KEY(userId), packetId)
    } catch (err) {
      this.logger.error(
        `[REDPKT] Redis 写 detail 失败 id=${packetId} user=${userId}：${(err as Error).message}`
      )
      await this.rollbackRedis(packetId, userId, thisAmount)
      throw new BusinessException(BizErrorCode.SYSTEM_REDIS_ERROR, '红包领取失败')
    }

    /* Step 4: DB CAS 兜底 */
    try {
      await this.dbCommitGrab(packetId, thisAmountStr)
    } catch (err) {
      this.logger.error(
        `[REDPKT] DB CAS 失败 id=${packetId} user=${userId}：${(err as Error).message}`
      )
      await this.rollbackRedis(packetId, userId, thisAmount)
      throw err
    }

    this.logger.log(
      `[REDPKT] grab id=${packetId} user=${userId} amount=${thisAmountStr} seq=${newQty}/${totalQty}`
    )
    return {
      packetId,
      packetName: packet.name,
      amount: thisAmountStr,
      grabSeq: newQty,
      grabbedAt,
      wishing: packet.wishing
    }
  }

  /**
   * 用户端：我领过的红包列表（从 redpacket:user:{userId} Set 读，再批量取详情）
   * 参数：userId
   * 返回值：MyRedPacketItemVo[]（按 grabbedAt desc）
   * 用途：GET /me/red-packets
   */
  async listMyPackets(userId: string): Promise<MyRedPacketItemVo[]> {
    const packetIds = await this.redis.smembers(USER_PACKETS_KEY(userId))
    if (packetIds.length === 0) return []

    const items: MyRedPacketItemVo[] = []
    for (const pid of packetIds) {
      const detailRaw = await this.redis.get(GRAB_DETAIL_KEY(pid, userId))
      if (!detailRaw) continue
      try {
        const detail = JSON.parse(detailRaw) as GrabDetailPayload
        items.push({
          packetId: pid,
          packetName: detail.packetName,
          amount: detail.amount,
          grabbedAt: detail.grabbedAt,
          wishing: null
        })
      } catch (err) {
        this.logger.warn(
          `[REDPKT] 反序列化 grab detail 失败 id=${pid} user=${userId}：${(err as Error).message}`
        )
      }
    }
    items.sort((a, b) => b.grabbedAt - a.grabbedAt)
    return items
  }

  /**
   * 用户端：单笔领取详情（我在某红包的领取记录）
   * 参数：userId / packetId
   * 返回值：MyRedPacketItemVo
   * 用途：GET /me/red-packets/:id
   */
  async getMyGrab(userId: string, packetId: string): Promise<MyRedPacketItemVo> {
    const detailRaw = await this.redis.get(GRAB_DETAIL_KEY(packetId, userId))
    if (!detailRaw) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '您未领取过该红包')
    }
    let detail: GrabDetailPayload
    try {
      detail = JSON.parse(detailRaw) as GrabDetailPayload
    } catch (err) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `grab detail 反序列化失败：${(err as Error).message}`
      )
    }
    /* 取祝福语：优先 DB 查实体；查不到则 fallback 用 detail 中的 packetName */
    let wishing: string | null = null
    const packet = await this.packetRepo.findOne({
      where: { id: packetId, isDeleted: 0 }
    })
    if (packet) wishing = packet.wishing
    return {
      packetId,
      packetName: detail.packetName,
      amount: detail.amount,
      grabbedAt: detail.grabbedAt,
      wishing
    }
  }

  /* ============================================================
   *                    Internal helpers
   * ============================================================ */

  /**
   * 校验创建入参（数额边界 / 时段 / 类型）
   */
  private assertCreateInput(dto: CreateRedPacketDto): void {
    const totalAmount = new BigNumber(dto.totalAmount)
    if (!totalAmount.isFinite() || totalAmount.lte(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'totalAmount 必须 > 0')
    }
    /* 红包单份至少 0.01 元（防止"分母为 totalQty 时取整为 0"） */
    if (totalAmount.times(100).lt(dto.totalQty)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `总金额 ${totalAmount.toFixed(2)} 元，无法切分成 ${dto.totalQty} 份（每份至少 0.01 元）`
      )
    }
    if (dto.minAmount) {
      const minA = new BigNumber(dto.minAmount)
      if (!minA.isFinite() || minA.lte(0)) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'minAmount 必须 > 0')
      }
    }
    if (dto.maxAmount) {
      const maxA = new BigNumber(dto.maxAmount)
      if (!maxA.isFinite() || maxA.lte(0)) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'maxAmount 必须 > 0')
      }
      if (maxA.gt(totalAmount)) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'maxAmount 不可大于 totalAmount')
      }
    }
    if (dto.minAmount && dto.maxAmount) {
      if (new BigNumber(dto.minAmount).gt(new BigNumber(dto.maxAmount))) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'minAmount 不能大于 maxAmount')
      }
    }
    const vf = new Date(dto.validFrom)
    const vt = new Date(dto.validTo)
    if (vf.getTime() >= vt.getTime()) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'validFrom 必须早于 validTo')
    }
  }

  /**
   * 计算初始 status：valid_from > now 草稿（0），其余进行中（1）
   */
  private computeInitialStatus(validFrom: Date, validTo: Date): number {
    const now = Date.now()
    if (validTo.getTime() < now) return STATUS_EXPIRED
    if (validFrom.getTime() > now) return STATUS_DRAFT
    return STATUS_ONGOING
  }

  /**
   * 校验 grab 调用上下文：状态 / 时段 / 白名单
   */
  private assertGrabAllowed(packet: RedPacket, userId: string): void {
    const now = Date.now()
    if (packet.status === STATUS_DRAFT) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '红包尚未开始')
    }
    if (packet.status === STATUS_FINISHED) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '红包已被领完')
    }
    if (packet.status === STATUS_EXPIRED) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '红包已过期')
    }
    if (packet.status === STATUS_CANCELLED) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '红包已撤销')
    }
    if (packet.status !== STATUS_ONGOING) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '红包状态非法')
    }
    if (packet.validFrom.getTime() > now) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '红包尚未开始')
    }
    if (packet.validTo.getTime() < now) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '红包已过期')
    }
    if (
      packet.targetUserIds &&
      packet.targetUserIds.length > 0 &&
      !packet.targetUserIds.includes(userId)
    ) {
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '您不在该红包指定用户范围内')
    }
  }

  /**
   * 调 Lua 抢红包脚本
   * 参数：packetId / userId
   * 返回值：[code, totalQty, receivedAmountBefore]
   */
  private async evalGrab(packetId: string, userId: string): Promise<LuaGrabReply> {
    const raw: unknown = await this.redis.eval(
      this.grabScript,
      2,
      META_KEY(packetId),
      USERS_KEY(packetId),
      userId
    )
    /* ioredis 返回 multi-bulk 时是 unknown[]；元素可能是 string 或 number */
    if (!Array.isArray(raw) || raw.length < 3) {
      this.logger.error(`[REDPKT] Lua 返回非法 raw=${JSON.stringify(raw)}`)
      throw new BusinessException(BizErrorCode.SYSTEM_REDIS_ERROR, 'red_packet_grab.lua 返回非法')
    }
    return [String(raw[0]), String(raw[1]), String(raw[2])]
  }

  /**
   * 二倍均值法 / 等额法 计算本次领取金额
   * 参数：
   *   - packet                  红包实体
   *   - newQty                  Lua 返回的 receivedQty（即"我是第几个"）
   *   - totalQty                总份数
   *   - receivedAmountBefore    本次领取前 Redis 中已发金额
   * 返回值：BigNumber（保留 2 位小数；最低 0.01 元）
   *
   * 算法：
   *   - PACKET_TYPE_FIXED / PACKET_TYPE_CASH：等额（avg = total / qty 向下取整 2 位）；
   *     最后一个领取人取剩余金额，避免精度丢失导致最后一份为 0。
   *   - PACKET_TYPE_LUCKY：二倍均值法
   *       remaining     = totalAmount - receivedAmountBefore
   *       remainingQty  = totalQty - (newQty - 1)
   *       if remainingQty == 1: thisAmount = remaining
   *       else:
   *         avg   = remaining / remainingQty
   *         upper = min(avg * 2, maxAmount or remaining)
   *         lower = minAmount (default 0.01)
   *         thisAmount = lower + Math.random() * (upper - lower)
   *       钳制 [lower, remaining]，最后保留 2 位（向下）
   */
  private computeAmount(
    packet: RedPacket,
    newQty: number,
    totalQty: number,
    receivedAmountBefore: BigNumber
  ): BigNumber {
    const totalAmount = new BigNumber(packet.totalAmount)
    const remaining = totalAmount.minus(receivedAmountBefore)
    const remainingQty = totalQty - (newQty - 1)

    if (remaining.lte(0) || remainingQty <= 0) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        '红包剩余额度异常，请稍后再试'
      )
    }

    if (packet.packetType === PACKET_TYPE_FIXED || packet.packetType === PACKET_TYPE_CASH) {
      if (newQty === totalQty) return remaining.decimalPlaces(2, BigNumber.ROUND_DOWN)
      const avg = totalAmount.dividedBy(totalQty).decimalPlaces(2, BigNumber.ROUND_DOWN)
      if (avg.lt(new BigNumber(DEFAULT_MIN_AMOUNT))) {
        return new BigNumber(DEFAULT_MIN_AMOUNT)
      }
      return avg
    }

    /* PACKET_TYPE_LUCKY 二倍均值法 */
    if (remainingQty === 1) return remaining.decimalPlaces(2, BigNumber.ROUND_DOWN)

    const minAmount = packet.minAmount
      ? new BigNumber(packet.minAmount)
      : new BigNumber(DEFAULT_MIN_AMOUNT)
    const avg = remaining.dividedBy(remainingQty)
    let upper = avg.times(2)
    if (packet.maxAmount) {
      upper = BigNumber.min(upper, new BigNumber(packet.maxAmount))
    }
    /* 上限不可超过剩余总额（剩余 = 总 - 已发；当前 thisAmount 必须 ≤ remaining） */
    upper = BigNumber.min(upper, remaining)
    /* 下限 ≤ 上限 */
    let lower = minAmount
    if (lower.gt(upper)) lower = upper

    /* 随机：lower + random() * (upper - lower) */
    const range = upper.minus(lower)
    let thisAmount = lower.plus(range.times(new BigNumber(Math.random())))
    thisAmount = thisAmount.decimalPlaces(2, BigNumber.ROUND_DOWN)

    /* 兜底钳制 */
    if (thisAmount.lt(minAmount)) thisAmount = minAmount
    if (thisAmount.gt(remaining)) thisAmount = remaining
    if (thisAmount.lt(new BigNumber(DEFAULT_MIN_AMOUNT))) {
      thisAmount = new BigNumber(DEFAULT_MIN_AMOUNT)
    }
    return thisAmount
  }

  /**
   * DB CAS 兜底：UPDATE red_packet
   * 参数：packetId / amountStr（保留 2 位小数）
   * 返回值：void
   * 错误：affectedRows=0 → SYSTEM_DB_ERROR（service 上层捕获后回滚 Redis）
   */
  private async dbCommitGrab(packetId: string, amountStr: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      const raw: unknown = await queryRunner.manager.query(
        `UPDATE red_packet
            SET received_qty = received_qty + 1,
                received_amount = received_amount + ?,
                status = CASE
                  WHEN (received_qty + 1) >= total_qty THEN ${STATUS_FINISHED}
                  ELSE status
                END,
                updated_at = ?
          WHERE id = ?
            AND received_qty < total_qty
            AND is_deleted = 0`,
        [amountStr, new Date(), packetId]
      )
      const packet = raw as UpdateResultPacket
      if ((packet.affectedRows ?? 0) === 0) {
        throw new BusinessException(
          BizErrorCode.SYSTEM_DB_ERROR,
          `red_packet DB CAS 失败：id=${packetId}（received_qty 已达 total_qty 或行不存在）`
        )
      }
      await queryRunner.commitTransaction()
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * 反向回滚 Redis（grab 失败时调用，best-effort 不抛二次异常）
   * 参数：packetId / userId / amount（已写回 receivedAmount 的金额；首次失败时 amount=0）
   */
  private async rollbackRedis(packetId: string, userId: string, amount: BigNumber): Promise<void> {
    try {
      await this.redis.srem(USERS_KEY(packetId), userId)
      await this.redis.hincrby(META_KEY(packetId), 'receivedQty', -1)
      if (amount.gt(0)) {
        await this.redis.hincrbyfloat(
          META_KEY(packetId),
          'receivedAmount',
          amount.negated().toFixed(2)
        )
      }
      await this.redis.del(GRAB_DETAIL_KEY(packetId, userId))
      await this.redis.srem(USER_PACKETS_KEY(userId), packetId)
    } catch (err) {
      this.logger.error(
        `[REDPKT] Redis 回滚失败 id=${packetId} user=${userId}：${(err as Error).message}`
      )
    }
  }

  /**
   * 初始化 Redis Hash（HSET 全量字段）；create / preload 时调用
   */
  private async initRedisMeta(packet: RedPacket): Promise<void> {
    try {
      await this.redis.hmset(META_KEY(packet.id), {
        totalQty: String(packet.totalQty),
        receivedQty: String(packet.receivedQty),
        totalAmount: packet.totalAmount,
        receivedAmount: packet.receivedAmount,
        packetType: String(packet.packetType),
        minAmount: packet.minAmount ?? DEFAULT_MIN_AMOUNT,
        maxAmount: packet.maxAmount ?? packet.totalAmount
      })
    } catch (err) {
      this.logger.warn(`[REDPKT] 初始化 Redis meta 失败 id=${packet.id}：${(err as Error).message}`)
    }
  }

  /**
   * 内部：找活跃红包；不存在抛 NotFound
   */
  private async findActive(id: string): Promise<RedPacket> {
    const e = await this.packetRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!e) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '红包不存在')
    return e
  }

  /**
   * Entity → VO
   */
  private toVo(e: RedPacket): RedPacketVo {
    return {
      id: e.id,
      packetCode: e.packetCode,
      name: e.name,
      packetType: e.packetType,
      issuerType: e.issuerType,
      issuerId: e.issuerId,
      totalAmount: e.totalAmount,
      totalQty: e.totalQty,
      receivedQty: e.receivedQty,
      receivedAmount: e.receivedAmount,
      minAmount: e.minAmount,
      maxAmount: e.maxAmount,
      targetUserIds: e.targetUserIds,
      validFrom: e.validFrom,
      validTo: e.validTo,
      wishing: e.wishing,
      imageUrl: e.imageUrl,
      status: e.status,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    }
  }
}
