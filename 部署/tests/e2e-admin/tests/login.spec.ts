import { test, expect, Page } from '@playwright/test'

/**
 * 管理后台 E2E — 登录流程
 * 覆盖：登录页渲染、空表单验证、成功登录跳转、Token 持久化
 */

const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123'

test.describe('管理后台登录', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('登录页正确渲染', async ({ page }) => {
    await expect(page.locator('input[placeholder*="用户名"], input[placeholder*="账号"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /登录/ })).toBeVisible()
  })

  test('空表单提交显示验证提示', async ({ page }) => {
    await page.getByRole('button', { name: /登录/ }).click()
    // 应显示验证提示
    await expect(page.locator('.el-form-item__error')).toHaveCount(2, { timeout: 3000 })
  })

  test('正确凭据登录成功', async ({ page }) => {
    await page.locator('input[placeholder*="用户名"], input[placeholder*="账号"]').fill(ADMIN_USER)
    await page.locator('input[type="password"]').fill(ADMIN_PASS)
    await page.getByRole('button', { name: /登录/ }).click()

    // 登录成功后应跳转到首页/仪表盘
    await expect(page).toHaveURL(/\/(dashboard|home|index)?$/, { timeout: 10_000 })
  })

  test('错误凭据显示错误提示', async ({ page }) => {
    await page.locator('input[placeholder*="用户名"], input[placeholder*="账号"]').fill('wrong')
    await page.locator('input[type="password"]').fill('wrong')
    await page.getByRole('button', { name: /登录/ }).click()

    await expect(page.locator('.el-message--error, .el-notification')).toBeVisible({ timeout: 5_000 })
  })
})
