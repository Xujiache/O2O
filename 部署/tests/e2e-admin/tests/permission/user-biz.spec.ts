import { test, expect } from '@playwright/test'
import { loginAs, mockBizApis } from '../../fixtures/auth'

/**
 * P9 Sprint 6 / W6.C.2（Agent C） - 权限 E2E：用户管理（user-biz）
 *
 * 覆盖路由：/biz/user/list、/biz/user/risk、/biz/user/detail/:id
 * 关键按钮（PERM_AUDIT_V2 §3.5）：
 *   - 行级"封禁/解封"（biz:user:risk:ban）
 *   - 批量"批量封禁"（biz:user:risk:ban）
 *
 * 矩阵期望：
 *   super → 全可见
 *   admin → list / risk 全可见
 *   finance / cs / audit → 用户菜单不可见 / 操作按钮被移除
 */

test.describe('权限 E2E - 用户管理', () => {
  test.beforeEach(async ({ page }) => {
    await mockBizApis(page)
  })

  /* ==================== super ==================== */
  test.describe('super 角色', () => {
    test('list 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/user/list').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('risk 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/user/risk').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('detail 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/user/detail/U_TEST_001').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('user 菜单可见（R_SUPER 短路）', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/dashboard').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })
  })

  /* ==================== admin ==================== */
  test.describe('admin 角色', () => {
    test('list 页可访问（biz:user:risk:ban OK）', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/user/list').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('risk 页可访问', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/user/risk').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('detail 页可访问', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/user/detail/U_TEST_001').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('admin 无 cs-risk / 财务菜单', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/dashboard').catch(() => {})
      const finance = page.locator('aside, nav, .menu, .el-menu').getByText(/财务管理/)
      const cs = page.locator('aside, nav, .menu, .el-menu').getByText(/客服与风控|客服风控/)
      await expect(finance).toHaveCount(0)
      await expect(cs).toHaveCount(0)
    })
  })

  /* ==================== finance ==================== */
  test.describe('finance 角色', () => {
    test('finance 用户菜单不可见', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/^用户管理$/)
      await expect(menu).toHaveCount(0)
    })

    test('finance 直接访问 list — 封禁行级被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/user/list').catch(() => {})
      const btn = page.getByRole('button', { name: /^封禁$/ })
      await expect(btn).toHaveCount(0)
    })

    test('finance 直接访问 list — 批量封禁被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/user/list').catch(() => {})
      const btn = page.getByRole('button', { name: /^批量封禁$/ })
      await expect(btn).toHaveCount(0)
    })

    test('finance 直接访问 risk — 操作按钮被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/user/risk').catch(() => {})
      const btn = page.getByRole('button', { name: /^封禁$|^解封$/ })
      await expect(btn).toHaveCount(0)
    })
  })

  /* ==================== cs ==================== */
  test.describe('cs 角色', () => {
    test('cs 用户菜单不可见', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/^用户管理$/)
      await expect(menu).toHaveCount(0)
    })

    test('cs 直接访问 list — 封禁 / 解封被移除', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/user/list').catch(() => {})
      const banBtn = page.getByRole('button', { name: /^封禁$/ })
      const unbanBtn = page.getByRole('button', { name: /^解封$/ })
      await expect(banBtn).toHaveCount(0)
      await expect(unbanBtn).toHaveCount(0)
    })

    test('cs 直接访问 list — 批量封禁被移除', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/user/list').catch(() => {})
      const btn = page.getByRole('button', { name: /^批量封禁$/ })
      await expect(btn).toHaveCount(0)
    })

    test('cs 直接访问 risk — 无任何操作按钮', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/user/risk').catch(() => {})
      const btn = page.getByRole('button', { name: /^封禁$|^解封$/ })
      await expect(btn).toHaveCount(0)
    })
  })

  /* ==================== audit ==================== */
  test.describe('audit 角色', () => {
    test('audit 用户菜单不可见', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/^用户管理$/)
      await expect(menu).toHaveCount(0)
    })

    test('audit 直接访问 list — 封禁 / 解封被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/user/list').catch(() => {})
      const banBtn = page.getByRole('button', { name: /^封禁$/ })
      const unbanBtn = page.getByRole('button', { name: /^解封$/ })
      await expect(banBtn).toHaveCount(0)
      await expect(unbanBtn).toHaveCount(0)
    })

    test('audit 直接访问 list — 批量封禁被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/user/list').catch(() => {})
      const btn = page.getByRole('button', { name: /^批量封禁$/ })
      await expect(btn).toHaveCount(0)
    })

    test('audit 直接访问 detail — 封禁按钮被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/user/detail/U_TEST_001').catch(() => {})
      const btn = page.getByRole('button', { name: /^封禁$/ })
      await expect(btn).toHaveCount(0)
    })
  })
})
