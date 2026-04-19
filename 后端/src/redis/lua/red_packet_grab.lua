-- ============================================================================
-- 文件名 : red_packet_grab.lua
-- 阶段   : P4/T4.12（Sprint 2）
-- 用途   : 红包原子领取（防超发 / 防一人多领）
--          对应 ACCEPTANCE V4.11 红包不超发
-- 调用   : EVAL <script> 2 redpacket:meta:{packetId} redpacket:users:{packetId} <userId>
--
-- KEYS[1] : redpacket:meta:{packetId}   Hash 字段 totalQty / receivedQty / receivedAmount
-- KEYS[2] : redpacket:users:{packetId}  Set   已领过的 userId 集合
-- ARGV[1] : 当前请求的 userId（雪花字符串）
--
-- 返回值约定（Redis 多 bulk reply，Node 侧均按字符串接收并自行 Number 化）：
--   {-3, "0", "0"}                          : meta 未初始化（Redis Hash 不存在）
--   {-2, "0", "0"}                          : 已领取过（Set 命中）
--   {-1, "0", "0"}                          : 已发完（receivedQty == totalQty）
--   {newQty, totalQty, receivedAmountBefore}: 领取成功
--                                             newQty                = HINCRBY 后值（即"我是第几个"）
--                                             totalQty              = 总份数（透传）
--                                             receivedAmountBefore  = 自增前的 receivedAmount 字符串
--
-- 设计要点：
--   * 原子保证："判重 + 判余量 + SADD + HINCRBY 计数预占"四步必须在 Lua 内一次完成；
--     金额发放（HINCRBYFLOAT receivedAmount + DB CAS）由 Node 侧 RedPacketService.grab 承担。
--   * 简化方案（任务 §7.1）：Lua 仅做"原子判重 + 计数预占"，金额计算放在 service 层
--     （BigNumber 二倍均值法）+ DB CAS 兜底；service 在金额计算或 DB 写失败时反向回滚 Redis：
--       SREM users + HINCRBY receivedQty -1。
--   * receivedAmountBefore 必须在 SADD/HINCRBY 之前读，确保拿到的是"我之前累计已发金额"，
--     避免读到自己未发但 Lua 已计数的"幽灵金额"，便于二倍均值法正确取 remaining。
--   * Lua 不在 meta 缺失时自动从 DB 回写：避免脚本越权读 DB；service 层负责 preloadMeta。
-- ============================================================================

local total_qty_str = redis.call('HGET', KEYS[1], 'totalQty')
if total_qty_str == false then
  return {-3, '0', '0'}
end

if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return {-2, '0', '0'}
end

local total_qty = tonumber(total_qty_str)
local received_qty_str = redis.call('HGET', KEYS[1], 'receivedQty')
local received_qty = tonumber(received_qty_str or '0')

if received_qty >= total_qty then
  return {-1, '0', '0'}
end

local received_amount_str = redis.call('HGET', KEYS[1], 'receivedAmount') or '0'

redis.call('SADD', KEYS[2], ARGV[1])
local new_qty = redis.call('HINCRBY', KEYS[1], 'receivedQty', 1)

return {tostring(new_qty), tostring(total_qty), received_amount_str}
