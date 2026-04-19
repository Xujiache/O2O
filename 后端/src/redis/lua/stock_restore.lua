-- ============================================================================
-- 文件名 : stock_restore.lua
-- 阶段   : P4/T4.6（Sprint 1）
-- 用途   : 库存原子恢复（取消订单 / 退款 / 扣减失败回滚时调用）
-- 调用   : EVAL <script> 1 stock:sku:{skuId} <qty>
--
-- KEYS[1] : Redis 库存 Key
-- ARGV[1] : 待恢复数量（正整数字符串，业务侧保证 >0）
--
-- 返回值约定：
--   -2  : Key 未初始化；业务侧应从 DB 回写后重试
--   -1  : 当前值为 -1（无限库存）；业务侧忽略
--   >=0 : 恢复后的新余量
--
-- 设计要点：
--   * 与 stock_deduct.lua 对称，同一份"GET → tonumber → 行为"模式；
--   * 不做"恢复后不超过 stock_qty 上限"的限制：取消/退款时上层已保证幂等，
--     超量恢复在业务侧由 OrderStatusLog + Idempotency Key 防御。
-- ============================================================================

local stock = redis.call('GET', KEYS[1])
if stock == false then
  return -2
end

local current = tonumber(stock)
if current == -1 then
  return -1
end

return redis.call('INCRBY', KEYS[1], ARGV[1])
