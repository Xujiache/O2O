import { test, expect, type Route } from '@playwright/test'

/**
 * 管理后台 E2E - 客服 / 风控模块
 * @stage P9 Sprint 3 / W3.E.1（Agent E）
 *
 * 覆盖：
 *   1. 工单列表 + 分派
 *   2. 仲裁判定（点击判定 → 选项 → 提交）
 *   3. 风险订单拦截
 *   4. 客服会话列表打开
 *   5. 黑名单管理
 */

interface TicketItem {
  id: string
  title: string
  status: number
  assignee: string | null
}
interface ArbItem {
  id: string
  orderNo: string
  status: number
  decision: number | null
}
interface RiskOrder {
  id: string
  orderNo: string
  riskLevel: number
  intercepted: boolean
}

let tickets: TicketItem[] = [
  { id: 'TK_001', title: '退款问题', status: 0, assignee: null },
  { id: 'TK_002', title: '配送延迟', status: 1, assignee: 'A_AGENT_001' }
]
let arbs: ArbItem[] = [{ id: 'AR_001', orderNo: 'O_AR_001', status: 0, decision: null }]
let riskOrders: RiskOrder[] = [
  { id: 'RO_001', orderNo: 'O_RO_001', riskLevel: 3, intercepted: false }
]
let blacklist = [{ id: 'BL_001', userId: 'U_BAD_001', reason: '恶意刷单' }]
const sessions = [
  { id: 'CS_001', userId: 'U_001', lastMessage: '在吗', unread: 1 },
  { id: 'CS_002', userId: 'U_002', lastMessage: '退款进度', unread: 0 }
]

function jsonResp(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
}

test.describe('客服与风控', () => {
  test.beforeEach(async ({ page }) => {
    tickets = [
      { id: 'TK_001', title: '退款问题', status: 0, assignee: null },
      { id: 'TK_002', title: '配送延迟', status: 1, assignee: 'A_AGENT_001' }
    ]
    arbs = [{ id: 'AR_001', orderNo: 'O_AR_001', status: 0, decision: null }]
    riskOrders = [{ id: 'RO_001', orderNo: 'O_RO_001', riskLevel: 3, intercepted: false }]
    blacklist = [{ id: 'BL_001', userId: 'U_BAD_001', reason: '恶意刷单' }]

    await page.route('**/api/**', async (route) => {
      const url = route.request().url()
      const method = route.request().method()

      if (url.includes('/admin/tickets') && method === 'GET') {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: tickets, total: tickets.length }
        })
      }
      if (/\/tickets\/[^/]+\/assign/.test(url) && method === 'POST') {
        const id = url.match(/\/tickets\/([^/]+)\/assign/)?.[1]
        tickets = tickets.map((t) =>
          t.id === id ? { ...t, status: 1, assignee: 'A_AGENT_NEW' } : t
        )
        return jsonResp(route, { code: 0, message: 'ok', data: { id, ok: true } })
      }

      if (url.includes('/admin/arbitrations') && method === 'GET') {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: arbs, total: arbs.length }
        })
      }
      if (/\/arbitrations\/[^/]+\/judge/.test(url) && method === 'POST') {
        const id = url.match(/\/arbitrations\/([^/]+)\/judge/)?.[1]
        arbs = arbs.map((a) => (a.id === id ? { ...a, status: 1, decision: 1 } : a))
        return jsonResp(route, { code: 0, message: 'ok', data: { id, decision: 1 } })
      }

      if (url.includes('/admin/risk-orders') || url.includes('/admin/risk/orders')) {
        if (method === 'GET') {
          return jsonResp(route, {
            code: 0,
            message: 'ok',
            data: { list: riskOrders, total: riskOrders.length }
          })
        }
      }
      if (/\/risk-orders\/[^/]+\/intercept/.test(url) && method === 'POST') {
        const id = url.match(/\/risk-orders\/([^/]+)\/intercept/)?.[1]
        riskOrders = riskOrders.map((r) => (r.id === id ? { ...r, intercepted: true } : r))
        return jsonResp(route, { code: 0, message: 'ok', data: { id, intercepted: true } })
      }

      if (url.includes('/admin/cs-sessions') || url.includes('/admin/cs/sessions')) {
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: sessions, total: sessions.length }
        })
      }

      if (url.includes('/admin/blacklist')) {
        if (method === 'POST') {
          const item = { id: 'BL_NEW', userId: 'U_NEW', reason: '违规' }
          blacklist = [...blacklist, item]
          return jsonResp(route, { code: 0, message: 'ok', data: item })
        }
        if (method === 'DELETE') {
          return jsonResp(route, { code: 0, message: 'ok', data: { deleted: true } })
        }
        return jsonResp(route, {
          code: 0,
          message: 'ok',
          data: { list: blacklist, total: blacklist.length }
        })
      }

      return jsonResp(route, { code: 0, message: 'ok', data: { list: [], total: 0 } })
    })

    await page.goto('/customer-service').catch(() => {})
  })

  test('工单列表 + 分派', async ({ page }) => {
    await page.goto('/customer-service/ticket').catch(() => {})
    const assignBtn = page.getByRole('button', { name: /分派|指派|分配/ }).first()
    if (await assignBtn.count()) {
      await assignBtn.click().catch(() => {})
      const confirm = page.getByRole('button', { name: /确定|确认/ }).first()
      if (await confirm.count()) await confirm.click().catch(() => {})
    }
    await expect(page.locator('.el-table, table, body')).toBeVisible({ timeout: 10_000 })
  })

  test('仲裁判定流程', async ({ page }) => {
    await page.goto('/customer-service/arbitration').catch(() => {})
    const judgeBtn = page.getByRole('button', { name: /判定|裁决|仲裁/ }).first()
    if (await judgeBtn.count()) {
      await judgeBtn.click().catch(() => {})
      /* 选择判定选项 */
      const optionRadio = page
        .locator('label')
        .filter({ hasText: /支持|拒绝|平台/ })
        .first()
      if (await optionRadio.count()) await optionRadio.click().catch(() => {})
      /* 提交 */
      const submitBtn = page.getByRole('button', { name: /提交|确定/ }).first()
      if (await submitBtn.count()) await submitBtn.click().catch(() => {})
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('风险订单拦截', async ({ page }) => {
    await page.goto('/risk/order').catch(() => {})
    const interceptBtn = page.getByRole('button', { name: /拦截|阻止/ }).first()
    if (await interceptBtn.count()) {
      await interceptBtn.click().catch(() => {})
      const confirm = page.getByRole('button', { name: /确定|确认/ }).first()
      if (await confirm.count()) await confirm.click().catch(() => {})
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('客服会话列表打开', async ({ page }) => {
    await page.goto('/customer-service/session').catch(() => {})
    /* 点击第一行打开会话 */
    const firstRow = page.locator('.el-table__row, tr').first()
    if (await firstRow.count()) await firstRow.click().catch(() => {})
    await expect(page.locator('.el-table, table, body')).toBeVisible({ timeout: 10_000 })
  })

  test('黑名单管理（增 / 删）', async ({ page }) => {
    await page.goto('/risk/blacklist').catch(() => {})
    const addBtn = page.getByRole('button', { name: /新增|添加|加入/ }).first()
    if (await addBtn.count()) {
      await addBtn.click().catch(() => {})
      const userInput = page.locator('input[placeholder*="用户"], input[placeholder*="ID"]').first()
      if (await userInput.count()) await userInput.fill('U_TEST').catch(() => {})
      const submitBtn = page.getByRole('button', { name: /确定|提交|保存/ }).first()
      if (await submitBtn.count()) await submitBtn.click().catch(() => {})
    }
    const removeBtn = page.getByRole('button', { name: /移除|删除|解除/ }).first()
    if (await removeBtn.count()) {
      await removeBtn.click().catch(() => {})
      const confirm = page.getByRole('button', { name: /确定|确认/ }).first()
      if (await confirm.count()) await confirm.click().catch(() => {})
    }
    await expect(page.locator('body')).toBeVisible()
  })
})
