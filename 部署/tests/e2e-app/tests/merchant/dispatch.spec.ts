/**
 * 商户端 APP E2E — 派送流程
 * Sprint 4 / W4.E.2
 *
 * 步骤 (≥ 5)：
 *   1. 进入「已接单」订单详情
 *   2. 点击「呼叫骑手 / 派送」
 *   3. 选择骑手或自配送
 *   4. 确认派送
 *   5. 校验状态变更为「派送中」
 */

import { loginByForm, MERCHANT_CRED } from '../../helpers/login'
import { ACCEPTED_ORDER, DEFAULT_RIDER } from '../../helpers/fixtures'

describe('商户端 - 派送', () => {
  before(async () => {
    await driver.activateApp(process.env.MERCHANT_BUNDLE_ID || 'com.o2o.merchant')
    const home = await $('~tab_home')
    if (!(await home.isExisting())) {
      await loginByForm(MERCHANT_CRED)
    }
  })

  it('Step 1: 打开已接单订单详情', async () => {
    const tabAccepted = await $('~tab_order_accepted')
    await tabAccepted.click()
    const item = await $(`~order_item_${ACCEPTED_ORDER.id}`)
    await item.waitForDisplayed({ timeout: 20_000 })
    await item.click()
    const detailRoot = await $('~order_detail_root')
    await expect(detailRoot).toBeDisplayed()
  })

  it('Step 2: 点击「呼叫骑手 / 派送」', async () => {
    const dispatchBtn = await $('~order_dispatch_btn')
    await dispatchBtn.waitForEnabled({ timeout: 10_000 })
    await dispatchBtn.click()
    const picker = await $('~dispatch_picker_root')
    await expect(picker).toBeDisplayed()
  })

  it('Step 3: 选择骑手（默认骑手 / 自配送）', async () => {
    const riderTab = await $('~picker_tab_rider')
    if (await riderTab.isExisting()) {
      await riderTab.click()
    }
    const riderOption = await $(`~rider_option_${DEFAULT_RIDER.id}`)
    await riderOption.waitForDisplayed({ timeout: 10_000 })
    await riderOption.click()
    await expect(riderOption).toBeDisplayed()
  })

  it('Step 4: 确认派送', async () => {
    const confirmBtn = await $('~dispatch_confirm_btn')
    await confirmBtn.click()
    // 成功 toast / dialog
    const toast = await $('~toast_success')
    if (await toast.isExisting()) {
      await expect(toast).toBeDisplayed()
    }
  })

  it('Step 5: 校验订单状态为「派送中」', async () => {
    const statusTag = await $(`~order_${ACCEPTED_ORDER.id}_status`)
    await statusTag.waitForDisplayed({ timeout: 15_000 })
    const text = await statusTag.getText()
    await expect(['派送中', '配送中', 'dispatching', 'delivering']).toContain(text)
  })
})
