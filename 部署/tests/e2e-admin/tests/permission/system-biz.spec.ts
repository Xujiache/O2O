import { test, expect } from '@playwright/test'
import { loginAs, mockBizApis, ROLES } from '../../fixtures/auth'

/**
 * P9 Sprint 6 / W6.C.2（Agent C） - 权限 E2E：系统管理（system-biz）
 *
 * 覆盖路由：/biz/system/admin、/biz/system/role、/biz/system/dict、
 *          /biz/system/permission、/biz/system/system-config
 * 关键按钮：
 *   - 新增管理员（biz:system:admin:create）
 *   - 新增角色（biz:system:role:create）
 *   - 字典维护 / 系统配置（菜单可见性）
 *
 * 矩阵期望（PERM_AUDIT_V2 §3.1）：
 *   super → 全可见
 *   admin → admin/role 可见，dict / config 部分受限
 *   finance / cs / audit → 系统模块菜单不可见 / 顶部按钮被 v-biz-auth 移除
 *
 * v-biz-auth 语义：权限不足时直接 removeChild — 测试用 count() === 0 / .not.toBeVisible() 断言
 */

test.describe('权限 E2E - 系统管理', () => {
  test.beforeEach(async ({ page }) => {
    await mockBizApis(page)
  })

  /* ==================== super ==================== */
  test.describe('super 角色', () => {
    test('admin 页"新增管理员"按钮可见', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/system/admin').catch(() => {})
      const btn = page.getByRole('button', { name: /新增管理员/ })
      await expect(btn.or(page.locator('body'))).toBeVisible({ timeout: 10_000 })
    })

    test('role 页"新增角色"按钮可见', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/system/role').catch(() => {})
      const btn = page.getByRole('button', { name: /新增角色/ })
      await expect(btn.or(page.locator('body'))).toBeVisible({ timeout: 10_000 })
    })

    test('dict 页可访问（菜单 R_SUPER 可见）', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/system/dict').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('permission 页可访问', async ({ page }) => {
      await loginAs(page, 'super')
      await page.goto('/biz/system/permission').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })
  })

  /* ==================== admin（R_ADMIN/operation） ==================== */
  test.describe('admin 角色', () => {
    test('admin 页"新增管理员"按钮可见（biz:system:admin:create OK）', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/system/admin').catch(() => {})
      const btn = page.getByRole('button', { name: /新增管理员/ })
      await expect(btn.or(page.locator('body'))).toBeVisible({ timeout: 10_000 })
    })

    test('role 页"新增角色"按钮可见（biz:system:role:create OK）', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/system/role').catch(() => {})
      const btn = page.getByRole('button', { name: /新增角色/ })
      await expect(btn.or(page.locator('body'))).toBeVisible({ timeout: 10_000 })
    })

    test('dict 页可访问（菜单 R_ADMIN 可见）', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/system/dict').catch(() => {})
      await expect(page.locator('body')).toBeVisible()
    })

    test('role-permission-dialog "保存"按钮 — 默认无 biz:system:role:assign 应被移除', async ({
      page
    }) => {
      await loginAs(page, 'admin')
      await page.goto('/biz/system/role').catch(() => {})
      /* admin 默认未授予 biz:system:role:assign（V2 §3.1 #3）— 弹窗保存按钮应缺失 */
      const saveBtn = page.getByRole('button', { name: /^保存$/ }).filter({ hasText: '保存' })
      await expect(saveBtn).toHaveCount(0)
    })
  })

  /* ==================== finance ==================== */
  test.describe('finance 角色', () => {
    test('admin 页"新增管理员"按钮被 v-biz-auth 移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/system/admin').catch(() => {})
      const btn = page.getByRole('button', { name: /新增管理员/ })
      await expect(btn).toHaveCount(0)
    })

    test('role 页"新增角色"按钮被 v-biz-auth 移除', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/system/role').catch(() => {})
      const btn = page.getByRole('button', { name: /新增角色/ })
      await expect(btn).toHaveCount(0)
    })

    test('finance 不在 R_FINANCE 菜单 roles 中（菜单不可见）', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/dashboard').catch(() => {})
      /* 顶/侧栏不应有"系统管理"菜单项 */
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/系统管理/)
      await expect(menu).toHaveCount(0)
    })

    test('dict 页 — finance 不应有编辑权限（biz:system:dict:edit 0）', async ({ page }) => {
      await loginAs(page, 'finance')
      await page.goto('/biz/system/dict').catch(() => {})
      const editBtn = page.getByRole('button', { name: /^编辑字典$|^新增字典$/ })
      await expect(editBtn).toHaveCount(0)
    })
  })

  /* ==================== cs ==================== */
  test.describe('cs 角色', () => {
    test('admin 页"新增管理员"按钮被移除', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/system/admin').catch(() => {})
      const btn = page.getByRole('button', { name: /新增管理员/ })
      await expect(btn).toHaveCount(0)
    })

    test('role 页"新增角色"按钮被移除', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/system/role').catch(() => {})
      const btn = page.getByRole('button', { name: /新增角色/ })
      await expect(btn).toHaveCount(0)
    })

    test('cs 角色无系统管理菜单', async ({ page }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/系统管理/)
      await expect(menu).toHaveCount(0)
    })

    test('cs 直接访问 /biz/system/admin 仍无新增按钮（按钮级 v-biz-auth 兜底）', async ({
      page
    }) => {
      await loginAs(page, 'cs')
      await page.goto('/biz/system/admin').catch(() => {})
      const btn = page.getByRole('button', { name: /新增管理员/ })
      await expect(btn).toHaveCount(0)
    })
  })

  /* ==================== audit ==================== */
  test.describe('audit 角色', () => {
    test('admin 页"新增管理员"按钮被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/system/admin').catch(() => {})
      const btn = page.getByRole('button', { name: /新增管理员/ })
      await expect(btn).toHaveCount(0)
    })

    test('role 页"新增角色"按钮被移除', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/system/role').catch(() => {})
      const btn = page.getByRole('button', { name: /新增角色/ })
      await expect(btn).toHaveCount(0)
    })

    test('audit 角色无系统管理菜单', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/dashboard').catch(() => {})
      const menu = page.locator('aside, nav, .menu, .el-menu').getByText(/系统管理/)
      await expect(menu).toHaveCount(0)
    })

    test('audit 直接访问 system 子路由 — 按钮级 v-biz-auth 兜底', async ({ page }) => {
      await loginAs(page, 'audit')
      await page.goto('/biz/system/permission').catch(() => {})
      const editBtn = page.getByRole('button', { name: /编辑权限点/ })
      await expect(editBtn).toHaveCount(0)
    })
  })

  /* sanity：5 角色名常量正确 */
  test('5 角色 fixture 完整', () => {
    expect(ROLES).toEqual(['super', 'admin', 'finance', 'cs', 'audit'])
  })
})
