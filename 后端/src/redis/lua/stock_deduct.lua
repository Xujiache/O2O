-- ============================================================================
-- 文件名 : stock_deduct.lua
-- 阶段   : P4/T4.6（Sprint 1）
-- 用途   : 库存原子扣减（下单阶段调用）；保证在并发下不超卖
-- 调用   : EVAL <script> 1 stock:sku:{skuId} <qty>
--
-- KEYS[1] : Redis 库存 Key（如 stock:sku:1893749381234567）
-- ARGV[1] : 待扣减数量（正整数字符串，业务侧保证 >0）
--
-- 返回值约定：
--   -2  : Key 未初始化（GET 返回 nil）；业务侧应从 DB 回写后重试
--   -1  : 当前值为 -1（无限库存）；业务侧应跳过 Redis 扣减，直接走 DB
--   -3  : 库存不足（current < qty）；业务侧应返回"库存不足"错误
--   >=0 : 扣减后的剩余余量
--
-- 设计要点：
--   * Redis 的 EVAL 在 Lua 脚本内全部命令为单线程顺序执行，天然原子；
--   * DECRBY 在 Redis 中本就是原子，但 GET + 业务判断 + DECRBY 这三步
--     必须放进同一脚本以避免 check-then-act 竞态；
--   * 不在脚本内做 SET 兜底：DB 回写策略由 Node 侧 InventoryService.preloadStock 控制，
--     避免脚本侧承担"读 DB → 写 Redis"的越权语义。
-- ============================================================================

local stock = redis.call('GET', KEYS[1])
if stock == false then
  return -2
end

local current = tonumber(stock)
if current == -1 then
  return -1
end

local qty = tonumber(ARGV[1])
if current < qty then
  return -3
end

return redis.call('DECRBY', KEYS[1], qty)
