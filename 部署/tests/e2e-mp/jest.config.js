/**
 * Jest 配置 — e2e-mp
 * - 单 worker 串行（automator 端口独占）
 * - 测试超时 60s（启动 + 渲染较慢）
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.js'],
  testTimeout: 60_000,
  maxWorkers: 1,
  verbose: true
}
