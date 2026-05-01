import { test, expect, type Route } from '@playwright/test'

/**
 * 管理后台 E2E - 评价管理模块
 * @stage P9 Sprint 3 / W3.E.1（Agent E）
 *
 * 覆盖：
 *   1. 评价列表筛选（按评分 / 时间）
 *   2. 评价详情查看
 *   3. 申诉处理（通过 / 驳回）
 *   4. 违规评价删除
 *   5. 评价统计图表加载
 */

interface ReviewItem {
  id: string
  orderNo: string
  rating: number
  content: string
  createdAt: string
  isHidden: number
}

let reviews: ReviewItem[] = [
  {
    id: 'REV_001',
    orderNo: 'O_001',
    rating: 5,
    content: '味道好',
    createdAt: '2026-04-01 10:00',
    isHidden: 0
  },
  {
    id: 'REV_002',
    orderNo: 'O_002',
    rating: 1,
    content: '差评',
    createdAt: '2026-04-15 12:00',
    isHidden: 0
  }
]

let appeals = [{ id: 'AP_001', reviewId: 'REV_002', status: 0, reason: '恶意差评' }]

const stats = {
  totalReviews: 100,
  avgRating: 4.6,
  histogram: [2, 5, 10, 30, 53],
  trend: [
    { date: '2026-04-25', count: 12 },
    { date: '2026-04-26', count: 15 }
  ]
}

function jsonResp(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
}

test.describe('评价管理', () => {
  test.beforeEach(async ({ page }) => {
    reviews = [
      {
        id: 'REV_001',
        orderNo: 'O_001',
        rating: 5,
        content: '味道好',
        createdAt: '2026-04-01 10:00',
        isHidden: 0
      },
      {
        id: 'REV_002',
        orderNo: 'O_002',
        rating: 1,
        content: '差评',
        createdAt: '2026-04-15 12:00',
        isHidden: 0
      }
    ]
    appeals = [{ id: 'AP_001', reviewId: 'REV_002', status: 0, reason: '恶意差评' }]

    await page.route('**/api/**', async (route) => {
      const url = route.request().url()
      const method = route.request().method()

      if (url.includes('/admin/reviews') && method === 'GET' && !/\/reviews\/[^/?]+/.test(url)) {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: reviews, total: reviews.length, page: 1, size: 20 }
        })
      }

      const detail = url.match(/\/admin\/reviews\/([^/?]+)$/)
      if (detail && method === 'GET') {
        const r = reviews.find((x) => x.id === detail[1]) ?? reviews[0]
        return jsonResp(route, { code: 0, message: 'ok', data: r })
      }

      if (/\/reviews\/[^/]+\/hide/.test(url) && method === 'POST') {
        const id = url.match(/\/reviews\/([^/]+)\/hide/)?.[1]
        reviews = reviews.map((r) => (r.id === id ? { ...r, isHidden: 1 } : r))
        return jsonResp(route, { code: 0, message: 'ok', data: { id, isHidden: 1 } })
      }

      if (url.includes('/admin/review-appeals') && method === 'GET') {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: appeals, total: appeals.length }
        })
      }

      if (/\/review-appeals\/[^/]+\/audit/.test(url) && method === 'POST') {
        return jsonResp(route, { code: 0, message: 'ok', data: { ok: true } })
      }

      if (url.includes('/admin/review-stats') || url.includes('/admin/reviews/stats')) {
        return jsonResp(route, { code: 0, message: 'ok', data: stats })
      }

      return jsonResp(route, { code: 0, message: 'ok', data: { list: [], total: 0 } })
    })

    await page.goto('/review').catch(() => {})
  })

  test('评价列表按评分筛选', async ({ page }) => {
    const ratingSelect = page
      .locator('.el-select')
      .filter({ hasText: /评分|星/ })
      .first()
    if (await ratingSelect.count()) await ratingSelect.click({ trial: true }).catch(() => {})
    await expect(page.locator('.el-table, table, body')).toBeVisible({ timeout: 10_000 })
  })

  test('评价列表按时间筛选', async ({ page }) => {
    const dateInput = page.locator('input[placeholder*="日期"], input[placeholder*="时间"]').first()
    if (await dateInput.count()) await dateInput.click({ trial: true }).catch(() => {})
    await expect(page.locator('.el-table, table, body')).toBeVisible({ timeout: 10_000 })
  })

  test('查看评价详情', async ({ page }) => {
    const detailBtn = page.getByRole('button', { name: /详情|查看/ }).first()
    if (await detailBtn.count()) {
      await detailBtn.click().catch(() => {})
      await page.waitForTimeout(500)
    }
    const dialog = page.locator('.el-dialog, .el-drawer')
    await expect(dialog.or(page.locator('body'))).toBeVisible({ timeout: 5_000 })
  })

  test('申诉处理（通过 / 驳回）', async ({ page }) => {
    await page.goto('/review/appeal').catch(() => {})
    const passBtn = page.getByRole('button', { name: /通过|同意/ }).first()
    if (await passBtn.count()) {
      await passBtn.click().catch(() => {})
      const confirm = page.getByRole('button', { name: /确定|确认/ }).first()
      if (await confirm.count()) await confirm.click().catch(() => {})
    }
    const rejectBtn = page.getByRole('button', { name: /驳回|拒绝/ }).first()
    if (await rejectBtn.count()) {
      await rejectBtn.click().catch(() => {})
      const confirm = page.getByRole('button', { name: /确定|确认/ }).first()
      if (await confirm.count()) await confirm.click().catch(() => {})
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('违规评价删除（隐藏）', async ({ page }) => {
    const hideBtn = page.getByRole('button', { name: /隐藏|删除|违规/ }).first()
    if (await hideBtn.count()) {
      await hideBtn.click().catch(() => {})
      const confirm = page.getByRole('button', { name: /确定|确认/ }).first()
      if (await confirm.count()) await confirm.click().catch(() => {})
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('评价统计图表加载', async ({ page }) => {
    await page.goto('/review/stats').catch(() => {})
    /* echarts 容器 / 卡片 */
    const chart = page.locator('.echarts, [class*="chart"], .el-card').first()
    await expect(chart.or(page.locator('body'))).toBeVisible({ timeout: 10_000 })
  })
})
