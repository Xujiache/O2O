/**
 * 用户端小程序 E2E — 支付路径
 * Sprint 4 / W4.E.1
 *
 * 步骤 (≥ 4)：
 *   1. 进入未支付订单详情
 *   2. 选择支付方式（微信支付）
 *   3. 唤起 mock 支付（mockWxMethod requestPayment）
 *   4. 返回订单详情 → 校验 status=paid
 */

const automator = require('miniprogram-automator')
const wmpaConfig = require('../wmpa.config.js')
const { mockLogin, clearLogin } = require('../helpers/login.js')
const { ORDERS } = require('../helpers/fixtures.js')

describe('用户端 E2E - 支付路径', () => {
  /** @type {import('miniprogram-automator').MiniProgram} */
  let miniProgram

  beforeAll(async () => {
    miniProgram = await automator.launch({
      cliPath: wmpaConfig.cliPath,
      projectPath: wmpaConfig.projectPath,
      port: wmpaConfig.port,
      timeout: wmpaConfig.timeout
    })
    await mockLogin(miniProgram)
  })

  afterAll(async () => {
    if (miniProgram) {
      await clearLogin(miniProgram)
      await miniProgram.close()
    }
  })

  test('Step 1: 进入未支付订单详情', async () => {
    await miniProgram.navigateTo(`/pages/order/detail?id=${ORDERS.unpaid.id}`)
    await miniProgram.waitFor(500)
    const page = await miniProgram.currentPage()
    expect(page.path).toMatch(/pages\/order\/detail/)
    const statusEl = await page.$('.order-status, .status-tag')
    expect(statusEl).not.toBeNull()
  })

  test('Step 2: 选择支付方式（微信支付）', async () => {
    const page = await miniProgram.currentPage()
    const payBtn = await page.$('.btn-pay, .pay-btn')
    expect(payBtn).not.toBeNull()
    await payBtn.tap()
    await miniProgram.waitFor(400)

    const next = await miniProgram.currentPage()
    expect(next.path).toMatch(/pages\/(pay|cashier|checkout)/)

    const wechatOpt = await next.$('.pay-method-wechat, .method-wechat, [data-method="wechat"]')
    if (wechatOpt) {
      await wechatOpt.tap()
    }
  })

  test('Step 3: 唤起 mock 支付（requestPayment）', async () => {
    // mock requestPayment 直接成功
    await miniProgram.mockWxMethod('requestPayment', {
      errMsg: 'requestPayment:ok'
    })

    const page = await miniProgram.currentPage()
    const confirmBtn = await page.$('.btn-confirm-pay, .pay-confirm, .btn-submit')
    expect(confirmBtn).not.toBeNull()
    await confirmBtn.tap()
    await miniProgram.waitFor(800)
  })

  test('Step 4: 返回订单详情 → 校验 status=paid', async () => {
    // 部分实现支付后会自动 redirectTo 详情；如果没有则手动跳
    const cur = await miniProgram.currentPage()
    if (!/order\/detail/.test(cur.path)) {
      await miniProgram.redirectTo(`/pages/order/detail?id=${ORDERS.unpaid.id}`)
      await miniProgram.waitFor(400)
    }
    const page = await miniProgram.currentPage()
    expect(page.path).toMatch(/pages\/order\/detail/)

    // 校验状态字段（从 page data 直接读，避免文案多语言）
    const data = await page.data()
    const status = data.order?.status || data.status || ''
    expect(['paid', 'PAID', '已支付', 'preparing', '待发货']).toContain(status)
  })
})
