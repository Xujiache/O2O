/**
 * @file jest-integration.config.js
 * @stage P9 Sprint 2 / T9.2（Agent E）
 * @desc 后端集成测试 Jest 配置（Supertest + 控制器级 e2e）
 *
 * 设计：
 *   - 与单测分离：单测在 src/**\/*.spec.ts，集成测试在 test/integration/**\/*.e2e-spec.ts
 *   - 全部依赖（Repository / Redis / Bull / 第三方 SDK）以 useValue mock 注入，不依赖真 Docker
 *   - 复用既有 setup helper（test/integration/setup.ts）暴露 buildTestApp / makeFakeRepo
 *
 * 用法：
 *   - 顶层（待 A 在 package.json 追加 script 后）：pnpm --filter 后端 test:integration
 *   - 当前手动：cd 后端 && pnpm exec jest --config jest-integration.config.js
 *
 * 注意：
 *   - 与 P4 既有 test/integration/jest-integration.config.json 互不影响
 *     （那份是 P4 takeout-flow / errand-flow 的同源配置，本配置 testRegex 覆盖整个 test/integration/*.e2e-spec.ts）
 *   - rootDir = 后端/；模块路径 @/* 解析到 后端/src/*
 */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/integration/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 30000,
  /* JUnit 输出（CI 收集；reporter 缺失时安静降级） */
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results/integration',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ]
  ].filter((r) => {
    if (typeof r === 'string') return true
    try {
      require.resolve(r[0])
      return true
    } catch {
      return false
    }
  })
}
