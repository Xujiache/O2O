import { defineConfig, devices } from '@playwright/test'

/**
 * O2O 管理后台 E2E 测试配置
 * 依据 TASK_P9 T9.3：10 个模块关键路径
 * 运行：npx playwright test
 *
 * Sprint 3（W3.E.1）追加 5 个独立 project：user / product / marketing / review / cs-risk
 *   - 各自独立 testMatch（fixture mock 后端，不挂 webServer）
 *   - 共用 Desktop Chrome 上下文
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: process.env.ADMIN_URL || 'http://localhost:3007',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    /* ===== Sprint 3 / W3.E.1 - 5 个 fixture-mock 模块 project ===== */
    {
      name: 'user',
      testMatch: /user\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'product',
      testMatch: /product\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'marketing',
      testMatch: /marketing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'review',
      testMatch: /review\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'cs-risk',
      testMatch: /cs-risk\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
