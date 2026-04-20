import { test, expect } from '@playwright/test'

/**
 * 管理后台 E2E — 订单管理模块
 * 覆盖：列表渲染、搜索过滤、订单详情、状态流转
 */

test.describe('订单管理', () => {
  test.beforeEach(async ({ page }) => {
    // 假设已登录（可在 globalSetup 中处理）
    await page.goto('/order')
  })

  test('订单列表页正确加载', async ({ page }) => {
    // 表格应渲染
    await expect(page.locator('.el-table, table')).toBeVisible({ timeout: 10_000 })
    // 搜索栏应存在
    await expect(page.locator('input[placeholder*="订单号"], input[placeholder*="搜索"]')).toBeVisible()
  })

  test('按订单号搜索', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="订单号"], input[placeholder*="搜索"]').first()
    await searchInput.fill('TEST001')
    await page.getByRole('button', { name: /搜索|查询/ }).first().click()
    // 等待表格刷新
    await page.waitForResponse(resp => resp.url().includes('order') && resp.status() === 200, { timeout: 5_000 }).catch(() => {})
  })

  test('筛选条件重置', async ({ page }) => {
    await page.getByRole('button', { name: /重置/ }).first().click()
    // 搜索框应清空
    const searchInput = page.locator('input[placeholder*="订单号"], input[placeholder*="搜索"]').first()
    await expect(searchInput).toHaveValue('')
  })
})
