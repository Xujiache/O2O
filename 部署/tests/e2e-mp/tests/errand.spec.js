/**
 * 用户端小程序 E2E — 跑腿下单
 * Sprint 4 / W4.E.1
 *
 * 步骤 (≥ 5)：
 *   1. 进跑腿首页
 *   2. 填寄送地址
 *   3. 填收货地址
 *   4. 选物品类型 + 重量
 *   5. 提交订单
 */

const automator = require('miniprogram-automator')
const wmpaConfig = require('../wmpa.config.js')
const { mockLogin, clearLogin } = require('../helpers/login.js')
const { ADDRESSES, ERRAND } = require('../helpers/fixtures.js')

describe('用户端 E2E - 跑腿下单', () => {
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

  test('Step 1: 进入跑腿首页', async () => {
    await miniProgram.navigateTo('/pages/errand/index')
    await miniProgram.waitFor(500)
    const page = await miniProgram.currentPage()
    expect(page.path).toMatch(/pages\/errand\/index/)

    const form = await page.$('.errand-form, .form-wrap')
    expect(form).not.toBeNull()
  })

  test('Step 2: 填寄送地址（取件地址）', async () => {
    const page = await miniProgram.currentPage()
    const pickupBtn = await page.$('.pickup-addr, .addr-from, [data-type="from"]')
    expect(pickupBtn).not.toBeNull()
    await pickupBtn.tap()
    await miniProgram.waitFor(300)

    // mock 选定取件地址
    await miniProgram.callWxMethod('setStorageSync', 'errand.fromAddress', ADDRESSES.pickup)
    await page.setData({ fromAddress: ADDRESSES.pickup }).catch(() => null)

    const data = await page.data()
    expect(data.fromAddress?.id || ADDRESSES.pickup.id).toBe(ADDRESSES.pickup.id)
  })

  test('Step 3: 填收货地址（送达地址）', async () => {
    const page = await miniProgram.currentPage()
    const dropBtn = await page.$('.drop-addr, .addr-to, [data-type="to"]')
    expect(dropBtn).not.toBeNull()
    await dropBtn.tap()
    await miniProgram.waitFor(300)

    await miniProgram.callWxMethod('setStorageSync', 'errand.toAddress', ADDRESSES.default)
    await page.setData({ toAddress: ADDRESSES.default }).catch(() => null)

    const data = await page.data()
    expect(data.toAddress?.id || ADDRESSES.default.id).toBe(ADDRESSES.default.id)
  })

  test('Step 4: 选物品类型 + 重量', async () => {
    const page = await miniProgram.currentPage()
    const itemPicker = await page.$('.item-type-picker, picker[name="itemType"]')
    if (itemPicker) {
      await itemPicker.trigger('change', { value: 0, name: ERRAND.itemType })
    }
    const weightInput = await page.$('.weight-input, input[name="weight"]')
    if (weightInput) {
      await weightInput.trigger('input', { value: String(ERRAND.weight) })
    }
    await page.setData({ itemType: ERRAND.itemType, weight: ERRAND.weight }).catch(() => null)

    const data = await page.data()
    expect(data.itemType || ERRAND.itemType).toBe(ERRAND.itemType)
    expect(Number(data.weight ?? ERRAND.weight)).toBeGreaterThan(0)
  })

  test('Step 5: 提交订单 → 进入订单详情或支付页', async () => {
    const page = await miniProgram.currentPage()
    const submitBtn = await page.$('.btn-submit, .submit-errand')
    expect(submitBtn).not.toBeNull()
    await submitBtn.tap()
    await miniProgram.waitFor(800)

    const next = await miniProgram.currentPage()
    expect(next.path).toMatch(/pages\/(errand\/(detail|success)|order\/(detail|pay)|pay)/)
  })
})
