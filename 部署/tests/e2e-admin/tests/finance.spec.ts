import { test, expect } from '@playwright/test'

/**
 * 管理后台 E2E — 财务管理模块
 * 覆盖：财务概览、结算规则、对账
 */
test.describe('财务管理', () => {
  test('财务概览页加载', async ({ page }) => {
    await page.goto('/finance/overview')
    await expect(page.locator('.el-card, [class*="overview"]')).toBeVisible({ timeout: 10_000 })
  })

  test('结算规则页加载', async ({ page }) => {
    await page.goto('/finance/settlement')
    await expect(page.locator('.el-table, table, .el-card')).toBeVisible({ timeout: 10_000 })
  })

  test('对账页加载', async ({ page }) => {
    await page.goto('/finance/reconciliation')
    await expect(page.locator('.el-table, table, .el-card')).toBeVisible({ timeout: 10_000 })
  })
})
