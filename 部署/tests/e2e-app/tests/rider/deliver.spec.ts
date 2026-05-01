/**
 * 骑手端 APP E2E — 派送流程
 * Sprint 4 / W4.E.2
 *
 * 步骤 (≥ 5)：
 *   1. 进入已接单订单详情
 *   2. 点击「已取餐」
 *   3. 行进中（mock 定位上报）
 *   4. 点击「已送达」
 *   5. 校验订单状态为「已完成」
 */

import { loginByForm, RIDER_CRED } from '../../helpers/login'
import { RIDER_DISPATCH_ORDER } from '../../helpers/fixtures'

describe('骑手端 - 派送', () => {
  before(async () => {
    await driver.activateApp(process.env.RIDER_BUNDLE_ID || 'com.o2o.rider')
    const home = await $('~tab_home')
    if (!(await home.isExisting())) {
      await loginByForm(RIDER_CRED)
    }
  })

  it('Step 1: 进入已接单订单详情', async () => {
    const tabActive = await $('~tab_order_active')
    await tabActive.click()
    const item = await $(`~order_item_${RIDER_DISPATCH_ORDER.id}`)
    await item.waitForDisplayed({ timeout: 20_000 })
    await item.click()
    const detailRoot = await $('~order_detail_root')
    await expect(detailRoot).toBeDisplayed()
  })

  it('Step 2: 点击「已取餐」', async () => {
    const pickupBtn = await $('~order_pickup_btn')
    await pickupBtn.waitForEnabled({ timeout: 10_000 })
    await pickupBtn.click()
    const confirm = await $('~dialog_confirm')
    if (await confirm.isExisting()) {
      await confirm.click()
    }
  })

  it('Step 3: 行进中（mock 定位上报）', async () => {
    // 通过 driver 设置 mock GPS（送达地点附近）
    await driver.setGeoLocation({ latitude: 31.205, longitude: 121.605, altitude: 10 })
    const enRouteTag = await $(`~order_${RIDER_DISPATCH_ORDER.id}_status`)
    await enRouteTag.waitForDisplayed({ timeout: 10_000 })
    const text = await enRouteTag.getText()
    await expect(['配送中', '派送中', 'delivering', 'on_the_way']).toContain(text)
  })

  it('Step 4: 点击「已送达」', async () => {
    const deliverBtn = await $('~order_deliver_btn')
    await deliverBtn.waitForEnabled({ timeout: 10_000 })
    await deliverBtn.click()
    const confirm = await $('~dialog_confirm')
    if (await confirm.isExisting()) {
      await confirm.click()
    }
  })

  it('Step 5: 校验订单状态为「已完成」', async () => {
    const statusTag = await $(`~order_${RIDER_DISPATCH_ORDER.id}_status`)
    await statusTag.waitForDisplayed({ timeout: 15_000 })
    const text = await statusTag.getText()
    await expect(['已完成', '已送达', 'delivered', 'completed']).toContain(text)
  })
})
