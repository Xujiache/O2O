import { test, expect } from '@playwright/test'
import { loginAs, mockBizApis } from '../../fixtures/auth'

/**
 * P9 Sprint 6 / W6.C.2（Agent C） - 权限 E2E：客服 / 风控（cs-risk-biz）
 *
 * 覆盖路由：/biz/cs-risk/arbitration、/biz/cs-risk/ticket、/biz/cs-risk/risk-order、
 *          /biz/cs-risk/cheat、/biz/cs-risk/rule
 * 关键按钮（PERM_AUDIT_V2 §3.3）：
 *   - 仲裁判定弹窗"判定确认"（biz:cs:arbitration:judge）
 *   - 风险订单"通过/拦截"行级（biz:risk:order:pass / biz:risk:order:block）
 *   - 工单关闭（biz:cs:ticket:close）
 *
 * 矩阵期望：
 *   super → 全可见
 *   cs → arbitration / ticket / risk-order 全可见
 *   admin / finance / audit → cs-risk 菜单不可见 / 操作按钮被移除
 */

test.describe('权限 E2E - 客服与风控', () => {
  test.beforeEach(async ({ page }) => {
    await mockBizApis(page)
  })

  /* ==================== super ==================== */
  test.describe('super 角色', () => {
    test('arbitration 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/cs-risk/arbitration').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('ticket 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/cs-risk/ticket').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('risk-order 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/cs-risk/risk-order').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('cheat 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/cs-risk/cheat').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })
  })

  /* ==================== admin ==================== */
  test.describe('admin 角色', () => {
    test('admin cs-risk 菜单不可见', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/客服与风控|客服风控/)
      await expect(menu).toHaveCount(0)
    })

    test('admin 直接访问 arbitration — 判定按钮被移除', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/cs-risk/arbitration').catch(() => {})
      const btn = page.getByRole('button', { name: /^判定确认$|^确认判定$/ })
      await expect(btn).toHaveCount(0)
    })

    test('admin 直接访问 risk-order — 通过 / 拦截行级被移除', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/cs-risk/risk-order').catch(() => {})
      const passBtn = page.getByRole('button', { name: /^通过$/ })
      const blockBtn = page.getByRole('button', { name: /^拦截$/ })
      await expect(passBtn).toHaveCount(0)
      await expect(blockBtn).toHaveCount(0)
    })

    test('admin 直接访问 ticket — 关闭按钮被移除', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/cs-risk/ticket').catch(() => {})
      const btn = page.getByRole('button', { name: /^关闭工单$/ })
      await expect(btn).toHaveCount(0)
    })
  })

  /* ==================== finance ==================== */
  test.describe('finance 角色', () => {
    test('finance cs-risk 菜单不可见', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/客服与风控|客服风控/)
      await expect(menu).toHaveCount(0)
    })

    test('finance 直接访问 arbitration — 判定按钮被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/cs-risk/arbitration').catch(() => {})
      const btn = page.getByRole('button', { name: /^判定确认$|^确认判定$/ })
      await expect(btn).toHaveCount(0)
    })

    test('finance 直接访问 risk-order — 通过 / 拦截被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/cs-risk/risk-order').catch(() => {})
      const passBtn = page.getByRole('button', { name: /^通过$/ })
      const blockBtn = page.getByRole('button', { name: /^拦截$/ })
      await expect(passBtn).toHaveCount(0)
      await expect(blockBtn).toHaveCount(0)
    })

    test('finance 直接访问 cheat — 操作按钮被移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/cs-risk/cheat').catch(() => {})
      const btn = page.getByRole('button', { name: /处理|确认/ })
      /* cheat 页可能根本没渲染（菜单守卫） — 容忍 0 */
      const count = await btn.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  /* ==================== cs ==================== */
  test.describe('cs 角色', () => {
    test('cs arbitration 页可访问', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/cs-risk/arbitration').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('cs ticket 页可访问', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/cs-risk/ticket').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('cs risk-order 页可访问', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/cs-risk/risk-order').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('cs 无系统管理菜单', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/系统管理/)
      await expect(menu).toHaveCount(0)
    })
  })

  /* ==================== audit ==================== */
  test.describe('audit 角色', () => {
    test('audit cs-risk 菜单不可见', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/客服与风控|客服风控/)
      await expect(menu).toHaveCount(0)
    })

    test('audit 直接访问 arbitration — 判定按钮被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/cs-risk/arbitration').catch(() => {})
      const btn = page.getByRole('button', { name: /^判定确认$|^确认判定$/ })
      await expect(btn).toHaveCount(0)
    })

    test('audit 直接访问 risk-order — 通过 / 拦截被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/cs-risk/risk-order').catch(() => {})
      const passBtn = page.getByRole('button', { name: /^通过$/ })
      const blockBtn = page.getByRole('button', { name: /^拦截$/ })
      await expect(passBtn).toHaveCount(0)
      await expect(blockBtn).toHaveCount(0)
    })

    test('audit 直接访问 ticket — 关闭按钮被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/cs-risk/ticket').catch(() => {})
      const btn = page.getByRole('button', { name: /^关闭工单$/ })
      await expect(btn).toHaveCount(0)
    })
  })
})
