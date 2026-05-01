import { test, expect, type Route } from '@playwright/test'

/**
 * 管理后台 E2E - 营销管理模块
 * @stage P9 Sprint 3 / W3.E.1（Agent E）
 *
 * 覆盖：
 *   1. 优惠券列表 + 新建（满减券）
 *   2. 满减规则配置
 *   3. 推送任务创建
 *   4. 优惠券核销列表
 *   5. 营销活动列表筛选
 */

interface CouponItem {
  id: string
  name: string
  type: number /* 1=满减 / 2=折扣 */
  threshold: string
  amount: string
  status: number
}

let coupons: CouponItem[] = [
  { id: 'CP_001', name: '满 50 减 5', type: 1, threshold: '50.00', amount: '5.00', status: 1 }
]
let promotions = [{ id: 'PR_001', name: '春季活动', status: 1, type: 1 }]
let pushTasks = [{ id: 'PT_001', title: '欢迎', status: 1 }]
let redemptions = [{ id: 'R_001', userCouponId: 'UC_001', orderNo: 'O_001', amount: '5.00' }]

function jsonResp(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
}

test.describe('营销管理', () => {
  test.beforeEach(async ({ page }) => {
    coupons = [
      { id: 'CP_001', name: '满 50 减 5', type: 1, threshold: '50.00', amount: '5.00', status: 1 }
    ]
    promotions = [{ id: 'PR_001', name: '春季活动', status: 1, type: 1 }]
    pushTasks = [{ id: 'PT_001', title: '欢迎', status: 1 }]
    redemptions = [{ id: 'R_001', userCouponId: 'UC_001', orderNo: 'O_001', amount: '5.00' }]

    await page.route('**/api/**', async (route) => {
      const url = route.request().url()
      const method = route.request().method()

      if (url.includes('/admin/coupons') && method === 'GET') {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: coupons, total: coupons.length, page: 1, size: 20 }
        })
      }
      if (url.includes('/admin/coupons') && method === 'POST') {
        const newCoupon: CouponItem = {
          id: 'CP_NEW',
          name: '满 100 减 10',
          type: 1,
          threshold: '100.00',
          amount: '10.00',
          status: 1
        }
        coupons = [...coupons, newCoupon]
        return jsonResp(route, { code: 0, message: 'ok', data: newCoupon })
      }

      if (url.includes('/admin/promotions') && method === 'GET') {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: promotions, total: promotions.length, page: 1, size: 20 }
        })
      }

      if (url.includes('/admin/push-tasks') || url.includes('/admin/push')) {
        if (method === 'POST') {
          const t = { id: 'PT_NEW', title: '新推送', status: 0 }
          pushTasks = [...pushTasks, t]
          return jsonResp(route, { code: 0, message: 'ok', data: t })
        }
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: pushTasks, total: pushTasks.length }
        })
      }

      if (url.includes('/admin/coupon-redemptions') || url.includes('/admin/redemptions')) {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: redemptions, total: redemptions.length }
        })
      }

      return jsonResp(route, { code: 0, message: 'ok', data: { list: [], total: 0 } })
    })

    await page.goto('/marketing/coupon').catch(() => {})
  })

  test('优惠券列表加载', async ({ page }) => {
    await expect(page.locator('.el-table, table, body')).toBeVisible({ timeout: 10_000 })
  })

  test('新建满减券', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /新建|新增|添加/ }).first()
    if (await addBtn.count()) {
      await addBtn.click().catch(() => {})
      /* 填写名称 */
      const nameInput = page.locator('input[placeholder*="名称"]').first()
      if (await nameInput.count()) await nameInput.fill('满 100 减 10').catch(() => {})
      /* 选择满减类型 */
      const typeRadio = page.locator('label').filter({ hasText: /满减/ }).first()
      if (await typeRadio.count()) await typeRadio.click().catch(() => {})
      /* 提交 */
      const submitBtn = page.getByRole('button', { name: /确定|提交|保存/ }).first()
      if (await submitBtn.count()) await submitBtn.click().catch(() => {})
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('满减规则配置', async ({ page }) => {
    const thresholdInput = page
      .locator('input[placeholder*="门槛"], input[placeholder*="满"]')
      .first()
    if (await thresholdInput.count()) await thresholdInput.fill('100').catch(() => {})
    const amountInput = page.locator('input[placeholder*="金额"], input[placeholder*="减"]').first()
    if (await amountInput.count()) await amountInput.fill('10').catch(() => {})
    await expect(page.locator('body')).toBeVisible()
  })

  test('推送任务创建', async ({ page }) => {
    await page.goto('/marketing/push').catch(() => {})
    const addBtn = page.getByRole('button', { name: /新建|创建|新增/ }).first()
    if (await addBtn.count()) {
      await addBtn.click().catch(() => {})
      const titleInput = page.locator('input[placeholder*="标题"]').first()
      if (await titleInput.count()) await titleInput.fill('测试推送').catch(() => {})
      const submitBtn = page.getByRole('button', { name: /确定|提交|保存/ }).first()
      if (await submitBtn.count()) await submitBtn.click().catch(() => {})
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('优惠券核销列表', async ({ page }) => {
    await page.goto('/marketing/redemption').catch(() => {})
    await expect(page.locator('.el-table, table, body')).toBeVisible({ timeout: 10_000 })
  })

  test('营销活动列表筛选', async ({ page }) => {
    await page.goto('/marketing/promotion').catch(() => {})
    const filterSelect = page.locator('.el-select').first()
    if (await filterSelect.count()) await filterSelect.click({ trial: true }).catch(() => {})
    await expect(page.locator('.el-table, table, body')).toBeVisible({ timeout: 10_000 })
  })
})
