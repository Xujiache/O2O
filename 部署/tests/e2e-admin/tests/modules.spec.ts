import { test, expect } from '@playwright/test'

/**
 * 管理后台 E2E — 营销管理模块
 * 覆盖：优惠券列表、活动列表
 */
test.describe('营销管理', () => {
  test('优惠券列表页加载', async ({ page }) => {
    await page.goto('/marketing/coupon')
    await expect(page.locator('.el-table, table')).toBeVisible({ timeout: 10_000 })
  })

  test('活动列表页加载', async ({ page }) => {
    await page.goto('/marketing/promotion')
    await expect(page.locator('.el-table, table, .el-card')).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * 管理后台 E2E — 评价管理模块
 */
test.describe('评价管理', () => {
  test('评价列表页加载', async ({ page }) => {
    await page.goto('/review')
    await expect(page.locator('.el-table, table')).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * 管理后台 E2E — 配送管理模块
 */
test.describe('配送管理', () => {
  test('配送列表页加载', async ({ page }) => {
    await page.goto('/dispatch')
    await expect(page.locator('.el-table, table, .el-card')).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * 管理后台 E2E — 商品管理模块
 */
test.describe('商品管理', () => {
  test('商品列表页加载', async ({ page }) => {
    await page.goto('/product')
    await expect(page.locator('.el-table, table')).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * 管理后台 E2E — 用户管理模块
 */
test.describe('用户管理', () => {
  test('用户列表页加载', async ({ page }) => {
    await page.goto('/user')
    await expect(page.locator('.el-table, table')).toBeVisible({ timeout: 10_000 })
  })
})

/**
 * 管理后台 E2E — 系统设置模块
 */
test.describe('系统设置', () => {
  test('系统配置页加载', async ({ page }) => {
    await page.goto('/system')
    await expect(page.locator('.el-form, .el-card, .el-table')).toBeVisible({ timeout: 10_000 })
  })
})
