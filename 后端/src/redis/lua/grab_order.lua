-- ============================================================================
-- 文件名 : grab_order.lua
-- 阶段   : P4/T4.40（Sprint 6）
-- 用途   : 订单原子抢单（防一单两抢）
--          对应 ACCEPTANCE V4.28 抢单不会一单被抢两次
-- 调用   : EVAL <script> 1 dispatch:grabbed:{orderNo} <riderId> <ttlSeconds>
--
-- KEYS[1] : dispatch:grabbed:{orderNo}  String   值=已抢到的 riderId（雪花字符串），TTL 由 ARGV[2] 控制
-- ARGV[1] : 当前请求的 riderId（雪花字符串）
-- ARGV[2] : Key TTL（秒）；订单从派出到结算约 1 小时，建议 3600
--
-- 返回值约定（Redis 整数）：
--   1 : 抢单成功（首次抢 / 同一骑手重复请求 → 幂等成功）
--   0 : 抢单失败（已被其他骑手抢占）
--
-- 设计要点：
--   * Redis EVAL 在 Lua 脚本内全部命令为单线程顺序执行，天然原子；
--   * GET + 判等 + SET 必须放进同一脚本以避免 check-then-act 竞态；
--   * 同一骑手二次调用返回 1（幂等）：避免网络重试 / 客户端重发误判为失败；
--   * 不在脚本内做"释放抢占"操作；如骑手中途取消由 Service 层显式 DEL Key。
-- ============================================================================

local existing = redis.call('GET', KEYS[1])
if existing then
  if existing == ARGV[1] then
    return 1
  end
  return 0
end

redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
