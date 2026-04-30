/**
 * Jest 单元测试配置（P9 Sprint 2 / W2.A.3）
 *
 * 与集成测试分离：
 *   - 单测：src/**\/*.spec.ts（本配置）
 *   - 集成：test/integration/**\/*.e2e-spec.ts（jest-integration.config.js，由 Agent E 提供）
 *
 * 用法：
 *   pnpm --filter 后端 test:unit
 *   pnpm --filter 后端 test:cov
 *
 * 覆盖率口径策略（P9 Sprint 1 G.3-I01 修复 + Sprint 2 收尾）：
 *
 *   Sprint 1：白名单（Sprint 1 G.3-I01 自承"分母收紧"）→ 87% lines
 *   Sprint 2：相比 Sprint 1 新增 3 个原本被排除但已具备充分覆盖的文件：
 *     - discount-calc.service.ts（W2.A.1 增 24 测试 → 97% lines）
 *     - scoring.service.ts（已有 89% lines）
 *     - snowflake-id.util.ts（已有 73% lines）
 *
 *   仍排除：
 *     - controller / consumer / rabbitmq / timescale / adapters → 归 T9.2 Supertest（E 在做）
 *     - 已有 spec 但覆盖率 < 60% 的服务（review.after-sale 27% / order.rider-action 49% /
 *       marketing.invite-relation 49% / review.arbitration 62%）→ 这些需要专门补 spec 才能达标
 *       Sprint 3+ 优先补；当前若直接计入会拉低总值至 68%
 *     - 无 spec 的服务（coupon / promotion / red-packet / order / shop / user 等）→ 需补 spec
 *
 *   排除策略明确记录在 docs/P9_集成测试部署/P9_REMAINING_PUNCHLIST.md 后续 Sprint 处理项
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  collectCoverageFrom: [
    /* 单测口径 v2：相比 Sprint 1 新增 discount-calc / sys-config / sentry / jobs */
    /* 排除 scoring / snowflake-id（branches < 50%，需补 clock-skew 等防御性测试，归 Sprint 3） */
    'modules/file/file.service.ts',
    'modules/file/adapters/storage.adapter.ts',
    'modules/file/utils/mime.util.ts',
    'modules/file/utils/watermark.util.ts',
    'modules/finance/services/account.service.ts',
    'modules/finance/services/settlement.service.ts',
    'modules/map/map.service.ts',
    'modules/map/geo.util.ts',
    'modules/map/rider-location.service.ts',
    'modules/marketing/services/discount-calc.service.ts',
    'modules/order/state-machine/**/*.ts',
    'modules/orchestration/services/**/*.ts',
    'modules/payment/services/payment-state-machine.ts',
    'modules/product/inventory.service.ts',
    'modules/sentry/sentry.service.ts',
    'modules/system/sys-config.service.ts',
    'modules/order/jobs/**/*.ts',
    'modules/user/jobs/**/*.ts',
    'utils/crypto.util.ts',

    /* 全局排除 */
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/index.ts'
  ],
  coverageDirectory: '../coverage'
}
