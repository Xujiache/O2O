/**
 * 用户端小程序 E2E — 下单完整路径
 * Sprint 4 / W4.E.1
 *
 * 步骤 (≥ 5)：
 *   1. launch 小程序 + mock 登录
 *   2. 首页 → 搜索店铺
 *   3. 进入店铺 → 加购物车
 *   4. 进入购物车 → 选地址
 *   5. 提交订单 → 跳转支付页
 */

const automator = require('miniprogram-automator')
const wmpaConfig = require('../wmpa.config.js')
const { mockLogin, clearLogin } = require('../helpers/login.js')
const { SHOPS, PRODUCTS, ADDRESSES } = require('../helpers/fixtures.js')

describe('用户端 E2E - 下单完整路径', () => {
  /** @type {import('miniprogram-automator').MiniProgram} */
  let miniProgram

  beforeAll(async () => {
    miniProgram = await automator.launch({
      cliPath: wmpaConfig.cliPath,
      projectPath: wmpaConfig.projectPath,
      port: wmpaConfig.port,
      timeout: wmpaConfig.timeout
    })
  })

  afterAll(async () => {
    if (miniProgram) {
      await clearLogin(miniProgram)
      await miniProgram.close()
    }
  })

  test('Step 1: launch 小程序 + mock 登录成功', async () => {
    await mockLogin(miniProgram)
    const page = await miniProgram.currentPage()
    expect(page.path).toMatch(/pages\/index\/index/)
    const token = await miniProgram.callWxMethod('getStorageSync', 'token')
    expect(token).toBeTruthy()
  })

  test('Step 2: 首页搜索店铺', async () => {
    const page = await miniProgram.currentPage()
    const searchInput = await page.$('.search-input, input[placeholder*="搜索"]')
    expect(searchInput).not.toBeNull()
    await searchInput.trigger('input', { value: SHOPS.primary.keyword })
    await miniProgram.waitFor(300)
    const searchBtn = await page.$('.search-btn, .btn-search')
    if (searchBtn) {
      await searchBtn.tap()
    }
    await miniProgram.waitFor(500)
    const list = await page.$('.shop-list, .search-result')
    expect(list).not.toBeNull()
  })

  test('Step 3: 进入店铺 → 加购物车', async () => {
    await miniProgram.navigateTo(`/pages/shop/detail?id=${SHOPS.primary.id}`)
    await miniProgram.waitFor(500)
    const page = await miniProgram.currentPage()
    expect(page.path).toMatch(/pages\/shop\/detail/)

    // 加购物车（通过点击商品 +）
    const addBtn = await page.$(
      `[data-pid="${PRODUCTS.burger.id}"] .btn-add, .product-item .btn-add`
    )
    if (addBtn) {
      await addBtn.tap()
      await miniProgram.waitFor(200)
      await addBtn.tap()
    }
    const badge = await page.$('.cart-badge, .cart-count')
    expect(badge).not.toBeNull()
  })

  test('Step 4: 进入购物车 → 选地址', async () => {
    await miniProgram.navigateTo('/pages/cart/index')
    await miniProgram.waitFor(500)
    const page = await miniProgram.currentPage()
    expect(page.path).toMatch(/pages\/cart\/index/)

    // 选地址
    const addrBtn = await page.$('.address-select, .addr-picker')
    expect(addrBtn).not.toBeNull()
    await addrBtn.tap()
    await miniProgram.waitFor(300)
    // mock 选定地址
    await miniProgram.callWxMethod('setStorageSync', 'selectedAddress', ADDRESSES.default)
  })

  test('Step 5: 提交订单 → 跳转支付页', async () => {
    const page = await miniProgram.currentPage()
    const submitBtn = await page.$('.btn-submit, .btn-checkout, .submit-order')
    expect(submitBtn).not.toBeNull()
    await submitBtn.tap()
    await miniProgram.waitFor(800)
    const next = await miniProgram.currentPage()
    expect(next.path).toMatch(/pages\/(pay|order\/pay|checkout)/)
  })
})
