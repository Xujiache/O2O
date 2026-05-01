import { test, expect } from '@playwright/test'
import { loginAs, mockBizApis } from '../../fixtures/auth'

/**
 * P9 Sprint 6 / W6.C.2（Agent C） - 权限 E2E：跨模块越权（cross-module）
 *
 * 6 个跨模块越权场景，验证"非该域角色试图操作该域资源"时
 * 全部被 v-biz-auth + BizTable 过滤兜底。
 *
 * 矩阵参考 PERM_AUDIT_V2 §3：
 *   1. finance 试访问 system → 系统按钮不可见
 *   2. cs 试访问 finance → 提现按钮不可见
 *   3. admin 试访问 finance → 提现按钮不可见（admin 不在 R_FINANCE）
 *   4. audit 试访问 cs-risk → 仲裁 / 风险订单不可见
 *   5. finance 试访问 user-biz → 封禁按钮不可见
 *   6. cs 试访问 merchant → 风控按钮不可见
 */

test.describe('权限 E2E - 跨模块越权', () => {
  test.beforeEach(async ({ page }) => {
    await mockBizApis(page)
  })

  /* 场景 1：finance → system */
  test('1. finance 越权访问 /biz/system/admin — 新增管理员按钮不可见', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto('/biz/system/admin').catch(() => {})
    const btn = page.getByRole('button', { name: /新增管理员/ })
    await expect(btn).toHaveCount(0)
  })

  test('1b. finance 越权访问 /biz/system/role — 新增角色按钮不可见', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto('/biz/system/role').catch(() => {})
    const btn = page.getByRole('button', { name: /新增角色/ })
    await expect(btn).toHaveCount(0)
  })

  /* 场景 2：cs → finance */
  test('2. cs 越权访问 /biz/finance/withdraw-audit — 确认驳回不可见', async ({ page }) => {
    await loginAs(page, 'cs')
    await page.goto('/biz/finance/withdraw-audit').catch(() => {})
    const btn = page.getByRole('button', { name: /^确认驳回$/ })
    await expect(btn).toHaveCount(0)
  })

  test('2b. cs 越权访问 /biz/finance — 批量通过 / 驳回不可见', async ({ page }) => {
    await loginAs(page, 'cs')
    await page.goto('/biz/finance/withdraw-audit').catch(() => {})
    const passBtn = page.getByRole('button', { name: /^批量通过$/ })
    const rejectBtn = page.getByRole('button', { name: /^批量驳回$/ })
    await expect(passBtn).toHaveCount(0)
    await expect(rejectBtn).toHaveCount(0)
  })

  /* 场景 3：admin → finance */
  test('3. admin 越权访问 /biz/finance/withdraw-audit — 提现批量按钮不可见', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/biz/finance/withdraw-audit').catch(() => {})
    const passBtn = page.getByRole('button', { name: /^批量通过$/ })
    const rejectBtn = page.getByRole('button', { name: /^批量驳回$/ })
    await expect(passBtn).toHaveCount(0)
    await expect(rejectBtn).toHaveCount(0)
  })

  /* 场景 4：audit → cs-risk */
  test('4. audit 越权访问 /biz/cs-risk/arbitration — 判定按钮不可见', async ({ page }) => {
    await loginAs(page, 'audit')
    await page.goto('/biz/cs-risk/arbitration').catch(() => {})
    const btn = page.getByRole('button', { name: /^判定确认$|^确认判定$/ })
    await expect(btn).toHaveCount(0)
  })

  test('4b. audit 越权访问 /biz/cs-risk/risk-order — 通过 / 拦截不可见', async ({ page }) => {
    await loginAs(page, 'audit')
    await page.goto('/biz/cs-risk/risk-order').catch(() => {})
    const passBtn = page.getByRole('button', { name: /^通过$/ })
    const blockBtn = page.getByRole('button', { name: /^拦截$/ })
    await expect(passBtn).toHaveCount(0)
    await expect(blockBtn).toHaveCount(0)
  })

  /* 场景 5：finance → user-biz */
  test('5. finance 越权访问 /biz/user/list — 封禁 / 批量封禁不可见', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto('/biz/user/list').catch(() => {})
    const banBtn = page.getByRole('button', { name: /^封禁$/ })
    const batchBtn = page.getByRole('button', { name: /^批量封禁$/ })
    await expect(banBtn).toHaveCount(0)
    await expect(batchBtn).toHaveCount(0)
  })

  /* 场景 6：cs → merchant */
  test('6. cs 越权访问 /biz/merchant/risk — 封禁 / 解封不可见', async ({ page }) => {
    await loginAs(page, 'cs')
    await page.goto('/biz/merchant/risk').catch(() => {})
    const banBtn = page.getByRole('button', { name: /^封禁$/ })
    const unbanBtn = page.getByRole('button', { name: /^解封$/ })
    await expect(banBtn).toHaveCount(0)
    await expect(unbanBtn).toHaveCount(0)
  })

  test('6b. cs 越权访问 /biz/merchant/audit — 驳回不可见', async ({ page }) => {
    await loginAs(page, 'cs')
    await page.goto('/biz/merchant/audit').catch(() => {})
    const btn = page.getByRole('button', { name: /^确认驳回$/ })
    await expect(btn).toHaveCount(0)
  })
})
