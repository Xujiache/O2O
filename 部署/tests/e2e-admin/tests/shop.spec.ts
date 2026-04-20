import { test, expect } from '@playwright/test'

/**
 * 管理后台 E2E — 店铺管理模块
 * 覆盖：列表、搜索、详情、审核
 */
test.describe('店铺管理', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shop')
  })

  test('店铺列表正确加载', async ({ page }) => {
    await expect(page.locator('.el-table, table')).toBeVisible({ timeout: 10_000 })
  })

  test('店铺搜索', async ({ page }) => {
    const input = page.locator('input[placeholder*="店铺"], input[placeholder*="搜索"]').first()
    await input.fill('测试店铺')
    await page.getByRole('button', { name: /搜索|查询/ }).first().click()
    await page.waitForTimeout(1000)
  })
})
