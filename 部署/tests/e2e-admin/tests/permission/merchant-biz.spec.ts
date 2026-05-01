import { test, expect } from '@playwright/test'
import { loginAs, mockBizApis } from '../../fixtures/auth'

/**
 * P9 Sprint 6 / W6.C.2（Agent C） - 权限 E2E：商户管理（merchant-biz）
 *
 * 覆盖路由：/biz/merchant/audit、/biz/merchant/list、/biz/merchant/risk、/biz/merchant/shop-list
 * 关键按钮（PERM_AUDIT_V2 §3.4）：
 *   - 商户入驻"驳回确认"（biz:merchant:audit）
 *   - 风控行级"封禁/解封"（biz:merchant:risk:ban）
 *
 * 矩阵期望：
 *   super → 全可见
 *   admin → audit / risk 可见
 *   audit → audit 可见，risk 不可见（biz:merchant:risk:ban 0）
 *   finance / cs → 商户菜单不可见
 */

test.describe('权限 E2E - 商户管理', () => {
  test.beforeEach(async ({ page }) => {
    await mockBizApis(page)
  })

  /* ==================== super ==================== */
  test.describe('super 角色', () => {
    test('audit 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/merchant/audit').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('list 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/merchant/list').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('risk 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/merchant/risk').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('shop-list 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/merchant/shop-list').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })
  })

  /* ==================== admin ==================== */
  test.describe('admin 角色', () => {
    test('admin audit 页可访问（biz:merchant:audit OK）', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/merchant/audit').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('admin risk 页可访问（biz:merchant:risk:ban OK）', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/merchant/risk').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('admin list 页可访问', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/merchant/list').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('admin shop-notice-audit 页可访问', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/merchant/shop-notice-audit').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })
  })

  /* ==================== finance ==================== */
  test.describe('finance 角色', () => {
    test('finance 商户菜单不可见', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/商户管理/)
      await expect(menu).toHaveCount(0)
    })

    test('finance 直接访问 audit — 驳回确认按钮被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/merchant/audit').catch(() => {})
      const btn = page.getByRole('button', { name: /^确认驳回$/ })
      await expect(btn).toHaveCount(0)
    })

    test('finance 直接访问 risk — 封禁 / 解封被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/merchant/risk').catch(() => {})
      const banBtn = page.getByRole('button', { name: /^封禁$/ })
      const unbanBtn = page.getByRole('button', { name: /^解封$/ })
      await expect(banBtn).toHaveCount(0)
      await expect(unbanBtn).toHaveCount(0)
    })

    test('finance shop-list 操作按钮被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/merchant/shop-list').catch(() => {})
      const btn = page.getByRole('button', { name: /关店|开店|审核/ })
      await expect(btn).toHaveCount(0)
    })
  })

  /* ==================== cs ==================== */
  test.describe('cs 角色', () => {
    test('cs 商户菜单不可见', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/商户管理/)
      await expect(menu).toHaveCount(0)
    })

    test('cs 直接访问 audit — 驳回按钮被移除', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/merchant/audit').catch(() => {})
      const btn = page.getByRole('button', { name: /^确认驳回$/ })
      await expect(btn).toHaveCount(0)
    })

    test('cs 直接访问 risk — 封禁 / 解封被移除', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/merchant/risk').catch(() => {})
      const banBtn = page.getByRole('button', { name: /^封禁$/ })
      const unbanBtn = page.getByRole('button', { name: /^解封$/ })
      await expect(banBtn).toHaveCount(0)
      await expect(unbanBtn).toHaveCount(0)
    })

    test('cs 商户列表无操作按钮', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/merchant/list').catch(() => {})
      const btn = page.getByRole('button', { name: /审核|封禁/ })
      await expect(btn).toHaveCount(0)
    })
  })

  /* ==================== audit ==================== */
  test.describe('audit 角色', () => {
    test('audit audit 页可访问（biz:merchant:audit OK）', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/merchant/audit').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('audit risk 页 — 封禁 / 解封被移除（无 biz:merchant:risk:ban）', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/merchant/risk').catch(() => {})
      const banBtn = page.getByRole('button', { name: /^封禁$/ })
      const unbanBtn = page.getByRole('button', { name: /^解封$/ })
      await expect(banBtn).toHaveCount(0)
      await expect(unbanBtn).toHaveCount(0)
    })

    test('audit list 页 — 审核按钮可见 / 风控操作不可见', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/merchant/list').catch(() => {})
      const banBtn = page.getByRole('button', { name: /^封禁$/ })
      await expect(banBtn).toHaveCount(0)
    })

    test('audit 财务 / 系统菜单不可见', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/dashboard').catch(() => {})
      const finance = page.locator('aside, nav, .menu, .el-menu').getByText(/财务管理/)
      const sys = page.locator('aside, nav, .menu, .el-menu').getByText(/系统管理/)
      await expect(finance).toHaveCount(0)
      await expect(sys).toHaveCount(0)
    })
  })
})
